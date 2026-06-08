import type { Factor } from "./types";

/**
 * Climatiq integration — optional, region-aware live emission factors.
 *
 * When `CLIMATIQ_API_KEY` is set and a factor declares a `climatiqActivityId`,
 * we price the activity through Climatiq's estimate endpoint (region = IN).
 * Any misconfiguration, network error or unmapped activity returns `null` so
 * the caller can transparently fall back to the built-in India factors.
 *
 * Docs: https://www.climatiq.io/docs
 */
const CLIMATIQ_ENDPOINT = "https://api.climatiq.io/data/v1/estimate";

/** Map an internal unit to the Climatiq parameter object for that activity. */
function buildParameters(unit: string, quantity: number): Record<string, unknown> | null {
  switch (unit) {
    case "km":
      return { distance: quantity, distance_unit: "km" };
    case "kWh":
      return { energy: quantity, energy_unit: "kWh" };
    case "kg":
      return { weight: quantity, weight_unit: "kg" };
    default:
      // Meals, items, etc. have no standard physical Climatiq parameter.
      return null;
  }
}

export interface ClimatiqResult {
  kgCo2e: number;
  source: "climatiq";
}

/**
 * Price an activity via Climatiq. Returns `null` (never throws) when the API
 * is unavailable, unconfigured, or the activity cannot be mapped.
 */
export async function priceWithClimatiq(
  factor: Factor,
  quantity: number,
): Promise<ClimatiqResult | null> {
  const apiKey = process.env.CLIMATIQ_API_KEY;
  if (!apiKey || !factor.climatiqActivityId) return null;

  const parameters = buildParameters(factor.unit, quantity);
  if (!parameters) return null;

  try {
    const res = await fetch(CLIMATIQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        emission_factor: {
          activity_id: factor.climatiqActivityId,
          data_version: process.env.CLIMATIQ_DATA_VERSION ?? "^6",
          region: "IN",
        },
        parameters,
      }),
      // Never let a slow third party block a user request for long.
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { co2e?: number };
    if (typeof data.co2e !== "number" || !Number.isFinite(data.co2e)) return null;
    return { kgCo2e: Math.round(data.co2e * 100) / 100, source: "climatiq" };
  } catch {
    // Timeout, DNS, JSON, or quota error — fall back silently.
    return null;
  }
}
