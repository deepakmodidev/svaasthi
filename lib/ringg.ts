export const RINGG_BASE = "https://prod-api.ringg.ai/ca/api/v0";
export const TIMEZONE = "Asia/Kolkata";

function findBool(obj: unknown, key: string): boolean | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const v = (obj as Record<string, unknown>)[key];
  if (typeof v === "boolean") return v;
  // Ringg may return custom-analysis keys typed as String ("true"/"false"/"yes"/"no").
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "yes") return true;
    if (s === "false" || s === "no") return false;
  }
  return undefined;
}

// Map a Ringg call result (from call-details, history, or webhook) to a dose status.
// Field names differ across endpoints (call_status vs status), so we read both.
// NOTE: medication_taken is a *custom analysis* field — its exact name is not in the
// public OpenAPI spec; confirm it against your agent's analysis config.
export function mapResult(input: Record<string, unknown>): string {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  const callStatus = (str("call_status") || str("status")).toLowerCase();
  const subStatus = (str("call_sub_status") || str("sub_status")).toUpperCase();

  if (subStatus.includes("VOICEMAIL")) return "voicemail";

  if (callStatus === "completed") {
    const taken =
      findBool(input.client_analysis, "medication_taken") ??
      findBool(input.platform_analysis, "medication_taken");
    if (taken === true) return "taken";
    if (taken === false) return "not_taken";
    return "completed";
  }

  if (["failed", "error", "cancelled"].includes(callStatus)) return "failed";

  // Non-terminal (registered / ongoing / retry / forwarded): keep Ringg's status
  // so a not-yet-fired scheduled call isn't relabelled.
  return callStatus || "registered";
}

// Poll Ringg for the latest status of a call (call-details), mapped to a dose
// status. Returns null on any failure so callers leave the dose unchanged.
export async function fetchCallStatus(ringgCallId: string): Promise<string | null> {
  const { RINGG_API_KEY } = process.env;
  if (!RINGG_API_KEY) return null;
  try {
    const res = await fetch(
      `${RINGG_BASE}/calling/call-details?id=${ringgCallId}&send_analysis=true`,
      { headers: { "X-API-KEY": RINGG_API_KEY }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Record<string, unknown> };
    const data = (body?.data ?? body) as Record<string, unknown>;
    return mapResult(data);
  } catch {
    return null;
  }
}

// Cancel queued/retry calls on Ringg by call ID (PATCH /campaign/terminate,
// max 100/request). Terminates calls still in "registered" (scheduled, not yet
// fired) or "retry" state. Used when a patient is paused so they aren't dialed.
// Returns true if Ringg accepted the termination.
export async function terminateCalls(callIds: string[]): Promise<boolean> {
  const { RINGG_API_KEY } = process.env;
  const ids = callIds.filter(Boolean).slice(0, 100);
  if (!RINGG_API_KEY || ids.length === 0) return false;
  try {
    const res = await fetch(`${RINGG_BASE}/campaign/terminate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-API-KEY": RINGG_API_KEY },
      body: JSON.stringify({ call_ids: ids }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Place one outbound Ringg call. Shared by the manual route and the cron, so the
// payload (custom vars, scheduled_at, webhook callback) stays identical everywhere.
export async function placeRinggCall(opts: {
  name: string;
  mobile_number: string;
  slot: string;
  doseId: string;
  scheduledAt?: string | null;
}): Promise<{
  ok: boolean;
  httpStatus: number;
  callId: string | null;
  status: string;
  ringg: unknown;
}> {
  const {
    RINGG_API_KEY,
    RINGG_AGENT_ID,
    RINGG_FROM_NUMBER_ID,
    PUBLIC_BASE_URL,
    RINGG_WEBHOOK_SECRET,
  } = process.env;
  if (!RINGG_API_KEY || !RINGG_AGENT_ID || !RINGG_FROM_NUMBER_ID) {
    return {
      ok: false,
      httpStatus: 0,
      callId: null,
      status: "failed",
      ringg: { error: "Missing RINGG_API_KEY / RINGG_AGENT_ID / RINGG_FROM_NUMBER_ID" },
    };
  }

  const scheduledAt = opts.scheduledAt ?? null;
  const payload: Record<string, unknown> = {
    name: opts.name,
    mobile_number: opts.mobile_number,
    agent_id: RINGG_AGENT_ID,
    from_number_id: RINGG_FROM_NUMBER_ID,
    custom_args_values: {
      callee_name: opts.name,
      slot: opts.slot,
      dose_id: opts.doseId,
    },
  };

  if (scheduledAt) {
    payload.call_config = {
      call_time: {
        call_start_time: "00:00",
        call_end_time: "23:59",
        timezone: TIMEZONE,
        scheduled_at: scheduledAt,
      },
    };
  }

  if (PUBLIC_BASE_URL) {
    payload.callback_url = `${PUBLIC_BASE_URL}/api/ringg/webhook`;
    payload.callback_args = {
      headers: RINGG_WEBHOOK_SECRET ? { "x-webhook-secret": RINGG_WEBHOOK_SECRET } : {},
      params: { dose_id: opts.doseId },
    };
  }

  const res = await fetch(`${RINGG_BASE}/calling/outbound/individual`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": RINGG_API_KEY },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let ringg: unknown;
  try {
    ringg = JSON.parse(text);
  } catch {
    ringg = text;
  }

  const data = (ringg as { data?: { call_id?: string; call_status?: string } })?.data;
  const callId = data?.call_id ?? null;
  const status = res.ok
    ? data?.call_status ?? (scheduledAt ? "scheduled" : "calling")
    : "failed";
  return { ok: res.ok, httpStatus: res.status, callId, status, ringg };
}
