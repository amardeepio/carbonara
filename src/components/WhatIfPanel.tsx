"use client";

import { useMemo, useState } from "react";
import { rankSwaps, simulateSwap, SWAPS } from "@/lib/whatif";
import type { Factor, LogEntry } from "@/lib/types";

interface Props {
  entries: LogEntry[];
  /** Grid-adjusted factor catalog from /api/activities. */
  factors: Record<string, Factor>;
}

/**
 * What-if simulator: pick a habit swap and see the projected yearly saving,
 * computed from the user's own recent logs when available.
 */
export default function WhatIfPanel({ entries, factors }: Props) {
  const ranked = useMemo(() => rankSwaps(entries, factors), [entries, factors]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (Object.keys(factors).length === 0) return null;

  const activeKey = selectedKey ?? ranked[0]?.swap.key ?? SWAPS[0]?.key ?? null;
  const activeSwap = SWAPS.find((s) => s.key === activeKey) ?? null;
  const projection = activeSwap ? simulateSwap(activeSwap, entries, factors) : null;

  return (
    <section className="card" aria-labelledby="whatif-heading">
      <h2 id="whatif-heading">What if you switched?</h2>
      <p className="muted">
        Try a swap and see what it would save over a year — based on your own logs where possible.
      </p>

      <div className="whatif-quick" role="group" aria-label="Highest-impact swaps for you">
        {ranked.slice(0, 3).map(({ swap }) => (
          <button
            key={swap.key}
            type="button"
            className="whatif-chip"
            aria-pressed={swap.key === activeKey}
            onClick={() => setSelectedKey(swap.key)}
          >
            <span aria-hidden="true">{swap.icon}</span> {swap.label}
          </button>
        ))}
      </div>

      <label htmlFor="whatif-select">Or pick any swap</label>
      <select
        id="whatif-select"
        value={activeKey ?? ""}
        onChange={(e) => setSelectedKey(e.target.value)}
      >
        {SWAPS.map((swap) => (
          <option key={swap.key} value={swap.key}>
            {swap.label}
          </option>
        ))}
      </select>

      <div className="whatif-result" aria-live="polite">
        {activeSwap && projection ? (
          <>
            <p className="metric">
              <span className="value">~{Math.round(projection.savedKgPerYear)}</span>
              <span className="unit">kg CO₂e saved per year</span>
            </p>
            <p className="muted whatif-detail">
              {activeSwap.description} That&apos;s ~{projection.savedKgPerWeek} kg a week on{" "}
              {projection.weeklyQty} {factors[activeSwap.fromType]?.unit ?? "units"}/week —{" "}
              {projection.basis === "history"
                ? "based on your last 4 weeks of logs."
                : "based on typical usage (log this activity for a personal estimate)."}
            </p>
          </>
        ) : (
          <p className="muted">Pick a swap to see its impact.</p>
        )}
      </div>
    </section>
  );
}
