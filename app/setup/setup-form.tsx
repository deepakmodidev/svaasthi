"use client";

import { useState } from "react";

const SLOTS = ["Morning", "Afternoon", "Evening", "Night"] as const;
const DEFAULT_TIME: Record<string, string> = {
  Morning: "08:00",
  Afternoon: "14:00",
  Evening: "20:00",
  Night: "22:00",
};

const field =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-600 dark:focus:ring-white/10";

export default function SetupForm() {
  const [parent, setParent] = useState("");
  const [phone, setPhone] = useState("");
  const [times, setTimes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const reminders = SLOTS.filter((s) => times[s]).map((s) => ({
      slot: s,
      time_local: times[s],
    }));
    if (reminders.length === 0) {
      setError("Pick at least one reminder time.");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parent, phone, reminders }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      window.location.assign("/");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold tracking-tight">Quick setup</h1>
        <p className="mt-1 text-sm text-zinc-500">
          One time only — who are we reminding, and when?
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Parent&apos;s name</label>
            <input
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              required
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              Parent&apos;s mobile (E.164)
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="+919876543210"
              className={field}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Reminder times</span>
            <p className="-mt-1 text-xs text-zinc-500">
              Pick the slots you want — leave the rest blank.
            </p>
            {SLOTS.map((s) => (
              <div
                key={s}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <span className="w-20 text-sm">{s}</span>
                <input
                  type="time"
                  value={times[s] ?? ""}
                  onChange={(e) =>
                    setTimes((t) => ({ ...t, [s]: e.target.value }))
                  }
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button
                  type="button"
                  onClick={() =>
                    setTimes((t) => ({ ...t, [s]: DEFAULT_TIME[s] }))
                  }
                  className="ml-auto text-xs font-medium text-emerald-600 hover:underline"
                >
                  use {DEFAULT_TIME[s]}
                </button>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-1 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {saving ? "Saving…" : "Finish setup"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  );
}
