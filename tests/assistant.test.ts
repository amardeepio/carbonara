import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateInsights, recommend, ruleBasedMessage } from "@/lib/assistant";
import { calculate, summarise } from "@/lib/emissions";
import type { LogEntry } from "@/lib/types";

function entry(type: string, quantity: number): LogEntry {
  return {
    id: `${type}-${Math.random()}`,
    type,
    quantity,
    kgCo2e: calculate(type, quantity),
    createdAt: new Date().toISOString(),
    pricedBy: "builtin",
  };
}

describe("recommend (rules engine)", () => {
  it("nudges the user to start logging when there is no data", () => {
    const recs = recommend(summarise([]));
    expect(recs).toHaveLength(1);
    expect(recs[0].category).toBe("general");
  });

  it("prioritizes actions for the dominant emission category", () => {
    // Energy dominates: 50 kWh electricity = 35.5 kg vs a small car trip.
    const summary = summarise([entry("electricity", 50), entry("car_petrol", 2)]);
    expect(summary.topCategory).toBe("energy");
    const recs = recommend(summary);
    expect(recs[0].category).toBe("energy");
  });

  it("returns multiple, ordered recommendations", () => {
    const summary = summarise([entry("meal_mutton", 3), entry("flight_domestic", 800)]);
    const recs = recommend(summary, 4);
    expect(recs.length).toBeGreaterThan(1);
    expect(recs.length).toBeLessThanOrEqual(4);
  });
});

describe("generateInsights fallback", () => {
  const original = process.env.GROQ_API_KEY;

  beforeEach(() => {
    delete process.env.GROQ_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = original;
  });

  it("falls back to the rules engine when no API key is configured", async () => {
    const summary = summarise([entry("electricity", 20)]);
    const insights = await generateInsights(summary);
    expect(insights.generatedBy).toBe("rules");
    expect(insights.message).toBe(ruleBasedMessage(summary));
    expect(insights.recommendations.length).toBeGreaterThan(0);
  });

  it("produces a context-aware narrative mentioning the user's standing", async () => {
    const summary = summarise([entry("electricity", 20)]); // 14.2 kg, over target
    const message = ruleBasedMessage(summary);
    expect(message).toContain("kg CO2e");
    expect(message).toMatch(/target/);
  });
});
