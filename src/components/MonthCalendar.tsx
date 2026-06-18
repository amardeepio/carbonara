"use client";

import { useMemo, useState } from "react";
import { dailyTotals } from "@/lib/emissions";
import { MONTH_NAMES, todayISO } from "@/lib/date";
import type { Factor, LogEntry } from "@/lib/types";

interface Props {
  entries: LogEntry[];
  target: number;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  onDelete: (id: string) => void;
  factors: Record<string, Factor>;
  onLogForDay: (date: string) => void;
  personalTarget?: number | null;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function mondayOffset(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

function fmtDay(date: string): string {
  const d = new Date(date + "T00:00:00");
  const day = d.getUTCDate();
  const month = MONTH_NAMES[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const now = new Date();
  if (year === now.getFullYear()) return `${day} ${month}`;
  return `${day} ${month} ${year}`;
}

function dayClass(kg: number | undefined, target: number): string {
  if (kg === undefined) return "";
  if (kg <= target) return "day-good";
  if (kg <= target * 1.5) return "day-warn";
  return "day-over";
}

function dayLabel(date: string, kg: number | undefined, target: number): string {
  const base = fmtDay(date);
  if (kg === undefined) return `${base}, no data`;
  const status = kg <= target ? "under target" : kg <= target * 1.5 ? "near target" : "over target";
  return `${base}, ${kg} kg CO₂e, ${status}`;
}

export default function MonthCalendar({
  entries,
  target,
  selectedDate,
  onSelectDate,
  onDelete,
  factors,
  onLogForDay,
  personalTarget,
}: Props) {
  const tgt = personalTarget ?? target;
  const today = todayISO();
  const [todayY, todayM] = today.split("-") as [string, string, string];

  const [viewYear, setViewYear] = useState(Number(todayY));
  const [viewMonth, setViewMonth] = useState(Number(todayM) - 1);

  const dayMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dailyTotals(entries)) {
      m.set(d.date, d.kg);
    }
    return m;
  }, [entries]);

  const canNext =
    viewYear < Number(todayY) || (viewYear === Number(todayY) && viewMonth < Number(todayM) - 1);

  const days = daysInMonth(viewYear, viewMonth);
  const offset = mondayOffset(viewYear, viewMonth);
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push(`${viewYear}-${mm}-${dd}`);
  }

  const selectedEntries = useMemo(() => {
    if (!selectedDate) return [];
    return entries.filter((e) => e.date === selectedDate);
  }, [entries, selectedDate]);

  const selectedDayKg = selectedDate ? dayMap.get(selectedDate) : undefined;

  return (
    <section className="card full calendar" aria-labelledby="cal-heading">
      <h2 id="cal-heading">Your month</h2>

      <div className="cal-nav">
        <button
          type="button"
          className="secondary cal-nav-btn"
          aria-label="Previous month"
          onClick={() => {
            if (viewMonth === 0) {
              setViewYear(viewYear - 1);
              setViewMonth(11);
            } else {
              setViewMonth(viewMonth - 1);
            }
          }}
        >
          ◀
        </button>
        <span className="cal-month-label">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          className="secondary cal-nav-btn"
          aria-label="Next month"
          disabled={!canNext}
          onClick={() => {
            if (viewMonth === 11) {
              setViewYear(viewYear + 1);
              setViewMonth(0);
            } else {
              setViewMonth(viewMonth + 1);
            }
          }}
        >
          ▶
        </button>
      </div>

      <div className="cal-grid" role="grid" aria-label="Calendar">
        {DAY_NAMES.map((d) => (
          <div key={d} className="cal-header" role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (date === null) {
            return <div key={`empty-${i}`} className="cal-day-empty" />;
          }
          const kg = dayMap.get(date);
          const future = date > today;
          const isSelected = date === selectedDate;
          return (
            <button
              key={date}
              type="button"
              className={`cal-day ${dayClass(kg, tgt)}`}
              disabled={future}
              aria-pressed={isSelected}
              aria-label={dayLabel(date, kg, tgt)}
              onClick={() => onSelectDate(isSelected ? null : date)}
            >
              <span className="cal-day-num">{new Date(date + "T00:00:00").getUTCDate()}</span>
              {kg !== undefined && <span className="cal-day-kg">{kg}</span>}
            </button>
          );
        })}
      </div>

      <div className="cal-legend" aria-hidden="true">
        <span className="cal-legend-dot day-good" />
        <span>under {tgt} kg</span>
        <span className="cal-legend-dot day-warn" />
        <span>up to {Math.round(tgt * 1.5)} kg</span>
        <span className="cal-legend-dot day-over" />
        <span>over {Math.round(tgt * 1.5)} kg</span>
      </div>

      {selectedDate && (
        <div className="day-panel">
          <div className="day-panel-head">
            <h3>{fmtDay(selectedDate)}</h3>
            <span className="day-panel-total">
              {selectedDayKg !== undefined ? `${selectedDayKg} kg CO₂e` : "No entries"}
            </span>
          </div>

          {selectedEntries.length === 0 ? (
            <p className="muted">Nothing logged for this day yet.</p>
          ) : (
            <ul className="entries">
              {selectedEntries.map((entry) => {
                const factor = factors[entry.type];
                return (
                  <li key={entry.id}>
                    <div>
                      <strong>{factor?.label ?? entry.type}</strong>{" "}
                      <span className="meta">
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
          )}

          <button
            type="button"
            className="primary cal-log-btn"
            onClick={() => onLogForDay(selectedDate)}
          >
            Add activity for this day
          </button>
        </div>
      )}
    </section>
  );
}
