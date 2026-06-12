import { NextResponse } from "next/server";
import { generateInsights } from "@/lib/assistant";
import { getSessionUser } from "@/lib/session";
import { loadSummary } from "@/lib/summary";
import { insightsRequestSchema } from "@/lib/types";
import { toSafeUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/** POST /api/insights — personalized, context-aware recommendations. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is fine — the locale falls back to the profile.
  }
  const parsed = insightsRequestSchema.safeParse(body);
  const locale = (parsed.success ? parsed.data.locale : undefined) ?? user.locale ?? "en";

  const { summary } = await loadSummary(user.id);
  const insights = await generateInsights(summary, toSafeUser(user), locale);
  return NextResponse.json({ insights, summary });
}
