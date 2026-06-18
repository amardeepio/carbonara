import { describe, expect, it } from "vitest";
import {
  BENCHMARKS,
  calculate,
  computeStreak,
  dailyTotals,
  EMISSION_FACTORS,
  estimatePersonalBaseline,
  getFactor,
  lastNDays,
  listFactors,
  movingAverage,
  personalDailyTarget,
  summarise,
  weekDelta,
} from "@/lib/emissions";
import type { DailyTotal, LogEntry } from "@/lib/types";

function entry(type: string, quantity: number, createdAt: string, date?: string): LogEntry {
  return {
    id: `${type}-${createdAt}`,
    userId: "test-user",
    date: date ?? createdAt.slice(0, 10),
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
    const mutton = getFactor("meal_mutton");
    const veg = getFactor("meal_veg");
    expect(mutton).toBeDefined();
    expect(veg).toBeDefined();
    expect(mutton?.kgPerUnit ?? 0).toBeGreaterThan(veg?.kgPerUnit ?? Infinity);
  });

  it("tags every factor with a source", () => {
    for (const factor of listFactors()) {
      expect(factor.source.length, factor.key).toBeGreaterThan(0);
    }
  });

  it("includes the newer everyday-India activities", () => {
    for (const key of [
      "geyser",
      "diesel_generator",
      "ride_hailing",
      "e_rickshaw",
      "ev_two_wheeler",
      "food_delivery",
      "online_shopping",
    ]) {
      expect(getFactor(key), key).toBeDefined();
    }
  });

  it("marks grid-powered activities with kwhPerUnit", () => {
    for (const key of ["electricity", "geyser", "e_rickshaw", "ev_two_wheeler"]) {
      expect(getFactor(key)?.kwhPerUnit, key).toBeGreaterThan(0);
    }
    expect(getFactor("diesel_generator")?.kwhPerUnit).toBeUndefined();
  });

  it("keeps an EV two-wheeler cleaner than petrol per km", () => {
    expect(calculate("ev_two_wheeler", 100)).toBeLessThan(calculate("two_wheeler", 100));
  });

  it("prices ride-hailing above a private petrol car", () => {
    expect(calculate("ride_hailing", 10)).toBeGreaterThan(calculate("car_petrol", 10));
  });
});

describe("summarise", () => {
  const today = "2026-06-09";

  it("returns an empty summary for no entries", () => {
    const s = summarise([], today);
    expect(s.totalKg).toBe(0);
    expect(s.todayKg).toBe(0);
    expect(s.topCategory).toBeNull();
    expect(s.breakdown).toEqual([]);
    expect(s.benchmarks).toEqual(BENCHMARKS);
  });

  it("aggregates totals, today's total and category breakdown", () => {
    const entries = [
      entry("car_petrol", 20, "2026-06-09T10:00:00.000Z", "2026-06-09"), // transport, today
      entry("electricity", 10, "2026-06-09T11:00:00.000Z", "2026-06-09"), // energy, today
      entry("meal_mutton", 1, "2026-06-08T20:00:00.000Z", "2026-06-08"), // diet, yesterday
    ];
    const s = summarise(entries, today);

    // 3.08 (car) + 7.1 (elec) + 3.5 (mutton)
    expect(s.totalKg).toBe(13.68);
    expect(s.todayKg).toBe(10.18); // only the two on 2026-06-09
    expect(s.entryCount).toBe(3);
    expect(s.topCategory).toBe("energy"); // 7.1 is the largest single category
    expect(s.breakdown.map((b) => b.category)).toEqual(["energy", "diet", "transport"]);
  });

  it("computes the target ratio against the sustainable benchmark", () => {
    const entries = [entry("electricity", 10, "2026-06-09T11:00:00.000Z", "2026-06-09")]; // 7.1 kg today
    const s = summarise(entries, today);
    expect(s.targetRatio).toBe(Math.round((7.1 / BENCHMARKS.sustainableTarget) * 100) / 100);
  });

  it("ignores entries referencing retired factor keys", () => {
    const stale: LogEntry = {
      id: "x",
      userId: "test-user",
      date: "2026-06-09",
      type: "retired_factor",
      quantity: 1,
      kgCo2e: 99,
      createdAt: "2026-06-09T11:00:00.000Z",
      pricedBy: "builtin",
    };
    expect(summarise([stale], today).totalKg).toBe(0);
  });
});

describe("dailyTotals", () => {
  it("returns an empty history for no entries", () => {
    expect(dailyTotals([])).toEqual([]);
  });

  it("groups entries into per-day totals by date field, oldest first", () => {
    const history = dailyTotals([
      entry("electricity", 10, "2026-06-09T08:00:00.000Z", "2026-06-09"), // 7.1
      entry("metro", 10, "2026-06-08T09:00:00.000Z", "2026-06-08"), // 0.14
      entry("meal_veg", 1, "2026-06-09T20:00:00.000Z", "2026-06-09"), // 0.6
    ]);
    expect(history).toEqual([
      { date: "2026-06-08", kg: 0.14 },
      { date: "2026-06-09", kg: 7.7 },
    ]);
  });

  it("groups by date field even when timestamps differ wildly", () => {
    const history = dailyTotals([
      entry("bus", 10, "2025-12-31T23:59:00.000Z", "2026-06-09"), // 0.5
      entry("metro", 10, "2026-06-09T00:01:00.000Z", "2026-06-09"), // 0.14
    ]);
    expect(history).toEqual([{ date: "2026-06-09", kg: 0.64 }]);
  });

  it("rounds day totals to two decimals", () => {
    const history = dailyTotals([
      entry("two_wheeler", 7, "2026-06-09T08:00:00.000Z", "2026-06-09"), // 0.36
      entry("two_wheeler", 7, "2026-06-09T18:00:00.000Z", "2026-06-09"), // 0.36
    ]);
    expect(history).toEqual([{ date: "2026-06-09", kg: 0.72 }]);
  });
});

// ---------------------------------------------------------------------------
// Streak, week-over-week delta, and personalised target
// ---------------------------------------------------------------------------

function dt(date: string, kg: number): DailyTotal {
  return { date, kg };
}

describe("personalised target", () => {
  it("estimates a baseline from commute + diet", () => {
    const b = estimatePersonalBaseline("car", "mixed");
    // car ~2.31 + mixed ~4.8 + 0.3*5.5(~1.65) = ~8.76
    expect(b).toBeDefined();
    expect(b!).toBeGreaterThan(6);
    expect(b!).toBeLessThan(12);
  });

  it("returns null when neither commute nor diet is known", () => {
    expect(estimatePersonalBaseline()).toBeNull();
    expect(estimatePersonalBaseline(null, null)).toBeNull();
  });

  it("returns a baseline from commute alone", () => {
    expect(estimatePersonalBaseline("metro")).toBeGreaterThan(0);
  });

  it("returns a baseline from diet alone", () => {
    expect(estimatePersonalBaseline(undefined, "veg")).toBeGreaterThan(0);
  });

  it("computes a target at 90% of baseline, floored at sustainable target", () => {
    const target = personalDailyTarget(4);
    // 3.6 is below 5.5, so floor kicks in
    expect(target).toBe(BENCHMARKS.sustainableTarget);
    const high = personalDailyTarget(10);
    expect(high).toBe(9); // 10 * 0.9
  });

  it("returns null for null baseline", () => {
    expect(personalDailyTarget(null)).toBeNull();
  });
});

describe("computeStreak", () => {
  const today = "2026-06-09";

  it("returns zero for no totals", () => {
    expect(computeStreak([], today)).toEqual({ current: 0, best: 0 });
  });

  it("counts consecutive days ending at today", () => {
    const totals = [dt("2026-06-09", 5), dt("2026-06-08", 4), dt("2026-06-07", 3)];
    expect(computeStreak(totals, today)).toEqual({ current: 3, best: 3 });
  });

  it("counts from yesterday when today is missing", () => {
    const totals = [dt("2026-06-08", 4), dt("2026-06-07", 3)];
    expect(computeStreak(totals, today)).toEqual({ current: 2, best: 2 });
  });

  it("returns zero when today is missing and yesterday is missing", () => {
    const totals = [dt("2026-06-07", 3)];
    expect(computeStreak(totals, today)).toEqual({ current: 0, best: 1 });
  });

  it("tracks best streak separately from current", () => {
    const totals = [
      dt("2026-06-09", 5),
      dt("2026-06-08", 4), // current = 2
      dt("2026-06-05", 3),
      dt("2026-06-04", 3),
      dt("2026-06-03", 3), // best = 3
    ];
    expect(computeStreak(totals, today)).toEqual({ current: 2, best: 3 });
  });
});

describe("weekDelta", () => {
  const today = "2026-06-10"; // a Wednesday

  it("compares this week vs last week", () => {
    // Mon–Sun Jun 1-7 vs Mon–Sun Jun 8-14
    const totals = [
      dt("2026-06-01", 2),
      dt("2026-06-02", 3), // last week Mon–Tue = 5
      dt("2026-06-08", 1),
      dt("2026-06-09", 2), // this week Mon–Tue = 3
    ];
    const d = weekDelta(totals, today);
    expect(d.thisWeek).toBe(3);
    expect(d.lastWeek).toBe(5);
    expect(d.pct).toBe(-40); // (3-5)/5 * 100 = -40
  });

  it("returns null pct when last week is zero", () => {
    const totals = [dt("2026-06-08", 3)];
    const d = weekDelta(totals, today);
    expect(d.lastWeek).toBe(0);
    expect(d.pct).toBeNull();
  });

  it("returns zero for both weeks when no data exists", () => {
    const d = weekDelta([], today);
    expect(d.thisWeek).toBe(0);
    expect(d.lastWeek).toBe(0);
    expect(d.pct).toBeNull();
  });
});

describe("lastNDays", () => {
  it("returns a gap-free series ending at today", () => {
    const series = lastNDays([{ date: "2026-06-07", kg: 4 }], 5, "2026-06-09");
    expect(series).toHaveLength(5);
    expect(series[0]?.date).toBe("2026-06-05");
    expect(series[4]?.date).toBe("2026-06-09");
    expect(series.map((d) => d.kg)).toEqual([0, 0, 4, 0, 0]);
  });

  it("ignores totals outside the window", () => {
    const series = lastNDays([{ date: "2026-01-01", kg: 99 }], 3, "2026-06-09");
    expect(series.every((d) => d.kg === 0)).toBe(true);
  });
});

describe("movingAverage", () => {
  it("averages a trailing window, shorter at the start", () => {
    const series = [
      { date: "2026-06-01", kg: 2 },
      { date: "2026-06-02", kg: 4 },
      { date: "2026-06-03", kg: 6 },
    ];
    const avg = movingAverage(series, 2);
    expect(avg.map((d) => d.kg)).toEqual([2, 3, 5]);
  });

  it("handles a window longer than the series", () => {
    const avg = movingAverage([{ date: "2026-06-01", kg: 3 }], 7);
    expect(avg).toEqual([{ date: "2026-06-01", kg: 3 }]);
  });
});
