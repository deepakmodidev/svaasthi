import { redirect } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Clock,
  TriangleAlert,
  Voicemail,
  PhoneMissed,
  ChevronDown,
  Ban,
} from "lucide-react";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import {
  CallNowButton,
  CronRunButton,
  LogoutButton,
  ServiceToggleButton,
} from "./dashboard-actions";
import PushSetup from "./push-setup";
import Hero from "./hero";
import { fetchCallStatus } from "@/lib/ringg";
import { notifyMissed } from "@/lib/push";
import { toMin, todayIST, nowMinIST, PENDING, MISSED } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Dose = {
  id: string;
  name: string;
  slot: string;
  status: string;
  scheduled_for: string | null;
  trigger: string;
  created_at: string;
};

const fmt = (s: string) => s.replace("T", " ").slice(0, 16);
const dateOf = (d: Dose) => (d.scheduled_for ?? d.created_at).slice(0, 10);

// Pretty date heading for history groups (e.g. "Mon, 16 Jun").
const dateLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

// The next reminder that will fire for a patient, given the current IST minute.
// Returns today's next slot, or tomorrow's first if all of today's have passed.
function nextCall(
  reminders: { slot: string; time_local: string }[],
  nowMin: number,
) {
  if (reminders.length === 0) return null;
  const sorted = [...reminders].sort(
    (a, b) => toMin(a.time_local) - toMin(b.time_local),
  );
  const upcoming = sorted.find((r) => toMin(r.time_local) > nowMin);
  const r = upcoming ?? sorted[0];
  return {
    slot: r.slot,
    time: r.time_local,
    when: upcoming ? ("today" as const) : ("tomorrow" as const),
  };
}

// Status → pill classes (soft tint + inset ring).
const pill = (s: string) => {
  const tone =
    s === "taken" || s === "completed"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : s === "not_taken" || s === "failed"
        ? "bg-rose-50 text-rose-700 ring-rose-600/20"
        : s === "voicemail"
          ? "bg-amber-50 text-amber-700 ring-amber-600/20"
          : s === "no_answer" || s === "cancelled"
            ? "bg-zinc-100 text-zinc-600 ring-zinc-500/20"
            : "bg-blue-50 text-blue-700 ring-blue-600/20";
  return `inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`;
};

// Status → leading icon for pills.
function StatusIcon({ status }: { status: string }) {
  const cls = "h-3 w-3";
  if (status === "taken" || status === "completed")
    return <CheckCircle2 className={cls} />;
  if (status === "not_taken" || status === "failed")
    return <XCircle className={cls} />;
  if (status === "voicemail") return <Voicemail className={cls} />;
  if (status === "no_answer") return <PhoneMissed className={cls} />;
  if (status === "cancelled") return <Ban className={cls} />;
  return <Clock className={cls} />;
}

const eyebrow = "text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground";
const card = "rounded-3xl border border-border bg-card shadow-sm";

export default async function Dashboard() {
  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user) return <Hero />;

  const patientRows = await sql`
    SELECT id, name, phone, active FROM patients WHERE user_id = ${user.id} ORDER BY created_at DESC
  `;
  if (patientRows.length === 0) redirect("/setup");

  const reminderRows = await sql`
    SELECT r.patient_id, r.slot, r.time_local
    FROM reminders r JOIN patients p ON p.id = r.patient_id
    WHERE p.user_id = ${user.id} ORDER BY r.time_local
  `;

  // Auto-reconcile in-progress calls so the dashboard is current without a manual
  // refresh (on localhost there is no webhook to push completions).
  const inProgress = await sql`
    SELECT id, ringg_call_id FROM doses
    WHERE user_id = ${user.id} AND ringg_call_id IS NOT NULL
      AND status IN ('registered', 'ongoing', 'retry', 'calling')
  `;
  await Promise.all(
    inProgress.map(async (d) => {
      const s = await fetchCallStatus(d.ringg_call_id as string);
      if (s) {
        await sql`UPDATE doses SET status = ${s} WHERE id = ${d.id}`;
        await notifyMissed(d.id as string);
      }
    }),
  );

  const doses = (await sql`
    SELECT id, name, slot, status, scheduled_for, trigger,
           to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at
    FROM doses WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 200
  `) as Dose[];

  const patients = patientRows.map((p) => ({
    id: p.id as string,
    name: p.name as string,
    phone: p.phone as string,
    active: p.active as boolean,
    reminders: reminderRows
      .filter((r) => r.patient_id === p.id)
      .map((r) => ({ slot: r.slot as string, time_local: r.time_local as string })),
  }));

  const today = todayIST();
  const nowMin = nowMinIST();
  const todays = doses.filter((d) => dateOf(d) === today);
  const takenCount = todays.filter(
    (d) => d.status === "taken" || d.status === "completed",
  ).length;
  const missed = todays.filter((d) => MISSED.includes(d.status));
  const pendingCount = todays.filter((d) => PENDING.includes(d.status)).length;

  const byDate: Record<string, Dose[]> = {};
  for (const d of doses) {
    const k = dateOf(d);
    if (!byDate[k]) byDate[k] = [];
    byDate[k].push(d);
  }
  const dates = Object.keys(byDate).sort().reverse();
  const userName = (user.name as string) || (user.email as string) || "";

  // Soonest upcoming call across active (non-paused) patients.
  const upcoming = patients
    .filter((p) => p.active)
    .map((p) => {
      const n = nextCall(p.reminders, nowMin);
      return n ? { ...n, patient: p.name } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort(
      (a, b) =>
        (a.when === "today" ? 0 : 1) - (b.when === "today" ? 0 : 1) ||
        toMin(a.time) - toMin(b.time),
    );
  const soonest = upcoming[0] ?? null;

  // Today's planned schedule (what the daily cron places) with live status.
  // Paused patients are excluded — the cron won't call them.
  const schedule = patients
    .filter((p) => p.active)
    .flatMap((p) =>
      p.reminders.map((r) => {
        const dose = todays.find(
          (d) =>
            d.slot === r.slot &&
            (d.scheduled_for ?? "").slice(11, 16) === r.time_local,
        );
        return {
          patient: p.name,
          slot: r.slot,
          time: r.time_local,
          status: dose?.status ?? null,
        };
      }),
    )
    .sort((a, b) => toMin(a.time) - toMin(b.time));
  const enqueuedToday = todays.filter((d) => d.trigger === "scheduled").length;
  const allPaused = patients.length > 0 && patients.every((p) => !p.active);
  const anyActive = patients.some((p) => p.active);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Svaasthi Logo"
              className="h-9 w-9 shrink-0 rounded-xl object-cover"
            />
            <span className="font-serif text-2xl font-normal tracking-tight">
              Svaasthi
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <ServiceToggleButton active={anyActive} />
            <PushSetup />
            <LogoutButton />
          </div>
        </div>
        <h1 className="mt-8 font-serif text-3xl font-normal tracking-tight">
          {userName ? `Hi ${userName}` : "Medicine reminders"}
        </h1>
      </header>

      {/* Who we're reminding */}
      <section className="mt-10 flex flex-col gap-3">
        {patients.map((p) => (
          <div
            key={p.id}
            className={`flex items-center justify-between gap-4 p-5 transition-colors hover:border-primary/40 ${card} ${p.active ? "" : "opacity-70"}`}
          >
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-serif text-lg text-primary">
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-serif flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-medium">{p.name}</span>
                  ||
                  <span className="shrink-0">
                    {p.phone}
                  </span>
                  {!p.active && (
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 font-sans text-xs font-medium text-zinc-500 ring-1 ring-inset ring-zinc-500/20">
                      Paused
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-sm text-muted-foreground">
                  {p.reminders.length
                    ? p.reminders
                        .map((r) => `${r.slot} ${r.time_local}`)
                        .join(", ")
                    : "no reminders"}
                </div>
              </div>
            </div>
            <CallNowButton disabled={!p.active} />
          </div>
        ))}
      </section>

      {/* Next call + cron status */}
      <section className={`mt-4 p-6 ${card}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Clock className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className={eyebrow}>Next call</span>
            {soonest ? (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="font-serif text-2xl leading-none">
                  {soonest.time}
                </span>
                <span className="text-sm text-muted-foreground">
                  {soonest.slot}
                  {soonest.when === "tomorrow" ? " · tomorrow" : ""}
                </span>
              </div>
            ) : allPaused ? (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="font-serif text-2xl leading-none text-muted-foreground">
                  Paused
                </span>
                <span className="text-sm text-muted-foreground">
                  resume to schedule calls
                </span>
              </div>
            ) : (
              <div className="mt-1 font-serif text-2xl leading-none text-muted-foreground">
                No upcoming calls
              </div>
            )}
          </div>
        </div>

        <details className="group mt-5 border-t border-border pt-4">
          <summary className="flex list-none items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            Cron status &amp; today&apos;s schedule
          </summary>
          <div className="mt-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Daily reminder cron runs at{" "}
                <span className="font-medium text-foreground">00:15 IST</span> ·{" "}
                {enqueuedToday > 0
                  ? `${enqueuedToday} call${enqueuedToday > 1 ? "s" : ""} enqueued today`
                  : "no calls enqueued yet today"}
                .
              </p>
              <CronRunButton disabled={!anyActive} />
            </div>
            {schedule.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No reminder times set.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {schedule.map((s, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                      {s.time}
                    </span>
                    <span className="font-medium">{s.slot}</span>
                    {s.status ? (
                      <span className={`ml-auto ${pill(s.status)}`}>
                        <StatusIcon status={s.status} />
                        {s.status}
                      </span>
                    ) : toMin(s.time) > nowMin ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        scheduled
                      </span>
                    ) : (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <XCircle className="h-3 w-3" />
                        no call
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </section>

      {/* Today */}
      <section className={`mt-4 p-6 ${card}`}>
        <div className="flex items-baseline justify-between">
          <h2 className={eyebrow}>Today</h2>
          <span className="text-xs text-muted-foreground">{today}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { n: takenCount, label: "Taken", color: "text-emerald-600", Icon: CheckCircle2 },
            { n: missed.length, label: "Missed", color: "text-rose-600", Icon: XCircle },
            { n: pendingCount, label: "Pending", color: "text-blue-600", Icon: Clock },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-border bg-secondary/40 px-4 py-4"
            >
              <s.Icon className={`h-4 w-4 ${s.color}`} />
              <div className={`mt-2 font-serif text-3xl leading-none ${s.color}`}>
                {s.n}
              </div>
              <div className="mt-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>
        {missed.length > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-600/20">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Needs attention — {missed.map((d) => `${d.slot} (${d.status})`).join(", ")}.
            </span>
          </p>
        )}
        {todays.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            No calls scheduled today.
          </p>
        )}
      </section>

      {/* History */}
      <section className={`mt-4 p-6 ${card}`}>
        <h2 className={eyebrow}>Call history</h2>
        {dates.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No calls yet - they&apos;ll appear here once the daily reminder runs or
            you press Call now.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {dates.map((date) => (
              <div key={date}>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  {dateLabel(date)}
                </div>
                <ul className="divide-y divide-border">
                  {byDate[date].map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-3 text-sm">
                      <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                        {fmt(d.scheduled_for ?? d.created_at).slice(11)}
                      </span>
                      <span className="font-medium">{d.slot}</span>
                      <span className="truncate text-muted-foreground">
                        {d.trigger === "scheduled" ? "auto" : "manual"}
                      </span>
                      <span className={`ml-auto ${pill(d.status)}`}>
                        <StatusIcon status={d.status} />
                        {d.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
