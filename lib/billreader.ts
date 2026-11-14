import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/** What Claude reads off a bill or receipt, ready to drop into the expense form. */
const Bill = z.object({
  readable: z.boolean(),
  amount: z.number(),
  date: z.string(),
  vendor_id: z.string(),
  vendor_name: z.string(),
  category_id: z.string(),
  note: z.string(),
  doubts: z.array(z.string()),
});
export type BillReading = z.infer<typeof Bill>;
export type BillOptions = { categories: { id: string; name: string }[]; vendors: { id: string; name: string }[]; today: string };

const MODEL = process.env.CLEANUP_MODEL || "claude-opus-5-5";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const SYSTEM = `You read a photo or PDF of a bill, invoice or payment receipt for Kaleidoscope by Rifah, a clothing brand in India, and fill in one expense entry.

Return:
- readable: false when the file is not a bill, invoice or receipt, or cannot be read. In that case leave the other fields empty or zero and explain in doubts.
- amount: the total actually payable or paid, in rupees, as a number with no symbols. Use the grand total including tax, not a subtotal. For a payment screenshot, use the amount paid.
- date: the bill or payment date as YYYY-MM-DD. Indian bills write the day first (05/11/2026 is 5 November). If no date is shown, return an empty string.
- vendor_id: the id of the matching vendor from the list given, when the seller or payee on the bill is clearly one of them (allow for small spelling differences). Otherwise an empty string.
- vendor_name: the seller's or payee's name as it should appear in a vendor list, in normal capitals, without address or tax numbers.
- category_id: the id of the best-fitting category from the list given, judged from what was bought. An empty string if none fits.
- note: one short line saying what the bill is for, with the bill or invoice number when there is one. For example "Invoice 482: 40 m cotton fabric".
- doubts: short plain questions for the owner about anything you could not settle, such as an unclear total, two different amounts, a handwritten figure you are unsure of, or a date that could be read two ways. Empty when the bill is clear.

Do not guess a figure you cannot read; raise a doubt instead.`;

export async function readBillWithClaude(data: string, mediaType: string, opts: BillOptions): Promise<BillReading> {
  const client = new Anthropic({ timeout: 22_000, maxRetries: 0 });
  const file: Anthropic.ContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mediaType as ImageType, data } };
  if (mediaType !== "application/pdf" && !IMAGE_TYPES.includes(mediaType as ImageType)) throw new Error("Use a photo (JPG, PNG, WebP) or a PDF.");
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(Bill) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            file,
            {
              type: "text",
              text: `Today is ${opts.today}.\n\nCategories:\n${JSON.stringify(opts.categories)}\n\nVendors:\n${JSON.stringify(opts.vendors)}\n\nRead the bill and fill in the expense entry.`,
            },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined to read this file.");
    const out = response.parsed_output;
    if (!out) throw new Error("Claude's reply could not be read. Try again.");
    // Only ids that were actually offered are accepted.
    return {
      ...out,
      vendor_id: opts.vendors.some((v) => v.id === out.vendor_id) ? out.vendor_id : "",
      category_id: opts.categories.some((c) => c.id === out.category_id) ? out.category_id : "",
      date: /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : "",
    };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("The Claude API key in Netlify was not accepted. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Claude is rate-limiting this key. Wait a minute and try again.");
    if (e instanceof Anthropic.BadRequestError) throw new Error(`Claude couldn't take this file: ${e.message.slice(0, 160)}`);
    if (e instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach Claude, or it took too long. Try again.");
    if (e instanceof Anthropic.APIError) throw new Error(`Claude returned an error (${e.status}). Try again.`);
    throw e;
  }
}
