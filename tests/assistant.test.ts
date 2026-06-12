import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chatReply,
  deterministicChatReply,
  generateInsights,
  recommend,
  ruleBasedMessage,
} from "@/lib/assistant";
import { calculate, summarise } from "@/lib/emissions";
import type { ChatMessage, LogEntry } from "@/lib/types";

function entry(type: string, quantity: number): LogEntry {
  return {
    id: `${type}-${Math.random()}`,
    userId: "test-user",
    date: new Date().toISOString().slice(0, 10),
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
    expect(recs[0]?.category).toBe("general");
  });

  it("prioritizes actions for the dominant emission category", () => {
    // Energy dominates: 50 kWh electricity = 35.5 kg vs a small car trip.
    const summary = summarise([entry("electricity", 50), entry("car_petrol", 2)]);
    expect(summary.topCategory).toBe("energy");
    const recs = recommend(summary);
    expect(recs[0]?.category).toBe("energy");
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

describe("chatbot fallback", () => {
  const original = process.env.GROQ_API_KEY;
  const ask = (text: string): ChatMessage[] => [{ role: "user", content: text }];

  beforeEach(() => {
    delete process.env.GROQ_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = original;
  });

  it("answers 'biggest source' from the footprint context", () => {
    const summary = summarise([entry("flight_domestic", 800), entry("meal_veg", 1)]);
    const reply = deterministicChatReply(ask("what's my biggest source?"), summary);
    expect(summary.topCategory).toBe("transport");
    expect(reply.toLowerCase()).toContain("travel");
  });

  it("answers a reduction question with concrete actions", () => {
    const summary = summarise([entry("electricity", 30)]);
    const reply = deterministicChatReply(ask("how do I reduce it?"), summary);
    expect(reply).toMatch(/AC|LED|solar|metro|plant|compost|•/i);
  });

  it("prompts the user to log data when there is none", () => {
    const reply = deterministicChatReply(ask("how am I doing?"), summarise([]));
    expect(reply).toMatch(/log/i);
  });

  it("chatReply falls back to the rules engine without an API key", async () => {
    const summary = summarise([entry("electricity", 10)]);
    const res = await chatReply(ask("what's my total today?"), summary);
    expect(res.generatedBy).toBe("rules");
    expect(res.reply.length).toBeGreaterThan(0);
  });
});
