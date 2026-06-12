import { NextResponse } from "next/server";
import { attachSession } from "@/lib/session";
import { guestAuthSchema } from "@/lib/types";
import { getUserStore, toSafeUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/** POST /api/auth/guest — create a guest user (with optional onboarding profile). */
export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is fine — the whole profile is optional.
  }

  const parsed = guestAuthSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
  }

  const profile = parsed.data.profile ?? {};
  const users = await getUserStore();
  const user = await users.create({
    provider: "guest",
    name: profile.name || "Guest",
    commute: profile.commute,
    diet: profile.diet,
    state: profile.state,
    createdAt: new Date().toISOString(),
  });

  const response = NextResponse.json({ user: toSafeUser(user) }, { status: 201 });
  attachSession(response, user);
  return response;
}
