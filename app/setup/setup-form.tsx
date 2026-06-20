"use client";

import { useState } from "react";
import { Sunrise, Sun, Sunset, Moon, type LucideIcon } from "lucide-react";

const SLOTS = ["Morning", "Afternoon", "Evening", "Night"] as const;
const DEFAULT_TIME: Record<string, string> = {
  Morning: "08:00",
  Afternoon: "14:00",
  Evening: "18:00",
  Night: "22:00",
};
const SLOT_ICON: Record<string, LucideIcon> = {
  Morning: Sunrise,
  Afternoon: Sun,
  Evening: Sunset,
  Night: Moon,
};

const field =
  "h-12 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20";

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
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
      <div className="relative z-10 w-full max-w-xl rounded-3xl border border-border bg-card p-8 shadow-sm">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Quick setup
        </span>
        <h1 className="mt-2 font-serif text-3xl font-normal tracking-tight">
          Who are we reminding?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One time only — add your parent and the times to call.
        </p>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Parent&apos;s name</label>
            <input
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              required
              placeholder="e.g. Amma"
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
            <p className="-mt-1 text-xs text-muted-foreground">
              Pick the slots you want — leave the rest blank.
            </p>
            {SLOTS.map((s) => {
              const Icon = SLOT_ICON[s];
              return (
              <div
                key={s}
                className="flex items-center gap-3 rounded-2xl border border-border px-4 py-2.5"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="w-16 text-sm font-medium">{s}</span>
                <input
                  type="time"
                  value={times[s] ?? ""}
                  onChange={(e) =>
                    setTimes((t) => ({ ...t, [s]: e.target.value }))
                  }
                  className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setTimes((t) => ({ ...t, [s]: DEFAULT_TIME[s] }))
                  }
                  className="ml-auto text-xs font-medium text-primary hover:underline"
                >
                  use {DEFAULT_TIME[s]}
                </button>
              </div>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-1 h-12 w-full rounded-full bg-foreground text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Finish setup"}
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
      </div>
    </main>
  );
}
