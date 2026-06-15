#!/usr/bin/env node
/* validate-day.mjs — structural + "no false positives" validator for a day file.
   Usage: node scripts/validate-day.mjs [YYYY-MM-DD]   (defaults to today, UTC)
   Exits non-zero on any error. Enforces that factual activities carry real source URLs. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const path = join(root, "content", "days", `${date}.json`);

const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

const isHttp = (u) => typeof u === "string" && /^https?:\/\//.test(u);
function checkSources(arr, where) {
  if (!Array.isArray(arr) || arr.length === 0) { err(`${where}: missing sources[]`); return; }
  arr.forEach((s, i) => {
    if (!s || !isHttp(s.url)) err(`${where}: source[${i}] needs a real https:// url`);
    if (!s || !s.title) warn(`${where}: source[${i}] has no title`);
  });
}

let day;
try {
  day = JSON.parse(readFileSync(path, "utf8"));
} catch (e) {
  console.error(`✗ Cannot read/parse ${path}\n  ${e.message}`);
  process.exit(1);
}

if (day.date !== date) err(`top: "date" (${day.date}) must equal ${date}`);
for (const f of ["title", "domain", "difficulty", "summary"]) {
  if (!day[f] || typeof day[f] !== "string") err(`top: missing "${f}"`);
}
if (!["intro", "core", "advanced"].includes(day.difficulty)) err(`top: difficulty must be intro|core|advanced`);
if (!Array.isArray(day.activities) || day.activities.length < 3) err(`top: need >= 3 activities`);

const KNOWN = ["concept", "mcq", "diagram", "chart", "flashcard", "news", "takeaways"];
(day.activities || []).forEach((a, i) => {
  const at = `activity[${i}] (${a && a.type})`;
  if (!a || !KNOWN.includes(a.type)) { err(`${at}: unknown/missing type`); return; }
  switch (a.type) {
    case "concept":
      if (!a.markdown) err(`${at}: missing markdown`);
      checkSources(a.sources, at);
      break;
    case "mcq":
      if (!a.question) err(`${at}: missing question`);
      if (!Array.isArray(a.options) || a.options.length < 2) err(`${at}: need >= 2 options`);
      if (typeof a.answerIndex !== "number" || a.answerIndex < 0 || a.answerIndex >= (a.options || []).length)
        err(`${at}: answerIndex out of range`);
      if (!a.explanation) err(`${at}: missing explanation`);
      checkSources(a.sources, at);
      break;
    case "diagram":
      if (!a.mermaid) err(`${at}: missing mermaid`);
      if (a.steps !== undefined) {
        if (!Array.isArray(a.steps) || !a.steps.length) err(`${at}: steps must be a non-empty array when present`);
        else a.steps.forEach((st, si) => {
          if (!st || typeof st.node !== "string" || !st.node) err(`${at}: steps[${si}] needs a string "node" id`);
        });
      }
      break;
    case "chart":
      if (!a.chart || !a.chart.type || !a.chart.data) err(`${at}: missing chart.{type,data}`);
      checkSources(a.sources, at);
      break;
    case "flashcard":
      if (!a.front || !a.back) err(`${at}: missing front/back`);
      break;
    case "news":
      if (!a.headline || !a.summary) err(`${at}: missing headline/summary`);
      if (!a.source || !isHttp(a.source.url)) err(`${at}: news needs source.url (https://)`);
      if (!a.date) warn(`${at}: news has no date`);
      break;
    case "takeaways":
      if (!Array.isArray(a.items) || !a.items.length) err(`${at}: need items[]`);
      break;
  }
});

const types = (day.activities || []).map((a) => a && a.type);
if (!types.includes("mcq")) warn("no mcq activity — lessons are better with questions");
(day.glossary || []).forEach((g, i) => {
  if (!g.term || !g.definition) err(`glossary[${i}]: needs term + definition`);
});

if (warns.length) console.warn("⚠ " + warns.join("\n⚠ "));
if (errors.length) {
  console.error(`\n✗ ${date} INVALID (${errors.length} error(s)):\n  - ` + errors.join("\n  - "));
  process.exit(1);
}
console.log(`✓ ${date} valid — ${day.activities.length} activities, ${(day.glossary || []).length} glossary terms.`);
