import { auth } from "@/lib/auth/server";

// Next.js 16 uses proxy.ts (replaces middleware.ts). Redirects unauthenticated
// users away from protected pages. APIs self-guard via currentUserId().
export default auth.middleware({
  loginUrl: "/auth?mode=login",
});

export const config = {
  matcher: ["/", "/setup"],
};
