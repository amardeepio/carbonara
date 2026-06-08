"use client";

import type { Factor, FootprintSummary, LogEntry } from "@/lib/types";

interface Props {
  summary: FootprintSummary;
  entries: LogEntry[];
  factors: Record<string, Factor>;
  persistent: boolean;
  onDelete: (id: string) => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  transport: "Travel",
  energy: "Home energy",
  diet: "Food",
  waste: "Waste",
  goods: "Shopping",
};

/** Today's footprint, benchmark comparison, category breakdown and entries. */
export default function FootprintDashboard({
  summary,
  entries,
  factors,
  persistent,
  onDelete,
}: Props) {
  const pctOfTarget = Math.min(Math.round(summary.targetRatio * 100), 100);
  const overTarget = summary.targetRatio > 1;

  return (
    <>
      <section className="card" aria-labelledby="today-heading">
        <h2 id="today-heading">Today&apos;s footprint</h2>
        <p className="metric">
          <span className="value">{summary.todayKg}</span>
          <span className="unit">kg CO₂e today</span>
        </p>

        <div
          className={`bar ${overTarget ? "over" : ""}`}
          role="img"
          aria-label={`Today's footprint is ${summary.todayKg} kilograms, which is ${summary.targetRatio} times the sustainable daily target of ${summary.benchmarks.sustainableTarget} kilograms.`}
        >
          <span style={{ width: `${pctOfTarget}%` }} />
        </div>

        <ul className="benchmarks">
          <li>
            <span>Sustainable target (1.5 °C)</span>
            <strong>{summary.benchmarks.sustainableTarget} kg/day</strong>
          </li>
          <li>
            <span>India average</span>
            <strong>{summary.benchmarks.indiaPerCapita} kg/day</strong>
          </li>
          <li>
            <span>Global average</span>
            <strong>{summary.benchmarks.globalAverage} kg/day</strong>
          </li>
        </ul>
      </section>

      <section className="card" aria-labelledby="breakdown-heading">
        <h2 id="breakdown-heading">Breakdown by category</h2>
        {summary.breakdown.length === 0 ? (
          <p className="muted">No activities logged yet. Add one to see your breakdown.</p>
        ) : (
          <ul className="breakdown">
            {summary.breakdown.map((b) => (
              <li key={b.category}>
                <div className="row">
                  <span>{CATEGORY_LABEL[b.category] ?? b.category}</span>
                  <span>
                    {b.kg} kg · {b.pct}%
                  </span>
                </div>
                <div className="bar" role="presentation">
                  <span style={{ width: `${b.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card full" aria-labelledby="entries-heading">
        <h2 id="entries-heading">
          Logged activities{" "}
          <span className="muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
            ({summary.entryCount} total · {persistent ? "saved to MongoDB" : "in-memory session"})
          </span>
        </h2>
        {entries.length === 0 ? (
          <p className="muted">Nothing logged yet.</p>
        ) : (
          <ul className="entries">
            {entries.map((entry) => {
              const factor = factors[entry.type];
              return (
                <li key={entry.id}>
                  <div>
                    <strong>{factor?.label ?? entry.type}</strong>{" "}
                    <span className="meta">
                      {entry.quantity} {factor?.unit ?? ""} · {entry.kgCo2e} kg CO₂e
                    </span>
                    {entry.pricedBy === "climatiq" && <span className="tag"> Climatiq</span>}
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => onDelete(entry.id)}
                    aria-label={`Delete ${factor?.label ?? entry.type} entry of ${entry.kgCo2e} kg`}
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
