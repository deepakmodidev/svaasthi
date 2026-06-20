// Call outcomes that count as a missed dose — drives both the dashboard "missed"
// tally and the decision to push a missed-dose alert. Kept in one place so the
// two never drift apart.
export const MISSED = ["not_taken", "no_answer", "voicemail", "failed"];
