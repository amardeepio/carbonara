import { NextResponse } from "next/server";
import { getFactor } from "@/lib/emissions";
import { getRoutineStore } from "@/lib/routines";
import { getSessionUser } from "@/lib/session";
import { routineSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/routines — the session user's saved routines. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const store = await getRoutineStore();
  return NextResponse.json({ routines: await store.list(user.id) });
}

/** POST /api/routines — save a new routine (bundle of activities). */
export async function POST(request: Request) {
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

  const parsed = routineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid routine" },
      { status: 400 },
    );
  }

  for (const item of parsed.data.items) {
    if (!getFactor(item.type)) {
      return NextResponse.json({ error: `Unknown activity type: ${item.type}` }, { status: 400 });
    }
  }

  const store = await getRoutineStore();
  const routine = await store.add({
    userId: user.id,
    name: parsed.data.name,
    items: parsed.data.items,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ routine }, { status: 201 });
}
