"use client";

import { TriangleAlert } from "lucide-react";

// Graceful error boundary — friendly message + retry instead of Next's raw page.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <TriangleAlert className="h-5 w-5" />
        </div>
        <h1 className="font-serif text-2xl font-normal tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          className="mt-6 h-12 w-full rounded-full bg-foreground text-sm font-medium text-background transition hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
