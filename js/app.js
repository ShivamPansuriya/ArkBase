/* app.js — router, pages, init, HUD. */
(function () {
  "use strict";
  const S = () => window.Ark.state;
  const C = () => window.Ark.content;
  const U = () => window.Ark.ui;
  const view = document.getElementById("view");
  let allDays = []; // manifest day list, cached for the unread-archive badge

  // ---------- HUD ----------
  function refreshHud() {
    const st = S();
    const li = st.levelInfo();
    document.getElementById("hud-xp").textContent = st.data.xp;
    document.getElementById("hud-level").textContent = li.level;
    document.getElementById("hud-level-title").textContent = li.title;
    document.getElementById("hud-xp-fill").style.width = li.pct + "%";
    document.getElementById("hud-streak").textContent = st.data.streak.current;
    const flame = document.getElementById("hud-flame");
    flame.classList.toggle("lit", st.streakAlive() && st.data.streak.current > 0);
    updateArchiveBadge();
  }

  // Unread = lessons in the manifest the user hasn't completed yet.
  function updateArchiveBadge() {
    const badge = document.getElementById("archive-badge");
    if (!badge) return;
    const unread = allDays.filter((d) => !S().isDayDone(d.date)).length;
    if (unread > 0) { badge.textContent = unread; badge.hidden = false; }
    else { badge.hidden = true; }
  }

  function setActiveNav(route) {
    document.querySelectorAll(".mainnav a").forEach((a) =>
      a.classList.toggle("active", a.dataset.route === route));
  }

  function loading(msg) { view.innerHTML = `<div class="empty">${msg || "Loading…"}</div>`; }
  function errorView(e) {
    view.innerHTML = `<div class="card"><h2>Something went wrong</h2>
      <p class="muted">${U().esc(e.message || e)}</p>
      <p class="muted">If you opened this file directly, run a local server instead (see README) so content can load.</p></div>`;
  }

  // ---------- Pages ----------
  async function pageToday() {
    setActiveNav("today");
    loading("Loading today’s knowledge transfer…");
    const idx = await C().loadIndex();
    allDays = idx.days || [];
    const latest = allDays[0];
    if (!latest) { view.innerHTML = `<div class="empty">No lessons yet. Run the daily loop to generate one.</div>`; return; }
    const done = S().isDayDone(latest.date);
    const due = S().dueReviews().length;
    const unread = allDays.filter((d) => !S().isDayDone(d.date)).length;
    view.innerHTML = `
      <div class="card hero">
        <div class="daterow">${fmtDate(latest.date)} · Daily KT</div>
        <div class="big">${U().esc(latest.title)}</div>
        <div class="row" style="margin:.6rem 0">
          <span class="pill domain">${U().esc(latest.domain || "")}</span>
          <span class="pill diff-${U().esc(latest.difficulty || "core")}">${U().esc(latest.difficulty || "core")}</span>
          ${latest.estimatedMinutes ? `<span class="pill">~${latest.estimatedMinutes} min</span>` : ""}
          <span class="pill">+${latest.xp || 0} XP</span>
        </div>
        <p class="muted">${U().esc(latest.summary || "")}</p>
        <div class="row" style="margin-top:.6rem">
          <a class="btn" href="#/lesson/${latest.date}">${done ? "Revisit lesson ↻" : "Start lesson →"}</a>
          ${done ? `<span class="pill">✓ completed</span>` : ""}
        </div>
      </div>
      <div class="grid">
        <a class="tile" href="#/review">
          <div class="t-title">🔁 Review${due ? ` · ${due} due` : ""}</div>
          <div class="t-meta">${due ? "Reinforce questions you missed." : "Nothing due — nice and sharp."}</div>
        </a>
        <a class="tile" href="#/archive"><div class="t-title">📚 Archive${unread ? ` · ${unread} unread` : ""}</div><div class="t-meta">${unread ? `${unread} lesson${unread === 1 ? "" : "s"} not done yet.` : "All caught up — revisit anytime."}</div></a>
        <a class="tile" href="#/progress"><div class="t-title">📈 Progress</div><div class="t-meta">XP, streak, badges &amp; mastery.</div></a>
        <a class="tile" href="#/glossary"><div class="t-title">📖 Glossary</div><div class="t-meta">${Object.keys(S().data.glossarySeen).length} terms learned.</div></a>
      </div>`;
    updateArchiveBadge();
  }

  async function pageLesson(date) {
    setActiveNav("today");
    loading("Loading lesson…");
    try {
      const day = await C().loadDay(date);
      window.Ark.render.runLesson(day, view);
    } catch (e) { errorView(e); }
  }

  async function pageArchive() {
    setActiveNav("archive");
    loading();
    const idx = await C().loadIndex();
    if (!idx.days.length) { view.innerHTML = `<div class="empty">No lessons yet.</div>`; return; }
    const tiles = idx.days.map((d) => {
      const done = S().isDayDone(d.date);
      return `<a class="tile ${done ? "done" : ""}" href="#/lesson/${d.date}">
        <div class="t-title">${done ? '<span class="check">✓</span> ' : ""}${U().esc(d.title)}</div>
        <div class="t-meta">${fmtDate(d.date)} · ${U().esc(d.domain || "")} · ${U().esc(d.difficulty || "core")}</div>
      </a>`;
    }).join("");
    view.innerHTML = `<h2>Archive <span class="muted">(${idx.days.length})</span></h2><div class="grid">${tiles}</div>`;
  }

  async function pageReview() {
    setActiveNav("review");
    loading("Gathering due questions…");
    const dueIds = S().dueReviews();
    if (!dueIds.length) {
      view.innerHTML = `<div class="card"><h2>🔁 Spaced review</h2>
        <p class="muted">Nothing is due right now. Questions you miss resurface here on a spaced schedule (1 → 2 → 4 → 9 → 21 days).</p>
        <a class="btn secondary" href="#/today">Back to today</a></div>`;
      return;
    }
    // Rebuild question objects from their day files
    const byDate = {};
    dueIds.forEach((id) => { const date = id.split(/[:#]/)[0]; (byDate[date] = byDate[date] || []).push(id); });
    const quiz = [];
    for (const date of Object.keys(byDate)) {
      let day; try { day = await C().loadDay(date); } catch (_) { continue; }
      (day.activities || []).forEach((act, i) => {
        if (act.type !== "mcq") return;
        const mcqId = act.id ? `${date}:${act.id}` : `${date}#${i}`;
        if (byDate[date].includes(mcqId)) quiz.push({ act, mcqId, key: `review:${mcqId}` });
      });
    }
    runReview(quiz);
  }

  function runReview(quiz) {
    let i = 0;
    const wrap = U().el(`<div>
      <div class="row" style="margin-bottom:.6rem"><h2 style="margin:0">🔁 Review</h2><span class="spacer"></span><span class="muted" id="rprog"></span></div>
      <div class="card stage"></div>
      <div class="row"><span class="spacer"></span><button class="btn" id="rnext" disabled>Next →</button></div>
    </div>`);
    view.innerHTML = ""; view.appendChild(wrap);
    const stage = wrap.querySelector(".stage");
    const nextBtn = wrap.querySelector("#rnext");
    const prog = wrap.querySelector("#rprog");

    function show() {
      if (i >= quiz.length) {
        S().checkBadges({ reviewDone: true }); S().save(); refreshHud();
        stage.innerHTML = `<div class="akind">Review complete</div><h2>Sharper already 🧠</h2>
          <p class="muted">${quiz.length} question(s) reviewed. They’ll resurface again when due.</p>
          <a class="btn" href="#/today">Done</a>`;
        nextBtn.style.display = "none";
        U().celebrate("Review complete!");
        return;
      }
      prog.textContent = `${i + 1} / ${quiz.length}`;
      const q = quiz[i];
      const cur = window.Ark.render.renderActivity(q.act, {
        key: q.key, mcqId: q.mcqId,
        onAnswer: () => {}, refreshNav: () => { nextBtn.disabled = false; },
      });
      stage.innerHTML = ""; stage.appendChild(cur.node);
      nextBtn.disabled = true;
      nextBtn.textContent = i >= quiz.length - 1 ? "Finish ✦" : "Next →";
    }
    nextBtn.addEventListener("click", () => { i++; show(); });
    show();
  }

  async function pageProgress() {
    setActiveNav("progress");
    loading();
    const st = S().data;
    const li = S().levelInfo();
    const acc = Math.round(S().accuracy() * 100);
    const idx = await C().loadIndex();
    // domain mastery
    const dom = {};
    idx.days.forEach((d) => {
      const k = d.domain || "Other";
      dom[k] = dom[k] || { total: 0, done: 0 };
      dom[k].total++; if (S().isDayDone(d.date)) dom[k].done++;
    });
    const domHtml = Object.entries(dom).map(([k, v]) =>
      `<div class="stat"><div class="num">${v.done}/${v.total}</div><div class="lbl">${U().esc(k)}</div></div>`).join("")
      || `<div class="muted">Complete lessons to build mastery.</div>`;

    const badgesHtml = S().BADGES.map((b) => {
      const unlocked = !!st.badges[b.id];
      return `<div class="badge ${unlocked ? "" : "locked"}" title="${U().esc(b.desc)}">
        <div class="emoji">${b.emoji}</div><div class="bname">${U().esc(b.name)}</div>
        <div class="bdesc">${U().esc(b.desc)}</div></div>`;
    }).join("");

    view.innerHTML = `
      <h2>Progress</h2>
      <div class="card">
        <div class="row"><strong>${U().esc(li.title)}</strong><span class="muted">· Level ${li.level}</span></div>
        <div class="xp-bar" style="width:100%;margin:.5rem 0"><div class="xp-fill" style="width:${li.pct}%"></div></div>
        <div class="statgrid">
          <div class="stat"><div class="num">${st.xp}</div><div class="lbl">Total XP</div></div>
          <div class="stat"><div class="num">🔥 ${st.streak.current}</div><div class="lbl">Current streak</div></div>
          <div class="stat"><div class="num">${st.streak.longest}</div><div class="lbl">Longest streak</div></div>
          <div class="stat"><div class="num">${Object.keys(st.completedDays).length}</div><div class="lbl">Lessons done</div></div>
          <div class="stat"><div class="num">${st.stats.totalAnswered ? acc + "%" : "—"}</div><div class="lbl">Accuracy</div></div>
          <div class="stat"><div class="num">${st.stats.totalAnswered}</div><div class="lbl">Questions answered</div></div>
        </div>
      </div>
      <div class="card"><h3>XP — last 30 days</h3><div class="chart-wrap"><canvas id="xpchart" height="200"></canvas></div></div>
      <div class="card"><h3>Domain mastery</h3><div class="statgrid">${domHtml}</div></div>
      <div class="card"><h3>Badges <span class="muted">(${Object.keys(st.badges).length}/${S().BADGES.length})</span></h3><div class="badges">${badgesHtml}</div></div>`;

    drawXpChart();
  }

  function drawXpChart() {
    const labels = [], data = [];
    const today = new Date();
    for (let k = 29; k >= 0; k--) {
      const d = new Date(today); d.setDate(d.getDate() - k);
      const key = d.toISOString().slice(0, 10);
      labels.push(key.slice(5));
      data.push(S().data.xpByDate[key] || 0);
    }
    const canvas = document.getElementById("xpchart");
    if (!canvas) return;
    window.Ark.render.drawChart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ label: "XP", data, backgroundColor: "#6aa6ff" }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
  }

  async function pageGlossary() {
    setActiveNav("glossary");
    loading();
    const g = await C().loadGlossary();
    const terms = (g.terms || []).slice().sort((a, b) => a.term.localeCompare(b.term));
    const render = (filter) => {
      const f = (filter || "").toLowerCase();
      const list = terms.filter((t) => !f || t.term.toLowerCase().includes(f) || (t.definition || "").toLowerCase().includes(f));
      return list.map((t) => `<div class="gterm">
        <span class="term">${U().esc(t.term)}</span>
        <div class="prose">${U().md(t.definition)}</div>
        ${U().sourcesHtml(t.sources)}
      </div>`).join("") || `<div class="muted">No matches.</div>`;
    };
    view.innerHTML = `<h2>Glossary <span class="muted">(${terms.length})</span></h2>
      <input class="searchbox" id="gsearch" placeholder="Search terms…" />
      <div id="glist">${render("")}</div>`;
    const search = document.getElementById("gsearch");
    search.addEventListener("input", () => { document.getElementById("glist").innerHTML = render(search.value); });
    // mark all current glossary terms as seen (browsing counts)
    S().markGlossary(terms.map((t) => t.term)); S().save(); refreshHud();
  }

  function pageSettings() {
    setActiveNav("settings");
    view.innerHTML = `
      <h2>Settings</h2>
      <div class="card">
        <h3>Your data</h3>
        <p class="muted">All progress lives in this browser (localStorage). Export it to keep a backup or move devices.</p>
        <div class="row">
          <button class="btn secondary" id="export">⬇ Export progress</button>
          <button class="btn secondary" id="import">⬆ Import progress</button>
          <button class="btn ghost" id="reset">Reset all</button>
        </div>
        <input type="file" id="file" accept="application/json" hidden />
      </div>
      <div class="card">
        <h3>About</h3>
        <p class="muted">Arkbase is your personal, fact-sourced education-standards academy. New knowledge transfers are generated daily by a local loop and deployed automatically. Every factual claim links to a source.</p>
      </div>`;
    document.getElementById("export").addEventListener("click", () => {
      const blob = new Blob([S().exportData()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `arkbase-progress-${S().todayStr()}.json`;
      a.click(); URL.revokeObjectURL(a.href);
    });
    const file = document.getElementById("file");
    document.getElementById("import").addEventListener("click", () => file.click());
    file.addEventListener("change", () => {
      const f = file.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try { S().importData(reader.result); refreshHud(); U().toast("Progress imported"); route(); }
        catch (e) { U().toast("Import failed: " + e.message); }
      };
      reader.readAsText(f);
    });
    document.getElementById("reset").addEventListener("click", () => {
      if (confirm("Reset ALL progress? This cannot be undone.")) { S().reset(); refreshHud(); U().toast("Progress reset"); route(); }
    });
  }

  // ---------- helpers ----------
  function fmtDate(s) {
    try { return new Date(s + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }); }
    catch (_) { return s; }
  }

  // ---------- Router ----------
  function route() {
    const hash = location.hash.replace(/^#/, "") || "/today";
    const parts = hash.split("/").filter(Boolean);
    closeNav();
    if (parts[0] === "lesson" && parts[1]) return pageLesson(parts[1]);
    switch (parts[0]) {
      case "archive": return pageArchive();
      case "review": return pageReview();
      case "progress": return pageProgress();
      case "glossary": return pageGlossary();
      case "settings": return pageSettings();
      default: return pageToday();
    }
  }

  function closeNav() { document.getElementById("mainnav").classList.remove("open"); }

  // ---------- Init ----------
  function init() {
    if (window.mermaid) window.mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
    document.getElementById("navtoggle").addEventListener("click", () =>
      document.getElementById("mainnav").classList.toggle("open"));
    window.addEventListener("hashchange", route);
    S().onChange(refreshHud);
    C().loadIndex().then((idx) => {
      allDays = idx.days || [];
      if (idx.generatedAt) document.getElementById("footer-generated").textContent =
        "Last updated " + fmtDate((idx.generatedAt || "").slice(0, 10));
      updateArchiveBadge();
    }).catch(() => {});
    refreshHud();
    route();
  }

  window.Ark = window.Ark || {};
  window.Ark.app = { refreshHud, route };
  // libraries are deferred; run after DOM + scripts are ready
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
