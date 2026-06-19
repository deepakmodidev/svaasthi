import { redirect } from "next/navigation";
import AuthForm from "./auth-form";

// Server page: read ?mode so the first paint is correct (no flicker), and never
// allow a bare /auth — redirect to ?mode=login.
export default async function Auth({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  if (mode !== "login" && mode !== "signup") {
    redirect("/auth?mode=login");
  }
  return <AuthForm initialMode={mode} />;
}
