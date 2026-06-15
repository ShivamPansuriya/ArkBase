# 📘 Arkbase — Education Standards Academy

A personal, **gamified, fact-sourced** knowledge-transfer app that keeps you current on **education-industry
standards and SIS domain knowledge** while you build [ManageArk](../ma2/manageark). Think *Duolingo for
education standards*: a fresh interactive lesson every day, with XP, streaks, badges, spaced repetition —
and **every factual claim links to a real source**.

Built to host **free** on Render's static tier (no server, no build step, no database).

---

## What's inside a daily lesson

Each day is one JSON file rendered as a Duolingo-style stepper:

- **Concept** cards (markdown, with sources)
- **MCQs** with instant feedback, explanations, and source links
- **Flow diagrams** (Mermaid) — e.g. how a term rollover works
- **Charts** (Chart.js) — only when there's real, sourced, same-unit data
- **Flashcards** (tap to flip)
- **From the News** — a recent, dated, sourced development
- **Key takeaways** + a **reflection** prompt tying it back to ManageArk

### Gamification (all stored in your browser, exportable)
XP + levels (*Curious Newcomer → Standards Sage*), daily **streak**, **badges**, per-domain **mastery**,
a 30-day XP chart, an accumulating **glossary**, and **spaced repetition** — questions you miss resurface
on a 1→2→4→9→21-day schedule under **Review**. Nothing is ever lost: **Settings → Export** saves all
progress to a JSON file you can re-import anywhere.

---

## Project layout

```
arkbase/
  index.html            # app shell (loads Mermaid + Chart.js + marked from CDN)
  styles.css            # single dark-theme stylesheet
  js/
    state.js            # progress, XP, levels, streak, badges, spaced repetition (localStorage)
    content.js          # loads the manifest + day files
    render.js           # activity renderers + lesson stepper + effects
    app.js              # router + pages (Today, Archive, Review, Progress, Glossary, Settings)
  content/
    index.json          # manifest of all days (auto-generated)
    days/YYYY-MM-DD.json # one lesson per day
    topics/glossary.json # accumulating glossary (auto-merged)
    schema/day.schema.json
  scripts/
    daily-kt-prompt.md  # ★ the instructions the daily loop follows (the "brain")
    validate-day.mjs    # guardrail: rejects a day with unsourced/ malformed content
    build-index.mjs     # regenerates index.json + merges glossary
    run-local.sh        # cron-friendly headless runner (optional)
  render.yaml           # Render static-site blueprint
```

---

## Run it locally

It fetches JSON, so use a static server (don't open via `file://`):

```bash
cd arkbase
python3 -m http.server 8080      # then open http://localhost:8080
```

---

## Deploy free on Render

1. Push this folder to a GitHub repo.
2. Render → **New + → Static Site** → connect the repo.
3. **Build Command:** leave empty · **Publish Directory:** `.` · **Auto-Deploy:** On.
   (Or just commit `render.yaml` and use **New + → Blueprint**.)
4. Every `git push` to the repo redeploys automatically — which is exactly how the daily loop ships
   new lessons.

---

## The daily loop (local cron + `/loop`)

The **brain** of the loop is [`scripts/daily-kt-prompt.md`](scripts/daily-kt-prompt.md). It enforces a
**facts-only, zero-false-positive** contract: every claim needs a real source it actually retrieved,
non-obvious claims need two sources, stats are dated, ambiguous terms (like "SBC") are flagged not
guessed, and `validate-day.mjs` blocks any day whose factual cards lack sources.

### Option A — interactive `/loop`
Open Claude Code **in this folder** and run:

```
/loop 24h Follow scripts/daily-kt-prompt.md to generate, validate, and push today's Arkbase KT.
```

Each firing researches a fresh topic, writes the day file, validates, rebuilds the manifest, commits,
and pushes → Render redeploys. (Leave the session running; interrupt anytime.)

### Option B — cron (unattended, optional)
```bash
chmod +x scripts/run-local.sh
crontab -e
# 08:30 every day:
30 8 * * *  /home/shivam-pansuriya/Documents/arkbase/scripts/run-local.sh >> "$HOME/.arkbase-loop.log" 2>&1
```
`run-local.sh` has Claude author *only* the day file headless, then the **shell** validates +
build-indexes + commits, so a malformed or unsourced lesson never reaches `main`.

### Backfill / test a day by hand
```bash
node scripts/validate-day.mjs 2026-06-15   # check a file
node scripts/build-index.mjs               # rebuild manifest + glossary
```

---

## The facts contract (why you can trust it)

- **No claim without a retrieved source.** Concepts, MCQs, charts, and news all require `sources`/
  `source.url`; `validate-day.mjs` fails the build otherwise.
- **Two-source rule** for versions, dates, stats, and "who governs X".
- **Dated statistics** are labeled historical, never presented as current.
- **Ambiguity is surfaced**, not hidden (the very first seed lesson does this with "SBC").

Seed content was generated from verified 2026 sources (1EdTech OneRoster v1.2, Ed-Fi Data Standard
v6.1 / ODS-API v7.3.2 and the May 2026 Ed-Fi OneRoster Service, CEDS/NCES, and named university
registrar pages).
