import net from "node:net";
import { neon } from "@neondatabase/serverless";

// Neon's pooler resolves to IPv6 and its TCP connect can take ~350ms, which
// exceeds undici/fetch's default autoSelectFamily attempt timeout (250ms) and
// causes spurious ETIMEDOUT. Raise the per-attempt timeout so it can connect.
(
  net as unknown as {
    setDefaultAutoSelectFamilyAttemptTimeout?: (ms: number) => void;
  }
).setDefaultAutoSelectFamilyAttemptTimeout?.(5000);

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("Missing DATABASE_URL in .env.local");
}

const _sql = neon(url);

function isTransient(e: unknown): boolean {
  const s = String((e as Error)?.message ?? e);
  return /ETIMEDOUT|fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN|connecting to database/i.test(
    s,
  );
}

// Tagged-template wrapper around neon's sql that retries transient connection
// failures (the Neon path occasionally blips). Used exactly like neon's sql.
export async function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await _sql(strings, ...values);
    } catch (e) {
      lastErr = e;
      if (!isTransient(e)) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}
