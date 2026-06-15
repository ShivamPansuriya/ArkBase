/* state.js — progress, gamification, spaced repetition. All persisted to localStorage.
   Exposes a single global: window.Ark.state */
(function () {
  "use strict";
  const KEY = "arkbase.progress.v2";

  const LEVELS = [
    "Curious Newcomer", "Enrollment Apprentice", "Registrar-in-Training",
    "Records Keeper", "Standards Reader", "Interoperability Engineer",
    "Data Steward", "Compliance Navigator", "SIS Architect", "Standards Sage",
  ];

  // Leitner spaced-repetition intervals (days) per box 0..5
  const SRS_DAYS = [1, 1, 2, 4, 9, 21];

  const BADGES = [
    { id: "first-lesson", emoji: "🎓", name: "First Steps", desc: "Complete your first lesson" },
    { id: "streak-3", emoji: "🔥", name: "On a Roll", desc: "3-day streak" },
    { id: "streak-7", emoji: "⚡", name: "Week Warrior", desc: "7-day streak" },
    { id: "streak-30", emoji: "🏆", name: "Unstoppable", desc: "30-day streak" },
    { id: "perfect", emoji: "💯", name: "Flawless", desc: "100% on a lesson" },
    { id: "scholar", emoji: "📚", name: "Scholar", desc: "Complete 10 lessons" },
    { id: "century", emoji: "🎯", name: "Centurion", desc: "Answer 100 questions" },
    { id: "sharpshooter", emoji: "🏹", name: "Sharpshooter", desc: "90%+ accuracy (20+ answered)" },
    { id: "glossarian", emoji: "📖", name: "Glossarian", desc: "Learn 50 glossary terms" },
    { id: "reflective", emoji: "🪞", name: "Reflective", desc: "Write 5 reflections" },
    { id: "reviewer", emoji: "🔁", name: "Spaced Learner", desc: "Finish a review session" },
  ];

  function fresh() {
    return {
      version: 1,
      xp: 0,
      completedDays: {},   // date -> {completedAt, accuracy, xpEarned}
      mcq: {},             // mcqId -> {seen,correct,wrong,box,dueAt,lastResult}
      streak: { current: 0, longest: 0, lastActiveDate: null },
      badges: {},          // badgeId -> ISO unlockedAt
      reflections: {},     // date -> text
      glossarySeen: {},    // term -> firstSeenDate
      stats: { totalAnswered: 0, totalCorrect: 0 },
      xpByDate: {},        // date -> xp earned that day
      seenActivities: {},  // activityKey -> true (so XP isn't double-granted)
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      return Object.assign(fresh(), JSON.parse(raw));
    } catch (e) {
      console.warn("Arkbase: failed to load progress, starting fresh.", e);
      return fresh();
    }
  }

  let data = load();
  const listeners = [];

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { console.warn("Arkbase: save failed", e); }
    listeners.forEach((fn) => { try { fn(data); } catch (_) {} });
  }

  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function daysBetween(a, b) {
    const ms = new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z");
    return Math.round(ms / 86400000);
  }

  // --- XP / levels ---
  function levelInfo() {
    // level n requires 100 * n^2 total XP (n starts at 0). Smooth quadratic curve.
    const xp = data.xp;
    let lvl = Math.floor(Math.sqrt(xp / 100));
    if (lvl < 0) lvl = 0;
    const curFloor = 100 * lvl * lvl;
    const nextFloor = 100 * (lvl + 1) * (lvl + 1);
    const into = xp - curFloor;
    const span = nextFloor - curFloor;
    const title = LEVELS[Math.min(lvl, LEVELS.length - 1)];
    return { level: lvl + 1, title, into, span, pct: Math.max(0, Math.min(100, (into / span) * 100)) };
  }

  function addXp(amount, note) {
    if (!amount) return;
    data.xp += amount;
    const t = todayStr();
    data.xpByDate[t] = (data.xpByDate[t] || 0) + amount;
    if (window.Ark && Ark.ui && note) Ark.ui.toast(`+${amount} XP · ${note}`);
  }

  // Grant XP once per unique activity key (so re-visiting doesn't farm XP)
  function grantActivityXp(key, amount, note) {
    if (data.seenActivities[key]) return false;
    data.seenActivities[key] = true;
    addXp(amount, note);
    return true;
  }

  // --- Streak ---
  function touchStreak() {
    const t = todayStr();
    const s = data.streak;
    if (s.lastActiveDate === t) return;
    if (s.lastActiveDate && daysBetween(s.lastActiveDate, t) === 1) s.current += 1;
    else s.current = 1;
    s.lastActiveDate = t;
    if (s.current > s.longest) s.longest = s.current;
  }

  // streak shown as "cold" if user hasn't been active today/yesterday
  function streakAlive() {
    const s = data.streak;
    if (!s.lastActiveDate) return false;
    return daysBetween(s.lastActiveDate, todayStr()) <= 1;
  }

  // --- MCQ + spaced repetition (Leitner) ---
  function recordMcq(mcqId, correct) {
    const m = data.mcq[mcqId] || { seen: 0, correct: 0, wrong: 0, box: 0, dueAt: null, lastResult: null };
    const firstTime = m.seen === 0;
    m.seen += 1;
    m.lastResult = correct ? "correct" : "wrong";
    if (correct) { m.correct += 1; m.box = Math.min(m.box + 1, SRS_DAYS.length - 1); }
    else { m.wrong += 1; m.box = 0; }
    const due = new Date();
    due.setDate(due.getDate() + SRS_DAYS[m.box]);
    m.dueAt = due.toISOString();
    data.mcq[mcqId] = m;
    data.stats.totalAnswered += 1;
    if (correct) data.stats.totalCorrect += 1;
    return { firstTime };
  }

  function dueReviews() {
    const now = Date.now();
    return Object.entries(data.mcq)
      .filter(([, m]) => m.dueAt && new Date(m.dueAt).getTime() <= now && m.wrong > 0)
      .map(([id]) => id);
  }

  function accuracy() {
    const a = data.stats;
    return a.totalAnswered ? a.totalCorrect / a.totalAnswered : 0;
  }

  // --- Lesson completion ---
  function completeLesson(date, accuracyPct) {
    const already = !!data.completedDays[date];
    touchStreak();
    let bonus = already ? 0 : 25;
    if (!already && accuracyPct >= 100) bonus += 25;
    data.completedDays[date] = {
      completedAt: new Date().toISOString(),
      accuracy: accuracyPct,
      xpEarned: (data.completedDays[date]?.xpEarned || 0) + bonus,
    };
    if (bonus) addXp(bonus, already ? "revisited" : "lesson complete!");
    checkBadges({ lessonAccuracy: accuracyPct });
    save();
    return { bonus, already };
  }

  function markGlossary(terms) {
    const t = todayStr();
    (terms || []).forEach((term) => { if (!data.glossarySeen[term]) data.glossarySeen[term] = t; });
  }

  function saveReflection(date, text) {
    if (text && text.trim()) data.reflections[date] = text.trim();
    else delete data.reflections[date];
    checkBadges({});
    save();
  }

  // --- Badges ---
  function unlock(id) {
    if (data.badges[id]) return;
    data.badges[id] = new Date().toISOString();
    const b = BADGES.find((x) => x.id === id);
    if (b && window.Ark && Ark.ui) Ark.ui.celebrate(`${b.emoji} Badge unlocked: ${b.name}`);
  }

  function checkBadges(ctx) {
    const completed = Object.keys(data.completedDays).length;
    if (completed >= 1) unlock("first-lesson");
    if (completed >= 10) unlock("scholar");
    if (data.streak.current >= 3) unlock("streak-3");
    if (data.streak.current >= 7) unlock("streak-7");
    if (data.streak.current >= 30) unlock("streak-30");
    if ((ctx.lessonAccuracy || 0) >= 100) unlock("perfect");
    if (data.stats.totalAnswered >= 100) unlock("century");
    if (data.stats.totalAnswered >= 20 && accuracy() >= 0.9) unlock("sharpshooter");
    if (Object.keys(data.glossarySeen).length >= 50) unlock("glossarian");
    if (Object.keys(data.reflections).length >= 5) unlock("reflective");
    if (ctx.reviewDone) unlock("reviewer");
  }

  // --- Export / import / reset ---
  function exportData() { return JSON.stringify(data, null, 2); }
  function importData(json) {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid file");
    data = Object.assign(fresh(), parsed);
    save();
  }
  function reset() { data = fresh(); save(); }

  window.Ark = window.Ark || {};
  window.Ark.state = {
    BADGES, LEVELS,
    get data() { return data; },
    save, todayStr,
    onChange(fn) { listeners.push(fn); },
    levelInfo, addXp, grantActivityXp,
    touchStreak, streakAlive,
    recordMcq, dueReviews, accuracy,
    completeLesson, markGlossary, saveReflection,
    checkBadges, unlock,
    exportData, importData, reset,
    isDayDone: (d) => !!data.completedDays[d],
  };
})();
