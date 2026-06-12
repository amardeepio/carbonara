/**
 * Server-side verification of Google Identity Services ID tokens.
 *
 * Uses Google's `tokeninfo` endpoint (recommended for low-volume apps): it
 * validates the token's signature and expiry, and we additionally check the
 * audience matches our client id and the email is verified. Returns `null`
 * on any failure — callers respond with 401 and never leak provider errors.
 */

export interface GoogleIdentity {
  /** Google's stable account id. */
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

/** Whether Google sign-in is configured (client id present). */
export function isGoogleAuthEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
}

/** Verify a Google ID token; returns the identity, or `null` if invalid. */
export async function verifyGoogleIdToken(credential: string): Promise<GoogleIdentity | null> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  try {
    const res = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(credential)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    if (data.aud !== clientId) return null;
    if (typeof data.sub !== "string" || data.sub.length === 0) return null;
    if (typeof data.email === "string" && data.email_verified !== "true") return null;

    return {
      sub: data.sub,
      email: typeof data.email === "string" ? data.email : undefined,
      name: typeof data.name === "string" ? data.name : undefined,
      picture: typeof data.picture === "string" ? data.picture : undefined,
    };
  } catch {
    return null;
  }
}
