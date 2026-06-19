import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { placeRinggCall } from "@/lib/ringg";
import { requireUser } from "@/lib/auth/server";

const E164 = /^\+[1-9]\d{7,14}$/;

// Place one outbound Ringg call now (manual "Call now"), persisting a dose row.
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;

  const { name, mobile_number, slot, scheduled_for } = await req.json();
  if (!name || !mobile_number) {
    return NextResponse.json(
      { error: "name and mobile_number are required" },
      { status: 400 },
    );
  }
  if (!E164.test(mobile_number)) {
    return NextResponse.json(
      { error: "mobile_number must be E.164, e.g. +919876543210" },
      { status: 400 },
    );
  }

  const scheduledAt =
    typeof scheduled_for === "string" && scheduled_for
      ? scheduled_for.length === 16
        ? `${scheduled_for}:00`
        : scheduled_for
      : null;

  const [dose] = await sql`
    INSERT INTO doses (name, phone, slot, status, scheduled_for, user_id)
    VALUES (
      ${name}, ${mobile_number}, ${slot ?? "Morning"},
      ${scheduledAt ? "scheduled" : "calling"}, ${scheduledAt}, ${userId}
    )
    RETURNING id
  `;
  const doseId = dose.id as string;

  const r = await placeRinggCall({
    name,
    mobile_number,
    slot: slot ?? "Morning",
    doseId,
    scheduledAt,
  });
  await sql`
    UPDATE doses SET status = ${r.status}, ringg_call_id = ${r.callId} WHERE id = ${doseId}
  `;

  return NextResponse.json(
    { dose_id: doseId, http_status: r.httpStatus, ringg: r.ringg },
    { status: r.ok ? 200 : r.httpStatus || 500 },
  );
}
