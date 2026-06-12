import type { Benchmarks } from "./types";
import { BENCHMARKS } from "./emissions";

/**
 * Live per-capita benchmarks from Our World in Data — no API key required.
 *
 * Fetches the public "CO₂ emissions per capita" series for India and the World,
 * converts tonnes/year to kg/day, and caches the result for a day. On any
 * failure (offline, parse error, schema change) it returns the static
 * BENCHMARKS, so the app always has sensible numbers.
 *
 * Source: https://ourworldindata.org/grapher/co2-emissions-per-capita
 */
const OWID_URL =
  "https://ourworldindata.org/grapher/co2-emissions-per-capita.csv?country=IND~OWID_WRL";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface Cache {
  value: Benchmarks;
  at: number;
}
// Persist the cache across hot reloads / warm serverless invocations.
const globalForOwid = globalThis as unknown as { __carbonaraBenchmarks?: Cache };

/** Convert tonnes CO₂ per capita per year to kg per capita per day. */
function tonnesPerYearToKgPerDay(tonnes: number): number {
  return Math.round(((tonnes * 1000) / 365) * 10) / 10;
}

/**
 * Parse the OWID CSV and derive benchmarks. The 1.5 °C-aligned sustainable
 * target is kept from the static config, since OWID has no target series.
 * Exported for unit testing. Throws if India/World rows are absent.
 */
export function parseBenchmarks(csv: string): Benchmarks {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0]?.split(",") ?? [];
  const valueIdx = header.length - 1; // the metric is always the final column

  // Track the most recent (highest-year) value per country code.
  const latest: Record<string, { year: number; value: number }> = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]?.split(",") ?? [];
    const code = cols[1];
    const year = Number(cols[2]);
    const value = Number(cols[valueIdx]);
    if (!code || !Number.isFinite(year) || !Number.isFinite(value)) continue;
    if (!latest[code] || year > latest[code].year) latest[code] = { year, value };
  }

  const india = latest["IND"]?.value;
  const world = latest["OWID_WRL"]?.value;
  if (india === undefined || world === undefined) {
    throw new Error("OWID data missing India/World per-capita values");
  }

  return {
    indiaPerCapita: tonnesPerYearToKgPerDay(india),
    globalAverage: tonnesPerYearToKgPerDay(world),
    sustainableTarget: BENCHMARKS.sustainableTarget,
  };
}

/** Resolve benchmarks, preferring live OWID data, cached for 24h. */
export async function getLiveBenchmarks(): Promise<Benchmarks> {
  const cache = globalForOwid.__carbonaraBenchmarks;
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  try {
    const res = await fetch(OWID_URL, {
      headers: { "User-Agent": "Carbonara/1.0 (carbon footprint awareness app)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`OWID HTTP ${res.status}`);
    const value = parseBenchmarks(await res.text());
    globalForOwid.__carbonaraBenchmarks = { value, at: Date.now() };
    return value;
  } catch {
    return BENCHMARKS;
  }
}
