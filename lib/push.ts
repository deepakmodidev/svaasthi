import webpush from "web-push";
import { sql } from "@/lib/db";

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
if (PUB && PRIV) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@svaasthi.app",
    PUB,
    PRIV,
  );
}

const MISSED = ["not_taken", "no_answer", "voicemail", "failed"];

type Payload = { title: string; body: string; url?: string };

// Send a push to every browser the user has subscribed. Prunes dead subscriptions.
export async function sendPushToUser(userId: string, payload: Payload) {
  if (!PUB || !PRIV) return;
  const subs = await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}
  `;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint as string,
            keys: { p256dh: s.p256dh as string, auth: s.auth as string },
          },
          JSON.stringify(payload),
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`;
        }
      }
    }),
  );
}

// Notify the caregiver once when a dose ends up missed. Idempotent via doses.notified,
// so it's safe to call from both the webhook and the dashboard reconcile.
export async function notifyMissed(doseId: string) {
  const [d] = await sql`
    SELECT user_id, name, slot, status, notified FROM doses WHERE id = ${doseId}
  `;
  if (!d || d.notified || !d.user_id || !MISSED.includes(d.status as string)) return;
  await sendPushToUser(d.user_id as string, {
    title: "Missed medicine",
    body: `${d.name} hasn't taken their ${d.slot} medicine.`,
  });
  await sql`UPDATE doses SET notified = true WHERE id = ${doseId}`;
}
