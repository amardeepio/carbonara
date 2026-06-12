"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ActivityForm from "@/components/ActivityForm";
import ChallengesPanel from "@/components/ChallengesPanel";
import Chatbot from "@/components/Chatbot";
import FootprintDashboard from "@/components/FootprintDashboard";
import InsightsPanel from "@/components/InsightsPanel";
import { LocaleToggle, useT } from "@/components/LocaleProvider";
import MonthCalendar from "@/components/MonthCalendar";
import Onboarding from "@/components/Onboarding";
import RoutinesCard from "@/components/RoutinesCard";
import TrendChart from "@/components/TrendChart";
import WhatIfPanel from "@/components/WhatIfPanel";
import {
  computeStreak,
  dailyTotals,
  estimatePersonalBaseline,
  personalDailyTarget,
  weekDelta,
} from "@/lib/emissions";
import type {
  Factor,
  FootprintSummary,
  LogEntry,
  SafeUser,
} from "@/lib/types";

interface FootprintResponse {
  entries: LogEntry[];
  summary: FootprintSummary;
  persistent: boolean;
}

type AuthState =
  | { status: "loading"; googleEnabled: boolean }
  | { status: "anon"; googleEnabled: boolean }
  | { status: "authed"; googleEnabled: boolean; user: SafeUser };

/** localStorage flag: this browser finished onboarding once already. */
const ONBOARDED_KEY = "carbonara_onboarded";

export default function HomePage() {
  const { t } = useT();
  const [auth, setAuth] = useState<AuthState>({ status: "loading", googleEnabled: false });
  const [returningUser, setReturningUser] = useState(false);
  const [activities, setActivities] = useState<Factor[]>([]);
  const [data, setData] = useState<FootprintResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [logDate, setLogDate] = useState<string | null>(null);

  const factors = useMemo(
    () => Object.fromEntries(activities.map((a) => [a.key, a])),
    [activities],
  );

  // Resolve the session once on mount.
  useEffect(() => {
    setReturningUser(localStorage.getItem(ONBOARDED_KEY) === "1");
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        // Any signed-in visit marks this browser as onboarded, so a later
        // sign-out goes straight to the "welcome back" sign-in step.
        if (d.user) {
          localStorage.setItem(ONBOARDED_KEY, "1");
          setReturningUser(true);
        }
        setAuth(
          d.user
            ? { status: "authed", user: d.user as SafeUser, googleEnabled: Boolean(d.googleEnabled) }
            : { status: "anon", googleEnabled: Boolean(d.googleEnabled) },
        );
      })
      .catch(() => setAuth({ status: "anon", googleEnabled: false }));
  }, []);

  const [entriesVersion, setEntriesVersion] = useState(0);

  const loadFootprint = useCallback(async () => {
    try {
      const res = await fetch("/api/footprint");
      if (!res.ok) throw new Error("Failed to load footprint.");
      setData((await res.json()) as FootprintResponse);
      setEntriesVersion((v) => v + 1);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load data.");
    }
  }, []);

  // Load dashboard data once signed in.
  useEffect(() => {
    if (auth.status !== "authed") return;
    fetch("/api/activities")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setActivities(d.activities as Factor[]))
      .catch(() => setLoadError("Failed to load activities."));
    loadFootprint();
  }, [auth.status, loadFootprint]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/log/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
      } catch {
        setLoadError("Could not delete that entry. Please try again.");
        return;
      }
      setLoadError(null);
      await loadFootprint();
    },
    [loadFootprint],
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setData(null);
      setLoadError(null);
      setAuth((a) => ({ status: "anon", googleEnabled: a.googleEnabled }));
    }
  }, []);

  const onLogForDay = useCallback((date: string) => {
    setLogDate(date);
    setSelectedDate(date);
    document.getElementById("log-heading")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const onClearLogDate = useCallback(() => {
    setLogDate(null);
  }, []);

  const totals = useMemo(() => (data ? dailyTotals(data.entries) : []), [data]);
  const streak = useMemo(() => computeStreak(totals), [totals]);
  const delta = useMemo(() => weekDelta(totals), [totals]);
  const personalBaseline = useMemo(() => {
    if (auth.status !== "authed") return null;
    return estimatePersonalBaseline(auth.user.commute, auth.user.diet);
  }, [auth]);
  const personalTarget = useMemo(() => personalDailyTarget(personalBaseline), [personalBaseline]);

  const enrichedSummary = useMemo(() => {
    if (!data) return null;
    return {
      ...data.summary,
      personalBaseline,
      personalTarget,
    };
  }, [data, personalBaseline, personalTarget]);

  if (auth.status === "loading") {
    return (
      <main className="onboarding" aria-busy="true">
        <p className="onb-mark" aria-hidden="true">🌱</p>
        <p className="muted">Loading Carbonara…</p>
      </main>
    );
  }

  if (auth.status === "anon") {
    return (
      <Onboarding
        googleEnabled={auth.googleEnabled}
        returning={returningUser}
        onComplete={(user) => {
          localStorage.setItem(ONBOARDED_KEY, "1");
          setReturningUser(true);
          setAuth((a) => ({ status: "authed", user, googleEnabled: a.googleEnabled }));
        }}
      />
    );
  }

  const { user } = auth;
  const firstName = user.name.split(/\s+/)[0] ?? user.name;

  return (
    <div className="shell">
      <header className="appbar">
        <div className="appbar-inner">
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">🌱</span>
            <span className="brand-name">Carbonara</span>
          </Link>
          <div className="appbar-user">
            <LocaleToggle />
            <Link
              className="user-chip"
              href="/profile"
              title={user.email ?? user.name}
              aria-label={t("app.openProfile", { name: firstName })}
            >
              <span className="avatar avatar-letter" aria-hidden="true">
                {firstName.charAt(0).toUpperCase() || "G"}
              </span>
              <span className="user-name">{firstName}</span>
              {user.provider === "guest" && <span className="tag">{t("app.guest")}</span>}
            </Link>
            <button type="button" className="secondary signout-btn" onClick={signOut}>
              {t("app.signOut")}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="page">
        <section className="hero">
          <h1>
            {user.name !== "Guest" ? t("hero.greeting", { name: firstName }) : ""}
            {t("hero.title")}
          </h1>
          <p>{t("hero.lede")}</p>
          <ul className="stack-badges" aria-label="Built with">
            <li>Next.js</li>
            <li>India emission factors</li>
            <li>Groq AI</li>
            <li>Live OWID benchmarks</li>
          </ul>
        </section>

        {loadError && (
          <p className="status error" role="alert">
            {loadError}
          </p>
        )}

        <div className="grid">
          <ActivityForm
            activities={activities}
            onLogged={loadFootprint}
            logDate={logDate}
            onClearLogDate={onClearLogDate}
          />

          <RoutinesCard activities={activities} logDate={logDate} onLogged={loadFootprint} />

          {enrichedSummary ? (
            <FootprintDashboard
              summary={enrichedSummary}
              entries={data!.entries}
              factors={factors}
              persistent={data!.persistent}
              onDelete={handleDelete}
              streak={streak}
              delta={delta}
            />
          ) : (
            <section className="card" aria-busy="true">
              <h2>Today&apos;s footprint</h2>
              <p className="muted">Loading…</p>
            </section>
          )}

          <InsightsPanel />

          {data && <WhatIfPanel entries={data.entries} factors={factors} />}

          <ChallengesPanel refreshKey={entriesVersion} />

          {data && (
            <TrendChart
              totals={totals}
              target={personalTarget ?? data.summary.benchmarks.sustainableTarget}
            />
          )}

          {enrichedSummary && (
            <MonthCalendar
              entries={data!.entries}
              target={data!.summary.benchmarks.sustainableTarget}
              personalTarget={personalTarget}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onDelete={handleDelete}
              factors={factors}
              onLogForDay={onLogForDay}
            />
          )}
        </div>

        <footer className="footer-note">
          <p>{t("footer.sources")}</p>
          <p>{t("footer.challenge")}</p>
        </footer>
      </main>

      <Chatbot />
    </div>
  );
}
