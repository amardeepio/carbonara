import { NextResponse } from "next/server";
import { createEntry } from "@/lib/logEntry";
import { getSessionUser } from "@/lib/session";
import { logEntrySchema } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST /api/log — validate, price and persist a single activity entry. */
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

  const parsed = logEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const result = await createEntry(user, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ entry: result.entry }, { status: 201 });
}
