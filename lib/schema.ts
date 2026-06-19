import { sql } from "@/lib/db";

// The complete database schema, applied idempotently. Lives here (not inside the
// route handler) so the schema is defined in one place, separate from the endpoint
// that triggers it. India-only: all times are Asia/Kolkata, so there is no
// per-row timezone column. user_id is text (Neon Auth ids are strings).
//
// Kept as a TS module rather than a .sql file so it reuses the resilient `sql`
// client (retry + IPv6 fix) and needs no migration tooling.
export async function ensureSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS patients (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    text,
      name       text NOT NULL,
      phone      text NOT NULL,
      active     boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS reminders (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      slot       text NOT NULL,
      time_local text NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS doses (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       text,
      reminder_id   uuid,
      name          text NOT NULL,
      phone         text NOT NULL,
      slot          text NOT NULL,
      status        text NOT NULL,
      trigger       text NOT NULL DEFAULT 'manual',
      scheduled_for text,
      ringg_call_id text,
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `;

  // One scheduled call per reminder per day — scheduled_for ("YYYY-MM-DDTHH:MM:SS"
  // in IST) is the per-day key. NULLs are distinct, so manual doses never collide.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS doses_reminder_sched_uniq ON doses (reminder_id, scheduled_for)`;

  // Web Push: whether a "missed dose" notification was already sent for this dose.
  await sql`ALTER TABLE doses ADD COLUMN IF NOT EXISTS notified boolean NOT NULL DEFAULT false`;

  // One row per browser push subscription, owned by a user.
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint   text PRIMARY KEY,
      user_id    text NOT NULL,
      p256dh     text NOT NULL,
      auth       text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}
