import Groq from "groq-sdk";
import type {
  Category,
  FootprintSummary,
  Insights,
  Recommendation,
} from "./types";

/**
 * The assistant has two layers:
 *
 *  1. `recommend()` — a deterministic rules engine that inspects the user's
 *     actual footprint summary, finds the dominant emission category and the
 *     biggest individual contributors, and selects targeted, India-relevant,
 *     quantified actions. This is the "logical decision-making on user
 *     context" and runs with zero external dependencies.
 *
 *  2. `generateInsights()` — wraps those recommendations and the footprint
 *     context into a prompt for Groq, which returns a warm, personalized
 *     narrative. If the LLM is unavailable it returns the rule-based output,
 *     so the feature never fails.
 */

/** Category → ordered list of high-impact, India-relevant actions. */
const PLAYBOOK: Record<Category, Recommendation[]> = {
  transport: [
    {
      title: "Swap short car trips for metro or bus",
      detail:
        "City transit emits a fraction of a private car per km. Moving a 10 km daily commute from a petrol car to the metro saves ~1.4 kg CO2e a day.",
      category: "transport",
      estimatedSavingKg: 1.4,
    },
    {
      title: "Reconsider that domestic flight",
      detail:
        "For trips under ~1000 km, an AC train journey can cut emissions by over 90% versus flying.",
      category: "transport",
      estimatedSavingKg: 120,
    },
    {
      title: "Carpool or share an auto",
      detail: "Splitting a ride halves the per-person footprint of the same distance.",
      category: "transport",
    },
  ],
  energy: [
    {
      title: "Set the AC to 24–26 °C",
      detail:
        "On India's coal-heavy grid every saved unit avoids ~0.71 kg CO2e. Each degree higher can cut cooling energy by 3–5%.",
      category: "energy",
      estimatedSavingKg: 0.71,
    },
    {
      title: "Switch to LED and star-rated appliances",
      detail: "BEE 5-star appliances and LEDs noticeably reduce monthly electricity use.",
      category: "energy",
    },
    {
      title: "Consider rooftop solar",
      detail: "Solar offsets grid electricity directly — the highest-leverage home upgrade in India.",
      category: "energy",
    },
  ],
  diet: [
    {
      title: "Make a few meals plant-forward",
      detail:
        "A vegetarian thali (~0.6 kg) emits far less than a mutton meal (~3.5 kg). Swapping one red-meat meal saves ~2.9 kg CO2e.",
      category: "diet",
      estimatedSavingKg: 2.9,
    },
    {
      title: "Cut food waste",
      detail: "Plan portions and store leftovers — wasted food wastes all the emissions that produced it.",
      category: "diet",
    },
  ],
  waste: [
    {
      title: "Segregate and compost wet waste",
      detail:
        "Composting kitchen waste avoids methane from landfills and cuts your waste footprint substantially.",
      category: "waste",
      estimatedSavingKg: 0.4,
    },
    {
      title: "Refuse single-use plastic",
      detail: "Carry a reusable bag and bottle to avoid recurring disposable waste.",
      category: "waste",
    },
  ],
  goods: [
    {
      title: "Buy less, choose durable",
      detail: "A new garment carries ~15 kg CO2e. Repairing and buying second-hand avoids most of it.",
      category: "goods",
      estimatedSavingKg: 15,
    },
  ],
};

const GENERAL_FALLBACK: Recommendation = {
  title: "Start logging your daily activities",
  detail:
    "Track your travel, electricity, meals and waste for a few days. Once there's data, you'll get targeted, personalized actions.",
  category: "general",
};

/** Friendly category names for narrative copy. */
const CATEGORY_LABEL: Record<Category, string> = {
  transport: "travel",
  energy: "home energy",
  diet: "food",
  waste: "waste",
  goods: "shopping",
};

/**
 * Select up to `limit` recommendations based on the user's footprint.
 * Prioritises the dominant category, then fills with actions from the next
 * largest categories so the advice is broad but focused.
 */
export function recommend(summary: FootprintSummary, limit = 4): Recommendation[] {
  if (summary.entryCount === 0 || summary.breakdown.length === 0) {
    return [GENERAL_FALLBACK];
  }

  const picks: Recommendation[] = [];
  for (const { category } of summary.breakdown) {
    for (const rec of PLAYBOOK[category] ?? []) {
      if (picks.length >= limit) break;
      picks.push(rec);
    }
    if (picks.length >= limit) break;
  }
  return picks.length > 0 ? picks : [GENERAL_FALLBACK];
}

/** Build a compact, factual context block for the LLM. */
function buildContext(summary: FootprintSummary, recs: Recommendation[]): string {
  const breakdown = summary.breakdown
    .map((b) => `${CATEGORY_LABEL[b.category]}: ${b.kg} kg (${b.pct}%)`)
    .join(", ");
  const vsTarget =
    summary.targetRatio <= 1
      ? `at or below the ${summary.benchmarks.sustainableTarget} kg/day sustainable target`
      : `${summary.targetRatio}x the ${summary.benchmarks.sustainableTarget} kg/day sustainable target`;

  return [
    `Today's footprint: ${summary.todayKg} kg CO2e (${vsTarget}).`,
    `India average is ${summary.benchmarks.indiaPerCapita} kg/day; global average is ${summary.benchmarks.globalAverage} kg/day.`,
    `Category breakdown: ${breakdown || "none yet"}.`,
    `Biggest contributor: ${summary.topCategory ? CATEGORY_LABEL[summary.topCategory] : "n/a"}.`,
    `Candidate actions: ${recs.map((r) => r.title).join("; ")}.`,
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "You are Carbonara, a friendly carbon-footprint coach for users in India.",
  "Given a user's footprint data and a list of candidate actions, write a short,",
  "encouraging, non-judgemental message (2-4 sentences). Be specific to their",
  "biggest contributor, use the Indian context (metro, AC, thali, LPG, Railways),",
  "and never invent numbers beyond those provided. Plain text only, no markdown.",
].join(" ");

/**
 * Produce personalized insights. Uses Groq when `GROQ_API_KEY` is set; on any
 * error or missing key, returns the deterministic rule-based output.
 */
export async function generateInsights(summary: FootprintSummary): Promise<Insights> {
  const recommendations = recommend(summary);
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return { message: ruleBasedMessage(summary), recommendations, generatedBy: "rules" };
  }

  try {
    const client = new Groq({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.5,
      max_tokens: 220,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildContext(summary, recommendations) },
      ],
    });
    const message = completion.choices[0]?.message?.content?.trim();
    if (!message) {
      return { message: ruleBasedMessage(summary), recommendations, generatedBy: "rules" };
    }
    return { message, recommendations, generatedBy: "groq" };
  } catch {
    return { message: ruleBasedMessage(summary), recommendations, generatedBy: "rules" };
  }
}

/** Deterministic narrative used when the LLM is unavailable. */
export function ruleBasedMessage(summary: FootprintSummary): string {
  if (summary.entryCount === 0) {
    return "Log a few of today's activities — travel, electricity, meals — and I'll suggest the highest-impact ways to cut your footprint.";
  }
  const top = summary.topCategory ? CATEGORY_LABEL[summary.topCategory] : "your activities";
  const standing =
    summary.targetRatio <= 1
      ? `That's within the ${summary.benchmarks.sustainableTarget} kg/day sustainable target — great going.`
      : `That's about ${summary.targetRatio}x the ${summary.benchmarks.sustainableTarget} kg/day sustainable target.`;
  return `Today you've logged ${summary.todayKg} kg CO2e, and ${top} is your biggest contributor. ${standing} Focus there first — the actions below are ordered by impact.`;
}
