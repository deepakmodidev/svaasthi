import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";
import { enqueueToday } from "@/lib/enqueue";

type ReminderInput = { slot: string; time_local: string };

// Pause / resume the whole service: flip active on all of the user's patients.
// The cron and Run now enqueue only WHERE active = true, so pausing stops every
// scheduled call until resumed.
export async function PATCH(req: NextRequest) {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;

  const body = await req.json().catch(() => ({}));
  const active = Boolean(body.active);
  const updated = await sql`
    UPDATE patients SET active = ${active} WHERE user_id = ${userId} RETURNING id
  `;
  return NextResponse.json({ ok: true, active, count: updated.length });
}

// List the current user's patients with their reminder times.
export async function GET() {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;

  const patients = await sql`
    SELECT id, name, phone, active, created_at
    FROM patients WHERE user_id = ${userId} ORDER BY created_at DESC
  `;
  const reminders = await sql`
    SELECT r.id, r.patient_id, r.slot, r.time_local
    FROM reminders r JOIN patients p ON p.id = r.patient_id
    WHERE p.user_id = ${userId}
  `;
  return NextResponse.json({
    patients: patients.map((p) => ({
      ...p,
      reminders: reminders
        .filter((r) => r.patient_id === p.id)
        .sort((a, b) => String(a.time_local).localeCompare(String(b.time_local))),
    })),
  });
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
