import { beforeAll, describe, expect, it } from "vitest";
import { getUserStore, toSafeUser } from "@/lib/users";
import type { User } from "@/lib/types";

describe("user store (in-memory fallback, no MONGODB_URI)", () => {
  beforeAll(() => {
    delete process.env.MONGODB_URI;
  });

  it("creates and retrieves a guest user", async () => {
    const users = await getUserStore();
    const created = await users.create({
      provider: "guest",
      name: "Asha",
      commute: "metro",
      createdAt: new Date().toISOString(),
    });
    expect(created.id).toBeTruthy();

    const fetched = await users.get(created.id);
    expect(fetched?.name).toBe("Asha");
    expect(fetched?.commute).toBe("metro");
    expect(await users.get("missing")).toBeNull();
  });

  it("finds a returning Google user by sub", async () => {
    const users = await getUserStore();
    const created = await users.create({
      provider: "google",
      googleSub: "google-sub-123",
      name: "Ravi",
      email: "ravi@example.com",
      createdAt: new Date().toISOString(),
    });
    const found = await users.findByGoogleSub("google-sub-123");
    expect(found?.id).toBe(created.id);
    expect(await users.findByGoogleSub("unknown-sub")).toBeNull();
  });

  it("updates profile fields without touching others", async () => {
    const users = await getUserStore();
    const created = await users.create({
      provider: "guest",
      name: "Guest",
      createdAt: new Date().toISOString(),
    });
    const updated = await users.update(created.id, { name: "Meera", diet: "veg" });
    expect(updated?.name).toBe("Meera");
    expect(updated?.diet).toBe("veg");
    expect(updated?.provider).toBe("guest");
    expect(await users.update("missing", { name: "x" })).toBeNull();
  });

  it("clears a field when patched with an explicit undefined", async () => {
    const users = await getUserStore();
    const created = await users.create({
      provider: "guest",
      name: "Guest",
      commute: "car",
      diet: "mixed",
      createdAt: new Date().toISOString(),
    });
    const updated = await users.update(created.id, { commute: undefined });
    expect(updated?.commute).toBeUndefined();
    expect(updated?.diet).toBe("mixed"); // untouched fields stay
  });

  it("strips provider internals from the client-safe shape", () => {
    const user: User = {
      id: "u1",
      provider: "google",
      googleSub: "secret-sub",
      name: "Ravi",
      createdAt: new Date().toISOString(),
    };
    const safe = toSafeUser(user);
    expect(safe).not.toHaveProperty("googleSub");
    expect(safe.name).toBe("Ravi");
  });
});
