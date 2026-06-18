import { NextResponse } from "next/server";
import { createEntry } from "@/lib/logEntry";
import { getRoutineStore } from "@/lib/routines";
import { getSessionUser } from "@/lib/session";
import { routineLogSchema, type LogEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/routines/:id/log — log every activity in a routine for a date.
 * Items are logged independently (no transactions in the memory store), so
 * the response reports per-item results instead of faking atomicity.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is fine — date defaults to the server day.
  }

  const parsed = routineLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { id } = await params;
  const store = await getRoutineStore();
  const routine = await store.get(id, user.id);
  if (!routine) {
    return NextResponse.json({ error: "Routine not found" }, { status: 404 });
  }

  const logged: LogEntry[] = [];
  const failed: { type: string; error: string }[] = [];
  for (const item of routine.items) {
    const result = await createEntry(user, { ...item, date: parsed.data.date });
    if (result.ok) logged.push(result.entry);
    else failed.push({ type: item.type, error: result.error });
  }

  return NextResponse.json({ logged, failed }, { status: logged.length > 0 ? 201 : 400 });
}
