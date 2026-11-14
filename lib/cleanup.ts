import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/** What the screen sends for one customer: their details exactly as written on their orders. */
export type RawCustomer = {
  key: string;
  names: string[];
  phones: string[];
  email: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  zip: string;
  country: string;
};
export type CleanCustomer = {
  key: string;
  name: string;
  phone: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  district: string;
  state: string;
  pin: string;
  country: string;
  doubts: string[];
};

const Cleaned = z.object({
  customers: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      phone: z.string(),
      email: z.string(),
      address1: z.string(),
      address2: z.string(),
      city: z.string(),
      district: z.string(),
      state: z.string(),
      pin: z.string(),
      country: z.string(),
      doubts: z.array(z.string()),
    }),
  ),
});

// Opus 5.5 is the default. Set CLEANUP_MODEL in Netlify to use a different Claude model.
const MODEL = process.env.CLEANUP_MODEL || "claude-opus-5-5";

const SYSTEM = `You tidy customer records for Kaleidoscope by Rifah, a clothing brand in India that ships mostly within India.
The owner uses the result to address parcels and to recognise repeat customers, so a tidy record must still be the same person at the same place.

For every customer in the input, return one record with the same "key".

How each field should look:
- name: the person's name in normal capitals ("lakshmi narayanan" becomes "Lakshmi Narayanan"; keep initials as "K." or "S. R."). Remove repeated words, stray dots and trailing symbols. When several spellings are given, choose the fullest correct one. Never translate or change the spelling of a name.
- phone: one number in international format with a space after the country code: "+91 98765 43210" for an Indian mobile (ten digits starting 6 to 9, with or without a leading 0 or 91). Keep another country's code when the number clearly has one. If several numbers are given, use the first valid one.
- email: lower case, no spaces. Leave it empty when none is given.
- address1: house or flat number, building, street. address2: area, locality, landmark. Put commas and spaces where they belong, expand nothing you are unsure of, and do not repeat the city, state or PIN code inside these lines.
- city, district, state: properly spelled and capitalised, with the state's full official name ("TN" becomes "Tamil Nadu").
- pin: six digits for India, no spaces. For other countries keep the postal code as written.
- country: full name ("India").

When the input includes "pin_directory" for a customer, that is India Post's record for the PIN code. Treat its district and state as correct. Its post office names help you tell the area from the city.

Do not invent anything. If a part is missing, leave that field empty.

doubts: plain questions for the owner, one per thing you could not settle yourself, written so they can answer in a few words. Raise a doubt when the PIN code does not match the city or state written, when the number is not a valid phone number, when two different addresses or names seem to be mixed together, or when the address is too incomplete to deliver to. Leave doubts empty when the record is clear. Small fixes such as capitals, spacing and punctuation are not doubts.`;

type Pin = { state: string; district: string; areas: string[] } | null;
async function pinInfo(pin: string): Promise<Pin> {
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: AbortSignal.timeout(3500), next: { revalidate: 86400 } });
    const data = (await res.json()) as { Status: string; PostOffice: { Name: string; District: string; State: string }[] | null }[];
    const offices = data?.[0]?.PostOffice;
    if (data?.[0]?.Status !== "Success" || !offices?.length) return null;
    return { state: offices[0].State, district: offices[0].District, areas: [...new Set(offices.map((o) => o.Name))].slice(0, 8) };
  } catch {
    return null;
  }
}

export const cleanupConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Ask Claude to tidy a small batch of customers. Throws with a readable message if it can't. */
export async function cleanWithClaude(batch: RawCustomer[]): Promise<CleanCustomer[]> {
  const client = new Anthropic({ timeout: 20_000, maxRetries: 0 });
  const pins = await Promise.all(batch.map((c) => pinInfo((c.zip ?? "").replace(/\D/g, ""))));
  const input = batch.map((c, i) => ({
    key: c.key,
    names_as_written: c.names,
    phones_as_written: c.phones,
    email: c.email,
    address_line_1: c.address1,
    address_line_2: c.address2,
    city: c.city,
    state_or_province: c.province,
    pin_or_postal_code: c.zip,
    country: c.country,
    ...(pins[i] ? { pin_directory: pins[i] } : {}),
  }));
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      // Tidying a record is routine work: low effort keeps each batch quick enough for the hosting time limit.
      output_config: { effort: "low", format: zodOutputFormat(Cleaned) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Customers to tidy:\n${JSON.stringify(input, null, 1)}` }],
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined to process this batch.");
    if (response.stop_reason === "max_tokens") throw new Error("The reply was cut short. Try again; the batch will be made smaller.");
    const out = response.parsed_output?.customers;
    if (!out) throw new Error("Claude's reply could not be read.");
    const wanted = new Set(batch.map((c) => c.key));
    return out.filter((c) => wanted.has(c.key));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("The Claude API key in Netlify was not accepted. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error("This Claude API key is not allowed to use this model.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Claude is rate-limiting this key. Wait a minute and carry on.");
    if (e instanceof Anthropic.BadRequestError) throw new Error(`Claude rejected the request: ${e.message.slice(0, 160)}`);
    if (e instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach Claude, or it took too long. Try again.");
    if (e instanceof Anthropic.APIError) throw new Error(`Claude returned an error (${e.status}). Try again.`);
    throw e;
  }
}
