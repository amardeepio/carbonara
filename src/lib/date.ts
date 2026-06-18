/**
 * Shared date helpers. `LogEntry.date` is a `YYYY-MM-DD` calendar day; this
 * module is the single source of truth for "what is today" so the convention
 * (and any future timezone handling) lives in one place instead of being
 * re-derived as `new Date().toISOString().slice(0, 10)` across the codebase.
 */

/**
 * Today as a `YYYY-MM-DD` string (UTC calendar day).
 *
 * Used as the default day for new entries and for "is this today?" display
 * checks. Callers that need the user's exact local day (e.g. the footprint
 * route) pass their own date explicitly; this is the safe server/client default.
 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** English month names, indexed 0–11 (e.g. for calendar headers). */
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
