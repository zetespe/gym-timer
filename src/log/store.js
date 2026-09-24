// Storage for the workout log. Everything lives in localStorage on the device.
// The shape is versioned; `migrate` upgrades older data in place and a copy of
// the pre-migration data is kept under a backup key before any upgrade.
import { useSyncExternalStore } from "react";

export const KEY = "gymtimer.log";
const BACKUP_KEY = "gymtimer.log.premigration";
export const SCHEMA = 3;

export function emptyState() {
  return {
    version: SCHEMA,
    settings: { unit: "kg", restTimer: true, timer: { hold: 20, swap: 4, rest: 0, perSet: 2 }, lastBackupAt: null, sessionsSinceBackup: 0, usageCount: true, usageSent: {} },
    plan: { name: "", loadNote: "", rules: [], stopRules: [], workouts: [] },
    sessions: [],
    draft: null,
  };
}

// Accepts a list of strings or one newline-separated string; always returns a
// clean array. Imported JSON is written by AIs, so both shapes arrive.
export function strList(v) {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/\r?\n/);
  return arr.map((s) => String(s).trim()).filter(Boolean);
}

export function migrate(raw) {
  if (!raw || typeof raw !== "object") return emptyState();
  let s = raw;
  if (!s.version || s.version < 2) {
    // v1 shape (phase 1 app): plan.sessions[] with reps/weight; workouts are the same thing.
    const out = emptyState();
    out.settings = Object.assign(out.settings, s.settings || {});
    if (s.plan) {
      out.plan.name = s.plan.name || "";
      out.plan.workouts = (s.plan.sessions || s.plan.workouts || []).map(migrateWorkout);
    }
    out.sessions = (s.sessions || []).map(normalizeSession);
    out.draft = s.draft || null;
    s = out;
  }
  s.version = SCHEMA;
  s.settings = Object.assign(emptyState().settings, s.settings || {});
  s.settings.timer = Object.assign(emptyState().settings.timer, s.settings.timer || {});
  s.plan = s.plan || { name: "", workouts: [] };
  s.plan.loadNote = s.plan.loadNote || "";
  s.plan.rules = strList(s.plan.rules);
  s.plan.stopRules = strList(s.plan.stopRules);
  s.plan.workouts = (s.plan.workouts || []).map(migrateWorkout);
  s.sessions = (s.sessions || []).map(normalizeSession);
  return s;
}

export function migrateWorkout(w) {
  return {
    id: w.id || uid(),
    name: w.name || "Workout",
    subtitle: w.subtitle || "",
    intent: w.intent || "",
    exercises: (w.exercises || []).map(migrateExercise),
  };
}

export function migrateExercise(x) {
  const mode = ["reps", "time", "dist"].includes(x.mode) ? x.mode : "reps";
  const repsMin = x.repsMin ?? x.reps ?? (mode === "reps" ? 8 : null);
  return {
    id: x.id || slug(x.name),
    name: x.name || "Exercise",
    mode,
    perSide: !!x.perSide,
    bodyweight: !!x.bodyweight,
    sets: x.sets || 3,
    repsMin,
    repsMax: x.repsMax ?? repsMin,
    secs: x.secs ?? (mode === "time" ? 30 : null),
    dist: x.dist ?? (mode === "dist" ? 30 : null),
    weight: x.bodyweight ? (x.weight ?? null) : (x.weight ?? 0),
    increment: x.increment ?? 1,
    rest: x.rest != null ? parseRest(x.rest) : 90,
    target: x.target || "",
    cue: x.cue || "",
    progression: x.progression || "",
    steps: strList(x.steps),
    watchFor: strList(x.watchFor ?? x.watchfor ?? x.faults),
  };
}

function parseRest(v) {
  if (typeof v === "number") return v;
  const m = String(v).match(/(\d+(?:\.\d+)?)\s*(min|m)?/i);
  if (!m) return 90;
  return m[2] ? Math.round(parseFloat(m[1]) * 60) : parseInt(m[1], 10);
}

export function normalizeSession(s) {
  return {
    id: s.id || (s.date || today()) + "-" + uid(),
    date: s.date || today(),
    workoutId: s.workoutId || s.planId || "free",
    name: s.name || "Session",
    startedAt: s.startedAt || null,
    endedAt: s.endedAt || null,
    notes: s.notes || "",
    source: s.source,
    exercises: (s.exercises || []).map((e) => ({
      exId: e.exId || slug(e.name),
      name: e.name || e.exId,
      mode: ["reps", "time", "dist"].includes(e.mode) ? e.mode : "reps",
      perSide: !!e.perSide,
      bodyweight: !!e.bodyweight,
      notes: e.notes || "",
      sets: (e.sets || []).map((st) => {
        const o = {};
        if (st.w != null) o.w = +st.w;
        if (st.r != null) o.r = +st.r;
        if (st.s != null) o.s = +st.s;
        if (st.m != null) o.m = +st.m;
        if (st.note) o.note = st.note;
        return o;
      }),
    })),
  };
}

export const uid = () => Math.random().toString(36).slice(2, 8);
export const slug = (s) => String(s || "exercise").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "exercise";
export const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

// ---- external store ----
let state = null;
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.version || parsed.version < SCHEMA) {
        try { localStorage.setItem(BACKUP_KEY, raw); } catch (e) {}
      }
      return migrate(parsed);
    }
  } catch (e) {
    console.warn("log: could not read storage", e);
  }
  return emptyState();
}

export function getState() {
  if (!state) state = read();
  return state;
}

// Persisting serialises the whole state, and note fields call setState per
// keystroke — so writes are batched (~300ms) and flushed when the page hides,
// which is the last reliable moment before a mobile browser kills the tab.
let saveTimer = null;
function persist() {
  saveTimer = null;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn("log: could not save", e); }
}
function flush() { if (saveTimer != null) { clearTimeout(saveTimer); persist(); } }
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
}

export function setState(updater) {
  const next = typeof updater === "function" ? updater(getState()) : updater;
  state = next;
  if (saveTimer == null) saveTimer = setTimeout(persist, 300);
  listeners.forEach((l) => l());
}

// Mutating helper: patch(draft => { draft.x = y }) clones shallowly at the top level only.
export function patch(fn) {
  setState((s) => {
    const copy = structuredClone(s);
    fn(copy);
    return copy;
  });
}

export function useLog() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getState,
    getState,
  );
}

export function resetAll() {
  // "Erase everything" wipes the log, not the usage-count choice: an opt-out
  // must survive, and periods already counted must not be counted again.
  const keep = state && state.settings ? { usageCount: state.settings.usageCount, usageSent: state.settings.usageSent } : {};
  try { localStorage.removeItem(KEY); } catch (e) {}
  state = emptyState();
  Object.assign(state.settings, keep);
  persist();
  listeners.forEach((l) => l());
}

// Ask the browser not to evict our storage. Installed home-screen apps on iOS are
// already exempt from the 7-day cap; this covers the other browsers.
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) {}
  return false;
}
