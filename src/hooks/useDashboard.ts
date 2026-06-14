import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeStreak,
  dailyTotals,
  estimatePersonalBaseline,
  personalDailyTarget,
  weekDelta,
} from "@/lib/emissions";
import type { Factor, FootprintSummary, LogEntry, SafeUser } from "@/lib/types";

export interface FootprintResponse {
  entries: LogEntry[];
  summary: FootprintSummary;
  persistent: boolean;
}

export type AuthState =
  | { status: "loading"; googleEnabled: boolean }
  | { status: "anon"; googleEnabled: boolean }
  | { status: "authed"; googleEnabled: boolean; user: SafeUser };

export const ONBOARDED_KEY = "carbonara_onboarded";

export function useDashboard() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading", googleEnabled: false });
  const [returningUser, setReturningUser] = useState(false);
  const [activities, setActivities] = useState<Factor[]>([]);
  const [data, setData] = useState<FootprintResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [logDate, setLogDate] = useState<string | null>(null);
  const [entriesVersion, setEntriesVersion] = useState(0);

  const factors = useMemo(
    () => Object.fromEntries(activities.map((a) => [a.key, a])),
    [activities]
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
            : { status: "anon", googleEnabled: Boolean(d.googleEnabled) }
        );
      })
      .catch(() => setAuth({ status: "anon", googleEnabled: false }));
  }, []);

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
    [loadFootprint]
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

  return {
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
  };
}
