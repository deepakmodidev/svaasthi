import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";
import { enqueueToday } from "@/lib/enqueue";
import { terminateCalls } from "@/lib/ringg";

type ReminderInput = { slot: string; time_local: string };

// Pause / resume the whole service: flip active on all of the user's patients.
// The cron and Run now enqueue only WHERE active = true, so pausing stops future
// scheduling. Pausing ALSO cancels today's still-pending calls on Ringg (they're
// already scheduled on Ringg's side, so the flag alone wouldn't stop them).
export async function PATCH(req: NextRequest) {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;

  const body = await req.json().catch(() => ({}));
  const active = Boolean(body.active);

  let cancelled = 0;
  if (!active) {
    // Cancel not-yet-fired calls on Ringg (registered = scheduled / retry), then
    // drop those dose rows so the slots are free to be re-scheduled via Run now.
    const pending = await sql`
      SELECT ringg_call_id FROM doses
      WHERE user_id = ${userId} AND status IN ('registered', 'retry')
        AND ringg_call_id IS NOT NULL
    `;
    const callIds = pending.map((d) => d.ringg_call_id as string);
    if (callIds.length > 0) await terminateCalls(callIds);
    const removed = await sql`
      DELETE FROM doses
      WHERE user_id = ${userId} AND status IN ('registered', 'retry', 'scheduled')
      RETURNING id
    `;
    cancelled = removed.length;
  }

  const updated = await sql`
    UPDATE patients SET active = ${active} WHERE user_id = ${userId} RETURNING id
  `;
  return NextResponse.json({ ok: true, active, count: updated.length, cancelled });
}

// Create a patient (owned by the user) with reminder slots.
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const reminders = body.reminders;
  if (!name || !phone) {
    return NextResponse.json({ error: "name and phone are required" }, { status: 400 });
  }
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return NextResponse.json(
      { error: "phone must be E.164, e.g. +919876543210" },
      { status: 400 },
    );
  }

  // Guard: one patient per phone number per user. Prevents accidentally
  // creating a second patient on the same number (which would double-call it).
  const dup = await sql`
    SELECT 1 FROM patients WHERE user_id = ${userId} AND phone = ${phone} LIMIT 1
  `;
  if (dup.length > 0) {
    return NextResponse.json(
      { error: "A patient with this phone number already exists" },
      { status: 409 },
    );
  }

  // Dedupe reminders so the same slot+time can't be inserted twice.
  const seen = new Set<string>();
  const list: ReminderInput[] = (Array.isArray(reminders) ? reminders : [])
    .filter((r) => r && r.slot && r.time_local)
    .filter((r) => {
      const key = `${r.slot}|${r.time_local}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const [patient] = await sql`
    INSERT INTO patients (name, phone, user_id) VALUES (${name}, ${phone}, ${userId})
    RETURNING id
  `;
  const patientId = patient.id as string;

  for (const r of list) {
    await sql`
      INSERT INTO reminders (patient_id, slot, time_local)
      VALUES (${patientId}, ${r.slot}, ${r.time_local})
    `;
  }

  // Schedule today's still-upcoming calls immediately, so a patient set up at
  // 1pm gets today's 2pm/6pm/etc. calls without waiting for the 00:15 cron.
  // Skips slots already passed. Idempotent, and never fails the setup.
  let scheduledNow = 0;
  try {
    const result = await enqueueToday({ userId, onlyUpcoming: true });
    scheduledNow = result.count;
  } catch (e) {
    console.error("[patients] initial enqueue failed:", e);
  }

  return NextResponse.json({
    patient_id: patientId,
    reminders: list.length,
    scheduledNow,
  });
}
