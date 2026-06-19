import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";

// Store (or refresh) a browser push subscription for the current user.
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;

  const sub = await req.json();
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  await sql`
    INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth)
    VALUES (${endpoint}, ${userId}, ${p256dh}, ${auth})
    ON CONFLICT (endpoint)
    DO UPDATE SET user_id = ${userId}, p256dh = ${p256dh}, auth = ${auth}
  `;
  return NextResponse.json({ ok: true });
}
