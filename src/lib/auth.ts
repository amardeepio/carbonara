import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Stateless session tokens: `base64url(JSON payload).base64url(HMAC-SHA256)`.
 *
 * Pure functions with no framework imports so they are trivially unit-testable;
 * the cookie plumbing lives in `session.ts`. Sign with `SESSION_SECRET`; when
 * it is unset (e.g. a reviewer running with zero keys) an ephemeral per-process
 * secret is generated, which simply means sessions reset on server restart —
 * consistent with the in-memory store fallback.
 */

export const SESSION_COOKIE = "carbonara_session";

/** Session lifetime in seconds (30 days). */
export const SESSION_TTL_S = 30 * 24 * 60 * 60;

export interface SessionPayload {
  /** User id. */
  uid: string;
  provider: "google" | "guest";
  /** Expiry, in unix seconds. */
  exp: number;
}

// Persist the fallback secret across hot reloads so dev sessions survive.
const globalForAuth = globalThis as unknown as { __carbonaraSessionSecret?: string };

function getSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  if (!globalForAuth.__carbonaraSessionSecret) {
    globalForAuth.__carbonaraSessionSecret = randomBytes(32).toString("hex");
    console.warn(
      "SESSION_SECRET is not set; using an ephemeral secret (sessions reset on restart).",
    );
  }
  return globalForAuth.__carbonaraSessionSecret;
}

function sign(body: string): string {
  return createHmac("sha256", getSecret()).update(body).digest("base64url");
}

/** Create a signed session token for a user. */
export function createSessionToken(
  payload: Omit<SessionPayload, "exp">,
  ttlSeconds: number = SESSION_TTL_S,
  now: number = Date.now(),
): string {
  const full: SessionPayload = { ...payload, exp: Math.floor(now / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Verify a session token; returns its payload, or `null` if invalid/expired. */
export function verifySessionToken(token: string, now: number = Date.now()): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.uid !== "string" || payload.uid.length === 0) return null;
    if (payload.provider !== "google" && payload.provider !== "guest") return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}
