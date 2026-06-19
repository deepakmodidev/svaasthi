import { ensureSchema } from "@/lib/schema";

// Idempotent schema setup — hit GET /api/setup once after a schema change.
// The schema itself is defined in lib/schema.ts.
export async function GET() {
  await ensureSchema();
  return Response.json({ ok: true, tables: ["patients", "reminders", "doses"] });
}
