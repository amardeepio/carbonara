import { z } from "zod";
import { INDIAN_STATES, type IndianState } from "./grid";

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
  /** Hindi label; English `label` is the fallback when absent. */
  labelHi?: string;
  /** Unit the user enters a quantity in, e.g. "km", "kWh", "meal". */
  unit: string;
  /** kg CO2e per single `unit` (at the national-average grid for electric activities). */
  kgPerUnit: number;
  /**
   * For grid-powered activities: kWh consumed per `unit`. When present, the
   * effective factor is `kwhPerUnit × grid intensity` so emissions follow the
   * user's regional grid; `kgPerUnit` stays the national-average default.
   */
  kwhPerUnit?: number;
  /** Provenance of the factor, surfaced in the UI/README for transparency. */
  source: string;
  /** Short, India-relevant nudge shown alongside the activity. */
  hint?: string;
}

/** A persisted activity log entry, owned by one user. */
export interface LogEntry {
  id: string;
  /** Owning user — entries are always scoped to a session user. */
  userId: string;
  /** The user's local calendar day as YYYY-MM-DD. Stored explicitly so
   *  day grouping is timezone-correct regardless of UTC createdAt. */
  date: string;
  type: string;
  quantity: number;
  kgCo2e: number;
  /** ISO-8601 timestamp (real log time, used for sort order). */
  createdAt: string;
  /** "live" if a live API priced this entry, otherwise "builtin". */
  pricedBy: "live" | "builtin";
}

// ---------------------------------------------------------------------------
// Users & onboarding
// ---------------------------------------------------------------------------

/** Typical commute mode, collected (optionally) during onboarding. */
export type CommuteMode = "two_wheeler" | "car" | "metro" | "bus" | "walk_cycle";

/** Usual diet, collected (optionally) during onboarding. */
export type DietPreference = "vegan" | "veg" | "eggs_chicken" | "mixed";

/** An application user — signed in with Google or as a guest. */
export interface User {
  id: string;
  provider: "google" | "guest";
  name: string;
  email?: string;
  picture?: string;
  /** Google's stable account id; used to recognise returning Google users. */
  googleSub?: string;
  commute?: CommuteMode;
  diet?: DietPreference;
  /** Indian state/UT, used to pick the regional electricity-grid factor. */
  state?: IndianState;
  /** Preferred UI language. */
  locale?: "en" | "hi";
  /** ISO-8601 timestamp. */
  createdAt: string;
}

/** User shape safe to send to the client (no provider internals). */
export type SafeUser = Omit<User, "googleSub">;

/** Optional lifestyle answers collected by the onboarding steps. */
export const onboardingProfileSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  commute: z.enum(["two_wheeler", "car", "metro", "bus", "walk_cycle"]).optional(),
  diet: z.enum(["vegan", "veg", "eggs_chicken", "mixed"]).optional(),
  state: z.enum(INDIAN_STATES).optional(),
});

export type OnboardingProfile = z.infer<typeof onboardingProfileSchema>;

/** Request body for updating the signed-in user's profile (`null` clears a field). */
export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name can't be empty").max(60).optional(),
  commute: z.enum(["two_wheeler", "car", "metro", "bus", "walk_cycle"]).nullable().optional(),
  diet: z.enum(["vegan", "veg", "eggs_chicken", "mixed"]).nullable().optional(),
  state: z.enum(INDIAN_STATES).nullable().optional(),
  locale: z.enum(["en", "hi"]).nullable().optional(),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** Request body for guest sign-in. */
export const guestAuthSchema = z.object({
  profile: onboardingProfileSchema.optional(),
});

/** Request body for Google sign-in (`credential` is a Google ID token). */
export const googleAuthSchema = z.object({
  credential: z.string().min(20).max(4096),
  profile: onboardingProfileSchema.optional(),
});

/** Total emissions for one calendar day, used by the history endpoint. */
export interface DailyTotal {
  /** Calendar day as YYYY-MM-DD. */
  date: string;
  kg: number;
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
  /** Personalised baseline estimated from commute + diet, kg/day (null if unknown). */
  personalBaseline?: number | null;
  /** Personalised daily target (90% of baseline, floored at sustainableTarget). */
  personalTarget?: number | null;
}

export interface Streak {
  /** Consecutive days logged ending at (and including) the reference date. */
  current: number;
  /** Best streak seen in all of the user's logged data. */
  best: number;
}

export interface WeekDelta {
  /** Mon–Sun week containing the reference date, kg CO2e. */
  thisWeek: number;
  /** Mon–Sun week before that one, kg CO2e (0 if no data). */
  lastWeek: number;
  /** Percentage change: negative = improvement. null when lastWeek is 0. */
  pct: number | null;
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
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
});

export type LogEntryInput = z.infer<typeof logEntrySchema>;

// ---------------------------------------------------------------------------
// Routines (one-tap logging of a recurring bundle of activities)
// ---------------------------------------------------------------------------

/** A saved bundle of activities (e.g. daily commute + meals), owned by a user. */
export interface Routine {
  id: string;
  userId: string;
  name: string;
  items: { type: string; quantity: number }[];
  /** ISO-8601 timestamp. */
  createdAt: string;
}

/** Request body for creating a routine. */
export const routineSchema = z.object({
  name: z.string().trim().min(1, "Routine name is required").max(60),
  items: z
    .array(
      z.object({
        type: z.string().min(1),
        quantity: z.number().positive("Quantity must be greater than zero").finite(),
      }),
    )
    .min(1, "Add at least one activity")
    .max(12, "A routine can hold at most 12 activities"),
});

export type RoutineInput = z.infer<typeof routineSchema>;

/** Request body for logging a routine (date defaults to the server day). */
export const routineLogSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
});

/** Request body for pledging a weekly challenge. */
export const pledgeRequestSchema = z.object({
  challengeKey: z.string().min(1, "Challenge is required"),
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD")
    .optional(),
});

/** A single chat turn. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Request body for the chatbot endpoint. Bounded to keep prompts small/safe. */
export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
  locale: z.enum(["en", "hi"]).optional(),
});

/** Request body for the insights endpoint (everything optional). */
export const insightsRequestSchema = z.object({
  locale: z.enum(["en", "hi"]).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export interface ChatResponse {
  reply: string;
  generatedBy: "groq" | "rules";
}
