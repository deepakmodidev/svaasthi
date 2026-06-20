import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { placeRinggCall } from "@/lib/ringg";
import { requireUser } from "@/lib/auth/server";

// Manual "Call now": place an immediate Ringg call to the user's own patient.
// The number is read from the DB (not the client) so this can't be used to dial
// arbitrary numbers.
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;

  const [patient] = await sql`
    SELECT name, phone FROM patients WHERE user_id = ${userId}
    ORDER BY created_at LIMIT 1
  `;
  if (!patient) {
    return NextResponse.json({ error: "no patient set up" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const slot = typeof body.slot === "string" && body.slot ? body.slot : "Morning";
  const name = patient.name as string;
  const phone = patient.phone as string;

  const [dose] = await sql`
    INSERT INTO doses (name, phone, slot, status, user_id)
    VALUES (${name}, ${phone}, ${slot}, 'calling', ${userId})
    RETURNING id
  `;
  const doseId = dose.id as string;

  const r = await placeRinggCall({ name, mobile_number: phone, slot, doseId });
  await sql`
    UPDATE doses SET status = ${r.status}, ringg_call_id = ${r.callId} WHERE id = ${doseId}
  `;

  return NextResponse.json(
    { dose_id: doseId, status: r.status },
    { status: r.ok ? 200 : r.httpStatus || 500 },
  );
}
