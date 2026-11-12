import type { Profile } from "@/lib/types";

/** Round photo if the person has one, otherwise their initials. */
export default function Avatar({ p, size = 40 }: { p: Pick<Profile, "full_name" | "email" | "avatar_url"> | null | undefined; size?: number }) {
  const name = p?.full_name || p?.email || "";
  const initials =
    name
      .replace(/@.*/, "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "·";
  return p?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="avatar" src={p.avatar_url} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="avatar avatar-initials" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden>
      {initials}
    </span>
  );
}
