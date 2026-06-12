import { describe, expect, it } from "vitest";
import {
  badges,
  canPledge,
  CHALLENGES,
  evaluateChallenge,
  getChallenge,
  type Pledge,
} from "@/lib/challenges";
import { calculate } from "@/lib/emissions";
import type { LogEntry } from "@/lib/types";

// 2026-06-01 is a Monday; the pledged week runs through Sunday 2026-06-07.
const WEEK_START = "2026-06-01";
const MID_WEEK = "2026-06-03";
const AFTER_WEEK = "2026-06-08";

function entry(type: string, quantity: number, date: string): LogEntry {
  return {
    id: `${type}-${date}-${Math.random()}`,
    userId: "test-user",
    date,
    type,
    quantity,
    kgCo2e: calculate(type, quantity),
    createdAt: `${date}T10:00:00.000Z`,
    pricedBy: "builtin",
  };
}

function def(key: string) {
  const d = getChallenge(key);
  if (!d) throw new Error(`Unknown challenge ${key}`);
  return d;
}

describe("use challenges (Metro Monday)", () => {
  it("completes mid-week once the quantity lands on the right day", () => {
    const entries = [entry("metro", 8, "2026-06-01")]; // Monday
    const r = evaluateChallenge(def("metro_monday"), entries, WEEK_START, MID_WEEK);
    expect(r.status).toBe("completed");
    // 8 km × (0.154 car − 0.014 metro) = 1.12 kg avoided
    expect(r.kgAvoided).toBeCloseTo(1.12, 2);
  });

  it("ignores qualifying activity on other days", () => {
    const entries = [entry("metro", 8, "2026-06-02")]; // Tuesday
    const r = evaluateChallenge(def("metro_monday"), entries, WEEK_START, MID_WEEK);
    expect(r.status).toBe("active");
    expect(r.progress).toBe(0);
  });

  it("misses once the week ends without enough quantity", () => {
    const entries = [entry("metro", 2, "2026-06-01")];
    const r = evaluateChallenge(def("metro_monday"), entries, WEEK_START, AFTER_WEEK);
    expect(r.status).toBe("missed");
  });

  it("reports partial progress while active", () => {
    const entries = [entry("ev_two_wheeler", 15, "2026-06-02")]; // 15 of 30 km
    const r = evaluateChallenge(def("ev_week"), entries, WEEK_START, MID_WEEK);
    expect(r.status).toBe("active");
    expect(r.progress).toBe(0.5);
  });
});

describe("avoid challenges (Meatless week)", () => {
  it("stays active mid-week even when clean", () => {
    const entries = [
      entry("meal_veg", 1, "2026-06-01"),
      entry("meal_veg", 1, "2026-06-02"),
      entry("meal_veg", 1, "2026-06-03"),
    ];
    const r = evaluateChallenge(def("meatless_week"), entries, WEEK_START, MID_WEEK);
    expect(r.status).toBe("active");
    expect(r.progress).toBeGreaterThan(0);
  });

  it("misses immediately on a violation", () => {
    const entries = [
      entry("meal_veg", 1, "2026-06-01"),
      entry("meal_mutton", 1, "2026-06-02"),
    ];
    const r = evaluateChallenge(def("meatless_week"), entries, WEEK_START, MID_WEEK);
    expect(r.status).toBe("missed");
  });

  it("completes after the week with enough substitutes, crediting the swap", () => {
    const entries = [
      entry("meal_veg", 1, "2026-06-01"),
      entry("meal_veg", 1, "2026-06-03"),
      entry("meal_vegan", 1, "2026-06-05"),
    ];
    const r = evaluateChallenge(def("meatless_week"), entries, WEEK_START, AFTER_WEEK);
    expect(r.status).toBe("completed");
    // veg: 2 × (1.4 − 0.6) = 1.6; vegan: 1 × (1.4 − 0.5) = 0.9 → 2.5 kg
    expect(r.kgAvoided).toBeCloseTo(2.5, 2);
  });

  it("refuses a vacuous win when too little was logged (anti-gaming)", () => {
    const entries = [entry("meal_veg", 1, "2026-06-01")]; // only 1 of the 3 required
    const r = evaluateChallenge(def("meatless_week"), entries, WEEK_START, AFTER_WEEK);
    expect(r.status).toBe("missed");
  });

  it("uses the assumed avoided volume when there is no direct substitute", () => {
    const entries = [
      entry("metro", 5, "2026-06-01"),
      entry("meal_veg", 1, "2026-06-03"),
      entry("electricity", 4, "2026-06-05"),
    ];
    const r = evaluateChallenge(def("no_delivery_week"), entries, WEEK_START, AFTER_WEEK);
    expect(r.status).toBe("completed");
    // 3 assumed avoided orders × 0.7 kg
    expect(r.kgAvoided).toBeCloseTo(2.1, 2);
  });
});

describe("reduce challenges (AC at 26 °C week)", () => {
  // 4 prior weeks of 28 kWh each (7 kg/week × 0.71... 28 kWh ≈ 19.88 kg/week)
  const history = [
    entry("electricity", 28, "2026-05-05"),
    entry("electricity", 28, "2026-05-12"),
    entry("electricity", 28, "2026-05-19"),
    entry("electricity", 28, "2026-05-26"),
  ];

  it("completes when the week lands 10% under the 4-week average", () => {
    const entries = [...history, entry("electricity", 20, "2026-06-03")];
    const r = evaluateChallenge(def("ac_26_week"), entries, WEEK_START, AFTER_WEEK);
    expect(r.status).toBe("completed");
    expect(r.kgAvoided).toBeGreaterThan(0);
  });

  it("misses when usage stays at the old level", () => {
    const entries = [...history, entry("electricity", 28, "2026-06-03")];
    const r = evaluateChallenge(def("ac_26_week"), entries, WEEK_START, AFTER_WEEK);
    expect(r.status).toBe("missed");
  });

  it("stays active during the week", () => {
    const entries = [...history, entry("electricity", 5, "2026-06-02")];
    const r = evaluateChallenge(def("ac_26_week"), entries, WEEK_START, MID_WEEK);
    expect(r.status).toBe("active");
  });
});

describe("canPledge", () => {
  it("gates reduce challenges on 7 days of prior history", () => {
    const fewDays = [
      entry("electricity", 5, "2026-05-20"),
      entry("electricity", 5, "2026-05-21"),
    ];
    expect(canPledge(def("ac_26_week"), fewDays, WEEK_START).ok).toBe(false);

    const enough = Array.from({ length: 7 }, (_, i) =>
      entry("electricity", 5, `2026-05-2${i}`),
    );
    expect(canPledge(def("ac_26_week"), enough, WEEK_START).ok).toBe(true);
  });

  it("always allows use/avoid challenges", () => {
    expect(canPledge(def("metro_monday"), [], WEEK_START).ok).toBe(true);
    expect(canPledge(def("meatless_week"), [], WEEK_START).ok).toBe(true);
  });
});

describe("badges", () => {
  function pledge(status: Pledge["status"], kgAvoided?: number): Pledge {
    return {
      id: String(Math.random()),
      userId: "u",
      challengeKey: "metro_monday",
      weekStart: WEEK_START,
      status,
      kgAvoided,
      createdAt: "2026-06-01T00:00:00.000Z",
    };
  }

  it("awards nothing with no pledges", () => {
    expect(badges([]).every((b) => !b.earned)).toBe(true);
  });

  it("awards milestones as pledges complete", () => {
    const earned = badges([
      pledge("completed", 6),
      pledge("completed", 3),
      pledge("completed", 2),
      pledge("missed"),
    ]);
    const byKey = new Map(earned.map((b) => [b.key, b.earned]));
    expect(byKey.get("first_pledge")).toBe(true);
    expect(byKey.get("first_win")).toBe(true);
    expect(byKey.get("hat_trick")).toBe(true);
    expect(byKey.get("big_saver")).toBe(true); // 11 kg total
  });
});

describe("catalog", () => {
  it("references only known factor types", () => {
    for (const c of CHALLENGES) {
      const types =
        c.rule.kind === "avoid"
          ? [...c.rule.avoidTypes, ...c.rule.requireTypes, c.rule.counterfactualType]
          : c.rule.kind === "use"
            ? [...c.rule.useTypes, c.rule.counterfactualType]
            : c.rule.types;
      for (const t of types) {
        expect(calculate(t, 1), `${c.key} → ${t}`).toBeGreaterThan(0);
      }
    }
  });
});
