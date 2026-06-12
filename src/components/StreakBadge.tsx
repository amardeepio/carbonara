"use client";

import type { Streak } from "@/lib/types";

interface Props {
  streak: Streak;
}

export default function StreakBadge({ streak }: Props) {
  if (streak.current === 0 && streak.best === 0) return null;

  return (
    <div className="streak-badge" aria-label={`${streak.current} day logging streak, best ${streak.best}`}>
      <span className="streak-fire" aria-hidden="true">🔥</span>
      <span className="streak-num">{streak.current}</span>
      <span className="streak-label">day streak</span>
      {streak.best > streak.current && (
        <span className="streak-best">best {streak.best}</span>
      )}
    </div>
  );
}
