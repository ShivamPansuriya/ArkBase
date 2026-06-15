# Arkbase — Daily Knowledge-Transfer Generator

You are generating **one** daily Knowledge Transfer (KT) lesson for Arkbase, a personal learning app
that keeps a Student Information System (SIS) engineer current on **education-industry standards and
domain knowledge**. The reader is building **ManageArk**, an enterprise, cloud-native SIS for
universities (competing with Ellucian Banner, Workday Student, PeopleSoft, Oracle Student Cloud).

Run this whole file as ONE loop iteration. Produce a single new day file, verify it, rebuild the
manifest, and commit. Then stop.

---

## 0) NON-NEGOTIABLE RULES — facts only, zero false positives

These rules outrank everything below. A wrong "fact" in this app is worse than a missing one.

1. **Every factual claim must trace to a real source you actually retrieved this run.** Capture the
   source **title + URL + publication date**. If you cannot verify a claim against a real page,
   **delete the claim**. Never write a URL you did not open.
2. **Two-source rule for non-obvious claims.** Version numbers, dates, statistics, "X is the latest",
   adoption figures, and "who governs X" need **two independent sources** or get cut. If two good
   sources conflict, present the disagreement honestly or drop it.
3. **Label every statistic with its date and source.** Never present a 2019 figure as "current".
4. **Handle ambiguity out loud.** If an acronym or term has no single authoritative meaning (e.g.
   "SBC"), say so explicitly and cite the most relevant interpretation. Do not manufacture certainty.
5. **No fabricated quotes, no invented org names, no guessed API field names.** Prefer **primary /
   official** sources (standards bodies, vendor docs, government/registrar pages) over blogs.
6. **MCQ answers must be unambiguously correct** and the distractors clearly wrong, with the
   explanation grounded in the cited source.
7. **Avoid US-only blind spots.** US standards dominate, but note where something is region-specific
   (e.g., FERPA is US; GDPR is EU) instead of implying it's universal.

If after research you cannot responsibly fill an activity, **omit that activity** — a shorter, correct
lesson beats a padded, shaky one.

---

## 1) Choose today's topic

- Read `content/index.json` and the last ~14 files in `content/days/` to see what's been covered.
  **Do not repeat a topic** already taught in the last two weeks; pick an adjacent or deeper angle.
- Rotate **domains** and vary **difficulty** (`intro` / `core` / `advanced`) day to day.
- Prefer a topic where something is **genuinely current** (a recent spec release, ruling, or report).

### Curriculum bank (draw from these; go deeper over time)
- **Interoperability standards:** OneRoster, Ed-Fi, CEDS, LTI (Learning Tools Interoperability),
  Caliper Analytics, QTI, SIF, CLR / Open Badges, PESC (higher-ed transcripts/EDI).
- **Registrar operations:** term rollover, course catalog vs section, registration & enrollment,
  holds, prerequisites & co-requisites, degree audit, articulation/transfer, transcripts,
  **credit hours / Carnegie unit**, SCED course codes, academic calendar.
- **Grading & assessment:** gradebook models, GPA calculation, standards-based & competency-based
  grading, grade scales, incompletes, grade changes & audit.
- **Compliance & privacy:** FERPA, Clery Act, IPEDS reporting, Title IV / financial aid lifecycle,
  FAFSA / ISIR, accreditation, GDPR (for international students).
- **Admissions & student lifecycle:** application → admit → matriculate → enroll → graduate; SLATE/
  CRM patterns; residency; orientation.
- **Identity, access & architecture:** SSO (SAML / OIDC), RBAC / ReBAC / ABAC, OpenFGA, multi-tenancy
  (schema-per-tenant), event-driven SIS patterns, data privacy by design. (Tie to ManageArk's stack.)
- **Sector news & trends:** ed-tech interoperability moves, regulatory changes, major vendor releases.

---

## 2) Research (use real tools)

Use the available web tools (WebSearch, Exa, Firecrawl, Context7 for specs) to gather and **open**
sources. For each claim you intend to teach, note the exact source URL + date. Favor:
standards-body specs (1edtech.org, imsglobal.org, ed-fi.org/docs, ceds.ed.gov, pesc.org),
government (ed.gov, nces.ed.gov), and named university registrar pages. Keep a short evidence list as
you go; you'll need it to fill the `sources` arrays.

---

## 3) Author `content/days/YYYY-MM-DD.json`

Write today's date (UTC). Follow `content/schema/day.schema.json` exactly. Shape:

```
{
  "date","title","domain","difficulty","summary","estimatedMinutes","xp",
  "activities":[ ... 7–11 items, mixed types ... ],
  "glossary":[ {term,definition,sources?} ... ],
  "reflection":"a question tying today's topic to building ManageArk"
}
```

Aim for a varied, well-paced lesson (about 8–12 minutes). A good day usually has:
- **2–3 `concept`** cards (each with `markdown` + `sources`). Markdown may use **bold**, lists, `code`.
- **3–5 `mcq`** cards (`question`, 4 `options`, `answerIndex`, `explanation`, `sources`, stable `id`).
- **1 `diagram`** (`mermaid` — a real flowchart that teaches a process). **Make it an animated,
  step-by-step walkthrough:** give each main node a **simple id** (letters/digits only, no spaces or
  hyphens — e.g. `A`, `B`, `C`, or `SIS`, `LMS`) and add a **`steps`** array that walks the nodes
  along the main path in order:
  ```
  "steps": [
    { "node": "A", "title": "Short step name", "caption": "One sentence explaining this step." },
    { "node": "B", "title": "...", "caption": "..." }
  ]
  ```
  The app highlights each node (and the edge into it) in sequence with a Play/Prev/Next control. List
  steps in the order a reader should follow the flow; keep node ids matching the mermaid exactly.
- **1 `chart`** ONLY if you have **real, same-unit numeric data with a source**; otherwise skip it
  (do not invent numbers). Provide a Chart.js `config` in `chart` + a `caption` noting the source/date.
- **1–2 `flashcard`** (`front`/`back`).
- **1 `news`** — a **recent (this year)** development with `headline`, `summary`, `date`, `source{title,url}`.
  If you can't verify a recent item, omit the news card rather than reuse a stale one.
- **1 `takeaways`** (`items`) as the closer.

Set `xp` ~80–140 by depth. Add **3–6 glossary terms** with crisp definitions (cite the factual ones).
Write a `reflection` that connects the topic to a concrete ManageArk design decision.

Mermaid note: escape newlines as `\n` inside the JSON string; keep node labels short.

---

## 4) Self-verification (do this before validating)

Re-read the finished file and check, line by line:
- [ ] Every `concept`, `mcq`, `chart` has a non-empty `sources` array with real `https://` URLs you opened.
- [ ] Every `news` has a working `source.url` and a real date.
- [ ] Each MCQ's `answerIndex` is correct and the explanation matches its sources.
- [ ] No invented stats, versions, dates, URLs, or quotes. Dated stats are labeled as historical.
- [ ] Ambiguities are flagged, not papered over.
- [ ] Valid JSON (no trailing commas, properly escaped strings).

Cut anything you can't stand behind.

---

## 5) Validate, build, commit

Run, from the repo root:

```
node scripts/validate-day.mjs YYYY-MM-DD      # fix until it passes (it enforces the sources rule)
node scripts/build-index.mjs                  # regenerates content/index.json + merges glossary
git add content && git commit -m "kt: YYYY-MM-DD <short title>" && git push
```

If `validate-day.mjs` fails, fix the file — do **not** weaken the validator. After push, Render
auto-deploys the static site. Then stop; you're done for today.
