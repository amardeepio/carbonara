import { NextResponse } from "next/server";
import { isGoogleAuthEnabled, verifyGoogleIdToken } from "@/lib/google";
import { attachSession } from "@/lib/session";
import { googleAuthSchema } from "@/lib/types";
import { getUserStore, toSafeUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/** POST /api/auth/google — verify a Google ID token and sign the user in. */
export async function POST(request: Request) {
  if (!isGoogleAuthEnabled()) {
    return NextResponse.json({ error: "Google sign-in is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = googleAuthSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const identity = await verifyGoogleIdToken(parsed.data.credential);
  if (!identity) {
    return NextResponse.json({ error: "Google sign-in failed" }, { status: 401 });
  }

  const profile = parsed.data.profile ?? {};
  const users = await getUserStore();

  let user = await users.findByGoogleSub(identity.sub);
  if (user) {
    // Returning user: refresh identity fields; only fill profile gaps so a
    // re-run of onboarding never wipes their existing preferences.
    user =
      (await users.update(user.id, {
        name: profile.name || identity.name || user.name,
        picture: identity.picture ?? user.picture,
        commute: user.commute ?? profile.commute,
        diet: user.diet ?? profile.diet,
        state: user.state ?? profile.state,
      })) ?? user;
  } else {
    user = await users.create({
      provider: "google",
      googleSub: identity.sub,
      email: identity.email,
      name: profile.name || identity.name || "Friend",
      picture: identity.picture,
      commute: profile.commute,
      diet: profile.diet,
      state: profile.state,
      createdAt: new Date().toISOString(),
    });
  }

  const response = NextResponse.json({ user: toSafeUser(user) });
  attachSession(response, user);
  return response;
}
