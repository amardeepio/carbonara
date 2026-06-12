import { summarise } from "./emissions";
import { getLiveBenchmarks } from "./owid";
import { getStore, isPersistent } from "./store";
import type { FootprintSummary, LogEntry } from "./types";

/**
 * Load one user's entries and build a footprint summary using live OWID
 * benchmarks. Shared by the footprint, insights and chat routes so they stay
 * consistent.
 *
 * @param today Optional YYYY-MM-DD string to use as "today" for the todayKg
 *              calculation. Defaults to the server's local date.
 */
export async function loadSummary(
  userId: string,
  today?: string,
): Promise<{
  entries: LogEntry[];
  summary: FootprintSummary;
  persistent: boolean;
}> {
  const store = await getStore();
  const [entries, benchmarks] = await Promise.all([store.list(userId), getLiveBenchmarks()]);
  return {
    entries,
    summary: summarise(entries, today, benchmarks),
    persistent: isPersistent(),
  };
}
