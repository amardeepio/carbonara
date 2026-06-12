/**
 * Indian electricity-grid carbon intensity, by state.
 *
 * India's grid is operated as five regional grids with very different
 * generation mixes (e.g. coal-heavy Eastern region vs hydro-rich North
 * Eastern region). Mapping the user's state to its regional grid gives a
 * noticeably better electricity factor than the single national average,
 * while staying awareness-grade (we use regional weighted averages from the
 * CEA CO2 Baseline Database, not plant-level data).
 *
 * Unknown/missing state falls back to the national average — the same
 * graceful-degradation rule as every other optional input in the app.
 */

/** The five regional grids operated by POSOCO/Grid-India. */
export type GridRegion = "NR" | "WR" | "SR" | "ER" | "NER";

/** National average grid intensity, kg CO2e per kWh (CEA CO2 Baseline Database). */
export const NATIONAL_INTENSITY = 0.71;

/**
 * Regional weighted-average grid emission factors, kg CO2e/kWh.
 * Source: CEA CO2 Baseline Database (regional generation mix), rounded to
 * awareness-grade precision. ER runs coal-dominant; NER has a large hydro
 * share; SR benefits from wind/solar penetration.
 */
export const REGION_INTENSITY: Record<GridRegion, number> = {
  NR: 0.69, // Northern: coal + growing solar/hydro
  WR: 0.76, // Western: coal-heavy (Maharashtra/Gujarat thermal fleet)
  SR: 0.63, // Southern: highest renewables share (TN/Karnataka wind & solar)
  ER: 0.86, // Eastern: coal-dominant generation
  NER: 0.41, // North Eastern: large hydro + gas share
};

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

export const STATE_TO_REGION: Record<IndianState, GridRegion> = {
  "Andaman and Nicobar Islands": "ER", // islanded diesel/solar; grouped with ER for accounting
  "Andhra Pradesh": "SR",
  "Arunachal Pradesh": "NER",
  Assam: "NER",
  Bihar: "ER",
  Chandigarh: "NR",
  Chhattisgarh: "WR",
  "Dadra and Nagar Haveli and Daman and Diu": "WR",
  Delhi: "NR",
  Goa: "WR",
  Gujarat: "WR",
  Haryana: "NR",
  "Himachal Pradesh": "NR",
  "Jammu and Kashmir": "NR",
  Jharkhand: "ER",
  Karnataka: "SR",
  Kerala: "SR",
  Ladakh: "NR",
  Lakshadweep: "SR", // islanded; grouped with SR for accounting
  "Madhya Pradesh": "WR",
  Maharashtra: "WR",
  Manipur: "NER",
  Meghalaya: "NER",
  Mizoram: "NER",
  Nagaland: "NER",
  Odisha: "ER",
  Puducherry: "SR",
  Punjab: "NR",
  Rajasthan: "NR",
  Sikkim: "ER",
  "Tamil Nadu": "SR",
  Telangana: "SR",
  Tripura: "NER",
  "Uttar Pradesh": "NR",
  Uttarakhand: "NR",
  "West Bengal": "ER",
};

/** Type guard: is this string a known Indian state/UT? */
export function isIndianState(value: string): value is IndianState {
  return (INDIAN_STATES as readonly string[]).includes(value);
}

/**
 * Grid intensity (kg CO2e/kWh) for a user's state.
 * Unknown, missing or unrecognised states use the national average.
 */
export function gridIntensity(state?: string | null): number {
  if (!state || !isIndianState(state)) return NATIONAL_INTENSITY;
  return REGION_INTENSITY[STATE_TO_REGION[state]];
}
