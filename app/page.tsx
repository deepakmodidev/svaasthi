import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { CallNowButton, LogoutButton, RefreshButton } from "./dashboard-actions";
import PushSetup from "./push-setup";
import { fetchCallStatus } from "@/lib/ringg";
import { notifyMissed } from "@/lib/push";

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

const PENDING = ["scheduled", "registered", "calling", "retry", "ongoing"];
const MISSED = ["not_taken", "no_answer", "voicemail", "failed"];

const fmt = (s: string) => s.replace("T", " ").slice(0, 16);
const dateOf = (d: Dose) => (d.scheduled_for ?? d.created_at).slice(0, 10);

// Status → pill classes.
const pill = (s: string) => {
  const tone =
    s === "taken" || s === "completed"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : s === "not_taken" || s === "failed"
        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
        : s === "voicemail"
          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          : s === "no_answer"
            ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
  return `inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`;
};

export default async function Dashboard() {
  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user) redirect("/auth?mode=login");

  const patientRows = await sql`
    SELECT id, name, phone FROM patients WHERE user_id = ${user.id} ORDER BY created_at DESC
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
    reminders: reminderRows
      .filter((r) => r.patient_id === p.id)
      .map((r) => ({ slot: r.slot as string, time_local: r.time_local as string })),
  }));

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
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

  const card =
    "rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Svaasthi</h1>
            <p className="text-sm text-zinc-500">Hi {userName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <PushSetup />
          <RefreshButton />
          <LogoutButton />
        </div>
      </header>

      <section className="mt-8 flex flex-col gap-3">
        {patients.map((p) => (
          <div
            key={p.id}
            className={`flex items-center justify-between gap-4 p-4 ${card}`}
          >
            <div className="min-w-0">
              <div className="font-medium">{p.name}</div>
              <div className="mt-0.5 truncate text-sm text-zinc-500">
                {p.phone}
                {p.reminders.length
                  ? ` · ${p.reminders.map((r) => `${r.slot} ${r.time_local}`).join(", ")}`
                  : " · no reminders"}
              </div>
            </div>
            <CallNowButton name={p.name} phone={p.phone} />
          </div>
        ))}
      </section>

      <section className={`mt-4 p-5 ${card}`}>
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Today · {today}
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[
            { n: takenCount, label: "Taken", color: "text-emerald-600" },
            { n: missed.length, label: "Missed", color: "text-red-600" },
            { n: pendingCount, label: "Pending", color: "text-blue-600" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className={`text-2xl font-semibold ${s.color}`}>{s.n}</div>
              <div className="text-xs text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>
        {missed.length > 0 && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/60 dark:text-red-300">
            ⚠ Needs attention: {missed.map((d) => `${d.slot} (${d.status})`).join(", ")}.
          </p>
        )}
        {todays.length === 0 && (
          <p className="mt-3 text-sm text-zinc-400">No calls scheduled today.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Call history
        </h2>
        {dates.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            No calls yet — they&apos;ll appear here once the daily reminder runs or
            you press Call now.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-6">
            {dates.map((date) => (
              <div key={date}>
                <div className="mb-2 text-xs font-medium text-zinc-400">{date}</div>
                <ul className={`divide-y divide-zinc-100 px-4 dark:divide-zinc-800 ${card}`}>
                  {byDate[date].map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-3 text-sm">
                      <span className="w-12 tabular-nums text-zinc-500">
                        {fmt(d.scheduled_for ?? d.created_at).slice(11)}
                      </span>
                      <span className="font-medium">{d.slot}</span>
                      <span className="truncate text-zinc-400">
                        {d.name}
                        {d.trigger === "scheduled" ? " · auto" : ""}
                      </span>
                      <span className={`ml-auto ${pill(d.status)}`}>{d.status}</span>
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
