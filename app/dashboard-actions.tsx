"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

// Small client islands for the otherwise server-rendered dashboard.
// Each action hits an API then router.refresh() to re-run the server component.

export function LogoutButton() {
  async function logout() {
    await authClient.signOut();
    window.location.assign("/auth?mode=login");
  }
  return (
    <button
      onClick={logout}
      className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100"
    >
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
      className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
    >
      {pending ? "Refreshing…" : "↻ Refresh"}
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
      className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {busy ? "Calling…" : "Call now"}
    </button>
  );
}
