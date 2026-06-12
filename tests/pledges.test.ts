import { beforeAll, describe, expect, it } from "vitest";
import type { Pledge } from "@/lib/challenges";
import { getPledgeStore } from "@/lib/pledges";

function draft(userId: string, challengeKey: string, weekStart = "2026-06-01"): Omit<Pledge, "id"> {
  return {
    userId,
    challengeKey,
    weekStart,
    status: "active",
    createdAt: "2026-06-01T08:00:00.000Z",
  };
}

describe("pledge store (in-memory fallback, no MONGODB_URI)", () => {
  beforeAll(() => {
    delete process.env.MONGODB_URI;
  });

  it("creates pledges with unique ids", async () => {
    const store = await getPledgeStore();
    const a = await store.add(draft("u1", "metro_monday"));
    const b = await store.add(draft("u1", "meatless_week"));
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it("lists only the owner's pledges, newest week first", async () => {
    const store = await getPledgeStore();
    await store.add(draft("owner-a", "metro_monday", "2026-05-25"));
    await store.add(draft("owner-b", "metro_monday", "2026-06-01"));
    await store.add(draft("owner-a", "ev_week", "2026-06-01"));

    const listed = await store.list("owner-a");
    expect(listed.map((p) => p.weekStart)).toEqual(["2026-06-01", "2026-05-25"]);
    expect(listed.every((p) => p.userId === "owner-a")).toBe(true);
  });

  it("updates status only for the owner", async () => {
    const store = await getPledgeStore();
    const created = await store.add(draft("owner-c", "metro_monday"));

    expect(await store.update(created.id, "intruder", { status: "completed" })).toBeNull();

    const updated = await store.update(created.id, "owner-c", {
      status: "completed",
      kgAvoided: 1.5,
    });
    expect(updated?.status).toBe("completed");
    expect(updated?.kgAvoided).toBe(1.5);
  });
});
