import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { mapResult } from "@/lib/ringg";

// Receives Ringg call-completion events (production path; needs a public URL).
// dose_id arrives via callback_args.params (query string); we also fall back to call_id.
// NOTE: Ringg's webhook payload shape is not in the public OpenAPI spec — this reads
// fields defensively (data.* or top-level) and should be confirmed against a real event.
export async function POST(req: NextRequest) {
  const secret = process.env.RINGG_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-webhook-secret") !== secret) {
    return Response.json({ error: "invalid webhook secret" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const data = ((body.data as Record<string, unknown>) ?? body) as Record<string, unknown>;
  const custom = data.custom_args_values as Record<string, unknown> | undefined;

  const doseId =
    req.nextUrl.searchParams.get("dose_id") ??
    (typeof data.dose_id === "string" ? data.dose_id : undefined) ??
    (typeof custom?.dose_id === "string" ? (custom.dose_id as string) : undefined);
  const callId =
    (typeof data.call_id === "string" ? data.call_id : undefined) ??
    (typeof data.id === "string" ? data.id : undefined);

  const status = mapResult(data);

  let matched: unknown = null;
  if (doseId) {
    [matched] = await sql`
      UPDATE doses SET status = ${status} WHERE id = ${doseId}
      RETURNING id, status
    `;
  } else if (callId) {
    [matched] = await sql`
      UPDATE doses SET status = ${status} WHERE ringg_call_id = ${callId}
      RETURNING id, status
    `;
  }

  // Ack 200 fast regardless, so Ringg does not retry on our matching misses.
  return Response.json({ ok: true, status, matched: matched ?? null });
}
