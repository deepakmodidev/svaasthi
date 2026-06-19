import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { auth } from "@/lib/auth/server";

// Current user (from Neon Auth) + whether they've completed setup (have a patient).
export async function GET() {
  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  const cnt = await sql`SELECT count(*)::int AS n FROM patients WHERE user_id = ${user.id}`;
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    hasPatient: cnt[0].n > 0,
  });
}
