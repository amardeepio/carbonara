import { beforeAll, describe, expect, it } from "vitest";
import { getRoutineStore } from "@/lib/routines";
import { routineLogSchema, routineSchema, type Routine } from "@/lib/types";

function draft(
  userId: string,
  name: string,
  createdAt = "2026-06-09T08:00:00.000Z",
): Omit<Routine, "id"> {
  return {
    userId,
    name,
    items: [
      { type: "metro", quantity: 12 },
      { type: "meal_veg", quantity: 2 },
    ],
    createdAt,
  };
}

describe("routine store (in-memory fallback, no MONGODB_URI)", () => {
  beforeAll(() => {
    delete process.env.MONGODB_URI;
  });

  it("creates routines with unique ids", async () => {
    const store = await getRoutineStore();
    const a = await store.add(draft("u1", "Workday"));
    const b = await store.add(draft("u1", "Weekend"));
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it("lists only the owner's routines, oldest first", async () => {
    const store = await getRoutineStore();
    await store.add(draft("owner-a", "First", "2026-06-01T08:00:00.000Z"));
    await store.add(draft("owner-b", "Other user"));
    await store.add(draft("owner-a", "Second", "2026-06-02T08:00:00.000Z"));

    const listed = await store.list("owner-a");
    expect(listed.map((r) => r.name)).toEqual(["First", "Second"]);
    expect(listed.every((r) => r.userId === "owner-a")).toBe(true);
  });

  it("fetches a routine only for its owner", async () => {
    const store = await getRoutineStore();
    const created = await store.add(draft("owner-c", "Mine"));
    expect(await store.get(created.id, "owner-c")).toMatchObject({ name: "Mine" });
    expect(await store.get(created.id, "intruder")).toBeNull();
  });

  it("removes a routine only for its owner", async () => {
    const store = await getRoutineStore();
    const created = await store.add(draft("owner-d", "Disposable"));
    expect(await store.remove(created.id, "intruder")).toBe(false);
    expect(await store.remove(created.id, "owner-d")).toBe(true);
    expect(await store.remove(created.id, "owner-d")).toBe(false);
  });
});

describe("routineSchema", () => {
  it("accepts a named bundle of activities", () => {
    const parsed = routineSchema.safeParse({
      name: "Usual day",
      items: [{ type: "metro", quantity: 10 }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty names, empty bundles and bad quantities", () => {
    expect(
      routineSchema.safeParse({ name: " ", items: [{ type: "metro", quantity: 1 }] }).success,
    ).toBe(false);
    expect(routineSchema.safeParse({ name: "Day", items: [] }).success).toBe(false);
    expect(
      routineSchema.safeParse({ name: "Day", items: [{ type: "metro", quantity: -2 }] }).success,
    ).toBe(false);
  });

  it("caps a routine at 12 items", () => {
    const items = Array.from({ length: 13 }, () => ({ type: "metro", quantity: 1 }));
    expect(routineSchema.safeParse({ name: "Too big", items }).success).toBe(false);
  });
});

describe("routineLogSchema", () => {
  it("accepts an empty body and a valid date", () => {
    expect(routineLogSchema.safeParse({}).success).toBe(true);
    expect(routineLogSchema.safeParse({ date: "2026-06-09" }).success).toBe(true);
  });

  it("rejects malformed dates", () => {
    expect(routineLogSchema.safeParse({ date: "9 June" }).success).toBe(false);
  });
});
