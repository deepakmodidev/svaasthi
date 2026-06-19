import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { placeRinggCall } from "@/lib/ringg";

// Daily enqueue: for each active patient's reminders, schedule today's calls via
// Ringg `scheduled_at`. Idempotent — re-running the same day won't double-call
// (unique index on (reminder_id, scheduled_for) + ON CONFLICT DO NOTHING).
//
// Auth: requires CRON_SECRET via ?secret=, x-cron-secret header, or
// `Authorization: Bearer <secret>` (Vercel Cron sends this automatically).
// Pass ?dry=1 to create the dose rows without actually placing calls (for testing).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.nextUrl.searchParams.get("secret") ||
      req.headers.get("x-cron-secret") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (provided !== secret) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";

  // Today's date in IST (YYYY-MM-DD). Reminders are wall-clock IST for the MVP.
  const todayIST = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });

  const rows = await sql`
    SELECT p.user_id, p.name, p.phone, r.id AS reminder_id, r.slot, r.time_local
    FROM patients p
    JOIN reminders r ON r.patient_id = p.id
    WHERE p.active = true
    ORDER BY r.time_local
  `;

  const enqueued: unknown[] = [];
  for (const row of rows) {
    const scheduledAt = `${todayIST}T${row.time_local}:00`; // wall-clock IST; Ringg + dedupe key

    // Dry run is read-only: report what would happen without inserting/calling.
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
      name: row.name,
      mobile_number: row.phone,
      slot: row.slot,
      doseId,
      scheduledAt,
    });
    await sql`
      UPDATE doses SET status = ${r.status}, ringg_call_id = ${r.callId} WHERE id = ${doseId}
    `;
    enqueued.push({ dose_id: doseId, slot: row.slot, scheduled_for: scheduledAt, status: r.status });
  }

  return Response.json({ ok: true, date: todayIST, dry, count: enqueued.length, enqueued });
}
