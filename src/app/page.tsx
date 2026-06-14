"use client";

import Link from "next/link";
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
import { useDashboard, ONBOARDED_KEY } from "@/hooks/useDashboard";

export default function HomePage() {
  const { t } = useT();
  const {
    auth,
    setAuth,
    returningUser,
    setReturningUser,
    activities,
    data,
    loadError,
    selectedDate,
    setSelectedDate,
    logDate,
    entriesVersion,
    factors,
    totals,
    streak,
    delta,
    personalTarget,
    enrichedSummary,
    loadFootprint,
    handleDelete,
    signOut,
    onLogForDay,
    onClearLogDate,
  } = useDashboard();

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
