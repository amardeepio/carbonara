"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ActivityForm from "@/components/ActivityForm";
import FootprintDashboard from "@/components/FootprintDashboard";
import InsightsPanel from "@/components/InsightsPanel";
import type { Factor, FootprintSummary, LogEntry } from "@/lib/types";

interface FootprintResponse {
  entries: LogEntry[];
  summary: FootprintSummary;
  persistent: boolean;
}

export default function HomePage() {
  const [activities, setActivities] = useState<Factor[]>([]);
  const [data, setData] = useState<FootprintResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const factors = useMemo(
    () => Object.fromEntries(activities.map((a) => [a.key, a])),
    [activities],
  );

  const loadFootprint = useCallback(async () => {
    try {
      const res = await fetch("/api/footprint");
      if (!res.ok) throw new Error("Failed to load footprint.");
      setData((await res.json()) as FootprintResponse);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load data.");
    }
  }, []);

  useEffect(() => {
    fetch("/api/activities")
      .then((r) => r.json())
      .then((d) => setActivities(d.activities as Factor[]))
      .catch(() => setLoadError("Failed to load activities."));
    loadFootprint();
  }, [loadFootprint]);

  const handleDelete = useCallback(
    async (id: string) => {
      await fetch(`/api/log/${id}`, { method: "DELETE" });
      await loadFootprint();
    },
    [loadFootprint],
  );

  return (
    <div className="page">
      <header className="masthead">
        <h1>
          Carbonara <span className="flag" aria-hidden="true">🌱🇮🇳</span>
        </h1>
        <p>
          Track your daily carbon footprint with India-specific data, then get a
          smart, personalized plan to reduce it — one simple action at a time.
        </p>
      </header>

      <main id="main">
        {loadError && (
          <p className="status error" role="alert">
            {loadError}
          </p>
        )}

        <div className="grid">
          <ActivityForm activities={activities} onLogged={loadFootprint} />

          {data ? (
            <FootprintDashboard
              summary={data.summary}
              entries={data.entries}
              factors={factors}
              persistent={data.persistent}
              onDelete={handleDelete}
            />
          ) : (
            <section className="card" aria-busy="true">
              <h2>Today&apos;s footprint</h2>
              <p className="muted">Loading…</p>
            </section>
          )}

          <InsightsPanel />
        </div>

        <p className="footer-note">
          Emission factors are awareness-grade approximations sourced from the CEA
          CO₂ Baseline Database, the India GHG Program, and Our World in Data.
          Live factors via Climatiq when configured. Built for Challenge 3 — Carbon
          Footprint Awareness Platform.
        </p>
      </main>
    </div>
  );
}
