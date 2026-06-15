/* render.js — activity renderers, lesson stepper, and UI effects. */
(function () {
  "use strict";
  const S = () => window.Ark.state;

  // ---------- UI helpers ----------
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function md(text) {
    if (window.marked) return window.marked.parse(String(text || ""));
    return "<p>" + esc(text).replace(/\n/g, "<br>") + "</p>";
  }
  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }
  function celebrate(msg) {
    if (msg) toast(msg);
    confetti();
  }
  function confetti() {
    const colors = ["#6aa6ff", "#8b7bff", "#3ddc97", "#ffd166", "#ff6b6b"];
    for (let i = 0; i < 60; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(c);
      const fall = c.animate(
        [{ top: "-20px", opacity: 1 }, { top: "100vh", opacity: 0.9 }],
        { duration: 1600 + Math.random() * 1200, easing: "cubic-bezier(.3,.7,.4,1)" }
      );
      fall.onfinish = () => c.remove();
    }
  }

  function sourcesHtml(sources) {
    if (!sources || !sources.length) return "";
    const items = sources.map((s) => {
      const title = esc(s.title || s.url || "source");
      const date = s.date ? ` <span class="muted">(${esc(s.date)})</span>` : "";
      return s.url
        ? `<span class="src">↳ <a href="${esc(s.url)}" target="_blank" rel="noopener">${title}</a>${date}</span>`
        : `<span class="src">↳ ${title}${date}</span>`;
    }).join("");
    return `<div class="sources"><strong>Sources</strong>${items}</div>`;
  }

  let mermaidSeq = 0;
  async function drawMermaid(container, code) {
    if (!window.mermaid) { container.textContent = code; return; }
    try {
      const id = "mmd-" + (++mermaidSeq);
      const { svg } = await window.mermaid.render(id, code);
      container.innerHTML = svg;
    } catch (e) {
      container.innerHTML = `<pre class="muted">${esc(code)}</pre>`;
    }
  }

  let activeChart = null;
  function drawChart(canvas, config) {
    if (!window.Chart) return;
    if (activeChart) { try { activeChart.destroy(); } catch (_) {} activeChart = null; }
    Chart.defaults.color = "#97a3c0";
    Chart.defaults.borderColor = "#263256";
    activeChart = new Chart(canvas.getContext("2d"), config);
  }

  // ---------- Activity renderers ----------
  // Each returns { node, requiresInteraction, onEnter, result() }
  function renderActivity(act, ctx) {
    switch (act.type) {
      case "mcq": return renderMcq(act, ctx);
      case "concept": return renderConcept(act, ctx);
      case "diagram": return renderDiagram(act, ctx);
      case "chart": return renderChartAct(act, ctx);
      case "flashcard": return renderFlashcard(act, ctx);
      case "news": return renderNews(act, ctx);
      case "takeaways": return renderTakeaways(act, ctx);
      default: return { node: el(`<div class="activity muted">Unsupported activity.</div>`) };
    }
  }

  function renderConcept(act, ctx) {
    const node = el(`<div class="activity">
      <div class="akind">Concept</div>
      ${act.title ? `<h2>${esc(act.title)}</h2>` : ""}
      <div class="prose">${md(act.markdown)}</div>
      ${sourcesHtml(act.sources)}
    </div>`);
    return { node, onEnter: () => S().grantActivityXp(ctx.key, 3, "learned") };
  }

  function renderMcq(act, ctx) {
    const node = el(`<div class="activity">
      <div class="akind">Question</div>
      <h2>${esc(act.question)}</h2>
      <div class="opts"></div>
      <div class="explain-slot"></div>
    </div>`);
    const optsBox = node.querySelector(".opts");
    const slot = node.querySelector(".explain-slot");
    let answered = false;
    const state = { interactionDone: false, correct: false };
    act.options.forEach((opt, i) => {
      const b = el(`<button class="mcq-opt">${esc(opt)}</button>`);
      b.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const correct = i === act.answerIndex;
        state.interactionDone = true;
        state.correct = correct;
        optsBox.querySelectorAll(".mcq-opt").forEach((x, xi) => {
          x.classList.add("disabled");
          if (xi === act.answerIndex) x.classList.add("correct");
          if (xi === i && !correct) x.classList.add("wrong");
        });
        const { firstTime } = S().recordMcq(ctx.mcqId, correct);
        ctx.onAnswer(correct);
        if (correct && firstTime) S().addXp(10, "correct!");
        else if (correct) S().addXp(4, "review correct");
        slot.innerHTML =
          `<div class="explain ${correct ? "correct" : "wrong"}">
            <strong>${correct ? "Correct ✓" : "Not quite ✗"}</strong><br>${esc(act.explanation || "")}
            ${sourcesHtml(act.sources)}
          </div>`;
        ctx.refreshNav();
      });
      optsBox.appendChild(b);
    });
    return { node, requiresInteraction: true, isDone: () => state.interactionDone };
  }

  // Resolve a mermaid node <g class="node" id="flowchart-<id>-<n>"> from a content node id.
  function nodeToken(gid) { const p = (gid || "").split("-"); return p.slice(1, -1).join("-"); }
  function findNode(svg, id) {
    return [...svg.querySelectorAll("g.node")].find((n) => nodeToken(n.id) === id) || null;
  }
  // Mermaid edge paths carry classes LS-<from> and LE-<to>.
  function findEdge(svg, from, to) {
    const paths = svg.querySelectorAll(".edgePaths path, path.flowchart-link");
    for (const p of paths) if (p.classList.contains("LS-" + from) && p.classList.contains("LE-" + to)) return p;
    return null;
  }

  // Build a step-through controller that highlights nodes/edges in sequence with Play/Prev/Next.
  function makeStepper(diagramEl, svg, steps, bar, label) {
    const nodes = steps.map((s) => findNode(svg, s.node));
    const allNodes = [...svg.querySelectorAll("g.node")];
    const allPaths = [...svg.querySelectorAll("path")];
    const playBtn = bar.querySelector('[data-act="play"]');
    const count = bar.querySelector(".stepcount");
    let idx = -1, playing = false, timer = null;

    function clearHi() {
      allNodes.forEach((n) => n.classList.remove("ark-active", "ark-dim"));
      allPaths.forEach((p) => p.classList.remove("ark-edge-active"));
    }
    function highlight(i) {
      idx = i;
      clearHi();
      diagramEl.classList.add("dimmed");
      allNodes.forEach((n) => n.classList.add("ark-dim"));
      const cur = nodes[i];
      if (cur) { cur.classList.remove("ark-dim"); cur.classList.add("ark-active"); }
      if (i > 0 && nodes[i - 1]) {
        nodes[i - 1].classList.remove("ark-dim");
        const e = findEdge(svg, steps[i - 1].node, steps[i].node);
        if (e) e.classList.add("ark-edge-active");
      }
      const s = steps[i] || {};
      label.classList.remove("idle");
      label.innerHTML = `<div class="sl-title">Step ${i + 1} — ${esc(s.title || "")}</div>` +
        (s.caption ? `<div class="sl-cap">${esc(s.caption)}</div>` : "");
      count.textContent = `Step ${i + 1} / ${steps.length}`;
    }
    function stop(atEnd) {
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }
      playBtn.textContent = atEnd ? "⟳ Replay" : "▶ Play";
    }
    function tick() {
      if (!document.body.contains(svg)) { stop(); return; }   // self-clean if removed from DOM
      if (idx >= steps.length - 1) { stop(true); return; }
      highlight(idx + 1);
    }
    function play() {
      playing = true; playBtn.textContent = "⏸ Pause";
      if (idx >= steps.length - 1) highlight(0);
      timer = setInterval(tick, 1900);
    }
    bar.querySelector('[data-act="prev"]').addEventListener("click", () => { stop(); if (idx > 0) highlight(idx - 1); });
    bar.querySelector('[data-act="next"]').addEventListener("click", () => { stop(); if (idx < steps.length - 1) highlight(idx + 1); });
    playBtn.addEventListener("click", () => { if (playing) stop(); else play(); });

    highlight(0);
    setTimeout(() => { if (document.body.contains(svg) && !playing && idx === 0) play(); }, 800); // auto-walk
  }

  function renderDiagram(act, ctx) {
    const hasSteps = Array.isArray(act.steps) && act.steps.length > 0;
    const node = el(`<div class="activity">
      <div class="akind">Flow diagram${hasSteps ? " · step-by-step" : ""}</div>
      ${act.title ? `<h2>${esc(act.title)}</h2>` : ""}
      <div class="diagram"><div class="mermaid-box"></div></div>
      ${hasSteps ? `<div class="stepbar">
        <button class="btn ghost small" data-act="prev">‹ Prev</button>
        <button class="btn small" data-act="play">▶ Play</button>
        <button class="btn ghost small" data-act="next">Next ›</button>
        <span class="stepcount"></span>
      </div>
      <div class="steplabel idle">Walk through the flow one step at a time — press Play.</div>` : ""}
      ${act.caption ? `<div class="caption">${esc(act.caption)}</div>` : ""}
      ${sourcesHtml(act.sources)}
    </div>`);
    return {
      node,
      onEnter: async () => {
        S().grantActivityXp(ctx.key, 3, "visualized");
        const box = node.querySelector(".mermaid-box");
        await drawMermaid(box, act.mermaid);
        if (hasSteps) {
          const svg = box.querySelector("svg");
          if (svg) makeStepper(node.querySelector(".diagram"), svg, act.steps, node.querySelector(".stepbar"), node.querySelector(".steplabel"));
        }
      },
    };
  }

  function renderChartAct(act, ctx) {
    const node = el(`<div class="activity">
      <div class="akind">Data</div>
      ${act.title ? `<h2>${esc(act.title)}</h2>` : ""}
      <div class="chart-wrap"><canvas height="240"></canvas></div>
      ${act.caption ? `<div class="caption">${esc(act.caption)}</div>` : ""}
      ${sourcesHtml(act.sources)}
    </div>`);
    return {
      node,
      onEnter: () => { drawChart(node.querySelector("canvas"), act.chart); S().grantActivityXp(ctx.key, 3, "charted"); },
    };
  }

  function renderFlashcard(act, ctx) {
    const node = el(`<div class="activity">
      <div class="akind">Flashcard · tap to flip</div>
      <div class="flash"><div class="flash-inner">
        <div class="flash-face flash-front"><div>${md(act.front)}</div></div>
        <div class="flash-face flash-back"><div>${md(act.back)}</div></div>
      </div></div>
    </div>`);
    const flash = node.querySelector(".flash");
    flash.addEventListener("click", () => flash.classList.toggle("flipped"));
    return { node, onEnter: () => S().grantActivityXp(ctx.key, 3, "recalled") };
  }

  function renderNews(act, ctx) {
    const src = act.source || {};
    const node = el(`<div class="activity">
      <div class="akind">From the news${act.date ? " · " + esc(act.date) : ""}</div>
      <div class="news">
        <div class="headline">${esc(act.headline)}</div>
        <div class="prose">${md(act.summary)}</div>
        ${src.url ? `<div class="sources"><span class="src">↳ <a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.title || src.url)}</a></span></div>` : ""}
      </div>
    </div>`);
    return { node, onEnter: () => S().grantActivityXp(ctx.key, 4, "stayed current") };
  }

  function renderTakeaways(act, ctx) {
    const items = (act.items || []).map((i) => `<li>${md(i)}</li>`).join("");
    const node = el(`<div class="activity">
      <div class="akind">Key takeaways</div>
      <ul class="prose">${items}</ul>
    </div>`);
    return { node, onEnter: () => S().grantActivityXp(ctx.key, 3, "summarized") };
  }

  // ---------- Lesson stepper ----------
  function runLesson(day, mount) {
    const activities = day.activities || [];
    let i = 0;
    const answers = []; // {correct}
    const steps = activities.length;

    const shell = el(`<div>
      <div class="row" style="margin-bottom:.6rem">
        <span class="pill domain">${esc(day.domain || "")}</span>
        <span class="pill diff-${esc(day.difficulty || "core")}">${esc(day.difficulty || "core")}</span>
        <span class="spacer"></span>
        <a class="btn ghost small" href="#/today">Exit</a>
      </div>
      <div class="stepper"></div>
      <div class="card stage"></div>
      <div class="row">
        <button class="btn secondary" id="back">← Back</button>
        <span class="spacer"></span>
        <button class="btn" id="next">Next →</button>
      </div>
    </div>`);
    mount.innerHTML = "";
    mount.appendChild(shell);
    const stage = shell.querySelector(".stage");
    const stepper = shell.querySelector(".stepper");
    const backBtn = shell.querySelector("#back");
    const nextBtn = shell.querySelector("#next");
    let current = null;

    function paintStepper() {
      stepper.innerHTML = "";
      for (let s = 0; s <= steps; s++) {
        const d = document.createElement("div");
        d.className = "dot" + (s < i ? " done" : s === i ? " current" : "");
        stepper.appendChild(d);
      }
    }
    function refreshNav() {
      backBtn.disabled = i === 0;
      if (current && current.requiresInteraction && !(current.isDone && current.isDone())) {
        nextBtn.disabled = true;
      } else {
        nextBtn.disabled = false;
      }
      nextBtn.textContent = i >= steps - 1 ? "Finish ✦" : "Next →";
    }

    function showSummary() {
      paintStepperDone();
      const correct = answers.filter((a) => a.correct).length;
      const total = answers.length;
      const acc = total ? Math.round((correct / total) * 100) : 100;
      S().markGlossary((day.glossary || []).map((g) => g.term));
      const res = S().completeLesson(day.date, acc);
      if (res.bonus) celebrate("Lesson complete! ✦");
      window.Ark.app.refreshHud();
      const reflectVal = S().data.reflections[day.date] || "";
      stage.innerHTML = `
        <div class="akind">Lesson complete</div>
        <h2>${esc(day.title)}</h2>
        <div class="statgrid" style="margin:1rem 0">
          <div class="stat"><div class="num">${total ? correct + "/" + total : "—"}</div><div class="lbl">Questions correct</div></div>
          <div class="stat"><div class="num">${acc}%</div><div class="lbl">Accuracy</div></div>
          <div class="stat"><div class="num">🔥 ${S().data.streak.current}</div><div class="lbl">Day streak</div></div>
        </div>
        ${day.reflection ? `
          <h3>Reflect</h3>
          <p class="muted">${esc(day.reflection)}</p>
          <textarea class="reflect" id="reflect" placeholder="Your thoughts (saved locally)...">${esc(reflectVal)}</textarea>
          <div class="row" style="margin-top:.6rem"><button class="btn small" id="save-reflect">Save reflection</button></div>
        ` : ""}
        <div class="row" style="margin-top:1rem">
          <a class="btn" href="#/archive">Back to archive</a>
          <a class="btn secondary" href="#/progress">View progress</a>
        </div>`;
      const sr = stage.querySelector("#save-reflect");
      if (sr) sr.addEventListener("click", () => {
        S().saveReflection(day.date, stage.querySelector("#reflect").value);
        toast("Reflection saved");
      });
      backBtn.disabled = false;
      nextBtn.style.display = "none";
    }
    function paintStepperDone() {
      stepper.querySelectorAll(".dot").forEach((d) => { d.className = "dot done"; });
    }

    function show() {
      if (i >= steps) { showSummary(); return; }
      nextBtn.style.display = "";
      const act = activities[i];
      const key = `${day.date}#${i}`;
      const mcqId = act.id ? `${day.date}:${act.id}` : `${day.date}#${i}`;
      const ctx = {
        key, mcqId, refreshNav,
        onAnswer: (correct) => { answers[i] = { correct }; },
      };
      current = renderActivity(act, ctx);
      stage.innerHTML = "";
      stage.appendChild(current.node);
      if (current.onEnter) current.onEnter();
      paintStepper();
      refreshNav();
      S().save();
      window.Ark.app.refreshHud();
    }

    backBtn.addEventListener("click", () => { if (i > 0) { i--; show(); } });
    nextBtn.addEventListener("click", () => { i++; show(); });
    show();
  }

  window.Ark = window.Ark || {};
  window.Ark.ui = { toast, celebrate, confetti, el, esc, md, sourcesHtml };
  window.Ark.render = { runLesson, renderActivity, drawChart, drawMermaid };
})();
