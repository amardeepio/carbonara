"use client";

import { useCallback, useEffect, useState } from "react";
import type { Factor, Routine } from "@/lib/types";

interface Props {
  activities: Factor[];
  /** Date selected in the calendar (YYYY-MM-DD), or null for today. */
  logDate: string | null;
  /** Called after a routine is logged so the dashboard refreshes. */
  onLogged: () => void;
}

interface DraftItem {
  type: string;
  quantity: string;
}

/**
 * One-tap routines: save a recurring bundle (commute + meals + power) once,
 * then log the whole day in a single tap.
 */
export default function RoutinesCard({ activities, logDate, onLogged }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ type: "", quantity: "" }]);
  const [busy, setBusy] = useState<string | null>(null); // routine id being logged
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const loadRoutines = useCallback(async () => {
    try {
      const res = await fetch("/api/routines");
      if (!res.ok) return;
      const data = await res.json();
      setRoutines(data.routines as Routine[]);
    } catch {
      // Non-fatal: the card simply shows no routines.
    }
  }, []);

  useEffect(() => {
    loadRoutines();
  }, [loadRoutines]);

  const factorByKey = new Map(activities.map((a) => [a.key, a]));

  function setItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function saveRoutine(event: React.FormEvent) {
    event.preventDefault();
    const cleanItems = items
      .filter((i) => i.type && Number(i.quantity) > 0)
      .map((i) => ({ type: i.type, quantity: Number(i.quantity) }));
    if (!name.trim() || cleanItems.length === 0) {
      setStatus({ kind: "error", text: "Give the routine a name and at least one activity." });
      return;
    }
    try {
      const res = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), items: cleanItems }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the routine.");
      setName("");
      setItems([{ type: "", quantity: "" }]);
      setBuilding(false);
      setStatus({ kind: "ok", text: `Saved "${data.routine.name}".` });
      await loadRoutines();
    } catch (err) {
      setStatus({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not save the routine.",
      });
    }
  }

  async function logRoutine(routine: Routine) {
    setBusy(routine.id);
    setStatus(null);
    try {
      const res = await fetch(`/api/routines/${routine.id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logDate ? { date: logDate } : {}),
      });
      const data = await res.json();
      if (!res.ok && !(data.logged?.length > 0)) {
        throw new Error(data.error ?? "Could not log the routine.");
      }
      const kg = (data.logged as { kgCo2e: number }[]).reduce((sum, e) => sum + e.kgCo2e, 0);
      const when = logDate ?? "today";
      const failures = data.failed?.length
        ? ` (${data.failed.length} item${data.failed.length > 1 ? "s" : ""} failed)`
        : "";
      setStatus({
        kind: "ok",
        text: `Logged "${routine.name}" for ${when} — ${Math.round(kg * 100) / 100} kg CO₂e${failures}.`,
      });
      onLogged();
    } catch (err) {
      setStatus({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not log the routine.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function deleteRoutine(routine: Routine) {
    try {
      const res = await fetch(`/api/routines/${routine.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await loadRoutines();
    } catch {
      setStatus({ kind: "error", text: "Could not delete that routine." });
    }
  }

  return (
    <section className="card" aria-labelledby="routines-heading">
      <h2 id="routines-heading">My routines</h2>
      <p className="muted">
        Save your usual day once — commute, meals, power — then log it in one tap.
      </p>

      {routines.length > 0 && (
        <ul className="routines">
          {routines.map((routine) => (
            <li key={routine.id}>
              <div>
                <strong>{routine.name}</strong>
                <span className="meta">
                  {" "}
                  {routine.items
                    .map((i) => `${i.quantity} ${factorByKey.get(i.type)?.unit ?? ""} ${factorByKey.get(i.type)?.label ?? i.type}`)
                    .join(" · ")}
                </span>
              </div>
              <div className="routine-actions">
                <button
                  type="button"
                  className="primary routine-log-btn"
                  onClick={() => logRoutine(routine)}
                  disabled={busy !== null}
                >
                  {busy === routine.id ? "Logging…" : `Log all${logDate ? ` (${logDate})` : ""}`}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => deleteRoutine(routine)}
                  aria-label={`Delete routine ${routine.name}`}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {building ? (
        <form onSubmit={saveRoutine} className="routine-builder">
          <label htmlFor="routine-name">Routine name</label>
          <input
            id="routine-name"
            type="text"
            value={name}
            maxLength={60}
            placeholder="e.g. Usual workday"
            onChange={(e) => setName(e.target.value)}
            required
          />

          {items.map((item, index) => (
            <div className="routine-row" key={index}>
              <label className="visually-hidden" htmlFor={`routine-type-${index}`}>
                Activity {index + 1}
              </label>
              <select
                id={`routine-type-${index}`}
                value={item.type}
                onChange={(e) => setItem(index, { type: e.target.value })}
              >
                <option value="">Choose activity…</option>
                {activities.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
              <label className="visually-hidden" htmlFor={`routine-qty-${index}`}>
                Quantity{item.type ? ` in ${factorByKey.get(item.type)?.unit}` : ""}
              </label>
              <input
                id={`routine-qty-${index}`}
                type="number"
                min="0.1"
                step="any"
                inputMode="decimal"
                placeholder={factorByKey.get(item.type)?.unit ?? "qty"}
                value={item.quantity}
                onChange={(e) => setItem(index, { quantity: e.target.value })}
              />
            </div>
          ))}

          <div className="routine-builder-actions">
            {items.length < 12 && (
              <button
                type="button"
                className="secondary"
                onClick={() => setItems((c) => [...c, { type: "", quantity: "" }])}
              >
                + Add activity
              </button>
            )}
            <button type="submit" className="primary">
              Save routine
            </button>
            <button type="button" className="secondary" onClick={() => setBuilding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="secondary" onClick={() => setBuilding(true)}>
          + New routine
        </button>
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
