# Family-First Medicine Reminder — MVP Plan (minimal)

**Status:** v0.4 · 2026-06-18

## Goal
Call a parent at each medicine time, ask **"have you taken it?"** If not, advise taking it and confirm, or offer a callback. The child sees **taken / missed** on a dashboard.

## Privacy stance (core design choice)
**We store no medicine names, doses, transcripts, reasons, or recordings.** The call is a *generic* reminder — it never names the drug — so nothing sensitive is spoken (safe on voicemail / wrong person) or saved. We keep only: who to call, when, and the outcome. The caregiver maps a slot ("Morning") to the actual pill in their own head.
> Tradeoff: the call says "your morning medicine," not "your Metformin." Naming the drug would require storing it — out of scope by choice.

## The app in 4 pieces
1. **Screens** — caregiver adds a parent + reminder times.
2. **Daily job** — queues that day's calls via Ringg `scheduled_at`.
3. **One English agent** — runs the generic call.
4. **One webhook** — records taken / not.

## Data (minimal — no health data)
```sql
patients   (id, user_id, name, phone, timezone, active)
reminders  (id, patient_id, time_local, slot)   -- slot = generic label: Morning|Afternoon|Evening|Night
doses      (id, reminder_id, patient_id, user_id, due_at, trigger, status, taken bool, ringg_call_id)
           -- trigger: scheduled|manual|followup
           -- status:  scheduled|calling|taken|not_taken|rescheduled|no_answer|voicemail|failed
```
- `unique (reminder_id, due_at) where trigger='scheduled'` · index `(user_id, due_at desc)` · unique `ringg_call_id`.
- **No** transcript / reason / raw-payload / recording columns. Ever. (`name`, `phone` are the only personal data, and they're required to place the call.)

## Scheduling
Daily enqueue (Vercel Cron, early IST) → for each reminder time today: insert a dose + place a Ringg call with `scheduled_at` = today's local time. `scheduled_at` is wall-clock in `call_time.timezone` (Asia/Kolkata for MVP — single zone, no DST). Follow-up = `now + 1h` (cap 2). "Call now" = immediate. Multi-timezone/DST is Phase 2.

## Agent (one, English, generic)
- **Intro:** "Hello @{{name}}, this is your @{{slot}} medicine reminder from your family."
- **Flow:** ask "have you taken your medicine?" → **yes** = done; **no** → "please take it now and tell me when you have, or I can call you back later." **Never names a drug; never instructs a specific dose.** Discloses it's an automated reminder; offers "say STOP to stop these calls."
- **Custom Analysis — two booleans only (no free text):** `medication_taken`, `followup_requested`.
- **Settings:** voicemail detection on; retries 1–2; `voice_speed ≈ 0.95`; generous idle timeout.

## Place call — `POST /calling/outbound/individual` (v1)
```jsonc
{
  "name": "Ramesh", "mobile_number": "+9198XXXXXXXX",
  "agent_id": "<RINGG_AGENT_ID>", "from_number_id": "<RINGG_FROM_NUMBER_ID>",
  "custom_args_values": { "slot": "Morning", "dose_id": "<dose uuid>" },
  "call_config": { "call_time": {
    "call_start_time": "08:00", "call_end_time": "21:00", "timezone": "Asia/Kolkata",
    "scheduled_at": "2026-06-19T08:00:00"        // omit for Call now; follow-up = now+1h
  } },
  "callback_url": "https://<app>/api/ringg/webhook",
  "callback_args": { "headers": { "x-webhook-secret": "<secret>" }, "params": { "dose_id": "<dose uuid>" } }
}
```
Save `data.call_id` → `doses.ringg_call_id`.

## Webhook — `POST /api/ringg/webhook` (subscribe agent to `all_processing_completed`)
1. Verify `x-webhook-secret`; dedupe via a `webhook_events(call_id, event_type)` unique row; **ack 200 fast, process async**.
2. Match dose by `dose_id`, else by `ringg_call_id == call_id`.
3. `sub_status` contains `VOICEMAIL_DETECTED` → **voicemail**.
4. Only if `client_analysis_status == success`: `medication_taken` true → **taken**; false + `followup_requested` → **rescheduled** (place a call at `now+1h`, cap 2); false → **not_taken**. Else → **no_answer / failed**.
5. **Store only** `status` + `taken` + `ringg_call_id`. Discard transcript / recording / any free text.

**Reconcile (in v1):** a cron sweeps doses stuck in `calling` past `due_at + grace` → `GET /calling/call-details?id=&send_analysis=true` (note renamed fields `call_status`/`call_sub_status`) → same mapping.

## Alerts (in v1)
On `not_taken` / `no_answer` / `voicemail` / `failed` → **push to the caregiver** (SMS/WhatsApp). A dashboard red dot alone isn't enough — the child must be told.

## Dashboard
Per patient: today's reminders with a status dot (green taken / red missed / grey pending) + a "Call now" button. Tap → status + time only.

## Before going live (hard gates — real calls to an elderly person)
- **Consent:** capture the parent's opt-in; verify the number is theirs; honor in-call STOP.
- **India TRAI/DLT:** register entity + header, scrub DND (treat `DND_SKIPPED` as a hard stop). Confirm Ringg supports this.
- **Safety:** agent never instructs a dose; has an emergency line ("call your doctor / emergency services"); medical disclaimer + ToS.
- **Reliability:** cron heartbeat; reconcile + stuck-dose sweep; rate-limit "Call now"; cap follow-ups.

## Env
```
DATABASE_URL · AUTH_* · RINGG_API_KEY · RINGG_AGENT_ID · RINGG_FROM_NUMBER_ID · RINGG_WEBHOOK_SECRET · CRON_SECRET
```

## Build order
1. Schema + onboarding (parent + reminder times).
2. Agent + "Call now" + webhook — prove the loop on a **test number**.
3. Daily enqueue + reconcile + heartbeat.
4. Alerts + dashboard.

## Verify live with Ringg
1. Agent webhook delivers `all_processing_completed` to our URL.
2. Custom Analysis returns `medication_taken`.
3. `scheduled_at` holds & fires on **v1** (timezone taken from `call_time.timezone`).
