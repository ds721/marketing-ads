// Structured logging. Never log secrets, tokens or passwords.

type LogFields = {
  tenantId?: string | null;
  userId?: string | null;
  requestId?: string;
  operation: string;
  provider?: string;
  status?: "ok" | "error";
  durationMs?: number;
  error?: string;
  [key: string]: unknown;
};

const REDACT = /token|secret|password|apikey|api_key|authorization/i;

function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = REDACT.test(k) ? "[redacted]" : v;
  }
  return out;
}

export const log = {
  info(fields: LogFields) {
    console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), ...sanitize(fields) }));
  },
  error(fields: LogFields) {
    console.error(JSON.stringify({ level: "error", ts: new Date().toISOString(), ...sanitize(fields) }));
  },
};
