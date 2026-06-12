import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth";

describe("session tokens", () => {
  it("round-trips a valid token", () => {
    const token = createSessionToken({ uid: "user-1", provider: "guest" });
    const payload = verifySessionToken(token);
    expect(payload?.uid).toBe("user-1");
    expect(payload?.provider).toBe("guest");
  });

  it("rejects a tampered payload", () => {
    const token = createSessionToken({ uid: "user-1", provider: "guest" });
    const [body, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ uid: "someone-else", provider: "guest", exp: 9999999999 }),
    ).toString("base64url");
    expect(verifySessionToken(`${forged}.${signature}`)).toBeNull();
    expect(body).toBeTruthy(); // sanity: token had the expected shape
  });

  it("rejects a tampered signature", () => {
    const token = createSessionToken({ uid: "user-1", provider: "guest" });
    const flipped = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifySessionToken(flipped)).toBeNull();
  });

  it("rejects an expired token", () => {
    const issuedAt = Date.now() - 10_000;
    const token = createSessionToken({ uid: "user-1", provider: "guest" }, 5, issuedAt);
    expect(verifySessionToken(token, issuedAt + 4_000)).not.toBeNull();
    expect(verifySessionToken(token, issuedAt + 6_000)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("not-a-token")).toBeNull();
    expect(verifySessionToken("a.b.c")).toBeNull();
    expect(verifySessionToken("only-one-part.")).toBeNull();
  });
});
