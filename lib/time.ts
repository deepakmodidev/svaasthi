// Svaasthi is India-only and India has no DST, so every time is Asia/Kolkata
// wall-clock. Centralised here so the dashboard, cron, and enqueue agree.
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
