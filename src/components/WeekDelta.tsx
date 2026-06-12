"use client";

import type { WeekDelta as WeekDeltaType } from "@/lib/types";

interface Props {
  delta: WeekDeltaType;
}

export default function WeekDelta({ delta }: Props) {
  if (delta.thisWeek === 0) return null;

  const improved = delta.pct !== null && delta.pct < 0;

  return (
    <div className="week-delta">
      <span className="week-delta-label">This week</span>
      <span className="week-delta-value">{delta.thisWeek} kg</span>
      {delta.pct !== null && (
        <span className={`week-delta-pct ${improved ? "down" : "up"}`}>
          {improved ? "↓" : "↑"} {Math.abs(delta.pct)}% vs last week
        </span>
      )}
      {delta.pct === null && delta.lastWeek > 0 && (
        <span className="week-delta-pct muted">same as last week</span>
      )}
    </div>
  );
}
