import { NextResponse } from "next/server";
import {
  badges,
  canPledge,
  CHALLENGES,
  evaluateChallenge,
  getChallenge,
  type Pledge,
} from "@/lib/challenges";
import { mondayOf } from "@/lib/emissions";
import { serverToday } from "@/lib/logEntry";
import { getPledgeStore } from "@/lib/pledges";
import { getSessionUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { pledgeRequestSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/challenges — challenge catalog, the user's pledges (lazily
 * re-evaluated against their logs), cumulative kg avoided, and badges.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const today = serverToday();
  const [pledgeStore, entryStore] = await Promise.all([getPledgeStore(), getStore()]);
  const [pledges, entries] = await Promise.all([
    pledgeStore.list(user.id),
    entryStore.list(user.id),
  ]);

  // Lazily evaluate non-final pledges; persist transitions only on change.
  const evaluated: (Pledge & { progress: number })[] = [];
  for (const pledge of pledges) {
    const def = getChallenge(pledge.challengeKey);
    if (!def) {
      evaluated.push({ ...pledge, progress: 0 });
      continue;
    }
    if (pledge.status !== "active") {
      evaluated.push({ ...pledge, progress: pledge.status === "completed" ? 1 : 0 });
      continue;
    }
    const result = evaluateChallenge(def, entries, pledge.weekStart, today);
    if (result.status !== pledge.status) {
      await pledgeStore.update(pledge.id, user.id, {
        status: result.status,
        kgAvoided: result.kgAvoided,
      });
      evaluated.push({
        ...pledge,
        status: result.status,
        kgAvoided: result.kgAvoided,
        progress: result.progress,
      });
    } else {
      evaluated.push({ ...pledge, progress: result.progress });
    }
  }

  const totalKgAvoided = evaluated
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + (p.kgAvoided ?? 0), 0);

  const weekStart = mondayOf(today);
  const catalog = CHALLENGES.map((def) => {
    const gate = canPledge(def, entries, weekStart);
    return {
      key: def.key,
      title: def.title,
      description: def.description,
      icon: def.icon,
      pledgeable: gate.ok,
      reason: gate.reason,
    };
  });

  return NextResponse.json({
    challenges: catalog,
    pledges: evaluated,
    totalKgAvoided: Math.round(totalKgAvoided * 100) / 100,
    badges: badges(evaluated),
    weekStart,
  });
}

/** POST /api/challenges — pledge a challenge for a week (default: this week). */
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

  const parsed = pledgeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const def = getChallenge(parsed.data.challengeKey);
  if (!def) {
    return NextResponse.json({ error: "Unknown challenge" }, { status: 400 });
  }

  const today = serverToday();
  // Pledges always snap to a Monday so evaluation windows are well-defined.
  const weekStart = mondayOf(parsed.data.weekStart ?? today);

  const [pledgeStore, entryStore] = await Promise.all([getPledgeStore(), getStore()]);
  const existing = await pledgeStore.list(user.id);
  if (existing.some((p) => p.challengeKey === def.key && p.weekStart === weekStart)) {
    return NextResponse.json(
      { error: "You've already pledged this challenge for that week" },
      { status: 409 },
    );
  }

  const entries = await entryStore.list(user.id);
  const gate = canPledge(def, entries, weekStart);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason ?? "Not enough history yet" }, { status: 400 });
  }

  const pledge = await pledgeStore.add({
    userId: user.id,
    challengeKey: def.key,
    weekStart,
    status: "active",
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ pledge }, { status: 201 });
}
