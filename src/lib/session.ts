import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_S, verifySessionToken } from "./auth";
import { getUserStore } from "./users";
import type { User } from "./types";

/**
 * Cookie plumbing for the signed session tokens in `auth.ts`.
 * Sessions are httpOnly, SameSite=Lax and Secure in production.
 */

/** Resolve the signed-in user for the current request, or `null`. */
export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const users = await getUserStore();
  return users.get(payload.uid);
}

/** Attach a fresh session cookie for `user` to an outgoing response. */
export function attachSession(response: NextResponse, user: User): void {
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken({ uid: user.id, provider: user.provider }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_S,
    },
  );
}

/** Expire the session cookie on an outgoing response. */
export function clearSession(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
