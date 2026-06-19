import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import SetupForm from "./setup-form";

export const dynamic = "force-dynamic";

// Server guard: must be logged in, and skip setup if a patient already exists.
export default async function Setup() {
  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user) redirect("/auth?mode=login");

  const cnt = await sql`SELECT count(*)::int AS n FROM patients WHERE user_id = ${user.id}`;
  if (cnt[0].n > 0) redirect("/");

  return <SetupForm />;
}
