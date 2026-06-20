import { auth } from "@/lib/auth/server";

// Next.js 16 uses proxy.ts (replaces middleware.ts). Redirects unauthenticated
// users away from protected pages. APIs self-guard via currentUserId().
// Note: "/" is intentionally NOT matched — logged-out visitors see the landing
// hero there (page.tsx renders <Hero/>); only the dashboard half needs a session.
export default auth.middleware({
  loginUrl: "/auth?mode=login",
});

export const config = {
  matcher: ["/setup"],
};
