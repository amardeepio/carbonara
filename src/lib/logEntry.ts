import { todayISO } from "./date";
import { addDays, calculate, getFactor } from "./emissions";
import { gridIntensity } from "./grid";
import { priceLive } from "./liveFactors";
import { getStore } from "./store";
import type { LogEntry, User } from "./types";

/**
 * Shared entry-creation pipeline: date-window validation, live pricing with
 * built-in fallback, grid-aware calculation, persistence. Used by both
 * `POST /api/log` (single entry) and routine logging (bulk).
 */

export type CreateEntryResult =
  | { ok: true; entry: LogEntry }
  | { ok: false; error: string; status: number };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function serverToday(): string {
  return todayISO();
}

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  return !Number.isNaN(d.getTime());
}

/**
 * Validate a log date against the accepted window (no further than tomorrow,
 * no older than 366 days). Returns an error message, or null when valid.
 */
export function validateLogDate(logDate: string, today: string = serverToday()): string | null {
  if (!isValidDate(logDate)) return "Invalid date";
  if (logDate > addDays(today, 1)) return "Date cannot be in the future";
  if (logDate < addDays(today, -366)) return "Date is too far in the past";
  return null;
}

/** Validate, price (live or built-in, grid-aware) and persist one activity. */
export async function createEntry(
  user: User,
  input: { type: string; quantity: number; date?: string },
): Promise<CreateEntryResult> {
  const factor = getFactor(input.type);
  if (!factor) {
    return { ok: false, error: `Unknown activity type: ${input.type}`, status: 400 };
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: "Quantity must be greater than zero", status: 400 };
  }

  const logDate = input.date ?? serverToday();
  const dateError = validateLogDate(logDate);
  if (dateError) {
    return { ok: false, error: dateError, status: 400 };
  }

  // Prefer the live figure (Carbon Interface); fall back to built-in factor.
  const live = await priceLive(factor, input.quantity);
  const kgCo2e = live?.kgCo2e ?? calculate(input.type, input.quantity, gridIntensity(user.state));

  const store = await getStore();
  const entry = await store.add({
    userId: user.id,
    date: logDate,
    type: input.type,
    quantity: input.quantity,
    kgCo2e,
    createdAt: new Date().toISOString(),
    pricedBy: live ? "live" : "builtin",
  });

  return { ok: true, entry };
}
