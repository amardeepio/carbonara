#!/usr/bin/env node
/**
 * Build-time translation generator.
 *
 * Reads src/lib/messages/en.json (the source of truth) and fills in the
 * other locale files via the Google Cloud Translation v2 API. Only missing
 * or empty keys are translated, so hand-curated translations (e.g. hi.json)
 * are never overwritten. The generated files are committed — the app needs
 * no key and no network at runtime.
 *
 * Usage:
 *   GOOGLE_TRANSLATE_API_KEY=... node scripts/translate.mjs [--force] [locales…]
 *   npm run translate            # reads the key from .env.local
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = join(root, "src/lib/messages");

/** Locales generated from English. Hindi is hand-curated; the script only fills gaps. */
const ALL_TARGETS = ["hi", "bn", "gu", "ta"];

// --- resolve the API key (env var, else .env.local) -------------------------
function loadEnvLocal() {
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY || loadEnvLocal().GOOGLE_TRANSLATE_API_KEY;
if (!apiKey) {
  console.error("GOOGLE_TRANSLATE_API_KEY is not set (env or .env.local). Nothing to do.");
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const requested = args.filter((a) => !a.startsWith("--"));
const targets = requested.length > 0 ? requested : ALL_TARGETS;

const en = JSON.parse(readFileSync(join(messagesDir, "en.json"), "utf8"));
const keys = Object.keys(en);

/**
 * Translate placeholders safely: wrap `{var}` in <span translate="no"> via
 * the HTML format so Google leaves them intact, then unwrap.
 */
function protect(text) {
  return text.replace(/\{[a-zA-Z0-9_]+\}/g, (m) => `<span translate="no">${m}</span>`);
}
function unprotect(text) {
  return (
    text
      .replace(/<span translate="no">/g, "")
      .replace(/<\/span>/g, "")
      // The HTML format entity-encodes a handful of characters; undo them.
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<")
      .replace(/&amp;/g, "&")
  );
}

async function translateBatch(texts, target) {
  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: texts.map(protect), source: "en", target, format: "html" }),
    },
  );
  if (!res.ok) {
    throw new Error(`Translate API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return data.data.translations.map((t) => unprotect(t.translatedText));
}

const BATCH = 100;

for (const target of targets) {
  const file = join(messagesDir, `${target}.json`);
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const missing = keys.filter((k) => force || !existing[k]);

  if (missing.length === 0) {
    console.log(`${target}: complete (${keys.length} keys), nothing to translate`);
    continue;
  }

  console.log(`${target}: translating ${missing.length} of ${keys.length} keys…`);
  const out = { ...existing };
  for (let i = 0; i < missing.length; i += BATCH) {
    const slice = missing.slice(i, i + BATCH);
    const translated = await translateBatch(
      slice.map((k) => en[k]),
      target,
    );
    slice.forEach((k, idx) => {
      out[k] = translated[idx];
    });
  }

  // Keep the file in en.json key order for stable diffs.
  const sorted = {};
  for (const k of keys) if (out[k]) sorted[k] = out[k];
  writeFileSync(file, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`${target}: wrote ${Object.keys(sorted).length} keys to ${file}`);
}
