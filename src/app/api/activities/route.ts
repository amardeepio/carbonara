import { NextResponse } from "next/server";
import { listFactors } from "@/lib/emissions";
import { gridIntensity } from "@/lib/grid";
import { getLiveBenchmarks } from "@/lib/owid";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/activities — available activity types + live benchmarks for the
 * form. Stays public; a session is only used (when present) to re-price
 * grid-powered factors for the user's state.
 */
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({
    activities: listFactors(user ? gridIntensity(user.state) : undefined),
    benchmarks: await getLiveBenchmarks(),
  });
}
