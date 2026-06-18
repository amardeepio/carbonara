"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/components/LocaleProvider";
import type { Category, Factor } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n";
import { MONTH_NAMES, todayISO } from "@/lib/date";

function prettyDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  const day = d.getUTCDate();
  const month = MONTH_NAMES[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const now = new Date();
  if (year === now.getFullYear()) return `${day} ${month}`;
  return `${day} ${month} ${year}`;
}

interface Props {
  activities: Factor[];
  onLogged: () => void;
  logDate: string | null;
  onClearLogDate: () => void;
}

/** Emoji glyphs for activities and categories (presentation only). */
const ACTIVITY_ICON: Record<string, string> = {
  two_wheeler: "🛵",
  car_petrol: "🚗",
  car_diesel: "🚙",
  auto_rickshaw: "🛺",
  bus: "🚌",
  metro: "🚇",
  train: "🚆",
  flight_domestic: "✈️",
  electricity: "⚡",
  lpg: "🔥",
  meal_vegan: "🥗",
  meal_veg: "🍛",
  meal_chicken: "🍗",
  meal_mutton: "🍖",
  general_waste: "🗑️",
  new_clothing: "👕",
};

const CATEGORY_META: Record<Category, { labelKey: MessageKey; icon: string }> = {
  transport: { labelKey: "cat.transport", icon: "🚗" },
  energy: { labelKey: "cat.energy", icon: "⚡" },
  diet: { labelKey: "cat.diet", icon: "🍽️" },
  waste: { labelKey: "cat.waste", icon: "🗑️" },
  goods: { labelKey: "cat.goods", icon: "🛍️" },
};

/** Sensible quick-add amounts per unit. */
const PRESETS: Record<string, number[]> = {
  km: [2, 5, 10, 25, 50],
  kWh: [1, 2, 5, 10, 20],
  kg: [1, 2, 5, 10],
  meal: [1, 2, 3],
  item: [1, 2, 3],
};

const CATEGORY_ORDER: Category[] = ["transport", "energy", "diet", "waste", "goods"];

/** Interactive activity logger: category → activity tile → amount → live estimate. */
export default function ActivityForm({ activities, onLogged, logDate, onClearLogDate }: Props) {
  const { t, locale } = useT();
  const [category, setCategory] = useState<Category | null>(null);
  const [type, setType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Categories present in the data, in a friendly order.
  const categories = useMemo(() => {
    const present = new Set(activities.map((a) => a.category));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [activities]);

  // Default to the first category once activities load.
  useEffect(() => {
    if (!category && categories.length > 0) setCategory(categories[0] ?? null);
  }, [categories, category]);

  const inCategory = useMemo(
    () => activities.filter((a) => a.category === category),
    [activities, category],
  );
  const selected = useMemo(() => activities.find((a) => a.key === type), [activities, type]);

  // Auto-select the first activity when the category changes.
  useEffect(() => {
    const first = inCategory[0];
    if (first && !inCategory.some((a) => a.key === type)) {
      setType(first.key);
    }
  }, [inCategory, type]);

  const qty = Number(quantity);
  const validQty = Number.isFinite(qty) && qty > 0;
  const estimate = selected && validQty ? Math.round(selected.kgPerUnit * qty * 100) / 100 : null;
  const presets = selected ? (PRESETS[selected.unit] ?? []) : [];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus(null);
    if (!type) {
      setStatus({ kind: "error", text: t("form.chooseActivity") });
      return;
    }
    if (!validQty) {
      setStatus({ kind: "error", text: t("form.qtyError") });
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { type, quantity: qty };
      if (logDate) body.date = logDate;
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("form.failed"));
      setStatus({
        kind: "ok",
        text: t("form.added", {
          label: (locale === "hi" ? selected?.labelHi : undefined) ?? selected?.label ?? type,
          kg: data.entry.kgCo2e,
        }),
      });
      setQuantity("");
      onLogged();
    } catch (err) {
      setStatus({
        kind: "error",
        text: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card logger" aria-labelledby="log-heading">
      <h2 id="log-heading">{t("form.heading")}</h2>

      {logDate && logDate !== todayISO() && (
        <div className="backfill-banner">
          <span>{t("form.backfill", { date: prettyDate(logDate) })}</span>
          <button type="button" className="secondary" onClick={onClearLogDate}>
            {t("form.backToToday")}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Step 1 — category */}
        <div className="step-label" id="cat-label">
          {t("form.step1")}
        </div>
        <div className="cat-pills" role="group" aria-labelledby="cat-label">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className="cat-pill"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              <span aria-hidden="true">{CATEGORY_META[c].icon}</span> {t(CATEGORY_META[c].labelKey)}
            </button>
          ))}
        </div>

        {/* Step 2 — activity tile */}
        <div className="step-label" id="act-label">
          {t("form.step2")}
        </div>
        <div className="tiles" role="group" aria-labelledby="act-label">
          {inCategory.map((a) => (
            <button
              key={a.key}
              type="button"
              className="tile"
              aria-pressed={type === a.key}
              onClick={() => setType(a.key)}
            >
              <span className="tile-icon" aria-hidden="true">
                {ACTIVITY_ICON[a.key] ?? "🌍"}
              </span>
              <span className="tile-label">
                {(locale === "hi" ? a.labelHi : undefined) ?? a.label}
              </span>
              <span className="tile-factor">
                {a.kgPerUnit} kg / {a.unit}
              </span>
            </button>
          ))}
        </div>

        {/* Step 3 — amount */}
        <div className="step-label">
          <label htmlFor="quantity">
            {t(
              selected?.unit === "meal" || selected?.unit === "item"
                ? "form.step3many"
                : "form.step3much",
              { unit: selected ? ` (${selected.unit})` : "" },
            )}
          </label>
        </div>

        {presets.length > 0 && (
          <div className="presets" role="group" aria-label={t("form.quickAmounts")}>
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                className="chip"
                aria-pressed={qty === p}
                onClick={() => setQuantity(String(p))}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="qty-row">
          <div className="qty-input">
            <input
              id="quantity"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              required
            />
            {selected && <span className="qty-unit">{selected.unit}</span>}
          </div>

          {/* Live, accessible CO2 estimate. */}
          <p className="estimate" role="status" aria-live="polite">
            {estimate !== null ? (
              <>
                ≈ <strong>{estimate}</strong> kg CO₂e
              </>
            ) : (
              <span className="muted">{t("form.preview")}</span>
            )}
          </p>
        </div>

        {selected?.hint && <p className="hint">💡 {selected.hint}</p>}

        <button type="submit" className="primary add-btn" disabled={submitting || !validQty}>
          {submitting
            ? t("form.adding")
            : logDate && logDate !== todayISO()
              ? t("form.addTo", { date: prettyDate(logDate) })
              : t("form.addToday")}
        </button>

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
