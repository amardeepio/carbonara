import { addDays, getFactor, round } from "./emissions";
import type { LogEntry } from "./types";

/**
 * Weekly challenges: pledge an India-relevant action for one Mon–Sun week and
 * let the app judge it from what actually gets logged. Evaluation is pure and
 * deterministic (entries + dates in, status out) so it is fully unit-testable.
 *
 * Honesty note: completion is inferred from self-reported logs. The guards
 * below (minimum logging activity, week-end-only completion for "avoid"
 * challenges) make a vacuous pass harder, not impossible — the UI says so.
 */

export type ChallengeRule =
  | {
      /** Complete a week without logging any `avoidTypes`. */
      kind: "avoid";
      avoidTypes: string[];
      /** Substitutes that must appear (proof of life); empty = any entry counts. */
      requireTypes: string[];
      /** Minimum qualifying entries logged in the week. */
      minEntries: number;
      /** What each substitute replaces, for the kg-avoided estimate. */
      counterfactualType: string;
      /** For challenges with no direct substitute: assumed avoided units/week. */
      assumedAvoidedQty?: number;
    }
  | {
      /** Log at least `minQty` units of `useTypes` on the qualifying days. */
      kind: "use";
      useTypes: string[];
      /** ISO weekdays the quantity must fall on (1=Mon … 7=Sun); empty = any day. */
      days?: number[];
      minQty: number;
      /** The mode each unit replaces, for the kg-avoided estimate. */
      counterfactualType: string;
    }
  | {
      /** Keep the week's kg from `types` at or below prior 4-week avg × (1−pct). */
      kind: "reduce";
      types: string[];
      reducePct: number;
    };

export interface ChallengeDef {
  key: string;
  title: string;
  description: string;
  icon: string;
  rule: ChallengeRule;
}

export const CHALLENGES: ChallengeDef[] = [
  {
    key: "metro_monday",
    title: "Metro Monday",
    description: "Take the metro for at least 5 km on Monday instead of driving.",
    icon: "🚇",
    rule: { kind: "use", useTypes: ["metro"], days: [1], minQty: 5, counterfactualType: "car_petrol" },
  },
  {
    key: "meatless_week",
    title: "Meatless week",
    description: "A whole week of veg meals — log at least 3 and no meat meals.",
    icon: "🥗",
    rule: {
      kind: "avoid",
      avoidTypes: ["meal_mutton", "meal_chicken"],
      requireTypes: ["meal_veg", "meal_vegan"],
      minEntries: 3,
      counterfactualType: "meal_chicken",
    },
  },
  {
    key: "ev_week",
    title: "Electric miles week",
    description: "Ride 30 km on an electric two-wheeler instead of petrol this week.",
    icon: "🛵",
    rule: { kind: "use", useTypes: ["ev_two_wheeler"], minQty: 30, counterfactualType: "two_wheeler" },
  },
  {
    key: "no_delivery_week",
    title: "No-delivery week",
    description: "Skip food delivery and parcels for a week (log at least 3 activities).",
    icon: "📦",
    rule: {
      kind: "avoid",
      avoidTypes: ["food_delivery", "online_shopping"],
      requireTypes: [],
      minEntries: 3,
      counterfactualType: "food_delivery",
      assumedAvoidedQty: 3,
    },
  },
  {
    key: "ac_26_week",
    title: "AC at 26 °C week",
    description: "Cut your logged electricity 10% below your 4-week average.",
    icon: "❄️",
    rule: { kind: "reduce", types: ["electricity"], reducePct: 0.1 },
  },
];

export function getChallenge(key: string): ChallengeDef | undefined {
  return CHALLENGES.find((c) => c.key === key);
}

/** A user's commitment to one challenge for one Mon–Sun week. */
export interface Pledge {
  id: string;
  userId: string;
  challengeKey: string;
  /** Monday of the pledged week, YYYY-MM-DD. */
  weekStart: string;
  status: "active" | "completed" | "missed";
  /** Estimated kg CO2e avoided, set when the pledge completes. */
  kgAvoided?: number;
  /** ISO-8601 timestamp. */
  createdAt: string;
}

export interface ChallengeEvaluation {
  status: Pledge["status"];
  /** 0–1 progress indicator for the UI. */
  progress: number;
  kgAvoided: number;
}

/** ISO weekday (1=Mon … 7=Sun) of a YYYY-MM-DD date. */
function isoWeekday(date: string): number {
  const day = new Date(date + "T00:00:00Z").getUTCDay();
  return day === 0 ? 7 : day;
}

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

/** Entries with `entry.date` inside [start, end] (inclusive). */
function inRange(entries: LogEntry[], start: string, end: string): LogEntry[] {
  return entries.filter((e) => e.date >= start && e.date <= end);
}

/** Fraction of the pledged week that has elapsed as of `today`. */
function weekElapsed(weekStart: string, today: string): number {
  if (today < weekStart) return 0;
  const days = Math.min(
    Math.floor((Date.parse(today) - Date.parse(weekStart)) / 86400000) + 1,
    7,
  );
  return days / 7;
}

/**
 * Evaluate one challenge for the week starting at `weekStart` (a Monday),
 * as of `today`, against the user's full entry list.
 */
export function evaluateChallenge(
  def: ChallengeDef,
  entries: LogEntry[],
  weekStart: string,
  today: string,
): ChallengeEvaluation {
  const weekEnd = addDays(weekStart, 6);
  const weekOver = today > weekEnd;
  const week = inRange(entries, weekStart, weekEnd);
  const rule = def.rule;

  if (rule.kind === "avoid") {
    const violations = week.filter((e) => rule.avoidTypes.includes(e.type));
    const qualifying =
      rule.requireTypes.length > 0
        ? week.filter((e) => rule.requireTypes.includes(e.type))
        : week;

    if (violations.length > 0) {
      return { status: "missed", progress: 0, kgAvoided: 0 };
    }
    if (!weekOver) {
      // Clean so far: progress tracks the week plus the logging requirement.
      const progress = clamp01(
        weekElapsed(weekStart, today) * 0.5 + clamp01(qualifying.length / rule.minEntries) * 0.5,
      );
      return { status: "active", progress, kgAvoided: 0 };
    }
    if (qualifying.length < rule.minEntries) {
      // Week over but too little logged to credit the win (anti-gaming guard).
      return { status: "missed", progress: 0, kgAvoided: 0 };
    }

    const counterfactual = getFactor(rule.counterfactualType)?.kgPerUnit ?? 0;
    let kgAvoided: number;
    if (rule.requireTypes.length > 0) {
      // Each substitute entry replaces the counterfactual choice.
      kgAvoided = qualifying.reduce(
        (sum, e) => sum + Math.max(e.quantity * counterfactual - e.kgCo2e, 0),
        0,
      );
    } else {
      kgAvoided = (rule.assumedAvoidedQty ?? 0) * counterfactual;
    }
    return { status: "completed", progress: 1, kgAvoided: round(kgAvoided) };
  }

  if (rule.kind === "use") {
    const qualifying = week.filter(
      (e) =>
        rule.useTypes.includes(e.type) &&
        (!rule.days || rule.days.length === 0 || rule.days.includes(isoWeekday(e.date))),
    );
    const qty = qualifying.reduce((sum, e) => sum + e.quantity, 0);
    const actualKg = qualifying.reduce((sum, e) => sum + e.kgCo2e, 0);

    if (qty >= rule.minQty) {
      const counterfactual = getFactor(rule.counterfactualType)?.kgPerUnit ?? 0;
      const kgAvoided = round(Math.max(qty * counterfactual - actualKg, 0));
      return { status: "completed", progress: 1, kgAvoided };
    }
    if (weekOver) {
      return { status: "missed", progress: clamp01(qty / rule.minQty), kgAvoided: 0 };
    }
    return { status: "active", progress: clamp01(qty / rule.minQty), kgAvoided: 0 };
  }

  // rule.kind === "reduce"
  const priorStart = addDays(weekStart, -28);
  const priorEnd = addDays(weekStart, -1);
  const prior = inRange(entries, priorStart, priorEnd).filter((e) => rule.types.includes(e.type));
  const priorWeeklyKg = prior.reduce((sum, e) => sum + e.kgCo2e, 0) / 4;
  const weekKg = week
    .filter((e) => rule.types.includes(e.type))
    .reduce((sum, e) => sum + e.kgCo2e, 0);
  const allowance = priorWeeklyKg * (1 - rule.reducePct);

  if (!weekOver) {
    // Progress = how much of the week has passed while staying under budget.
    const underBudget = priorWeeklyKg === 0 || weekKg <= allowance;
    return {
      status: "active",
      progress: underBudget ? weekElapsed(weekStart, today) : 0,
      kgAvoided: 0,
    };
  }
  if (priorWeeklyKg > 0 && weekKg <= allowance) {
    return { status: "completed", progress: 1, kgAvoided: round(priorWeeklyKg - weekKg) };
  }
  return { status: "missed", progress: 0, kgAvoided: 0 };
}

/**
 * Whether the user may pledge this challenge: "reduce" challenges need at
 * least 7 distinct days of relevant history before the week starts, so the
 * baseline isn't guesswork. Returns a human-readable reason when blocked.
 */
export function canPledge(
  def: ChallengeDef,
  entries: LogEntry[],
  weekStart: string,
): { ok: boolean; reason?: string } {
  if (def.rule.kind !== "reduce") return { ok: true };
  const types = def.rule.types;
  const priorDays = new Set(
    entries
      .filter((e) => types.includes(e.type) && e.date < weekStart)
      .map((e) => e.date),
  );
  if (priorDays.size < 7) {
    return {
      ok: false,
      reason: "Log electricity on at least 7 days first so we can set your baseline.",
    };
  }
  return { ok: true };
}

export interface Badge {
  key: string;
  label: string;
  icon: string;
  earned: boolean;
}

/** Badges derived from a user's pledge history. */
export function badges(pledges: Pledge[]): Badge[] {
  const completed = pledges.filter((p) => p.status === "completed");
  const totalAvoided = completed.reduce((sum, p) => sum + (p.kgAvoided ?? 0), 0);
  return [
    { key: "first_pledge", label: "First pledge", icon: "🤝", earned: pledges.length >= 1 },
    { key: "first_win", label: "Challenge complete", icon: "🏅", earned: completed.length >= 1 },
    { key: "hat_trick", label: "3 challenges done", icon: "🎩", earned: completed.length >= 3 },
    { key: "big_saver", label: "10+ kg avoided", icon: "🌍", earned: totalAvoided >= 10 },
  ];
}
