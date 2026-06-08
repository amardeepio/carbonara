import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET /api/history — daily totals (kg CO2e per day), oldest first. */
export async function GET() {
  const store = await getStore();
  const entries = await store.list();

  const byDay = new Map<string, number>();
  for (const entry of entries) {
    const day = entry.createdAt.slice(0, 10); // YYYY-MM-DD
    byDay.set(day, (byDay.get(day) ?? 0) + entry.kgCo2e);
  }

  const history = [...byDay.entries()]
    .map(([date, kg]) => ({ date, kg: Math.round(kg * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ history });
}
