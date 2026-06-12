"use client";

import { useCallback, useEffect, useState } from "react";
import type { Badge, Pledge } from "@/lib/challenges";

interface CatalogItem {
  key: string;
  title: string;
  description: string;
  icon: string;
  pledgeable: boolean;
  reason?: string;
}

interface ChallengesData {
  challenges: CatalogItem[];
  pledges: (Pledge & { progress: number })[];
  totalKgAvoided: number;
  badges: Badge[];
  weekStart: string;
}

interface Props {
  /** Bumped by the parent whenever entries change, to re-evaluate pledges. */
  refreshKey: number;
}

const STATUS_LABEL: Record<Pledge["status"], string> = {
  active: "In progress",
  completed: "Completed",
  missed: "Missed",
};

/** Weekly India-relevant challenges: pledge, auto-track from logs, earn badges. */
export default function ChallengesPanel({ refreshKey }: Props) {
  const [data, setData] = useState<ChallengesData | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/challenges");
      if (!res.ok) return;
      setData((await res.json()) as ChallengesData);
    } catch {
      // Non-fatal: the panel simply stays empty.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function pledge(item: CatalogItem) {
    setBusyKey(item.key);
    setStatus(null);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeKey: item.key }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not pledge that challenge.");
      setStatus({ kind: "ok", text: `Pledged "${item.title}" — it's on for this week!` });
      await load();
    } catch (err) {
      setStatus({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not pledge that challenge.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  if (!data) return null;

  const thisWeekPledged = new Set(
    data.pledges.filter((p) => p.weekStart === data.weekStart).map((p) => p.challengeKey),
  );
  const activePledges = data.pledges.filter((p) => p.status === "active");
  const pastPledges = data.pledges.filter((p) => p.status !== "active");
  const earnedBadges = data.badges.filter((b) => b.earned);
  const challengeTitle = (key: string) =>
    data.challenges.find((c) => c.key === key)?.title ?? key;
  const challengeIcon = (key: string) => data.challenges.find((c) => c.key === key)?.icon ?? "🎯";

  return (
    <section className="card" aria-labelledby="challenges-heading">
      <h2 id="challenges-heading">Weekly challenges</h2>
      <p className="muted">
        Pledge a challenge and Carbonara tracks it from what you log this week (honor system —
        it&apos;s based on your own logging).
      </p>

      {data.totalKgAvoided > 0 && (
        <p className="challenges-total">
          🌍 <strong>{data.totalKgAvoided} kg CO₂e avoided</strong> through completed challenges
        </p>
      )}

      {earnedBadges.length > 0 && (
        <ul className="badges" aria-label="Badges earned">
          {earnedBadges.map((b) => (
            <li key={b.key}>
              <span aria-hidden="true">{b.icon}</span> {b.label}
            </li>
          ))}
        </ul>
      )}

      {activePledges.length > 0 && (
        <ul className="pledges" aria-label="Active pledges">
          {activePledges.map((p) => (
            <li key={p.id}>
              <div className="row">
                <span>
                  <span aria-hidden="true">{challengeIcon(p.challengeKey)}</span>{" "}
                  {challengeTitle(p.challengeKey)}
                  <span className="meta"> · week of {p.weekStart}</span>
                </span>
                <span>{Math.round(p.progress * 100)}%</span>
              </div>
              <div
                className="bar"
                role="progressbar"
                aria-valuenow={Math.round(p.progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${challengeTitle(p.challengeKey)} progress`}
              >
                <span style={{ width: `${Math.round(p.progress * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="challenges-subhead">This week&apos;s challenges</h3>
      <ul className="challenge-catalog">
        {data.challenges.map((item) => {
          const pledged = thisWeekPledged.has(item.key);
          return (
            <li key={item.key}>
              <div>
                <strong>
                  <span aria-hidden="true">{item.icon}</span> {item.title}
                </strong>
                <p className="muted challenge-desc">{item.description}</p>
                {!item.pledgeable && item.reason && (
                  <p className="muted challenge-desc">{item.reason}</p>
                )}
              </div>
              <button
                type="button"
                className="secondary"
                disabled={pledged || !item.pledgeable || busyKey !== null}
                onClick={() => pledge(item)}
              >
                {pledged ? "Pledged" : busyKey === item.key ? "Pledging…" : "Pledge"}
              </button>
            </li>
          );
        })}
      </ul>

      {pastPledges.length > 0 && (
        <details className="pledge-history">
          <summary>Past challenges ({pastPledges.length})</summary>
          <ul>
            {pastPledges.map((p) => (
              <li key={p.id}>
                {challengeTitle(p.challengeKey)} · week of {p.weekStart} —{" "}
                <strong>{STATUS_LABEL[p.status]}</strong>
                {p.status === "completed" && p.kgAvoided ? ` (~${p.kgAvoided} kg avoided)` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p
        className={`status ${status?.kind === "error" ? "error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {status?.text ?? ""}
      </p>
    </section>
  );
}
