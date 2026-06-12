# Carbonara 🌱🇮🇳

**An India-focused Carbon Footprint Awareness Platform with a smart, context-aware assistant.**

Carbonara helps an individual in India *understand*, *track*, and *reduce* their
carbon footprint through simple daily actions and personalized, AI-assisted
insights. Built for **Challenge 3 — Carbon Footprint Awareness Platform**.

---

## Table of contents

1. [Chosen vertical](#1-chosen-vertical)
2. [Approach and logic](#2-approach-and-logic)
3. [How the solution works](#3-how-the-solution-works)
4. [Feature tour](#4-feature-tour)
5. [Getting started](#5-getting-started)
6. [Configuration](#6-configuration)
7. [API reference](#7-api-reference)
8. [Security](#8-security)
9. [Testing](#9-testing)
10. [Accessibility](#10-accessibility)
11. [Internationalization](#11-internationalization)
12. [Deployment](#12-deployment)
13. [Assumptions & limitations](#13-assumptions--limitations)
14. [Data sources](#14-data-sources)

## 1. Chosen vertical

**Personal carbon footprint tracking & reduction, localized for India.**

Most footprint calculators use Western emission factors and benchmarks that
mislead Indian users. Carbonara is built around **Indian data and context**:

- India's grid is coal-heavy, so **electricity** carries a high factor
  (~0.71 kg CO₂/kWh national average, CEA) and is often the biggest lever.
  Carbonara goes further and prices electricity by **regional grid**: the user's
  state maps to one of India's five grids (NR/WR/SR/ER/NER), each with its own
  CEA-derived intensity — hydro-rich North East ≠ coal-heavy West.
- Transport reflects how India actually moves: **two-wheelers, auto-rickshaws,
  metro, city buses, Indian Railways**, and domestic flights.
- Diet uses **thali**-style meal options (veg / chicken / mutton / vegan).
- Benchmarks are India-aware and **live**: per-capita figures for India and the
  world are fetched from Our World in Data daily, so the comparison stays
  current. The average Indian (~5.2 kg/day) is already near the 1.5 °C
  **sustainable target** (~5.5 kg/day) and well below the global average
  (~11 kg/day) — so the assistant motivates by **focusing on outliers**
  (flights, AC use, red meat) rather than guilt-tripping.
- Abstract kilograms are translated into **relatable Indian equivalents**
  (autorickshaw kilometres, ceiling-fan hours, trees needed) so the numbers land.

## 2. Approach and logic

The "smart assistant" is intentionally **two-layered** so it is both trustworthy
and genuinely intelligent:

1. **Deterministic rules engine (`src/lib/assistant.ts → recommend`)** — inspects
   the user's *actual* footprint summary, identifies the **dominant emission
   category** and biggest contributors, and selects targeted, quantified,
   India-relevant actions from a curated playbook. This is the *logical
   decision-making based on user context*, and it needs no network or API key.
   It is fully unit-tested and its output is explainable.

2. **LLM narrative (Groq, `generateInsights` / `chatReply`)** — wraps that
   context (footprint summary, profile answers, the engine's chosen actions)
   into a prompt for **Groq** (`llama-3.3-70b-versatile`), which returns a warm,
   personalized message or a conversational chat reply. If the key is missing or
   the API fails, both **gracefully fall back** to deterministic output — the
   feature never breaks.

This separation means the recommendations are explainable and tested, while the
LLM adds a human, motivating voice on top.

### Key design principle: graceful degradation

Every external dependency is optional and **fails closed to a safe fallback**,
so the app runs end-to-end for a reviewer with **zero keys configured**:

| Missing | Fallback |
| --- | --- |
| `GROQ_API_KEY` | Deterministic rules-engine insights & chat |
| `MONGODB_URI` | In-memory store (resets on restart, banner shown) |
| `CARBON_INTERFACE_API_KEY` | Built-in India emission factors |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Guest sign-in only |
| `SESSION_SECRET` | Ephemeral per-process secret |
| OWID unreachable | Static India/world benchmarks |
| Unknown state for grid lookup | National-average grid intensity |

## 3. How the solution works

```
Browser UI ──▶ Next.js API routes ──▶ emissions (India factors + regional grid)
                                   ├─▶ store / users / routines / pledges ──▶ MongoDB or memory
                                   ├─▶ assistant (rules engine + Groq LLM)
                                   ├─▶ OWID live per-capita benchmarks (24h cache)
                                   ├─▶ Carbon Interface live factors (optional)
                                   └─▶ Google OAuth / guest sessions (HMAC cookies)
```

### Tech stack

TypeScript end-to-end · **Next.js 15** (App Router, React 19 UI + API routes) ·
**MongoDB** (official driver, cached client) · **Groq** LLM · **Our World in
Data** live benchmarks · **Carbon Interface** live factors (optional) ·
**Google Identity Services** sign-in (guest fallback) · **zod** validation ·
**Vitest** tests. `tsconfig` runs `strict` + `noUncheckedIndexedAccess`.
Deployable to **Vercel** or **Google Cloud Run**.

### Project layout

```
src/lib/
  emissions.ts    India emission factors, calculate(), summarise(), date helpers
  grid.ts         state → regional grid (NR/WR/SR/ER/NER) electricity intensity
  assistant.ts    recommend() rules engine, generateInsights(), chatReply()
  equivalents.ts  kg CO₂e → relatable Indian equivalents (auto-km, fan-hours…)
  whatif.ts       habit-swap simulator, grounded in the user's logged history
  challenges.ts   weekly challenge catalog + pure pledge evaluation
  owid.ts         live OWID per-capita benchmarks (24h cache, static fallback)
  liveFactors.ts  Carbon Interface live pricing (never throws; null = fallback)
  summary.ts      loadSummary(): entries + live benchmarks → FootprintSummary
  logEntry.ts     shared entry-creation pipeline (validation, pricing, storage)
  db.ts           shared Mongo connection (null → memory fallback)
  store.ts        per-user EntryStore (Mongo + in-memory)
  users.ts        UserStore + toSafeUser()
  routines.ts     saved one-tap activity bundles (per-user store)
  pledges.ts      challenge pledge store (per-user)
  auth.ts         HMAC-SHA256-signed session tokens (pure, unit-tested)
  session.ts      cookie plumbing: getSessionUser / attach / clearSession
  google.ts       Google ID-token verification (tokeninfo + audience check)
  i18n.ts         typed translate() over 5 locale dictionaries
  messages/       en, hi (hand-curated), bn, gu, ta (generated, committed)
  types.ts        shared types + zod schemas

src/app/api/      activities, log, log/[id], footprint, history, insights,
                  chat, challenges, routines, routines/[id], routines/[id]/log,
                  auth/{guest,google,logout,me}
src/app/          layout.tsx, page.tsx, profile/page.tsx, globals.css
src/components/   Onboarding, ActivityForm, FootprintDashboard, TrendChart,
                  MonthCalendar, WeekDelta, StreakBadge, InsightsPanel,
                  Chatbot, WhatIfPanel, ChallengesPanel, RoutinesCard,
                  LocaleProvider, profileOptions
scripts/          check-db.mjs (Mongo smoke test), translate.mjs (build-time i18n)
tests/            14 Vitest suites, 147 tests (see §9)
```

## 4. Feature tour

- **Onboarding** — mobile-first stepper (welcome → name → commute → diet →
  sign-in). All profile questions are optional; answers personalize the LLM
  context. Google Sign-In or one-tap guest login.
- **Activity logging** — pick an activity (travel / electricity / meals /
  waste / shopping), enter a quantity, get the CO₂e instantly. Supports
  **backfill** onto past days (up to 366 days; future dates rejected).
- **Dashboard** — today's total vs your target with a progress bar, category
  breakdown, benchmark comparison (live OWID India/world figures), relatable
  equivalents, entry list with delete, and **CSV export**.
- **Trend chart** — 30-day SVG chart: daily bars + 7-day moving average +
  target reference line.
- **Month calendar** — green/amber/red day grid vs the sustainable target.
  Tap a day to inspect, delete, or backfill entries.
- **Streaks & week delta** — current/best logging streak and a this-week vs
  last-week percentage to reinforce the habit loop.
- **Insights** — one tap builds your footprint summary and returns a
  personalized reduction plan (rules engine + optional Groq narrative).
- **Chatbot** — floating widget that answers footprint questions in context
  ("what's my biggest source?", "how do I cut it?"); works with or without
  the LLM key.
- **What-if simulator** — pick a habit swap (car → metro, AC discipline,
  mutton → veg…) and see the projected yearly kg CO₂e saved, computed from
  *your own* logged volumes when available (assumed averages otherwise), and
  priced with your regional grid for electric swaps.
- **Weekly challenges** — pledge an India-relevant action for a Mon–Sun week
  ("no two-wheeler week", "metro commute"); completion is judged automatically
  from what actually gets logged, with guards against vacuous passes, and
  shows estimated kg avoided.
- **Routines** — save recurring activity bundles ("daily commute") and log
  them with one tap.
- **Profile** — edit name, commute, diet, household, state (drives the grid
  factor), language, and a personal daily target.
- **Language switcher** — English, हिंदी, বাংলা, ગુજરાતી, தமிழ் (see §11).

## 5. Getting started

Requires **Node ≥ 18.17**.

```bash
npm install
cp .env.example .env.local   # optional — fill in keys, all are optional
npm test                     # 147 unit tests, must stay green
npm run dev                  # http://localhost:3000
```

**Zero-config review:** with no env vars at all, the app runs fully on built-in
India factors, the rules-based assistant, guest sign-in, and an in-memory store.

Other commands:

```bash
npm run build                # production build (must pass before deploy)
npm run lint                 # ESLint, zero warnings allowed
npm run test:watch           # Vitest in watch mode
node --env-file=.env.local scripts/check-db.mjs   # MongoDB connectivity smoke test
```

## 6. Configuration

All variables are optional; see `.env.example` for inline documentation.

| Variable | Enables | If unset |
| --- | --- | --- |
| `GROQ_API_KEY` | AI-written insights + chat ([get a key](https://console.groq.com/keys)) | Rule-based insights & chat |
| `GROQ_MODEL` | Override the model | `llama-3.3-70b-versatile` |
| `MONGODB_URI` | Persistent storage (Atlas free tier works) | In-memory (resets on restart) |
| `MONGODB_DB` | Database name | `carbonara` |
| `SESSION_SECRET` | Stable session signing across restarts (`openssl rand -hex 32`) | Ephemeral per-process secret |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google Sign-In button | Guest sign-in only |
| `CARBON_INTERFACE_API_KEY` | Live electricity factors | Built-in India factors |
| `CARBON_INTERFACE_COUNTRY` | Country for live estimates | `in` |
| `GOOGLE_TRANSLATE_API_KEY` | Build-time only: regenerate locale files via `scripts/translate.mjs` | Not needed (translations are committed) |

**MongoDB Atlas note:** when deploying to Vercel/Cloud Run (dynamic egress IPs),
add `0.0.0.0/0` to the Atlas **Network Access** IP list and rely on strong
database credentials + TLS; scope the DB user to read/write on the app database
only.

## 7. API reference

All data routes require a session cookie (**401** otherwise) and scope every
read/write by the session's `userId` — the client is never trusted with one.
All bodies are zod-validated (**400** with field errors on failure).

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/guest` | POST | Create a guest user + session |
| `/api/auth/google` | POST | Verify a Google ID token, sign in/up |
| `/api/auth/me` | GET / PATCH | Current user; update profile (name, state, diet, locale, target…) |
| `/api/auth/logout` | POST | Clear the session cookie |
| `/api/activities` | GET | Activity catalog with grid-adjusted factors for the user's state |
| `/api/log` | POST | Log an activity (optional `date` for backfill) |
| `/api/log/[id]` | DELETE | Delete one of the user's entries |
| `/api/footprint` | GET | Entries + summary: today's total, breakdown, live benchmarks. Accepts `?today=YYYY-MM-DD` for timezone-correct roll-up |
| `/api/history` | GET | Per-day totals (drives the trend chart, calendar, streaks, week delta) |
| `/api/insights` | POST | Personalized reduction plan (rules + optional LLM) |
| `/api/chat` | POST | Conversational assistant over the user's footprint |
| `/api/challenges` | GET / POST | Weekly challenge catalog + statuses; pledge a challenge (evaluation runs on GET) |
| `/api/routines` | GET / POST | List / save activity bundles |
| `/api/routines/[id]` | DELETE | Delete a routine |
| `/api/routines/[id]/log` | POST | Log a routine's entries in one tap |

## 8. Security

- **No secrets in the repo.** Keys live only in git-ignored `.env.local`;
  `.env.example` ships placeholders.
- **Sessions** are HMAC-SHA256-signed tokens in an `httpOnly`, `SameSite=Lax`,
  Secure-in-production cookie with a 30-day TTL; verification is constant-time.
- **Google sign-in** is verified **server-side** (token signature + audience
  check against the client id) — the client's word is never trusted.
- Every store operation takes the authenticated `userId`; no cross-user reads
  or deletes are possible.
- All API input is **validated with zod** at the boundary; dates are
  range-checked (≤ 1 day future, ≤ 366 days past).
- Third-party calls (Groq, Carbon Interface, OWID) are time-boxed and **fail
  closed to safe fallbacks**; their errors never leak internals to the client.
- No secrets are logged; `scripts/check-db.mjs` never prints credentials.

## 9. Testing

`npm test` runs **147 tests across 14 Vitest suites**, covering: emission math
and guard rails; `summarise()` aggregation (totals, today, breakdown, top
category, benchmark ratio); date handling and backfill validation; regional
grid lookup; relatable equivalents; the rules-engine prioritization and no-key
LLM fallbacks; what-if projections; challenge evaluation (including the
anti-gaming guards); the entry/user/routine/pledge stores; HMAC session
round-trips and tamper rejection; and zod boundary validation.

Tests are deterministic and offline: `summarise()` accepts an explicit `today`
date, and stores fall back to memory, so no network or database is needed.

## 10. Accessibility

Semantic landmarks and headings, a skip link, fully labelled form controls,
`aria-live` status regions for async results, text alternatives for the
progress bars and charts, visible keyboard focus, AA-contrast colors,
responsive mobile-first layout, and `prefers-reduced-motion` support.

## 11. Internationalization

The UI ships in **English, Hindi, Bengali, Gujarati, and Tamil** via a
lightweight typed dictionary (`src/lib/i18n.ts`, zero runtime dependencies).
`en.json` is the source of truth and Hindi is hand-curated; the other locales
are machine-generated at build time (`scripts/translate.mjs`, Google Cloud
Translation) and **committed**, so no key or network is needed at runtime.
Missing keys fall back to English. The assistant's narrative layer (insights +
chat) is bilingual (English/Hindi), matching the profile's language options;
documented as a tradeoff in `i18n.ts`.

## 12. Deployment

**Vercel (recommended):** import the repo, set the env vars from §6 in
Project → Settings → Environment Variables, deploy. No other config needed.

**Google Cloud Run:** `next build`, containerize with `next start` (or use a
framework integration), set the same env vars.

For either platform use **MongoDB Atlas** (free tier) with `0.0.0.0/0` network
access (see §6) and verify connectivity with `scripts/check-db.mjs`.

## 13. Assumptions & limitations

- Emission factors are **awareness-grade approximations** (CEA, India GHG
  Program, Our World in Data), not certified carbon accounting; each factor
  carries a `source` tag in `emissions.ts`.
- Regional grid factors are CEA **regional weighted averages**, not plant-level
  data; unknown state falls back to the national average.
- Challenge completion is inferred from **self-reported logs**; guards make a
  vacuous pass harder, not impossible — the UI says so.
- `LogEntry.date` (YYYY-MM-DD) is the **user's local calendar day**, stored
  explicitly alongside the UTC `createdAt`. This avoids the timezone bug where
  an IST entry logged after midnight lands on the wrong day; the dashboard
  passes `?today=` so "today" is computed in the user's timezone. Legacy
  entries are normalised on read.
- Carbon Interface (when configured) prices the electricity activity; all
  other activities use built-in India factors.
- The in-memory fallback store is per-process: fine for review, not for
  multi-instance production (use MongoDB there).

## 14. Data sources

- **CEA** — CO₂ Baseline Database for the Indian Power Sector (national +
  regional grid factors)
- **India GHG Program** (WRI India / CII / TERI) — fuel & transport factors
- **Our World in Data** — per-food emission estimates and live per-capita
  benchmarks ([co2-emissions-per-capita](https://ourworldindata.org/grapher/co2-emissions-per-capita))
- **Carbon Interface** — optional live emission factors (electricity)
