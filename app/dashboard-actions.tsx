"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Phone, Play, RefreshCw } from "lucide-react";
import { authClient } from "@/lib/auth/client";

// Small client islands for the otherwise server-rendered dashboard.
// Each action hits an API then router.refresh() to re-run the server component.

// Bordered pill — shared by the header actions (matches the Run now button).
const ghost =
  "inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50";

export function LogoutButton() {
  async function logout() {
    await authClient.signOut();
    window.location.assign("/auth?mode=login");
  }
  return (
    <button
      onClick={logout}
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-rose-300 hover:text-rose-600"
    >
      <LogOut className="h-4 w-4" />
      Log out
    </button>
  );
}

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Re-runs the server component, which reconciles in-progress calls.
  return (
    <button
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className={ghost}
    >
      <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}

function slotForNow(): string {
  const h = Number(
    new Date().toLocaleString("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }),
  );
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  if (h < 21) return "Evening";
  return "Night";
}

export function CronRunButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Enqueues today's upcoming calls for this user (skips already-passed slots).
  async function run() {
    setBusy(true);
    try {
      await fetch("/api/cron/run", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={run}
      disabled={busy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 disabled:opacity-50"
    >
      <Play className={`h-3.5 w-3.5 ${busy ? "animate-pulse" : ""}`} />
      {busy ? "Running…" : "Run now"}
    </button>
  );
}

export function CallNowButton({ name, phone }: { name: string; phone: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function callNow() {
    setBusy(true);
    try {
      await fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mobile_number: phone, slot: slotForNow() }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={callNow}
      disabled={busy}
      className="inline-flex shrink-0 items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
    >
      <Phone className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
      {busy ? "Calling…" : "Call now"}
    </button>
  );
}
