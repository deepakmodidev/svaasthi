import { auth } from "@/lib/auth/server";

// Proxies all Neon Auth requests (signup, signin, signout, session, ...).
export const { GET, POST } = auth.handler();
