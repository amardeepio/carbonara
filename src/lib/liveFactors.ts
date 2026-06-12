import { round } from "./emissions";
import type { Factor } from "./types";

/**
 * Optional live emission data via Carbon Interface (https://www.carboninterface.com).
 *
 * When `CARBON_INTERFACE_API_KEY` is set, supported activities are priced live;
 * anything unsupported, or any network/API error, returns `null` so the caller
 * transparently falls back to the built-in India factors. This function never
 * throws.
 *
 * Carbon Interface's estimate types don't map 1:1 to our per-km / per-meal
 * model, so today we price the `electricity` activity (kWh, by country). The
 * provider boundary is isolated here, so more mappings (or a different
 * provider) can be added without touching the rest of the app.
 *
 * Docs: https://docs.carboninterface.com/#/?id=estimates
 */
const ENDPOINT = "https://www.carboninterface.com/api/v1/estimates";

export interface LiveResult {
  kgCo2e: number;
  source: "live";
}

/** Build a Carbon Interface estimate request for a supported activity. */
function buildEstimate(factor: Factor, quantity: number): Record<string, unknown> | null {
  switch (factor.key) {
    case "electricity":
      return {
        type: "electricity",
        electricity_unit: "kwh",
        electricity_value: quantity,
        // Carbon Interface is region-specific; default to India where supported.
        country: process.env.CARBON_INTERFACE_COUNTRY || "in",
      };
    default:
      return null;
  }
}

/**
 * Price an activity via Carbon Interface. Returns `null` (never throws) when the
 * API is unconfigured, the activity is unsupported, or the request fails.
 */
export async function priceLive(factor: Factor, quantity: number): Promise<LiveResult | null> {
  const apiKey = process.env.CARBON_INTERFACE_API_KEY;
  if (!apiKey) return null;

  const body = buildEstimate(factor, quantity);
  if (!body) return null;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      // Never let a slow third party block a user request for long.
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { attributes?: { carbon_kg?: number } };
    };
    const kg = data.data?.attributes?.carbon_kg;
    if (typeof kg !== "number" || !Number.isFinite(kg)) return null;
    return { kgCo2e: round(kg), source: "live" };
  } catch {
    // Timeout, DNS, JSON, quota or unsupported-country error — fall back silently.
    return null;
  }
}
