import { NextResponse } from "next/server";
import { summarise } from "@/lib/emissions";
import { getStore, isPersistent } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET /api/footprint — current entries plus the aggregated summary. */
export async function GET() {
  const store = await getStore();
  const entries = await store.list();
  return NextResponse.json({
    entries,
    summary: summarise(entries),
    persistent: isPersistent(),
  });
}
