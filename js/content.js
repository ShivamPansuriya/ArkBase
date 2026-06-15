/* content.js — loads the content manifest and individual day files. */
(function () {
  "use strict";
  const cache = { index: null, days: {} };

  async function getJSON(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
    return res.json();
  }

  async function loadIndex() {
    if (cache.index) return cache.index;
    const idx = await getJSON("content/index.json");
    // newest first
    idx.days = (idx.days || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    cache.index = idx;
    return idx;
  }

  async function loadDay(date) {
    if (cache.days[date]) return cache.days[date];
    const day = await getJSON(`content/days/${date}.json`);
    cache.days[date] = day;
    return day;
  }

  async function loadGlossary() {
    try { return await getJSON("content/topics/glossary.json"); }
    catch (_) { return { terms: [] }; }
  }

  // The most recent day in the manifest = "today's" lesson
  async function latestDay() {
    const idx = await loadIndex();
    return idx.days[0] || null;
  }

  window.Ark = window.Ark || {};
  window.Ark.content = { loadIndex, loadDay, loadGlossary, latestDay };
})();
