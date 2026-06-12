import { round } from "./emissions";

/**
 * Relatable equivalents: translate an abstract "kg CO2e" into Indian mental
 * models so the number lands. Awareness-grade conversions, each sourced.
 */

export interface Equivalent {
  key: string;
  /** Template label; `{n}` is replaced with the formatted value. */
  label: string;
  value: number;
  icon: string;
  source: string;
}

interface Conversion {
  key: string;
  /** kg CO2e represented by one unit of this equivalent. */
  kgPerUnit: number;
  icon: string;
  source: string;
  singular: string;
  plural: string;
  /** Skip when the computed count is outside this range (keeps it legible). */
  min: number;
  max: number;
}

const CONVERSIONS: Conversion[] = [
  {
    key: "car_km",
    kgPerUnit: 0.154, // petrol car per km (same factor as the logger)
    icon: "🚗",
    source: "Petrol car @ 0.154 kg/km",
    singular: "km driven in a petrol car",
    plural: "km driven in a petrol car",
    min: 1,
    max: 100000,
  },
  {
    key: "train_trips",
    kgPerUnit: 2.24, // Delhi–Jaipur ≈ 280 km × 0.008 kg/passenger-km
    icon: "🚆",
    source: "Delhi–Jaipur by train (~280 km @ 0.008 kg/km)",
    singular: "Delhi–Jaipur train trip",
    plural: "Delhi–Jaipur train trips",
    min: 0.5,
    max: 1000,
  },
  {
    key: "tree_years",
    kgPerUnit: 22, // a mature tree sequesters ~22 kg CO2/year
    icon: "🌳",
    source: "Mature tree absorbs ~22 kg CO2/year",
    singular: "year of one tree absorbing CO₂",
    plural: "years of one tree absorbing CO₂",
    min: 0.1,
    max: 1000,
  },
  {
    key: "lpg_cylinders",
    kgPerUnit: 42.3, // 14.2 kg LPG × 2.98 kg CO2/kg
    icon: "🛢️",
    source: "14.2 kg LPG cylinder ≈ 42.3 kg CO2e",
    singular: "LPG cylinder burned",
    plural: "LPG cylinders burned",
    min: 0.1,
    max: 1000,
  },
  {
    key: "phone_charges",
    kgPerUnit: 0.0085, // ~12 Wh per full charge × India grid 0.71 kg/kWh
    icon: "📱",
    source: "Full smartphone charge ≈ 12 Wh on the Indian grid",
    singular: "smartphone full charge",
    plural: "smartphone full charges",
    min: 10,
    max: 100000,
  },
];

/** Format a count for display: whole numbers stay whole, small values get 1 dp. */
function fmt(n: number): string {
  return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}

/**
 * Convert kg CO2e into up to `limit` relatable equivalents, skipping any
 * that would read as 0 or an absurdly large number.
 */
export function equivalents(kg: number, limit = 4): Equivalent[] {
  if (!Number.isFinite(kg) || kg <= 0) return [];
  const results: Equivalent[] = [];
  for (const c of CONVERSIONS) {
    const count = kg / c.kgPerUnit;
    if (count < c.min || count > c.max) continue;
    const value = round(count);
    results.push({
      key: c.key,
      label: `${fmt(count)} ${count >= 1.5 ? c.plural : c.singular}`,
      value,
      icon: c.icon,
      source: c.source,
    });
    if (results.length >= limit) break;
  }
  return results;
}

/** One-line summary, e.g. for LLM context: "≈ 32 km driven …, 2.2 Delhi–Jaipur …". */
export function equivalentsSentence(kg: number): string | null {
  const eq = equivalents(kg, 2);
  if (eq.length === 0) return null;
  return `≈ ${eq.map((e) => e.label).join(", or ")}`;
}
