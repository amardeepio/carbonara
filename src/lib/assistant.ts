import Groq from "groq-sdk";
import type {
  Category,
  ChatMessage,
  ChatResponse,
  CommuteMode,
  DietPreference,
  FootprintSummary,
  Insights,
  LogEntry,
  Recommendation,
  SafeUser,
} from "./types";
import { EMISSION_FACTORS, round } from "./emissions";
import { equivalentsSentence } from "./equivalents";
import { translate, type Locale, type MessageKey } from "./i18n";

/**
 * The narrative layer (LLM prompts + deterministic fallbacks) is bilingual
 * (en/hi) and matches the profile's locale field; the wider UI locale set
 * lives in `i18n.ts` and only applies to dictionary-backed strings.
 */
type AssistantLocale = "en" | "hi";

const CATEGORY_LABEL: Record<Category, { en: string; hi: string }> = {
  transport: { en: "Travel", hi: "यात्रा" },
  energy: { en: "Energy", hi: "ऊर्जा" },
  diet: { en: "Food", hi: "भोजन" },
  waste: { en: "Waste", hi: "कचरा" },
  goods: { en: "Shopping", hi: "खरीदारी" },
};

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

/**
 * The playbook's copy lives in the message dictionaries (`rec.<category>.<i>`)
 * so every recommendation is available in all supported languages; only the
 * structure and quantified savings live here.
 */
const PLAYBOOK: Record<Category, { estimatedSavingKg?: number }[]> = {
  transport: [{ estimatedSavingKg: 1.4 }, { estimatedSavingKg: 120 }, {}],
  energy: [{ estimatedSavingKg: 0.71 }, {}, {}],
  diet: [{ estimatedSavingKg: 2.9 }, {}],
  waste: [{ estimatedSavingKg: 0.4 }, {}],
  goods: [{ estimatedSavingKg: 15 }],
};

function resolveRec(
  category: Category | "general",
  index: number,
  locale: Locale,
  estimatedSavingKg?: number,
): Recommendation {
  return {
    title: translate(locale, `rec.${category}.${index}.title` as MessageKey),
    detail: translate(locale, `rec.${category}.${index}.detail` as MessageKey),
    category,
    ...(estimatedSavingKg !== undefined && { estimatedSavingKg }),
  };
}

/**
 * Select up to `limit` recommendations based on the user's footprint.
 * Prioritises the dominant category, then fills with actions from the next
 * largest categories so the advice is broad but focused.
 */
export function recommend(
  summary: FootprintSummary,
  limit = 4,
  locale: Locale = "en",
): Recommendation[] {
  if (summary.entryCount === 0 || summary.breakdown.length === 0) {
    return [resolveRec("general", 0, locale)];
  }

  const picks: Recommendation[] = [];
  for (const { category } of summary.breakdown) {
    (PLAYBOOK[category] ?? []).forEach((rec, index) => {
      if (picks.length >= limit) return;
      picks.push(resolveRec(category, index, locale, rec.estimatedSavingKg));
    });
    if (picks.length >= limit) break;
  }
  return picks.length > 0 ? picks : [resolveRec("general", 0, locale)];
}

/** Friendly phrasing for onboarding answers, injected into LLM context. */
const COMMUTE_PHRASE: Record<CommuteMode, string> = {
  two_wheeler: "a two-wheeler",
  car: "a car",
  metro: "the metro or train",
  bus: "the bus",
  walk_cycle: "walking or cycling",
};

const DIET_PHRASE: Record<DietPreference, string> = {
  vegan: "vegan food",
  veg: "vegetarian food",
  eggs_chicken: "eggs and chicken",
  mixed: "a mixed diet including red meat",
};

/** One factual line about the user's onboarding profile, or null if empty. */
function profileLine(user?: SafeUser | null): string | null {
  if (!user) return null;
  const parts: string[] = [];
  if (user.name && user.name !== "Guest") parts.push(`name: ${user.name}`);
  if (user.commute) parts.push(`usually travels by ${COMMUTE_PHRASE[user.commute]}`);
  if (user.diet) parts.push(`usually eats ${DIET_PHRASE[user.diet]}`);
  return parts.length > 0 ? `About the user — ${parts.join("; ")}.` : null;
}

/** Build a compact, factual context block for the LLM. */
function buildContext(
  summary: FootprintSummary,
  recs: Recommendation[],
  user?: SafeUser | null,
): string {
  const breakdown = summary.breakdown
    .map((b) => `${CATEGORY_LABEL[b.category].en}: ${b.kg} kg (${b.pct}%)`)
    .join(", ");
  const vsTarget =
    summary.targetRatio <= 1
      ? `at or below the ${summary.benchmarks.sustainableTarget} kg/day sustainable target`
      : `${summary.targetRatio}x the ${summary.benchmarks.sustainableTarget} kg/day sustainable target`;

  const lines = [
    `Today's footprint: ${summary.todayKg} kg CO2e (${vsTarget}).`,
    `India average is ${summary.benchmarks.indiaPerCapita} kg/day; global average is ${summary.benchmarks.globalAverage} kg/day.`,
    `Category breakdown: ${breakdown || "none yet"}.`,
    `Biggest contributor: ${summary.topCategory ? CATEGORY_LABEL[summary.topCategory].en : "n/a"}.`,
    `Candidate actions: ${recs.map((r) => r.title).join("; ")}.`,
  ];
  const todayEq = equivalentsSentence(summary.todayKg);
  if (todayEq) lines.push(`Relatable comparison for today's total: ${todayEq}.`);
  const profile = profileLine(user);
  if (profile) lines.push(profile);
  return lines.join("\n");
}

const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_TEMPERATURE = 0.5;
const INSIGHTS_MAX_TOKENS = 220;
const CHAT_MAX_TOKENS = 300;

/** Appended to system prompts when the user's UI language is Hindi. */
const HINDI_INSTRUCTION = " Reply in Hindi (Devanagari script).";

/** Cached Groq client, recreated only if the key changes (e.g. in tests). */
let groqCache: { apiKey: string; client: Groq } | null = null;

function getGroqClient(apiKey: string): Groq {
  if (groqCache?.apiKey !== apiKey) {
    groqCache = { apiKey, client: new Groq({ apiKey }) };
  }
  return groqCache.client;
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
export async function generateInsights(
  summary: FootprintSummary,
  user?: SafeUser | null,
  locale: AssistantLocale = "en",
): Promise<Insights> {
  const recommendations = recommend(summary, 4, locale);
  const fallback: Insights = {
    message: ruleBasedMessage(summary, locale),
    recommendations,
    generatedBy: "rules",
  };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return fallback;

  try {
    const completion = await getGroqClient(apiKey).chat.completions.create({
      model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
      temperature: DEFAULT_TEMPERATURE,
      max_tokens: INSIGHTS_MAX_TOKENS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT + (locale === "hi" ? HINDI_INSTRUCTION : "") },
        { role: "user", content: buildContext(summary, recommendations, user) },
      ],
    });
    const message = completion.choices[0]?.message?.content?.trim();
    return message ? { message, recommendations, generatedBy: "groq" } : fallback;
  } catch (error) {
    console.error("Groq API error in generateInsights:", error);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Conversational chatbot
// ---------------------------------------------------------------------------

const CHAT_SYSTEM_PROMPT = [
  "You are Carbonara, a friendly, practical carbon-footprint assistant for users in India.",
  "Answer questions about the user's footprint and how to reduce it, grounded in the",
  "context block provided. Use the Indian setting (metro, AC, thali, LPG, Railways, two-wheelers).",
  "Be concise (2-5 sentences), encouraging and non-judgemental. Never invent numbers",
  "beyond the context. If asked something unrelated to climate/footprint, gently steer back.",
  "Plain text only, no markdown.",
].join(" ");

/**
 * Answer a chat conversation in the context of the user's footprint.
 * Uses Groq when configured; otherwise a lightweight deterministic responder
 * that handles the most common intents from the footprint summary.
 */
export async function chatReply(
  messages: ChatMessage[],
  summary: FootprintSummary,
  user?: SafeUser | null,
  locale: AssistantLocale = "en",
): Promise<ChatResponse> {
  const fallback = (): ChatResponse => ({
    reply: deterministicChatReply(messages, summary, locale),
    generatedBy: "rules",
  });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return fallback();

  try {
    const completion = await getGroqClient(apiKey).chat.completions.create({
      model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
      temperature: DEFAULT_TEMPERATURE,
      max_tokens: CHAT_MAX_TOKENS,
      messages: [
        {
          role: "system",
          content: CHAT_SYSTEM_PROMPT + (locale === "hi" ? HINDI_INSTRUCTION : ""),
        },
        {
          role: "system",
          content: `Footprint context:\n${buildContext(summary, recommend(summary), user)}`,
        },
        ...messages,
      ],
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    return reply ? { reply, generatedBy: "groq" } : fallback();
  } catch (error) {
    console.error("Groq API error in chatReply:", error);
    return fallback();
  }
}

/** Intent-matched fallback so the chatbot stays useful without an LLM key. */
export function deterministicChatReply(
  messages: ChatMessage[],
  summary: FootprintSummary,
  locale: AssistantLocale = "en",
): string {
  const last =
    [...messages]
      .reverse()
      .find((m) => m.role === "user")
      ?.content.toLowerCase() ?? "";
  const hi = locale === "hi";

  if (summary.entryCount === 0) {
    return hi
      ? "मुझे अभी कोई लॉग की गई गतिविधि नहीं दिख रही। आज के कुछ काम जोड़ें — यात्रा, बिजली, भोजन — और मैं बताऊँगा कि आपका फ़ुटप्रिंट कहाँ केंद्रित है और उसे कैसे घटाएँ।"
      : "I can't see any logged activities yet. Add a few of today's actions — travel, electricity, meals — and I'll tell you where your footprint is concentrated and how to cut it.";
  }

  const top = summary.topCategory
    ? CATEGORY_LABEL[summary.topCategory][locale]
    : hi
      ? "आपकी गतिविधियाँ"
      : "your activities";

  if (
    /(biggest|highest|most|main|top|largest).*(source|contributor|impact|emit)|where.*from|सबसे बड़ा|स्रोत/.test(
      last,
    )
  ) {
    const b = summary.breakdown[0];
    return hi
      ? `आज आपका सबसे बड़ा योगदानकर्ता ${top} है — ${b?.kg ?? 0} kg CO2e (कुल का ${b?.pct ?? 0}%)। पहले उसी पर काम करने से सबसे ज़्यादा असर होगा।`
      : `Your biggest contributor today is ${top} at ${b?.kg ?? 0} kg CO2e (${b?.pct ?? 0}% of your total). Tackling that first gives you the most impact.`;
  }
  if (
    /total|how much|footprint|today|target|compare|average|doing|\bvs\b|versus|कितना|लक्ष्य|औसत/.test(
      last,
    )
  ) {
    const standing = hi
      ? summary.targetRatio <= 1
        ? `${summary.benchmarks.sustainableTarget} kg/दिन के सतत लक्ष्य के भीतर`
        : `${summary.benchmarks.sustainableTarget} kg/दिन के सतत लक्ष्य का लगभग ${summary.targetRatio} गुना`
      : summary.targetRatio <= 1
        ? `within the ${summary.benchmarks.sustainableTarget} kg/day sustainable target`
        : `about ${summary.targetRatio}x the ${summary.benchmarks.sustainableTarget} kg/day sustainable target`;
    return hi
      ? `आज आपने ${summary.todayKg} kg CO2e लॉग किया है — यह ${standing} है। भारत का औसत ${summary.benchmarks.indiaPerCapita} kg/दिन और वैश्विक औसत ${summary.benchmarks.globalAverage} kg/दिन है।`
      : `You've logged ${summary.todayKg} kg CO2e today — that's ${standing}. The India average is ${summary.benchmarks.indiaPerCapita} kg/day and the global average is ${summary.benchmarks.globalAverage} kg/day.`;
  }
  if (/reduce|lower|cut|improve|less|tips?|help|how|घटा|कम|कैसे|सुझाव/.test(last)) {
    const recs = recommend(summary, 3, locale)
      .map((r) => `• ${r.title}`)
      .join("\n");
    return hi
      ? `चूँकि ${top} आपका सबसे बड़ा स्रोत है, वहीं से शुरू करें:\n${recs}\nपूरी व्यक्तिगत योजना के लिए "सुझाव पाएँ" दबाएँ।`
      : `Since ${top} is your largest source, start there:\n${recs}\nTap "Get insights" for a fuller, personalized plan.`;
  }

  return hi
    ? `अभी ${top} आपका सबसे बड़ा स्रोत है — आज ${summary.todayKg} kg CO2e। मुझसे पूछें "मेरा सबसे बड़ा स्रोत क्या है?", "इसे कैसे घटाऊँ?", या "लक्ष्य की तुलना में मैं कैसा कर रहा हूँ?"।`
    : `Right now ${top} is your biggest source at ${summary.todayKg} kg CO2e today. Ask me "what's my biggest source?", "how do I reduce it?", or "how am I doing vs the target?".`;
}

/** Deterministic narrative used when the LLM is unavailable. */
export function ruleBasedMessage(
  summary: FootprintSummary,
  locale: AssistantLocale = "en",
): string {
  const hi = locale === "hi";
  if (summary.entryCount === 0) {
    return hi
      ? "आज की कुछ गतिविधियाँ लॉग करें — यात्रा, बिजली, भोजन — और मैं फ़ुटप्रिंट घटाने के सबसे असरदार तरीक़े सुझाऊँगा।"
      : "Log a few of today's activities — travel, electricity, meals — and I'll suggest the highest-impact ways to cut your footprint.";
  }
  const top = summary.topCategory
    ? CATEGORY_LABEL[summary.topCategory][locale]
    : hi
      ? "आपकी गतिविधियाँ"
      : "your activities";
  if (hi) {
    const standing =
      summary.targetRatio <= 1
        ? `यह ${summary.benchmarks.sustainableTarget} kg/दिन के सतत लक्ष्य के भीतर है — बहुत बढ़िया।`
        : `यह ${summary.benchmarks.sustainableTarget} kg/दिन के सतत लक्ष्य का लगभग ${summary.targetRatio} गुना है।`;
    return `आज आपने ${summary.todayKg} kg CO2e लॉग किया है, और ${top} आपका सबसे बड़ा योगदानकर्ता है। ${standing} पहले वहीं ध्यान दें — नीचे के सुझाव असर के क्रम में हैं।`;
  }
  const standing =
    summary.targetRatio <= 1
      ? `That's within the ${summary.benchmarks.sustainableTarget} kg/day sustainable target — great going.`
      : `That's about ${summary.targetRatio}x the ${summary.benchmarks.sustainableTarget} kg/day sustainable target.`;
  return `Today you've logged ${summary.todayKg} kg CO2e, and ${top} is your biggest contributor. ${standing} Focus there first — the actions below are ordered by impact.`;
}

/**
 * Produce a single quantified, behavior-specific tip based on the user's
 * actual logged entries (not just the summary). Returns null when there
 * isn't enough data for a specific recommendation.
 */
export function quickTip(entries: LogEntry[], summary: FootprintSummary): Recommendation | null {
  if (entries.length < 2 || summary.breakdown.length === 0) return null;

  const top = summary.breakdown[0]!;
  const cat = top.category;

  // Count occurrences per activity type within the top category.
  const countByType = new Map<string, number>();
  for (const e of entries) {
    const f = EMISSION_FACTORS[e.type];
    if (f && f.category === cat) {
      countByType.set(e.type, (countByType.get(e.type) ?? 0) + 1);
    }
  }

  let best: Recommendation | null = null;

  if (cat === "transport") {
    const autoRickshaw = countByType.get("auto_rickshaw") ?? 0;
    const carPetrol = countByType.get("car_petrol") ?? 0;
    const carDiesel = countByType.get("car_diesel") ?? 0;
    const carTotal = carPetrol + carDiesel;
    const flight = countByType.get("flight_domestic") ?? 0;

    if (flight > 0) {
      best = {
        title: "That flight is your biggest lever",
        detail: `You logged ${flight} domestic flight trip${flight > 1 ? "s" : ""}. For trips under ~1000 km, an AC train cuts emissions by over 90% — a single swap can save ~120 kg CO2e.`,
        category: "transport",
        estimatedSavingKg: 120,
      };
    } else if (autoRickshaw >= 3 && EMISSION_FACTORS["auto_rickshaw"]) {
      const autoFactor = EMISSION_FACTORS["auto_rickshaw"];
      const metroFactor = EMISSION_FACTORS["metro"];
      const saving = round((autoFactor.kgPerUnit - (metroFactor?.kgPerUnit ?? 0)) * 10);
      best = {
        title: "Try metro instead of auto-rickshaw",
        detail: `You've taken ${autoRickshaw} auto-rickshaw trips recently (${round(autoRickshaw * autoFactor.kgPerUnit * 10)} kg CO2e). Switching half of them to the metro could save ~${saving} kg — that's a big cut on travel.`,
        category: "transport",
        estimatedSavingKg: saving,
      };
    } else if (carTotal >= 3) {
      best = {
        title: "Share a ride or take the bus",
        detail: `You've logged ${carTotal} car trip${carTotal > 1 ? "s" : ""}. Carpooling with one other person halves your per-person footprint for those trips.`,
        category: "transport",
      };
    }
  } else if (cat === "energy") {
    const elec = countByType.get("electricity") ?? 0;
    if (elec >= 2) {
      best = {
        title: "Small AC tweak, big difference",
        detail: `You've logged electricity ${elec} times. Setting the AC to 24–26 °C instead of 20 °C can cut cooling energy by 10–15% — on India's coal-heavy grid each saved kWh avoids ~0.71 kg CO2e.`,
        category: "energy",
        estimatedSavingKg: 0.71,
      };
    }
  } else if (cat === "diet") {
    const mutton = countByType.get("meal_mutton") ?? 0;
    const chicken = countByType.get("meal_chicken") ?? 0;
    if (mutton > 0) {
      best = {
        title: "Swap one red-meat meal",
        detail: `You've had ${mutton} mutton meal${mutton > 1 ? "s" : ""} (${round(mutton * 3.5)} kg). Swapping just one for a vegetarian thali (0.6 kg) saves ~2.9 kg CO2e.`,
        category: "diet",
        estimatedSavingKg: 2.9,
      };
    } else if (chicken >= 3) {
      best = {
        title: "Try a plant-forward day",
        detail: `You've logged ${chicken} chicken/egg meal${chicken > 1 ? "s" : ""} (${round(chicken * 1.4)} kg). A veg thali day once a week cuts ~0.8 kg per meal swapped.`,
        category: "diet",
        estimatedSavingKg: 0.8,
      };
    }
  } else if (cat === "waste") {
    const waste = countByType.get("general_waste") ?? 0;
    if (waste >= 2) {
      best = {
        title: "Segregate your wet waste",
        detail: `You've logged waste ${waste} times. Composting kitchen waste avoids methane from landfills and can cut your waste footprint substantially.`,
        category: "waste",
        estimatedSavingKg: 0.4,
      };
    }
  } else if (cat === "goods") {
    best = {
      title: "One less new item",
      detail:
        "Shopping is your top category. Each new garment carries ~15 kg CO2e — buying second-hand or repairing avoids most of it.",
      category: "goods",
      estimatedSavingKg: 15,
    };
  }

  return best;
}
