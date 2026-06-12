import { describe, expect, it } from "vitest";
import { BENCHMARKS } from "@/lib/emissions";
import { parseBenchmarks } from "@/lib/owid";

const CSV = `Entity,Code,Year,Annual CO₂ emissions (per capita)
India,IND,2000,1.0
India,IND,2022,2.0
World,OWID_WRL,2010,4.5
World,OWID_WRL,2022,4.7`;

describe("parseBenchmarks (OWID)", () => {
  it("derives India and global kg/day from the latest year", () => {
    const b = parseBenchmarks(CSV);
    // 2.0 t/yr -> 2000 kg / 365 = 5.48 -> 5.5
    expect(b.indiaPerCapita).toBeCloseTo(5.5, 1);
    // 4.7 t/yr -> 4700 / 365 = 12.88 -> 12.9
    expect(b.globalAverage).toBeCloseTo(12.9, 1);
  });

  it("keeps the static sustainable target (OWID has no target series)", () => {
    expect(parseBenchmarks(CSV).sustainableTarget).toBe(BENCHMARKS.sustainableTarget);
  });

  it("ignores older years and picks the most recent value per country", () => {
    // India 2022 (2.0) should win over 2000 (1.0): 5.5, not ~2.7
    expect(parseBenchmarks(CSV).indiaPerCapita).toBeGreaterThan(4);
  });

  it("throws when required country rows are missing", () => {
    const bad = `Entity,Code,Year,Annual CO₂ emissions (per capita)\nFrance,FRA,2022,5.0`;
    expect(() => parseBenchmarks(bad)).toThrow(/missing/i);
  });
});
