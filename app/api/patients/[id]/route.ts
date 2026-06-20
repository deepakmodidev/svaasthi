import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";

// Pause / resume a patient's automated calls by toggling patients.active.
// The cron and Run now both enqueue only WHERE active = true, so a paused
// patient gets no scheduled calls until resumed.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const active = Boolean(body.active);

  const [updated] = await sql`
    UPDATE patients SET active = ${active}
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id, active
  `;
  if (!updated) {
    return NextResponse.json({ error: "patient not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: updated.id, active: updated.active });
}
