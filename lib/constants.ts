// Shared constants and the small IST helpers. Svaasthi is India-only and India
// has no DST, so every time is Asia/Kolkata wall-clock.

export const IST = "Asia/Kolkata";

// "HH:MM" → minutes since midnight.
export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Today's date in IST as "YYYY-MM-DD".
export const todayIST = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: IST });

// Current minute-of-day in IST (0–1439).
export const nowMinIST = () =>
  toMin(
    new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: IST,
    }),
  );

// Dose statuses grouped by how the dashboard treats them. MISSED also drives the
// missed-dose push, so the tally and the notifier never drift apart.
export const PENDING = ["scheduled", "registered", "calling", "retry", "ongoing"];
export const MISSED = ["not_taken", "no_answer", "voicemail", "failed"];
