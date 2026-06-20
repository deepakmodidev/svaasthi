import { sql } from "@/lib/db";
import { placeRinggCall } from "@/lib/ringg";

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export type EnqueueResult = {
  date: string;
  dry: boolean;
  count: number;
  skippedPast: number;
  enqueued: unknown[];
};

// Schedule today's reminder calls via Ringg `scheduled_at`. Idempotent — the
// unique index on (reminder_id, scheduled_for) + ON CONFLICT DO NOTHING means
// re-running the same day never double-calls. Shared by the daily cron (all
// users) and the dashboard "Run now" button (one user, upcoming slots only).
//   userId       — limit to one user's patients (omit for the global cron)
//   dry          — report what would happen without inserting / calling
//   onlyUpcoming — skip slots whose IST time already passed today (so a manual
//                  run never places a surprise call for a missed slot)
export async function enqueueToday(
  opts: { userId?: string; dry?: boolean; onlyUpcoming?: boolean } = {},
): Promise<EnqueueResult> {
  const { userId, dry = false, onlyUpcoming = false } = opts;

  const todayIST = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const nowMin = toMin(
    new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }),
  );

  const rows = userId
    ? await sql`
        SELECT p.user_id, p.name, p.phone, r.id AS reminder_id, r.slot, r.time_local
        FROM patients p JOIN reminders r ON r.patient_id = p.id
        WHERE p.active = true AND p.user_id = ${userId}
        ORDER BY r.time_local
      `
    : await sql`
        SELECT p.user_id, p.name, p.phone, r.id AS reminder_id, r.slot, r.time_local
        FROM patients p JOIN reminders r ON r.patient_id = p.id
        WHERE p.active = true
        ORDER BY r.time_local
      `;

  const enqueued: unknown[] = [];
  let skippedPast = 0;

  for (const row of rows) {
    const timeLocal = row.time_local as string;
    if (onlyUpcoming && toMin(timeLocal) <= nowMin) {
      skippedPast++;
      continue;
    }
    const scheduledAt = `${todayIST}T${timeLocal}:00`; // wall-clock IST; Ringg + dedupe key

    if (dry) {
      const exists = await sql`
        SELECT 1 FROM doses WHERE reminder_id = ${row.reminder_id} AND scheduled_for = ${scheduledAt} LIMIT 1
      `;
      enqueued.push(
        exists.length
          ? { slot: row.slot, scheduled_for: scheduledAt, skipped: "already enqueued" }
          : { slot: row.slot, scheduled_for: scheduledAt, would_enqueue: true },
      );
      continue;
    }

    const inserted = await sql`
      INSERT INTO doses (name, phone, slot, status, scheduled_for, user_id, reminder_id, trigger)
      VALUES (${row.name}, ${row.phone}, ${row.slot}, 'scheduled', ${scheduledAt},
              ${row.user_id}, ${row.reminder_id}, 'scheduled')
      ON CONFLICT (reminder_id, scheduled_for) DO NOTHING
      RETURNING id
    `;
    if (!inserted.length) {
      enqueued.push({ slot: row.slot, scheduled_for: scheduledAt, skipped: "already enqueued" });
      continue;
    }
    const doseId = inserted[0].id as string;

    const r = await placeRinggCall({
      name: row.name as string,
      mobile_number: row.phone as string,
      slot: row.slot as string,
      doseId,
      scheduledAt,
    });
    await sql`
      UPDATE doses SET status = ${r.status}, ringg_call_id = ${r.callId} WHERE id = ${doseId}
    `;
    enqueued.push({ dose_id: doseId, slot: row.slot, scheduled_for: scheduledAt, status: r.status });
  }

  return { date: todayIST, dry, count: enqueued.length, skippedPast, enqueued };
}
