import { describe, expect, it } from "vitest";
import {
  gridIntensity,
  INDIAN_STATES,
  isIndianState,
  NATIONAL_INTENSITY,
  REGION_INTENSITY,
  STATE_TO_REGION,
} from "@/lib/grid";
import { calculate, effectiveKgPerUnit, getFactor, listFactors } from "@/lib/emissions";

describe("gridIntensity", () => {
  it("returns the regional intensity for a known state", () => {
    expect(gridIntensity("Tamil Nadu")).toBe(REGION_INTENSITY.SR);
    expect(gridIntensity("West Bengal")).toBe(REGION_INTENSITY.ER);
    expect(gridIntensity("Assam")).toBe(REGION_INTENSITY.NER);
  });

  it("falls back to the national average for unknown or missing state", () => {
    expect(gridIntensity(undefined)).toBe(NATIONAL_INTENSITY);
    expect(gridIntensity(null)).toBe(NATIONAL_INTENSITY);
    expect(gridIntensity("")).toBe(NATIONAL_INTENSITY);
    expect(gridIntensity("Atlantis")).toBe(NATIONAL_INTENSITY);
  });

  it("maps every state to a region with an intensity", () => {
    for (const state of INDIAN_STATES) {
      const region = STATE_TO_REGION[state];
      expect(REGION_INTENSITY[region]).toBeGreaterThan(0);
    }
  });

  it("recognises states via the type guard", () => {
    expect(isIndianState("Kerala")).toBe(true);
    expect(isIndianState("kerala")).toBe(false);
  });
});

describe("grid-aware calculate", () => {
  it("prices electricity with the regional grid when passed", () => {
    // 10 kWh on the Southern grid (0.63) vs national default (0.71)
    expect(calculate("electricity", 10, gridIntensity("Karnataka"))).toBe(6.3);
    expect(calculate("electricity", 10)).toBe(7.1);
  });

  it("leaves grid-independent factors untouched", () => {
    expect(calculate("car_petrol", 10, 0.41)).toBe(calculate("car_petrol", 10));
  });

  it("scales EV factors with the grid", () => {
    const ner = calculate("ev_two_wheeler", 100, gridIntensity("Meghalaya"));
    const er = calculate("ev_two_wheeler", 100, gridIntensity("Bihar"));
    expect(ner).toBeLessThan(er);
  });
});

describe("grid-aware listFactors", () => {
  it("re-prices only grid-powered factors", () => {
    const grid = 0.41;
    const factors = listFactors(grid);
    const byKey = new Map(factors.map((f) => [f.key, f]));
    expect(byKey.get("electricity")?.kgPerUnit).toBe(0.41);
    expect(byKey.get("car_petrol")?.kgPerUnit).toBe(0.154);
  });

  it("returns national-default values when no grid is passed", () => {
    const electricity = listFactors().find((f) => f.key === "electricity");
    expect(electricity?.kgPerUnit).toBe(NATIONAL_INTENSITY);
  });

  it("keeps effective per-unit precision for small factors", () => {
    const ev = getFactor("ev_two_wheeler");
    expect(ev).toBeDefined();
    // 0.03 kWh/km × 0.41 = 0.0123 — must not collapse to 0.01
    expect(effectiveKgPerUnit(ev!, 0.41)).toBe(0.0123);
  });
});
