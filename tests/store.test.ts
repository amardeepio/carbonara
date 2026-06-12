import { beforeAll, describe, expect, it } from "vitest";
import { getStore, isPersistent } from "@/lib/store";
import type { LogEntry } from "@/lib/types";

function draft(
  userId: string,
  type: string,
  createdAt: string,
  date?: string,
): Omit<LogEntry, "id"> {
  return {
    userId,
    date: date ?? createdAt.slice(0, 10),
    type,
    quantity: 1,
    kgCo2e: 1,
    createdAt,
    pricedBy: "builtin",
  };
}

describe("entry store (in-memory fallback, no MONGODB_URI)", () => {
  beforeAll(() => {
    delete process.env.MONGODB_URI;
  });

  it("reports non-persistent storage without a Mongo URI", () => {
    expect(isPersistent()).toBe(false);
  });

  it("assigns a unique id when adding an entry", async () => {
    const store = await getStore();
    const a = await store.add(draft("u1", "electricity", "2026-06-09T08:00:00.000Z"));
    const b = await store.add(draft("u1", "metro", "2026-06-09T09:00:00.000Z"));
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it("lists a user's entries newest first", async () => {
    const store = await getStore();
    await store.add(draft("u2", "bus", "2026-06-01T08:00:00.000Z"));
    await store.add(draft("u2", "train", "2026-06-10T08:00:00.000Z"));
    const entries = await store.list("u2");
    expect(entries.map((e) => e.type)).toEqual(["train", "bus"]);
  });

  it("isolates entries between users", async () => {
    const store = await getStore();
    const mine = await store.add(draft("owner", "lpg", "2026-06-09T10:00:00.000Z"));

    const others = await store.list("intruder");
    expect(others.some((e) => e.id === mine.id)).toBe(false);

    // Another user cannot delete it…
    expect(await store.remove(mine.id, "intruder")).toBe(false);
    // …but the owner can.
    expect(await store.remove(mine.id, "owner")).toBe(true);
  });

  it("removes an entry by id and reports unknown ids", async () => {
    const store = await getStore();
    const created = await store.add(draft("u3", "lpg", "2026-06-09T10:00:00.000Z"));
    expect(await store.remove(created.id, "u3")).toBe(true);
    expect(await store.remove(created.id, "u3")).toBe(false);
    const remaining = await store.list("u3");
    expect(remaining.some((e) => e.id === created.id)).toBe(false);
  });

  it("normalizes legacy entries without a date field", async () => {
    const store = await getStore();
    // Simulate a legacy entry that was written without a `date` field.
    const created = await store.add({
      userId: "u4",
      type: "metro",
      quantity: 5,
      kgCo2e: 0.07,
      createdAt: "2025-11-23T14:30:00.000Z",
      pricedBy: "builtin",
    } as Omit<LogEntry, "id">);
    const entries = await store.list("u4");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.date).toBe("2025-11-23");
    expect(entries[0]?.id).toBe(created.id);
  });
});
