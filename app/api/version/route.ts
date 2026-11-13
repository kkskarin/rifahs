// The build this deploy was made from. The app compares it with its own to offer a reload.
export const dynamic = "force-static";

export function GET() {
  return Response.json({ build: process.env.NEXT_PUBLIC_BUILD ?? "" });
}
