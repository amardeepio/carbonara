import { NextResponse } from "next/server";
import { priceWithClimatiq } from "@/lib/climatiq";
import { calculate, getFactor } from "@/lib/emissions";
import { getStore } from "@/lib/store";
import { logEntrySchema } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST /api/log — validate, price and persist a single activity entry. */
export async function POST(request: Request) {
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

  const { type, quantity } = parsed.data;
  const factor = getFactor(type);
  if (!factor) {
    return NextResponse.json({ error: `Unknown activity type: ${type}` }, { status: 400 });
  }

  // Prefer Climatiq's live figure; fall back to the built-in India factor.
  const live = await priceWithClimatiq(factor, quantity);
  const kgCo2e = live?.kgCo2e ?? calculate(type, quantity);

  const store = await getStore();
  const entry = await store.add({
    type,
    quantity,
    kgCo2e,
    createdAt: new Date().toISOString(),
    pricedBy: live ? "climatiq" : "builtin",
  });

  return NextResponse.json({ entry }, { status: 201 });
}
