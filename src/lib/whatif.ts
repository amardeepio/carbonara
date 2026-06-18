import { todayISO } from "./date";
import { addDays, round } from "./emissions";
import type { Factor, LogEntry } from "./types";

/**
 * What-if swap simulator: project the yearly CO2e saved by a habit swap,
 * grounded in the user's own logged history when available.
 *
 * The factors map is passed in by the caller (the client already holds the
 * grid-adjusted catalog from /api/activities), so electric swaps are priced
 * with the user's regional grid automatically.
 */

export interface Swap {
  key: string;
  label: string;
  /** Activity being replaced; weekly volume is read from history of this type. */
  fromType: string;
  /** Replacement activity, or null when the swap is a percentage reduction. */
  toType: string | null;
  /** Fraction of `fromType` emissions removed (used when `toType` is null). */
  savingPct?: number;
  /** Weekly quantity assumed when the user has no logged history. */
  assumedWeeklyQty: number;
  description: string;
  icon: string;
}

export const SWAPS: Swap[] = [
  {
    key: "car_to_metro",
    label: "Drive less, metro more",
    fromType: "car_petrol",
    toType: "metro",
    assumedWeeklyQty: 60, // ~10 km commute, 6 days
    description: "Shift your petrol-car kilometres to the metro.",
    icon: "🚇",
  },
  {
    key: "two_wheeler_to_ev",
    label: "Petrol scooter → electric",
    fromType: "two_wheeler",
    toType: "ev_two_wheeler",
    assumedWeeklyQty: 70,
    description: "Ride the same kilometres on an electric two-wheeler.",
    icon: "🛵",
  },
  {
    key: "ride_hailing_to_metro",
    label: "Cabs → metro",
    fromType: "ride_hailing",
    toType: "metro",
    assumedWeeklyQty: 30,
    description: "Replace Ola/Uber rides with the metro where it runs.",
    icon: "🚖",
  },
  {
    key: "mutton_to_veg",
    label: "Mutton meals → veg thali",
    fromType: "meal_mutton",
    toType: "meal_veg",
    assumedWeeklyQty: 2,
    description: "Swap red-meat meals for a vegetarian thali.",
    icon: "🍛",
  },
  {
    key: "chicken_to_veg",
    label: "Chicken meals → veg thali",
    fromType: "meal_chicken",
    toType: "meal_veg",
    assumedWeeklyQty: 4,
    description: "Make a few chicken meals plant-based instead.",
    icon: "🥗",
  },
  {
    key: "ac_setpoint",
    label: "AC at 26 °C, not 22 °C",
    fromType: "electricity",
    toType: null,
    savingPct: 0.12, // ~6% cooling energy per °C × 2 °C, applied to logged kWh
    assumedWeeklyQty: 35, // ~5 kWh/day household share
    description: "Raise the AC setpoint — every degree cuts cooling energy ~6%.",
    icon: "❄️",
  },
];

export interface SwapProjection {
  weeklyQty: number;
  /** Whether the weekly volume came from the user's logs or a typical value. */
  basis: "history" | "assumed";
  savedKgPerWeek: number;
  savedKgPerYear: number;
}

/** Days of history considered when averaging the user's weekly volume. */
const HISTORY_WINDOW_DAYS = 28;

/** Average weekly quantity of `type` logged in the last 28 days, or 0. */
function weeklyHistoryQty(entries: LogEntry[], type: string, today: string): number {
  const cutoff = addDays(today, -HISTORY_WINDOW_DAYS);
  let qty = 0;
  for (const e of entries) {
    if (e.type === type && e.date > cutoff && e.date <= today) qty += e.quantity;
  }
  return qty / (HISTORY_WINDOW_DAYS / 7);
}

/**
 * Project the saving for one swap. Uses the user's last-28-day average weekly
 * volume of the `fromType` activity; falls back to a typical assumed volume
 * when there's no history. Returns null if the factors map lacks the types.
 */
export function simulateSwap(
  swap: Swap,
  entries: LogEntry[],
  factors: Record<string, Factor>,
  today: string = todayISO(),
): SwapProjection | null {
  const from = factors[swap.fromType];
  if (!from) return null;
  const to = swap.toType === null ? null : factors[swap.toType];
  if (swap.toType !== null && !to) return null;

  const historyQty = weeklyHistoryQty(entries, swap.fromType, today);
  const basis: SwapProjection["basis"] = historyQty > 0 ? "history" : "assumed";
  const weeklyQty = round(historyQty > 0 ? historyQty : swap.assumedWeeklyQty);

  const perUnitSaving = to ? from.kgPerUnit - to.kgPerUnit : from.kgPerUnit * (swap.savingPct ?? 0);
  const savedKgPerWeek = round(Math.max(perUnitSaving, 0) * weeklyQty);

  return {
    weeklyQty,
    basis,
    savedKgPerWeek,
    savedKgPerYear: round(savedKgPerWeek * 52),
  };
}

/** All swaps with their projections, ordered by yearly saving (largest first). */
export function rankSwaps(
  entries: LogEntry[],
  factors: Record<string, Factor>,
  today?: string,
): { swap: Swap; projection: SwapProjection }[] {
  const ranked: { swap: Swap; projection: SwapProjection }[] = [];
  for (const swap of SWAPS) {
    const projection = simulateSwap(swap, entries, factors, today);
    if (projection && projection.savedKgPerYear > 0) ranked.push({ swap, projection });
  }
  return ranked.sort((a, b) => b.projection.savedKgPerYear - a.projection.savedKgPerYear);
}
