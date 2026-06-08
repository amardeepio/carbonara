import { z } from "zod";

/** High-level grouping used for the dashboard breakdown and the rules engine. */
export type Category = "transport" | "energy" | "diet" | "waste" | "goods";

/**
 * A single emission factor. Values are India-specific, awareness-grade
 * approximations (see `source`) expressed in kg CO2e per `unit`.
 */
export interface Factor {
  /** Stable key used by the API and storage layer. */
  key: string;
  category: Category;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Unit the user enters a quantity in, e.g. "km", "kWh", "meal". */
  unit: string;
  /** kg CO2e per single `unit`. */
  kgPerUnit: number;
  /** Provenance of the factor, surfaced in the UI/README for transparency. */
  source: string;
  /** Optional Climatiq activity_id enabling a live-data lookup. */
  climatiqActivityId?: string;
  /** Short, India-relevant nudge shown alongside the activity. */
  hint?: string;
}

/** A persisted activity log entry. */
export interface LogEntry {
  id: string;
  type: string;
  quantity: number;
  kgCo2e: number;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** "climatiq" if the live API priced this entry, otherwise "builtin". */
  pricedBy: "climatiq" | "builtin";
}

export interface CategoryBreakdown {
  category: Category;
  kg: number;
  pct: number;
}

export interface Benchmarks {
  /** India average per-capita daily footprint (kg CO2e). */
  indiaPerCapita: number;
  /** Global average per-capita daily footprint (kg CO2e). */
  globalAverage: number;
  /** Per-capita daily budget aligned with the 1.5 °C goal (kg CO2e). */
  sustainableTarget: number;
}

export interface FootprintSummary {
  totalKg: number;
  todayKg: number;
  entryCount: number;
  breakdown: CategoryBreakdown[];
  topCategory: Category | null;
  benchmarks: Benchmarks;
  /** todayKg relative to the sustainable target, as a ratio (1 = on budget). */
  targetRatio: number;
}

export interface Recommendation {
  title: string;
  detail: string;
  category: Category | "general";
  /** Rough estimated saving in kg CO2e per occurrence/day, when quantifiable. */
  estimatedSavingKg?: number;
}

export interface Insights {
  /** Personalized narrative; LLM-generated when available, else rule-based. */
  message: string;
  recommendations: Recommendation[];
  /** How the narrative was produced. */
  generatedBy: "groq" | "rules";
}

/** Request body for logging an activity. Validated at the API boundary. */
export const logEntrySchema = z.object({
  type: z.string().min(1, "Activity type is required"),
  quantity: z.number().positive("Quantity must be greater than zero").finite(),
});

export type LogEntryInput = z.infer<typeof logEntrySchema>;
