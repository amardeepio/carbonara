import { describe, expect, it } from "vitest";
import { rankSwaps, simulateSwap, SWAPS } from "@/lib/whatif";
import { calculate, listFactors } from "@/lib/emissions";
import { gridIntensity } from "@/lib/grid";
import type { Factor, LogEntry } from "@/lib/types";

const TODAY = "2026-06-09";

function factorMap(gridKgPerKwh?: number): Record<string, Factor> {
  return Object.fromEntries(listFactors(gridKgPerKwh).map((f) => [f.key, f]));
}

function entry(type: string, quantity: number, date: string): LogEntry {
  return {
    id: `${type}-${date}-${quantity}`,
    userId: "test-user",
    date,
    type,
    quantity,
    kgCo2e: calculate(type, quantity),
    createdAt: `${date}T10:00:00.000Z`,
    pricedBy: "builtin",
  };
}

function swap(key: string) {
  const s = SWAPS.find((s) => s.key === key);
  if (!s) throw new Error(`Unknown swap ${key}`);
  return s;
}

describe("simulateSwap", () => {
  it("averages the last 28 days of history into a weekly volume", () => {
    // 80 km of petrol car over the window → 20 km/week
    const entries = [entry("car_petrol", 40, "2026-06-01"), entry("car_petrol", 40, "2026-05-20")];
    const p = simulateSwap(swap("car_to_metro"), entries, factorMap(), TODAY);
    expect(p?.basis).toBe("history");
    expect(p?.weeklyQty).toBe(20);
    // (0.154 - 0.014) × 20 = 2.8 kg/week
    expect(p?.savedKgPerWeek).toBe(2.8);
    expect(p?.savedKgPerYear).toBe(145.6);
  });

  it("ignores entries older than the 28-day window", () => {
    const entries = [
      entry("car_petrol", 40, "2026-06-01"),
      entry("car_petrol", 400, "2026-04-01"), // outside window
    ];
    const p = simulateSwap(swap("car_to_metro"), entries, factorMap(), TODAY);
    expect(p?.weeklyQty).toBe(10);
  });

  it("falls back to assumed usage with no history", () => {
    const p = simulateSwap(swap("mutton_to_veg"), [], factorMap(), TODAY);
    expect(p?.basis).toBe("assumed");
    expect(p?.weeklyQty).toBe(2);
    // (3.5 - 0.6) × 2 = 5.8 kg/week
    expect(p?.savedKgPerWeek).toBe(5.8);
  });

  it("computes percentage-based swaps from logged electricity", () => {
    // 70 kWh over 28 days → 17.5 kWh/week; saving = 17.5 × 0.71 × 0.12
    const entries = [entry("electricity", 70, "2026-06-01")];
    const p = simulateSwap(swap("ac_setpoint"), entries, factorMap(), TODAY);
    expect(p?.weeklyQty).toBe(17.5);
    expect(p?.savedKgPerWeek).toBeCloseTo(1.49, 2);
  });

  it("prices EV swaps with the grid-adjusted factor map", () => {
    const entries = [entry("two_wheeler", 112, "2026-06-01")]; // 28 km/week... 112/4 = 28
    const national = simulateSwap(swap("two_wheeler_to_ev"), entries, factorMap(), TODAY);
    const lowCarbon = simulateSwap(
      swap("two_wheeler_to_ev"),
      entries,
      factorMap(gridIntensity("Meghalaya")), // NER 0.41 — cleaner grid, bigger saving
      TODAY,
    );
    expect(lowCarbon!.savedKgPerYear).toBeGreaterThan(national!.savedKgPerYear);
  });

  it("returns null when the factors map is missing the types", () => {
    expect(simulateSwap(swap("car_to_metro"), [], {}, TODAY)).toBeNull();
  });
});

describe("rankSwaps", () => {
  it("ranks history-backed swaps by yearly saving", () => {
    const entries = [
      entry("car_petrol", 200, "2026-06-01"), // 50 km/wk → 7 kg/wk saving
      entry("meal_mutton", 4, "2026-06-02"), // 1/wk → 2.9 kg/wk saving
    ];
    const ranked = rankSwaps(entries, factorMap(), TODAY);
    expect(ranked[0]?.swap.key).toBe("car_to_metro");
    expect(ranked.map((r) => r.swap.key)).toContain("mutton_to_veg");
  });

  it("orders strictly by descending yearly saving", () => {
    const ranked = rankSwaps([], factorMap(), TODAY);
    const savings = ranked.map((r) => r.projection.savedKgPerYear);
    expect(savings).toEqual([...savings].sort((a, b) => b - a));
    expect(ranked.length).toBeGreaterThan(0);
  });
});
