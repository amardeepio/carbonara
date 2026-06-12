import { describe, expect, it } from "vitest";
import { validateLogDate } from "@/lib/logEntry";

describe("validateLogDate", () => {
  const today = "2026-06-09";

  it("accepts today, recent past dates and tomorrow", () => {
    expect(validateLogDate("2026-06-09", today)).toBeNull();
    expect(validateLogDate("2026-06-01", today)).toBeNull();
    expect(validateLogDate("2026-06-10", today)).toBeNull(); // client a day ahead (timezones)
  });

  it("rejects malformed dates", () => {
    expect(validateLogDate("09-06-2026", today)).toBe("Invalid date");
    expect(validateLogDate("not-a-date", today)).toBe("Invalid date");
  });

  it("rejects dates beyond tomorrow", () => {
    expect(validateLogDate("2026-06-11", today)).toBe("Date cannot be in the future");
  });

  it("rejects dates older than 366 days", () => {
    expect(validateLogDate("2025-06-01", today)).toBe("Date is too far in the past");
    expect(validateLogDate("2025-06-09", today)).toBeNull(); // exactly 365 days back
  });
});
