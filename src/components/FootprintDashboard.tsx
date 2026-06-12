"use client";

import { useMemo } from "react";
import type { Category, Factor, FootprintSummary, LogEntry, Streak, WeekDelta as WeekDeltaType } from "@/lib/types";
import { quickTip } from "@/lib/assistant";
import { equivalents } from "@/lib/equivalents";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "./LocaleProvider";
import StreakBadge from "./StreakBadge";
import WeekDelta from "./WeekDelta";

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  summary: FootprintSummary;
  entries: LogEntry[];
  factors: Record<string, Factor>;
  persistent: boolean;
  onDelete: (id: string) => void;
  streak: Streak;
  delta: WeekDeltaType;
}

const CATEGORY_KEY: Record<Category, MessageKey> = {
  transport: "cat.transport",
  energy: "cat.homeEnergy",
  diet: "cat.diet",
  waste: "cat.waste",
  goods: "cat.goods",
};

function exportCSV(entries: LogEntry[], factors: Record<string, Factor>, summary: FootprintSummary) {
  const header = "date,type,label,quantity,unit,kgCo2e,pricedBy";
  const rows = entries.map((e) => {
    const f = factors[e.type];
    return [e.date, e.type, f?.label ?? e.type, e.quantity, f?.unit ?? "", e.kgCo2e, e.pricedBy].join(",");
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `carbonara-footprint-${summary.totalKg}kg.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Today's footprint, benchmark comparison, category breakdown and entries. */
export default function FootprintDashboard({
  summary,
  entries,
  factors,
  persistent,
  onDelete,
  streak,
  delta,
}: Props) {
  const { t } = useT();
  const target = summary.personalTarget ?? summary.benchmarks.sustainableTarget;
  const targetLabel = summary.personalTarget ? "your target" : "sustainable target";
  const pctOfTarget = Math.min(Math.round((summary.todayKg / target) * 100), 100);
  const overTarget = summary.todayKg > target;

  const tip = useMemo(() => quickTip(entries, summary), [entries, summary]);

  return (
    <>
      <section className="card" aria-labelledby="today-heading">
        <h2 id="today-heading">Today&apos;s footprint</h2>

        <StreakBadge streak={streak} />

        <p className="metric">
          <span className="value">{summary.todayKg}</span>
          <span className="unit">kg CO₂e today</span>
        </p>

        <div
          className={`bar ${overTarget ? "over" : ""}`}
          role="img"
          aria-label={`Today's footprint is ${summary.todayKg} kilograms, which is ${Math.round(summary.todayKg / target * 10) / 10}x ${targetLabel} of ${target} kilograms.`}
        >
          <span style={{ width: `${pctOfTarget}%` }} />
        </div>

        <ul className="benchmarks">
          {summary.personalTarget != null && (
            <li>
              <span>Your target ({Math.round(target * 10) / 10} kg)</span>
              <strong>{summary.personalBaseline != null ? `From ${summary.personalBaseline} kg baseline` : targetLabel}</strong>
            </li>
          )}
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

        <WeekDelta delta={delta} />

        {delta.thisWeek > 0 && (
          <div className="equivalents">
            <h3 className="equivalents-title">This week&apos;s {delta.thisWeek} kg is like…</h3>
            <ul aria-label="What this week's footprint equals">
              {equivalents(delta.thisWeek).map((eq) => (
                <li key={eq.key} title={eq.source}>
                  <span aria-hidden="true">{eq.icon}</span> {eq.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {tip && (
        <section className="card tip-card" aria-labelledby="tip-heading">
          <h2 id="tip-heading">💡 Smart tip</h2>
          <h3>{tip.title}</h3>
          <p>{tip.detail}</p>
          {typeof tip.estimatedSavingKg === "number" && (
            <span className="saving">
              ↓ saves ~{tip.estimatedSavingKg} kg CO₂e
            </span>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="breakdown-heading">
        <h2 id="breakdown-heading">Breakdown by category</h2>
        {summary.breakdown.length === 0 ? (
          <p className="muted">No activities logged yet. Add one to see your breakdown.</p>
        ) : (
          <ul className="breakdown">
            {summary.breakdown.map((b) => (
              <li key={b.category}>
                <div className="row">
                  <span>{t(CATEGORY_KEY[b.category]) ?? b.category}</span>
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
          <span className="muted heading-sub">
            ({summary.entryCount} total · {persistent ? "saved to MongoDB" : "in-memory session"})
          </span>
        </h2>
        {entries.length === 0 ? (
          <p className="muted">Nothing logged yet.</p>
        ) : (
          <>
            <ul className="entries">
              {entries.map((entry) => {
                const factor = factors[entry.type];
                return (
                  <li key={entry.id}>
                    <div>
                      <strong>{factor?.label ?? entry.type}</strong>{" "}
                      <span className="meta">
                        {entry.date !== todayLocal() && <>{entry.date} · </>}
                        {entry.quantity} {factor?.unit ?? ""} · {entry.kgCo2e} kg CO₂e
                      </span>
                      {entry.pricedBy === "live" && <span className="tag"> Live</span>}
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
            <button
              type="button"
              className="secondary export-btn"
              onClick={() => exportCSV(entries, factors, summary)}
            >
              Download CSV
            </button>
          </>
        )}
      </section>
    </>
  );
}
