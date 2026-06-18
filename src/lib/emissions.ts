import type {
  Benchmarks,
  Category,
  CategoryBreakdown,
  CommuteMode,
  DailyTotal,
  DietPreference,
  Factor,
  FootprintSummary,
  LogEntry,
  Streak,
  WeekDelta,
} from "./types";
import { todayISO } from "./date";
import { NATIONAL_INTENSITY } from "./grid";

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
    labelHi: "दोपहिया (पेट्रोल)",
    unit: "km",
    kgPerUnit: 0.051,
    source: "Petrol 2.31 kg/L @ ~45 km/L",
    hint: "India's most common vehicle — efficient per km.",
  },
  car_petrol: {
    key: "car_petrol",
    category: "transport",
    label: "Car (petrol)",
    labelHi: "कार (पेट्रोल)",
    unit: "km",
    kgPerUnit: 0.154,
    source: "Petrol 2.31 kg/L @ ~15 km/L",
    hint: "Carpooling roughly halves this per person.",
  },
  car_diesel: {
    key: "car_diesel",
    category: "transport",
    label: "Car (diesel)",
    labelHi: "कार (डीज़ल)",
    unit: "km",
    kgPerUnit: 0.18,
    source: "Diesel 2.68 kg/L @ ~15 km/L",
  },
  auto_rickshaw: {
    key: "auto_rickshaw",
    category: "transport",
    label: "Auto-rickshaw (CNG)",
    labelHi: "ऑटो-रिक्शा (CNG)",
    unit: "km",
    kgPerUnit: 0.1,
    source: "CNG three-wheeler, India GHG Program",
  },
  bus: {
    key: "bus",
    category: "transport",
    label: "City bus",
    labelHi: "सिटी बस",
    unit: "km",
    kgPerUnit: 0.05,
    source: "Per passenger-km, Indian public transit",
    hint: "Shared transit — low per-passenger emissions.",
  },
  metro: {
    key: "metro",
    category: "transport",
    label: "Metro rail",
    labelHi: "मेट्रो रेल",
    unit: "km",
    kgPerUnit: 0.014,
    source: "Per passenger-km, Indian metro systems",
    hint: "One of the cleanest ways to travel in a city.",
  },
  train: {
    key: "train",
    category: "transport",
    label: "Indian Railways",
    labelHi: "भारतीय रेल",
    unit: "km",
    kgPerUnit: 0.008,
    source: "Per passenger-km, electrified rail",
    hint: "Prefer trains over flights for intercity trips.",
  },
  flight_domestic: {
    key: "flight_domestic",
    category: "transport",
    label: "Domestic flight",
    labelHi: "घरेलू उड़ान",
    unit: "km",
    kgPerUnit: 0.158,
    source: "Per passenger-km, short-haul",
    hint: "A single flight can outweigh a month of commuting.",
  },

  ride_hailing: {
    key: "ride_hailing",
    category: "transport",
    label: "Ride-hailing (Ola/Uber)",
    labelHi: "राइड-हेलिंग (ओला/उबर)",
    unit: "km",
    kgPerUnit: 0.21,
    source: "Petrol car 0.154 kg/km × ~1.35 deadheading uplift",
    hint: "Empty return trips make cabs costlier than your own car.",
  },
  e_rickshaw: {
    key: "e_rickshaw",
    category: "transport",
    label: "E-rickshaw",
    labelHi: "ई-रिक्शा",
    unit: "km",
    kgPerUnit: 0.028,
    kwhPerUnit: 0.04,
    source: "~0.04 kWh/km × CEA grid intensity",
    hint: "Battery three-wheeler — cleaner than a CNG auto.",
  },
  ev_two_wheeler: {
    key: "ev_two_wheeler",
    category: "transport",
    label: "Electric two-wheeler",
    labelHi: "इलेक्ट्रिक दोपहिया",
    unit: "km",
    kgPerUnit: 0.021,
    kwhPerUnit: 0.03,
    source: "~0.03 kWh/km × CEA grid intensity",
    hint: "Cleaner than petrol everywhere; cleanest on low-carbon grids.",
  },

  // ---- Energy --------------------------------------------------------------
  electricity: {
    key: "electricity",
    category: "energy",
    label: "Grid electricity",
    labelHi: "ग्रिड बिजली",
    unit: "kWh",
    kgPerUnit: 0.71,
    kwhPerUnit: 1,
    source: "CEA CO2 Baseline Database (coal-heavy grid)",
    hint: "India's grid is coal-heavy, so each unit counts.",
  },
  geyser: {
    key: "geyser",
    category: "energy",
    label: "Geyser (hot-water session)",
    labelHi: "गीज़र (गर्म पानी)",
    unit: "use",
    kgPerUnit: 1.42,
    kwhPerUnit: 2,
    source: "Typical 2 kW storage geyser ≈ 2 kWh/session (BEE) × CEA grid",
    hint: "A solar water heater brings this close to zero.",
  },
  diesel_generator: {
    key: "diesel_generator",
    category: "energy",
    label: "Diesel generator backup",
    labelHi: "डीज़ल जनरेटर",
    unit: "litre",
    kgPerUnit: 2.68,
    source: "Diesel combustion 2.68 kg CO2/L (India GHG Program)",
    hint: "Inverter + battery backup avoids most genset hours.",
  },
  lpg: {
    key: "lpg",
    category: "energy",
    label: "LPG cooking gas",
    labelHi: "LPG रसोई गैस",
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
    labelHi: "वीगन भोजन",
    unit: "meal",
    kgPerUnit: 0.5,
    source: "Our World in Data, plant-based",
  },
  meal_veg: {
    key: "meal_veg",
    category: "diet",
    label: "Vegetarian thali",
    labelHi: "शाकाहारी थाली",
    unit: "meal",
    kgPerUnit: 0.6,
    source: "Our World in Data, dairy-inclusive veg",
    hint: "India's default diet is already low-carbon.",
  },
  meal_chicken: {
    key: "meal_chicken",
    category: "diet",
    label: "Chicken/egg meal",
    labelHi: "चिकन/अंडा भोजन",
    unit: "meal",
    kgPerUnit: 1.4,
    source: "Our World in Data, poultry",
  },
  meal_mutton: {
    key: "meal_mutton",
    category: "diet",
    label: "Mutton/red-meat meal",
    labelHi: "मटन/रेड-मीट भोजन",
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
    labelHi: "सामान्य (लैंडफ़िल) कचरा",
    unit: "kg",
    kgPerUnit: 0.45,
    source: "Mixed municipal waste to landfill",
    hint: "Segregating wet waste for compost cuts this sharply.",
  },
  new_clothing: {
    key: "new_clothing",
    category: "goods",
    label: "New clothing item",
    labelHi: "नया कपड़ा",
    unit: "item",
    kgPerUnit: 15,
    source: "Lifecycle estimate per garment",
  },
  food_delivery: {
    key: "food_delivery",
    category: "goods",
    label: "Food delivery order",
    labelHi: "फ़ूड डिलीवरी ऑर्डर",
    unit: "order",
    kgPerUnit: 0.7,
    source: "Two-wheeler last-mile + packaging, lifecycle estimate",
    hint: "Delivery + packaging only — log the meal itself separately.",
  },
  online_shopping: {
    key: "online_shopping",
    category: "goods",
    label: "Online shopping parcel",
    labelHi: "ऑनलाइन शॉपिंग पार्सल",
    unit: "parcel",
    kgPerUnit: 1.0,
    source: "Last-mile logistics + packaging, lifecycle estimate",
    hint: "Combine orders — fewer parcels, fewer delivery runs.",
  },
};

/** Per-capita daily benchmarks in kg CO2e (annual figures ÷ 365). */
export const BENCHMARKS: Benchmarks = {
  indiaPerCapita: 5.2, // ~1.9 t CO2/yr (MoEFCC / global datasets)
  globalAverage: 11.0, // ~4 t CO2/yr
  sustainableTarget: 5.5, // ~2 t CO2/yr, 1.5 °C-aligned
};

/**
 * Effective kg CO2e per unit for a factor at a given grid intensity.
 * Grid-powered activities (`kwhPerUnit`) scale with the regional grid; all
 * others are grid-independent. Kept at 4-decimal precision so small per-km
 * factors (e.g. e-rickshaw) survive the conversion.
 */
export function effectiveKgPerUnit(
  factor: Factor,
  gridKgPerKwh: number = NATIONAL_INTENSITY,
): number {
  if (factor.kwhPerUnit === undefined) return factor.kgPerUnit;
  return Math.round(factor.kwhPerUnit * gridKgPerKwh * 10000) / 10000;
}

/**
 * Ordered list of factors for building the activity form. When a grid
 * intensity is passed (the user's regional grid), grid-powered factors are
 * re-priced so the client sees state-correct per-unit values.
 */
export function listFactors(gridKgPerKwh?: number): Factor[] {
  const factors = Object.values(EMISSION_FACTORS);
  if (gridKgPerKwh === undefined) return factors;
  return factors.map((f) =>
    f.kwhPerUnit === undefined ? f : { ...f, kgPerUnit: effectiveKgPerUnit(f, gridKgPerKwh) },
  );
}

/** Look up a factor by key, or `undefined` if unknown. */
export function getFactor(type: string): Factor | undefined {
  return EMISSION_FACTORS[type];
}

/**
 * Compute kg CO2e for a given activity using the built-in factors.
 * @param type The activity type key (e.g., "car_petrol").
 * @param quantity The amount of the activity (e.g., km, kWh).
 * @param gridKgPerKwh Regional grid intensity for grid-powered activities;
 *                     defaults to the national average.
 * @returns The total emissions in kg CO2e.
 * @throws {Error} if the activity type is unknown or the quantity is invalid.
 */
export function calculate(
  type: string,
  quantity: number,
  gridKgPerKwh: number = NATIONAL_INTENSITY,
): number {
  const factor = EMISSION_FACTORS[type];
  if (!factor) {
    throw new Error(`Unknown activity type: ${type}`);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive, finite number");
  }
  return round(effectiveKgPerUnit(factor, gridKgPerKwh) * quantity);
}

const CATEGORIES: Category[] = ["transport", "energy", "diet", "waste", "goods"];

/**
 * Aggregate log entries into a footprint summary: total, today's total,
 * per-category breakdown, the dominant category and benchmark comparison.
 *
 * @param today The local date string (YYYY-MM-DD) to compare entries against.
 *              Defaults to the server's local date.
 * @param benchmarks Per-capita comparison figures (live OWID values when
 *                   available, else the static defaults).
 */
export function summarise(
  entries: LogEntry[],
  today: string = todayISO(),
  benchmarks: Benchmarks = BENCHMARKS,
): FootprintSummary {
  const byCategory = new Map<Category, number>();
  let totalKg = 0;
  let todayKg = 0;

  for (const entry of entries) {
    const factor = EMISSION_FACTORS[entry.type];
    if (!factor) continue; // ignore entries referencing retired factors
    totalKg += entry.kgCo2e;
    byCategory.set(factor.category, (byCategory.get(factor.category) ?? 0) + entry.kgCo2e);
    if (entry.date === today) {
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
    benchmarks,
    targetRatio: round(todayKg / benchmarks.sustainableTarget),
  };
}

/** Aggregate entries into per-day totals (kg CO2e per calendar day), oldest first. */
export function dailyTotals(entries: LogEntry[]): DailyTotal[] {
  const byDay = new Map<string, number>();
  for (const entry of entries) {
    byDay.set(entry.date, (byDay.get(entry.date) ?? 0) + entry.kgCo2e);
  }
  return [...byDay.entries()]
    .map(([date, kg]) => ({ date, kg: round(kg) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Round to two decimals to keep numbers readable and stable. */
export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The last `n` calendar days (ending at `today`) as a gap-free series:
 * days with no entries appear with 0 kg, so charts get an even time axis.
 */
export function lastNDays(
  totals: DailyTotal[],
  n: number,
  today: string = todayISO(),
): DailyTotal[] {
  const byDate = new Map(totals.map((t) => [t.date, t.kg]));
  const series: DailyTotal[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    series.push({ date, kg: byDate.get(date) ?? 0 });
  }
  return series;
}

/**
 * Trailing moving average over a gap-free daily series. Each point averages
 * the up-to-`window` days ending at that date (shorter at the start).
 */
export function movingAverage(totals: DailyTotal[], window = 7): DailyTotal[] {
  return totals.map((t, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = totals.slice(start, i + 1);
    const avg = slice.reduce((sum, d) => sum + d.kg, 0) / slice.length;
    return { date: t.date, kg: round(avg) };
  });
}

// ---------------------------------------------------------------------------
// Streak, week-over-week delta, and personalised target
// ---------------------------------------------------------------------------

/** Estimated daily kg CO2e for a given commute mode (typical Indian commute). */
const COMMUTE_BASELINE: Partial<Record<CommuteMode, number>> = {
  two_wheeler: 0.51, // 10 km/day
  car: 2.31, // 15 km/day
  bus: 0.5, // 10 km/day
  metro: 0.14, // 10 km/day
  walk_cycle: 0,
};

/** Estimated daily kg CO2e for a given diet preference (2 meals/day). */
const DIET_BASELINE: Partial<Record<DietPreference, number>> = {
  vegan: 1.0,
  veg: 1.2,
  eggs_chicken: 2.8,
  mixed: 4.8,
};

/**
 * Estimate a personalised daily baseline from the user's commute + diet
 * answers. Returns null when neither is known.
 */
export function estimatePersonalBaseline(
  commute?: CommuteMode | null,
  diet?: DietPreference | null,
): number | null {
  let kg = 0;
  let known = false;
  if (commute && COMMUTE_BASELINE[commute] !== undefined) {
    kg += COMMUTE_BASELINE[commute];
    known = true;
  }
  if (diet && DIET_BASELINE[diet] !== undefined) {
    kg += DIET_BASELINE[diet];
    known = true;
  }
  // Add a small fixed allowance for energy + waste (lights, fridge, etc.)
  if (known) {
    kg += BENCHMARKS.sustainableTarget * 0.3;
    return round(kg);
  }
  return null;
}

/**
 * Compute a practical daily target: 90% of the personal baseline, but never
 * below the sustainable target so early-stage users aren't discouraged.
 */
export function personalDailyTarget(
  baseline?: number | null,
  floor = BENCHMARKS.sustainableTarget,
): number | null {
  if (baseline == null) return null;
  return round(Math.max(baseline * 0.9, floor));
}

/**
 * Compute the current and best logging streak from a set of total daily entries.
 * `today` is the reference date string (YYYY-MM-DD).
 */
export function computeStreak(totals: DailyTotal[], today: string = todayISO()): Streak {
  const days = new Set(totals.map((t) => t.date));
  if (days.size === 0) return { current: 0, best: 0 };

  // Current streak: walk backwards from today (or the last logged day if today
  // hasn't been logged yet).
  let current = 0;
  let cursor = today;
  // If today isn't logged but yesterday is, start counting from there.
  if (!days.has(today)) {
    const prev = addDays(today, -1);
    if (days.has(prev)) {
      cursor = prev;
    }
    // else: no streak active
  }
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  // Best streak: scan all sorted dates.
  const sorted = [...days].sort();
  let best = current;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (addDays(sorted[i - 1]!, 1) === sorted[i]) {
      run++;
    } else {
      if (run > best) best = run;
      run = 1;
    }
  }
  if (run > best) best = run;

  return { current, best };
}

/**
 * Compare this week's emissions vs last week's.
 * `totals` is the full dailyTotals output; `today` is the reference date.
 * Returns null for pct when lastWeek is 0.
 */
export function weekDelta(totals: DailyTotal[], today: string = todayISO()): WeekDelta {
  const weekKg = (start: string, end: string) => {
    let kg = 0;
    for (const t of totals) {
      if (t.date >= start && t.date <= end) kg += t.kg;
    }
    return round(kg);
  };

  const thisMonday = mondayOf(today);
  const lastMonday = addDays(thisMonday, -7);
  const thisSunday = addDays(thisMonday, 6);
  const lastSunday = addDays(thisMonday, -1);

  const thisWeek = weekKg(thisMonday, thisSunday);
  const lastWeek = weekKg(lastMonday, lastSunday);
  const pct = lastWeek > 0 ? round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

  return { thisWeek, lastWeek, pct };
}

/**
 * Parse a YYYY-MM-DD string to UTC midnight without timezone shift.
 * @param date The date string to parse in YYYY-MM-DD format.
 * @returns A Date object set to UTC midnight of the specified date.
 */
function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Format a Date as YYYY-MM-DD in UTC.
 * @param d The Date object to format.
 * @returns A string representing the date in YYYY-MM-DD format.
 */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Return the Monday (YYYY-MM-DD) of the week containing `date`. */
export function mondayOf(date: string): string {
  const d = parseDate(date);
  const day = d.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return fmtDate(d);
}

/** Add n calendar days to a YYYY-MM-DD string and return the result. */
export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}
