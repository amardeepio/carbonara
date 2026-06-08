import type {
  Benchmarks,
  Category,
  CategoryBreakdown,
  Factor,
  FootprintSummary,
  LogEntry,
} from "./types";

/**
 * India-specific emission factors.
 *
 * These are awareness-grade approximations intended to drive behaviour change,
 * not formal carbon accounting. Sources:
 *  - CEA: CO2 Baseline Database for the Indian Power Sector (grid ~0.71 kg/kWh).
 *  - India GHG Program (WRI India / CII / TERI): fuel & transport factors.
 *  - Standard fuel combustion: petrol 2.31 kg/L, diesel 2.68 kg/L, LPG 2.98 kg/kg,
 *    combined with typical Indian vehicle mileage to derive per-km values.
 *  - Our World in Data: per-food/meal estimates mapped to Indian thali options.
 * Per-passenger-km transit/rail figures reflect Indian public-transport studies.
 */
export const EMISSION_FACTORS: Record<string, Factor> = {
  // ---- Transport (kg CO2e per km) -----------------------------------------
  two_wheeler: {
    key: "two_wheeler",
    category: "transport",
    label: "Two-wheeler (petrol)",
    unit: "km",
    kgPerUnit: 0.051,
    source: "Petrol 2.31 kg/L @ ~45 km/L",
    hint: "India's most common vehicle — efficient per km.",
  },
  car_petrol: {
    key: "car_petrol",
    category: "transport",
    label: "Car (petrol)",
    unit: "km",
    kgPerUnit: 0.154,
    source: "Petrol 2.31 kg/L @ ~15 km/L",
    hint: "Carpooling roughly halves this per person.",
  },
  car_diesel: {
    key: "car_diesel",
    category: "transport",
    label: "Car (diesel)",
    unit: "km",
    kgPerUnit: 0.18,
    source: "Diesel 2.68 kg/L @ ~15 km/L",
  },
  auto_rickshaw: {
    key: "auto_rickshaw",
    category: "transport",
    label: "Auto-rickshaw (CNG)",
    unit: "km",
    kgPerUnit: 0.1,
    source: "CNG three-wheeler, India GHG Program",
  },
  bus: {
    key: "bus",
    category: "transport",
    label: "City bus",
    unit: "km",
    kgPerUnit: 0.05,
    source: "Per passenger-km, Indian public transit",
    hint: "Shared transit — low per-passenger emissions.",
  },
  metro: {
    key: "metro",
    category: "transport",
    label: "Metro rail",
    unit: "km",
    kgPerUnit: 0.014,
    source: "Per passenger-km, Indian metro systems",
    hint: "One of the cleanest ways to travel in a city.",
  },
  train: {
    key: "train",
    category: "transport",
    label: "Indian Railways",
    unit: "km",
    kgPerUnit: 0.008,
    source: "Per passenger-km, electrified rail",
    hint: "Prefer trains over flights for intercity trips.",
  },
  flight_domestic: {
    key: "flight_domestic",
    category: "transport",
    label: "Domestic flight",
    unit: "km",
    kgPerUnit: 0.158,
    source: "Per passenger-km, short-haul",
    hint: "A single flight can outweigh a month of commuting.",
  },

  // ---- Energy --------------------------------------------------------------
  electricity: {
    key: "electricity",
    category: "energy",
    label: "Grid electricity",
    unit: "kWh",
    kgPerUnit: 0.71,
    source: "CEA CO2 Baseline Database (coal-heavy grid)",
    climatiqActivityId: "electricity-supply_grid-source_residual_mix",
    hint: "India's grid is coal-heavy, so each unit counts.",
  },
  lpg: {
    key: "lpg",
    category: "energy",
    label: "LPG cooking gas",
    unit: "kg",
    kgPerUnit: 2.98,
    source: "LPG combustion 2.98 kg CO2/kg",
    hint: "A 14.2 kg cylinder ≈ 42 kg CO2e.",
  },

  // ---- Diet (kg CO2e per thali/meal) --------------------------------------
  meal_vegan: {
    key: "meal_vegan",
    category: "diet",
    label: "Vegan meal",
    unit: "meal",
    kgPerUnit: 0.5,
    source: "Our World in Data, plant-based",
  },
  meal_veg: {
    key: "meal_veg",
    category: "diet",
    label: "Vegetarian thali",
    unit: "meal",
    kgPerUnit: 0.6,
    source: "Our World in Data, dairy-inclusive veg",
    hint: "India's default diet is already low-carbon.",
  },
  meal_chicken: {
    key: "meal_chicken",
    category: "diet",
    label: "Chicken/egg meal",
    unit: "meal",
    kgPerUnit: 1.4,
    source: "Our World in Data, poultry",
  },
  meal_mutton: {
    key: "meal_mutton",
    category: "diet",
    label: "Mutton/red-meat meal",
    unit: "meal",
    kgPerUnit: 3.5,
    source: "Our World in Data, ruminant meat",
    hint: "Red meat is the single highest-impact food choice.",
  },

  // ---- Waste & goods -------------------------------------------------------
  general_waste: {
    key: "general_waste",
    category: "waste",
    label: "General (landfill) waste",
    unit: "kg",
    kgPerUnit: 0.45,
    source: "Mixed municipal waste to landfill",
    hint: "Segregating wet waste for compost cuts this sharply.",
  },
  new_clothing: {
    key: "new_clothing",
    category: "goods",
    label: "New clothing item",
    unit: "item",
    kgPerUnit: 15,
    source: "Lifecycle estimate per garment",
  },
};

/** Per-capita daily benchmarks in kg CO2e (annual figures ÷ 365). */
export const BENCHMARKS: Benchmarks = {
  indiaPerCapita: 5.2, // ~1.9 t CO2/yr (MoEFCC / global datasets)
  globalAverage: 11.0, // ~4 t CO2/yr
  sustainableTarget: 5.5, // ~2 t CO2/yr, 1.5 °C-aligned
};

/** Ordered list of factors for building the activity form. */
export function listFactors(): Factor[] {
  return Object.values(EMISSION_FACTORS);
}

/** Look up a factor by key, or `undefined` if unknown. */
export function getFactor(type: string): Factor | undefined {
  return EMISSION_FACTORS[type];
}

/**
 * Compute kg CO2e for a given activity using the built-in factors.
 * @throws {Error} if the activity type is unknown or the quantity is invalid.
 */
export function calculate(type: string, quantity: number): number {
  const factor = EMISSION_FACTORS[type];
  if (!factor) {
    throw new Error(`Unknown activity type: ${type}`);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive, finite number");
  }
  return round(factor.kgPerUnit * quantity);
}

const CATEGORIES: Category[] = ["transport", "energy", "diet", "waste", "goods"];

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

/**
 * Aggregate log entries into a footprint summary: total, today's total,
 * per-category breakdown, the dominant category and benchmark comparison.
 *
 * @param now Injectable "current time" so the aggregation is deterministic
 *            and testable.
 */
export function summarise(entries: LogEntry[], now: Date = new Date()): FootprintSummary {
  const byCategory = new Map<Category, number>();
  let totalKg = 0;
  let todayKg = 0;

  for (const entry of entries) {
    const factor = EMISSION_FACTORS[entry.type];
    if (!factor) continue; // ignore entries referencing retired factors
    totalKg += entry.kgCo2e;
    byCategory.set(factor.category, (byCategory.get(factor.category) ?? 0) + entry.kgCo2e);
    if (isSameDay(entry.createdAt, now)) {
      todayKg += entry.kgCo2e;
    }
  }

  const breakdown: CategoryBreakdown[] = CATEGORIES.filter((c) => byCategory.has(c))
    .map((category) => {
      const kg = byCategory.get(category) ?? 0;
      return { category, kg: round(kg), pct: totalKg > 0 ? round((kg / totalKg) * 100) : 0 };
    })
    .sort((a, b) => b.kg - a.kg);

  return {
    totalKg: round(totalKg),
    todayKg: round(todayKg),
    entryCount: entries.length,
    breakdown,
    topCategory: breakdown[0]?.category ?? null,
    benchmarks: BENCHMARKS,
    targetRatio: round(todayKg / BENCHMARKS.sustainableTarget),
  };
}

/** Round to two decimals to keep numbers readable and stable. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
