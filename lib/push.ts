import webpush from "web-push";
import { sql } from "@/lib/db";
import { MISSED } from "@/lib/status";

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;

// web-push requires the subject to be a mailto: or https: URL. Accept a bare
// email (or anything) from the env and normalize it so a sloppy value can't
// crash the build — this runs at import time during page-data collection.
function vapidSubject(): string {
  const raw = (process.env.VAPID_SUBJECT || "").trim();
  if (raw.startsWith("mailto:") || raw.startsWith("https://")) return raw;
  if (raw.includes("@")) return `mailto:${raw}`;
  return "mailto:deepakmodi8676@gmail.com";
}

// Whether Web Push is usable. Guarded so a bad VAPID config degrades to "off"
// instead of throwing and breaking unrelated routes / the build.
let pushReady = false;
if (PUB && PRIV) {
  try {
    webpush.setVapidDetails(vapidSubject(), PUB, PRIV);
    pushReady = true;
  } catch (e) {
    console.error("[push] invalid VAPID config — push disabled:", e);
  }
}

type Payload = { title: string; body: string; url?: string };

// Send a push to every browser the user has subscribed. Prunes dead subscriptions.
export async function sendPushToUser(userId: string, payload: Payload) {
  if (!pushReady) return;
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
