import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** DELETE /api/log/:id — remove one of the session user's logged entries. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const store = await getStore();
  const removed = await store.remove(id, user.id);
  if (!removed) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
