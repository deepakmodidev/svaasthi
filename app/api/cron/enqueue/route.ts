import { type NextRequest, NextResponse } from "next/server";
import { enqueueToday } from "@/lib/enqueue";

// Daily enqueue (Vercel Cron): schedule today's calls for every active patient.
// Auth: requires CRON_SECRET via ?secret=, x-cron-secret header, or
// `Authorization: Bearer <secret>` (Vercel Cron sends this automatically).
// Pass ?dry=1 to preview without inserting / calling.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.nextUrl.searchParams.get("secret") ||
      req.headers.get("x-cron-secret") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const result = await enqueueToday({ dry });
  return NextResponse.json({ ok: true, ...result });
}
