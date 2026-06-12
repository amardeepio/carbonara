import { describe, expect, it } from "vitest";
import {
  chatRequestSchema,
  logEntrySchema,
  onboardingProfileSchema,
  profileUpdateSchema,
} from "@/lib/types";

describe("logEntrySchema", () => {
  it("accepts a valid activity payload", () => {
    expect(logEntrySchema.safeParse({ type: "electricity", quantity: 5 }).success).toBe(true);
  });

  it.each([
    ["missing type", { quantity: 5 }],
    ["empty type", { type: "", quantity: 5 }],
    ["zero quantity", { type: "electricity", quantity: 0 }],
    ["negative quantity", { type: "electricity", quantity: -1 }],
    ["non-finite quantity", { type: "electricity", quantity: Infinity }],
    ["non-numeric quantity", { type: "electricity", quantity: "5" }],
  ])("rejects %s", (_name, payload) => {
    expect(logEntrySchema.safeParse(payload).success).toBe(false);
  });

  it.each([
    ["valid date", { type: "electricity", quantity: 5, date: "2026-06-09" }],
    ["without date", { type: "electricity", quantity: 5 }],
  ])("accepts %s", (_name, payload) => {
    expect(logEntrySchema.safeParse(payload).success).toBe(true);
  });

  it.each([
    ["wrong format", { type: "electricity", quantity: 5, date: "09-06-2026" }],
    ["not a date", { type: "electricity", quantity: 5, date: "not-a-date" }],
    ["empty date string", { type: "electricity", quantity: 5, date: "" }],
  ])("rejects bad date: %s", (_name, payload) => {
    expect(logEntrySchema.safeParse(payload).success).toBe(false);
  });
});

describe("onboardingProfileSchema", () => {
  it("accepts a complete profile and an empty one", () => {
    expect(
      onboardingProfileSchema.safeParse({ name: "Asha", commute: "metro", diet: "veg" }).success,
    ).toBe(true);
    expect(onboardingProfileSchema.safeParse({}).success).toBe(true);
  });

  it("rejects unknown enum values and over-long names", () => {
    expect(onboardingProfileSchema.safeParse({ commute: "rocket" }).success).toBe(false);
    expect(onboardingProfileSchema.safeParse({ diet: "carnivore" }).success).toBe(false);
    expect(onboardingProfileSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
  });

  it("accepts a known Indian state and rejects unknown ones", () => {
    expect(onboardingProfileSchema.safeParse({ state: "Tamil Nadu" }).success).toBe(true);
    expect(onboardingProfileSchema.safeParse({ state: "Gotham" }).success).toBe(false);
  });
});

describe("profileUpdateSchema", () => {
  it("accepts a rename and null to clear a preference", () => {
    expect(profileUpdateSchema.safeParse({ name: "Amar" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ commute: null, diet: "veg" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ state: null }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ state: "Delhi" }).success).toBe(true);
  });

  it("rejects an empty name and unknown enum values", () => {
    expect(profileUpdateSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ commute: "rocket" }).success).toBe(false);
  });
});

describe("chatRequestSchema", () => {
  const turn = (role: "user" | "assistant", content = "hello") => ({ role, content });

  it("accepts a bounded conversation", () => {
    const parsed = chatRequestSchema.safeParse({
      messages: [turn("user"), turn("assistant"), turn("user", "what's my footprint?")],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty conversation", () => {
    expect(chatRequestSchema.safeParse({ messages: [] }).success).toBe(false);
  });

  it("rejects conversations beyond 20 turns (prompt-size bound)", () => {
    const messages = Array.from({ length: 21 }, () => turn("user"));
    expect(chatRequestSchema.safeParse({ messages }).success).toBe(false);
  });

  it("rejects unknown roles and over-long messages", () => {
    expect(
      chatRequestSchema.safeParse({ messages: [{ role: "system", content: "x" }] }).success,
    ).toBe(false);
    expect(
      chatRequestSchema.safeParse({ messages: [turn("user", "x".repeat(2001))] }).success,
    ).toBe(false);
  });
});
