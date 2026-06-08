"use client";

import { useMemo, useState } from "react";
import type { Factor } from "@/lib/types";

interface Props {
  activities: Factor[];
  onLogged: () => void;
}

/** Form for logging a single activity (type + quantity). */
export default function ActivityForm({ activities, onLogged }: Props) {
  const [type, setType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = useMemo(() => activities.find((a) => a.key === type), [activities, type]);

  // Group activities by category for an accessible, scannable dropdown.
  const groups = useMemo(() => {
    const map = new Map<string, Factor[]>();
    for (const a of activities) {
      const list = map.get(a.category) ?? [];
      list.push(a);
      map.set(a.category, list);
    }
    return [...map.entries()];
  }, [activities]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus(null);

    const qty = Number(quantity);
    if (!type) {
      setStatus({ kind: "error", text: "Please choose an activity." });
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setStatus({ kind: "error", text: "Enter a quantity greater than zero." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not log activity.");
      setStatus({
        kind: "ok",
        text: `Logged ${selected?.label}: ${data.entry.kgCo2e} kg CO2e.`,
      });
      setQuantity("");
      onLogged();
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card" aria-labelledby="log-heading">
      <h2 id="log-heading">Log an activity</h2>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="activity">Activity</label>
          <select
            id="activity"
            value={type}
            onChange={(e) => setType(e.target.value)}
            required
          >
            <option value="">Select an activity…</option>
            {groups.map(([category, items]) => (
              <optgroup key={category} label={category[0].toUpperCase() + category.slice(1)}>
                {items.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label} (per {a.unit})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selected?.hint && <p className="hint">{selected.hint}</p>}
        </div>

        <div className="field">
          <label htmlFor="quantity">
            Quantity{selected ? ` (${selected.unit})` : ""}
          </label>
          <input
            id="quantity"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={selected ? `e.g. how many ${selected.unit}` : "Enter a number"}
            required
          />
          {selected && (
            <p className="hint">
              Factor: {selected.kgPerUnit} kg CO2e per {selected.unit} · {selected.source}
            </p>
          )}
        </div>

        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? "Logging…" : "Add to today"}
        </button>

        {/* Live region announces success/errors to screen readers. */}
        <p
          className={`status ${status?.kind === "error" ? "error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {status?.text ?? ""}
        </p>
      </form>
    </section>
  );
}
