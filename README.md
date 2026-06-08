# Carbonara 🌱🇮🇳

**An India-focused Carbon Footprint Awareness Platform with a smart, context-aware assistant.**

Carbonara helps an individual in India *understand*, *track*, and *reduce* their
carbon footprint through simple daily actions and personalized, AI-assisted
insights. Built for **Challenge 3 — Carbon Footprint Awareness Platform**.

---

## 1. Chosen vertical

**Personal carbon footprint tracking & reduction, localized for India.**

Most footprint calculators use Western emission factors and benchmarks that
mislead Indian users. Carbonara is built around **Indian data and context**:

- India's grid is coal-heavy, so **electricity** carries a high factor
  (~0.71 kg CO₂/kWh, CEA) and is often the biggest lever.
- Transport reflects how India actually moves: **two-wheelers, auto-rickshaws,
  metro, Indian Railways**, and domestic flights.
- Diet uses **thali**-style meal options (veg / chicken / mutton / vegan).
- Benchmarks are India-aware: the average Indian (~**5.2 kg/day**) is already
  near the 1.5 °C **sustainable target** (~5.5 kg/day) and well below the global
  average (~11 kg/day). So the assistant motivates by **focusing on outliers**
  (flights, AC use, red meat) rather than guilt-tripping.

## 2. Approach and logic

The "smart assistant" is intentionally **two-layered** so it is both trustworthy
and genuinely intelligent:

1. **Deterministic rules engine (`src/lib/assistant.ts → recommend`)** — inspects
   the user's *actual* footprint summary, identifies the **dominant emission
   category** and biggest contributors, and selects targeted, quantified,
   India-relevant actions from a curated playbook. This is the *logical
   decision-making based on user context*, and it needs no network or API key.

2. **LLM narrative (Groq, `generateInsights`)** — wraps that context and the
   chosen actions into a prompt for **Groq** (`llama-3.3-70b-versatile`), which
   returns a warm, personalized message. If the key is missing or the API fails,
   it **gracefully falls back** to a deterministic message — the feature never
   breaks.

This separation means the recommendations are explainable and tested, while the
LLM adds a human, motivating voice on top.

## 3. How the solution works

```
Browser UI ──▶ Next.js API routes ──▶ emissions (India factors) ──▶ MongoDB / memory
                                   └─▶ Climatiq (live factors, optional)
                                   └─▶ assistant (rules + Groq)
```

- **Log an activity** → `POST /api/log` validates input (zod), prices it via
  **Climatiq** when configured (else built-in India factors), and stores it.
- **Dashboard** → `GET /api/footprint` aggregates entries into today's total,
  a category breakdown, and a benchmark comparison.
- **Get insights** → `POST /api/insights` builds the footprint summary and runs
  the assistant (rules + Groq) for a personalized plan.
- `GET /api/history` returns per-day totals for trend tracking.

### Tech stack
TypeScript end-to-end · **Next.js 15** (App Router, React UI + API routes) ·
**MongoDB** (official driver, cached client) · **Groq** LLM · **Climatiq** live
factors · **zod** validation · **Vitest** tests. Deployable to **Vercel** or
**Google Cloud Run**.

### Project layout
```
src/lib/        emissions.ts (factors+math), assistant.ts (rules+Groq),
                climatiq.ts (live factors), store.ts (Mongo+memory), types.ts
src/app/api/    activities, log, log/[id], footprint, history, insights
src/app/        layout.tsx, page.tsx, globals.css
src/components/ ActivityForm, FootprintDashboard, InsightsPanel
tests/          emissions.test.ts, assistant.test.ts
```

## 4. Getting started

```bash
npm install
cp .env.example .env.local   # fill in keys (all optional)
npm test                     # run the unit tests
npm run dev                  # http://localhost:3000
```

**Every integration is optional.** With no env vars the app runs fully on
built-in India factors, the rules-based assistant, and an in-memory store —
ideal for a quick review. Add keys to enable:

| Variable | Enables | If unset |
| --- | --- | --- |
| `GROQ_API_KEY` | AI-written insights | Rule-based insights |
| `CLIMATIQ_API_KEY` | Live emission factors | Built-in India factors |
| `MONGODB_URI` | Persistent storage | In-memory (per session) |

## 5. Security

- **No secrets in the repo.** Keys live only in git-ignored `.env.local`;
  `.env.example` ships placeholders.
- All API input is **validated with zod** at the boundary.
- Third-party calls (Climatiq) are time-boxed and **fail closed to safe
  fallbacks**; errors never leak internals to the client.
- No secrets are logged.

## 6. Testing

`npm test` (Vitest) covers the core logic: emission math and guard rails, the
`summarise` aggregation (totals, today, breakdown, top category, benchmark
ratio), the rules-engine prioritization, and the assistant's no-key fallback.

## 7. Accessibility

Semantic landmarks and headings, a skip link, fully labelled form controls,
`aria-live` status regions for async results, image-role text alternatives for
the progress bars, visible keyboard focus, AA-contrast colors, responsive
layout, and `prefers-reduced-motion` support.

## 8. Deployment

**Vercel (recommended):** import the repo, set `GROQ_API_KEY`, `CLIMATIQ_API_KEY`
and `MONGODB_URI` in Project → Settings → Environment Variables, deploy.

**Google Cloud Run:** `next build` then containerize (`node server` via
`next start`), or deploy with the Firebase/Next.js framework integration; set the
same env vars. Use **MongoDB Atlas** (free tier) for the database.

## 9. Assumptions

- Emission factors are **awareness-grade approximations** (sourced from CEA,
  India GHG Program, Our World in Data), not certified carbon accounting.
- Single-user demo: entries are global, not per-account (auth is out of scope).
- Climatiq `activity_id`s/units map cleanly for distance/energy/weight; meals and
  per-item goods always use built-in factors.
- "Today" is computed in the server's local timezone.

## Data sources

- **CEA** — CO₂ Baseline Database for the Indian Power Sector (grid factor)
- **India GHG Program** (WRI India / CII / TERI) — fuel & transport factors
- **Our World in Data** — per-food emission estimates
- **Climatiq** — optional live, region-aware emission factors
