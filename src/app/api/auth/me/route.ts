import { NextResponse } from "next/server";
import { isGoogleAuthEnabled } from "@/lib/google";
import { getSessionUser } from "@/lib/session";
import { profileUpdateSchema, type User } from "@/lib/types";
import { getUserStore, toSafeUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — current session user (or null) + auth capabilities. */
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({
    user: user ? toSafeUser(user) : null,
    googleEnabled: isGoogleAuthEnabled(),
  });
}

/** PATCH /api/auth/me — update the signed-in user's profile. */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid profile" },
      { status: 400 },
    );
  }

  // Only touch fields present in the request; `null` clears a field.
  const patch: Partial<Omit<User, "id">> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if ("commute" in parsed.data) patch.commute = parsed.data.commute ?? undefined;
  if ("diet" in parsed.data) patch.diet = parsed.data.diet ?? undefined;
  if ("state" in parsed.data) patch.state = parsed.data.state ?? undefined;
  if ("locale" in parsed.data) patch.locale = parsed.data.locale ?? undefined;

  const users = await getUserStore();
  const updated = await users.update(user.id, patch);
  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ user: toSafeUser(updated) });
}
