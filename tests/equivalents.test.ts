import { describe, expect, it } from "vitest";
import { equivalents, equivalentsSentence } from "@/lib/equivalents";

describe("equivalents", () => {
  it("returns nothing for zero, negative or non-finite input", () => {
    expect(equivalents(0)).toEqual([]);
    expect(equivalents(-5)).toEqual([]);
    expect(equivalents(NaN)).toEqual([]);
  });

  it("converts a typical week into relatable counts", () => {
    const eq = equivalents(35); // ~a week around the India average
    const byKey = new Map(eq.map((e) => [e.key, e]));
    // 35 / 0.154 ≈ 227 km by petrol car
    expect(byKey.get("car_km")?.value).toBeCloseTo(227.27, 1);
    // 35 / 2.24 ≈ 15.6 Delhi–Jaipur train trips
    expect(byKey.get("train_trips")?.value).toBeCloseTo(15.63, 1);
    // 35 / 22 ≈ 1.6 tree-years
    expect(byKey.get("tree_years")?.value).toBeCloseTo(1.59, 1);
  });

  it("respects the limit", () => {
    expect(equivalents(35, 2)).toHaveLength(2);
  });

  it("drops equivalents that would read as degenerate counts", () => {
    // 0.5 kg: car_km = 3.2 (kept), lpg_cylinders = 0.012 (dropped, < min 0.1)
    const keys = equivalents(0.5, 5).map((e) => e.key);
    expect(keys).toContain("car_km");
    expect(keys).not.toContain("lpg_cylinders");
  });

  it("uses singular phrasing for counts near one", () => {
    // 2.24 kg = exactly 1 train trip
    const trip = equivalents(2.24, 5).find((e) => e.key === "train_trips");
    expect(trip?.label).toBe("1 Delhi–Jaipur train trip");
  });

  it("tags every equivalent with a source", () => {
    for (const eq of equivalents(35, 5)) {
      expect(eq.source.length).toBeGreaterThan(0);
    }
  });
});

describe("equivalentsSentence", () => {
  it("builds a compact one-liner", () => {
    const s = equivalentsSentence(35);
    expect(s).toMatch(/^≈ /);
    expect(s).toContain("km driven in a petrol car");
  });

  it("returns null when there is nothing to say", () => {
    expect(equivalentsSentence(0)).toBeNull();
  });
});
