"use client";

import { createAuthClient } from "@neondatabase/auth/next";

// Browser-side auth (signUp/signIn/signOut). Talks to /api/auth/* same-origin.
export const authClient = createAuthClient();
