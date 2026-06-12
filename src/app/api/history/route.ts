import { NextResponse } from "next/server";
import { dailyTotals } from "@/lib/emissions";
import { getSessionUser } from "@/lib/session";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET /api/history — the session user's daily totals (kg CO2e), oldest first. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const store = await getStore();
  const entries = await store.list(user.id);
  return NextResponse.json({ history: dailyTotals(entries) });
}
