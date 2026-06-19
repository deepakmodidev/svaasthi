import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";

type ReminderInput = { slot: string; time_local: string };

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

  const { name, phone, reminders } = await req.json();
  if (!name || !phone) {
    return NextResponse.json({ error: "name and phone are required" }, { status: 400 });
  }
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return NextResponse.json(
      { error: "phone must be E.164, e.g. +919876543210" },
      { status: 400 },
    );
  }

  const list: ReminderInput[] = Array.isArray(reminders)
    ? reminders.filter((r) => r && r.slot && r.time_local)
    : [];

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

  return NextResponse.json({ patient_id: patientId, reminders: list.length });
}
