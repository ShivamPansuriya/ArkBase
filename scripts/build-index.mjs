#!/usr/bin/env node
/* build-index.mjs — regenerate content/index.json from day files, and merge each day's
   glossary into content/topics/glossary.json (existing definitions are preserved).
   Usage: node scripts/build-index.mjs */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const daysDir = join(root, "content", "days");
const indexPath = join(root, "content", "index.json");
const glossaryPath = join(root, "content", "topics", "glossary.json");

const files = readdirSync(daysDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));

const days = [];
const newTerms = [];
for (const f of files) {
  let d;
  try { d = JSON.parse(readFileSync(join(daysDir, f), "utf8")); }
  catch (e) { console.error(`skip ${f}: ${e.message}`); continue; }
  days.push({
    date: d.date,
    title: d.title,
    domain: d.domain || "",
    difficulty: d.difficulty || "core",
    xp: d.xp || 0,
    estimatedMinutes: d.estimatedMinutes || 10,
  });
  (d.glossary || []).forEach((g) => { if (g && g.term && g.definition) newTerms.push(g); });
}
days.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

writeFileSync(indexPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  days,
  topics: [],
}, null, 2) + "\n");

// merge glossary (keep earliest/existing definition for a term)
let glossary = { updatedAt: "", terms: [] };
try { glossary = JSON.parse(readFileSync(glossaryPath, "utf8")); } catch (_) {}
const byTerm = new Map(glossary.terms.map((t) => [t.term.toLowerCase(), t]));
let added = 0;
for (const t of newTerms) {
  const key = t.term.toLowerCase();
  if (!byTerm.has(key)) { byTerm.set(key, t); added++; }
}
const merged = [...byTerm.values()].sort((a, b) => a.term.localeCompare(b.term));
writeFileSync(glossaryPath, JSON.stringify({
  updatedAt: new Date().toISOString().slice(0, 10),
  terms: merged,
}, null, 2) + "\n");

console.log(`✓ index.json: ${days.length} day(s). glossary.json: ${merged.length} term(s) (+${added} new).`);
