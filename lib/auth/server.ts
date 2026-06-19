import { NextResponse } from "next/server";
import { createNeonAuth } from "@neondatabase/auth/next/server";

// Single server-side auth instance: .handler(), .middleware(), .getSession(), etc.
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});

// Current Neon Auth user id (string), or null — used to scope DB rows.
export async function currentUserId(): Promise<string | null> {
  const { data } = await auth.getSession();
  return data?.user?.id ?? null;
}

// Single auth guard for protected API routes. Returns the user id, or a 401
// response. Use uniformly so a new route can't silently skip auth:
//   const userId = await requireUser();
//   if (typeof userId !== "string") return userId;
export async function requireUser(): Promise<string | NextResponse> {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return userId;
}
