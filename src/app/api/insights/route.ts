import { NextResponse } from "next/server";
import { generateInsights } from "@/lib/assistant";
import { summarise } from "@/lib/emissions";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** POST /api/insights — personalized, context-aware recommendations. */
export async function POST() {
  const store = await getStore();
  const entries = await store.list();
  const summary = summarise(entries);
  const insights = await generateInsights(summary);
  return NextResponse.json({ insights, summary });
}
