"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

const field =
  "h-12 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function AuthForm({
  initialMode,
}: {
  initialMode: "login" | "signup";
}) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchMode(m: "login" | "signup") {
    setMode(m);
    setError(null);
    window.history.replaceState(null, "", `/auth?mode=${m}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res =
        mode === "signup"
          ? await authClient.signUp.email({ email, password, name })
          : await authClient.signIn.email({ email, password });
      if (res?.error) {
        setError(res.error.message || "Authentication failed");
        return;
      }
      window.location.assign("/");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 opacity-70"
      >
        <img
          src="/auth-gradient.svg"
          alt=""
          className="h-auto w-full translate-y-2/3 scale-150 rotate-180 object-cover"
        />
      </div>
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <img
            src="/logo.png"
            alt="Svaasthi Logo"
            className="h-9 w-9 shrink-0 rounded-xl object-cover"
          />
          <span className="font-serif text-2xl font-normal tracking-tight">
            Svaasthi
          </span>
        </div>
        <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <h1 className="font-serif text-3xl font-normal tracking-tight">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup"
            ? "Start reminding the people you care for."
            : "Sign in to check in on your family."}
        </p>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
          {mode === "signup" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={field}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
              className={field}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-1 h-12 w-full rounded-full bg-foreground text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {loading
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : "Log in"}
          </button>
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-rose-600/20 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {error}
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button
                onClick={() => switchMode("login")}
                className="font-medium text-primary hover:underline"
              >
                Log in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button
                onClick={() => switchMode("signup")}
                className="font-medium text-primary hover:underline"
              >
                Sign up
              </button>
            </>
          )}
        </p>
        </div>
      </div>
    </main>
  );
}
