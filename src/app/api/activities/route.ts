import { NextResponse } from "next/server";
import { BENCHMARKS, listFactors } from "@/lib/emissions";

export const dynamic = "force-dynamic";

/** GET /api/activities — available activity types + benchmarks for the form. */
export function GET() {
  return NextResponse.json({
    activities: listFactors(),
    benchmarks: BENCHMARKS,
  });
}
