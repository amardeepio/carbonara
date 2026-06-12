import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { loadSummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

const todaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "today must be YYYY-MM-DD")
  .optional();

/** GET /api/footprint — the session user's entries plus aggregated summary. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const todayParam = searchParams.get("today") ?? undefined;
  const parsed = todaySchema.safeParse(todayParam);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid today parameter" }, { status: 400 });
  }

  const { entries, summary, persistent } = await loadSummary(user.id, parsed.data);
  return NextResponse.json({ entries, summary, persistent });
}
