import { NextResponse } from "next/server";
import { getRoutineStore } from "@/lib/routines";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** DELETE /api/routines/:id — remove one of the session user's routines. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const store = await getRoutineStore();
  const removed = await store.remove(id, user.id);
  if (!removed) {
    return NextResponse.json({ error: "Routine not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
