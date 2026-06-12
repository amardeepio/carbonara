"use client";

import { useMemo } from "react";
import { lastNDays, movingAverage, round } from "@/lib/emissions";
import type { DailyTotal } from "@/lib/types";

interface Props {
  /** Full dailyTotals() output; the chart slices the last 30 days itself. */
  totals: DailyTotal[];
  /** Daily target (kg) drawn as a reference line. */
  target: number;
}

const DAYS = 30;
const W = 600;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };

/**
 * 30-day emissions trend: daily bars + 7-day moving average, hand-rolled SVG
 * (no chart dependency). A visually-hidden table mirrors the data for screen
 * readers; the SVG itself carries a computed summary label.
 */
export default function TrendChart({ totals, target }: Props) {
  const series = useMemo(() => lastNDays(totals, DAYS), [totals]);
  const avg = useMemo(() => movingAverage(series), [series]);

  const hasData = series.some((d) => d.kg > 0);
  if (!hasData) return null;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxKg = Math.max(...series.map((d) => d.kg), target) * 1.1;
  const x = (i: number) => PAD.left + (i / DAYS) * innerW;
  const y = (kg: number) => PAD.top + innerH - (kg / maxKg) * innerH;
  const barW = (innerW / DAYS) * 0.7;

  const latestAvg = avg[avg.length - 1]?.kg ?? 0;
  const firstAvg = avg[Math.max(0, avg.length - 8)]?.kg ?? latestAvg;
  const trendWord = latestAvg < firstAvg ? "trending down" : latestAvg > firstAvg ? "trending up" : "steady";
  const label = `30-day emissions trend: currently averaging ${latestAvg} kg per day, ${trendWord} over the last week. Daily target is ${round(target)} kg.`;

  const avgPath = avg.map((d, i) => `${i === 0 ? "M" : "L"}${x(i) + barW / 2},${y(d.kg)}`).join(" ");

  // Date ticks: first day, middle, today.
  const ticks = [0, Math.floor(DAYS / 2), DAYS - 1];

  return (
    <section className="card full" aria-labelledby="trend-heading">
      <h2 id="trend-heading">
        Last 30 days <span className="muted heading-sub">(7-day average in green)</span>
      </h2>

      <svg
        className="trend-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* target reference line */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(target)}
          y2={y(target)}
          className="trend-target"
        />
        <text x={W - PAD.right} y={y(target) - 4} textAnchor="end" className="trend-target-label">
          target {round(target)} kg
        </text>

        {/* daily bars */}
        {series.map((d, i) => (
          <rect
            key={d.date}
            x={x(i)}
            y={y(d.kg)}
            width={barW}
            height={Math.max(innerH + PAD.top - y(d.kg), 0)}
            className={d.kg > target ? "trend-bar over" : "trend-bar"}
          >
            <title>{`${d.date}: ${d.kg} kg`}</title>
          </rect>
        ))}

        {/* 7-day moving average */}
        <path d={avgPath} className="trend-avg" fill="none" />

        {/* y axis labels */}
        <text x={PAD.left - 6} y={y(0) + 4} textAnchor="end" className="trend-tick">
          0
        </text>
        <text x={PAD.left - 6} y={y(maxKg / 1.1) + 4} textAnchor="end" className="trend-tick">
          {round(maxKg / 1.1)}
        </text>

        {/* x axis date ticks */}
        {ticks.map((i) => (
          <text
            key={i}
            x={x(i) + barW / 2}
            y={H - 6}
            textAnchor="middle"
            className="trend-tick"
          >
            {series[i]?.date.slice(5)}
          </text>
        ))}
      </svg>

      <table className="visually-hidden">
        <caption>Daily emissions for the last 30 days</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">kg CO₂e</th>
            <th scope="col">7-day average</th>
          </tr>
        </thead>
        <tbody>
          {series.map((d, i) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.kg}</td>
              <td>{avg[i]?.kg ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
