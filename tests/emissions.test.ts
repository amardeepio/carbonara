import { describe, expect, it } from "vitest";
import {
  BENCHMARKS,
  calculate,
  EMISSION_FACTORS,
  getFactor,
  listFactors,
  summarise,
} from "@/lib/emissions";
import type { LogEntry } from "@/lib/types";

function entry(type: string, quantity: number, createdAt: string): LogEntry {
  return {
    id: `${type}-${createdAt}`,
    type,
    quantity,
    kgCo2e: calculate(type, quantity),
    createdAt,
    pricedBy: "builtin",
  };
}

describe("calculate", () => {
  it("multiplies the India factor by the quantity", () => {
    // electricity = 0.71 kg/kWh
    expect(calculate("electricity", 10)).toBe(7.1);
  });

  it("rounds to two decimals", () => {
    // two_wheeler = 0.051 kg/km * 7 = 0.357 -> 0.36
    expect(calculate("two_wheeler", 7)).toBe(0.36);
  });

  it("throws on an unknown activity type", () => {
    expect(() => calculate("teleport", 5)).toThrow(/Unknown activity type/);
  });

  it("throws on a non-positive quantity", () => {
    expect(() => calculate("electricity", 0)).toThrow();
    expect(() => calculate("electricity", -3)).toThrow();
  });
});

describe("factor catalogue", () => {
  it("exposes every factor through listFactors", () => {
    expect(listFactors()).toHaveLength(Object.keys(EMISSION_FACTORS).length);
  });

  it("looks factors up by key", () => {
    expect(getFactor("metro")?.category).toBe("transport");
    expect(getFactor("nope")).toBeUndefined();
  });

  it("keeps mutton as the highest-impact diet option", () => {
    expect(EMISSION_FACTORS.meal_mutton.kgPerUnit).toBeGreaterThan(
      EMISSION_FACTORS.meal_veg.kgPerUnit,
    );
  });
});

describe("summarise", () => {
  const now = new Date("2026-06-09T12:00:00.000Z");
  // Derive timestamps relative to `now` so the local-day grouping in
  // `summarise` is asserted independently of the machine's timezone.
  const iso = (msOffset: number) => new Date(now.getTime() + msOffset).toISOString();
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  it("returns an empty summary for no entries", () => {
    const s = summarise([], now);
    expect(s.totalKg).toBe(0);
    expect(s.todayKg).toBe(0);
    expect(s.topCategory).toBeNull();
    expect(s.breakdown).toEqual([]);
    expect(s.benchmarks).toEqual(BENCHMARKS);
  });

  it("aggregates totals, today's total and category breakdown", () => {
    const entries = [
      entry("car_petrol", 20, iso(-2 * HOUR)), // transport, today
      entry("electricity", 10, iso(-HOUR)), // energy, today
      entry("meal_mutton", 1, iso(-DAY)), // diet, yesterday
    ];
    const s = summarise(entries, now);

    // 3.08 (car) + 7.1 (elec) + 3.5 (mutton)
    expect(s.totalKg).toBe(13.68);
    expect(s.todayKg).toBe(10.18); // only the two on 2026-06-09
    expect(s.entryCount).toBe(3);
    expect(s.topCategory).toBe("energy"); // 7.1 is the largest single category
    expect(s.breakdown.map((b) => b.category)).toEqual(["energy", "diet", "transport"]);
  });

  it("computes the target ratio against the sustainable benchmark", () => {
    const entries = [entry("electricity", 10, iso(-HOUR))]; // 7.1 kg today
    const s = summarise(entries, now);
    expect(s.targetRatio).toBe(Math.round((7.1 / BENCHMARKS.sustainableTarget) * 100) / 100);
  });

  it("ignores entries referencing retired factor keys", () => {
    const stale: LogEntry = {
      id: "x",
      type: "retired_factor",
      quantity: 1,
      kgCo2e: 99,
      createdAt: iso(-HOUR),
      pricedBy: "builtin",
    };
    expect(summarise([stale], now).totalKg).toBe(0);
  });
});
