import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { enqueueToday } from "@/lib/enqueue";

// Manual "Run now" trigger for the dashboard. Session-authed (so no CRON_SECRET
// on the client) and scoped to the logged-in user's own patients. Only enqueues
// slots still upcoming today, so it never places a surprise call for a slot
// whose time already passed.
export async function POST() {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;

  const result = await enqueueToday({ userId, onlyUpcoming: true });
  return NextResponse.json({ ok: true, ...result });
}
