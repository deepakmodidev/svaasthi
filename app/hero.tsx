import Link from "next/link";
import {
  Pill,
  Phone,
  BellRing,
  LayoutDashboard,
  ArrowRight,
} from "lucide-react";

// Single-slide landing hero shown to logged-out visitors at "/".
export default function Hero() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Warm gradient wash rising from below, same as the auth screens. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 opacity-70"
      >
        <img
          src="/auth-gradient.svg"
          alt=""
          className="h-auto w-full translate-y-2/3 scale-120 rotate-180 object-cover"
        />
      </div>

      {/* Top bar */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Pill className="h-5 w-5" />
          </div>
          <span className="font-serif text-2xl font-normal tracking-tight">
            Svaasthi
          </span>
        </div>
        <Link
          href="/auth?mode=login"
          className="rounded-full border border-border bg-card px-5 py-2 text-sm font-medium transition-colors hover:border-primary/40"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Family-first medicine reminders
        </span>

        <h1 className="mt-5 font-serif text-5xl font-normal leading-[1.05] tracking-tight md:text-6xl">
          Never let them miss a dose again.
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Svaasthi calls your parents at medicine time, asks if they&apos;ve taken
          it, and alerts you the moment a dose is missed, nothing for them to
          install or learn.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/auth?mode=signup"
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3.5 text-sm font-medium text-background transition hover:opacity-90"
          >
            Get started
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/auth?mode=login"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-7 py-3.5 text-sm font-medium transition-colors hover:border-primary/40"
          >
            Sign in
          </Link>
        </div>

        {/* What it does */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Automated daily calls
          </span>
          <span className="inline-flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" />
            Missed-dose alerts
          </span>
          <span className="inline-flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            Caregiver dashboard
          </span>
        </div>
      </section>
    </main>
  );
}
