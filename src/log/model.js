// Pure helpers over the log state: formatting, history lookups, the next-weight
// rule, the quick-log parser, plan-text parser and export/import.
import { normalizeSession, migrateWorkout, slug, uid, today } from "./store";

export const valKey = (mode) => (mode === "time" ? "s" : mode === "dist" ? "m" : "r");
export const valUnit = (mode) => (mode === "time" ? "s" : mode === "dist" ? "m" : "reps");
export const setVal = (set, mode) => set[valKey(mode)];

export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: y === new Date().getFullYear() ? undefined : "numeric" });
}

export function fmtEntry(e, unit = "kg") {
  const sets = (e.sets || []).filter((s) => setVal(s, e.mode) != null || s.w != null);
  if (!sets.length) return e.notes ? "(" + e.notes + ")" : "—";
  const suffix = e.mode === "time" ? " s" : e.mode === "dist" ? " m" : "";
  const ws = [...new Set(sets.map((s) => s.w).filter((w) => w != null))];
  const vals = sets.map((s) => (setVal(s, e.mode) == null ? "·" : setVal(s, e.mode)));
  let out;
  if (ws.length > 1) out = sets.map((s) => (s.w != null ? s.w + " " + unit + " × " : "") + (setVal(s, e.mode) ?? "·") + suffix).join(", ");
  else out = (ws.length === 1 && !(e.bodyweight && ws[0] === 0) ? ws[0] + " " + unit + " × " : "") + vals.join(", ") + suffix;
  if (e.perSide) out += " / side";
  return out;
}

export function sortedSessions(sessions) {
  return sessions.slice().sort((a, b) => (b.date + (b.endedAt || "")).localeCompare(a.date + (a.endedAt || "")));
}

export function historyFor(sessions, exId, opts = {}) {
  const out = [];
  for (const s of sortedSessions(sessions)) {
    if (opts.excludeId && s.id === opts.excludeId) continue;
    for (const e of s.exercises) if (e.exId === exId && e.sets && e.sets.length) out.push({ date: s.date, session: s.name, entry: e });
  }
  return out;
}
export const lastFor = (sessions, exId, opts) => historyFor(sessions, exId, opts)[0] || null;

export function allExercises(state) {
  const m = new Map();
  for (const w of state.plan.workouts) for (const x of w.exercises) if (!m.has(x.id)) m.set(x.id, { id: x.id, name: x.name, mode: x.mode, perSide: x.perSide, bodyweight: x.bodyweight });
  for (const s of state.sessions) for (const e of s.exercises) if (!m.has(e.exId)) m.set(e.exId, { id: e.exId, name: e.name, mode: e.mode, perSide: e.perSide, bodyweight: e.bodyweight });
  return [...m.values()];
}

// ---- next-weight rule (double progression) ----
// Returns { kind: 'up'|'repeat'|'down'|'none', weight, text }.
export function suggest(state, ex) {
  const hist = historyFor(state.sessions, ex.id);
  const unit = state.settings.unit;
  if (!hist.length) return { kind: "none", text: "" };
  const last = hist[0].entry;
  const k = valKey(ex.mode);
  const target = ex.mode === "reps" ? ex.repsMax : ex.mode === "time" ? ex.secs : ex.dist;
  const floor = ex.mode === "reps" ? ex.repsMin : target;
  const vals = last.sets.map((s) => s[k]).filter((v) => v != null);
  if (!vals.length || target == null) return { kind: "none", text: "" };
  const w = last.sets.find((s) => s.w != null)?.w ?? null;
  const inc = ex.increment || 1;
  const hitAll = vals.every((v) => v >= target);
  const belowFloor = vals.some((v) => v < floor);
  const weighted = !ex.bodyweight && w != null;
  if (hitAll) {
    if (weighted) return { kind: "up", weight: round(w + inc), text: `Next: ${round(w + inc)} ${unit}` };
    if (ex.mode === "time") return { kind: "up", text: `Next: aim ${target + 5} s` };
    return { kind: "up", text: `Next: aim ${target + 1} ${valUnit(ex.mode)}` };
  }
  if (belowFloor) {
    const prev = hist[1] && hist[1].entry;
    const prevVals = prev ? prev.sets.map((s) => s[k]).filter((v) => v != null) : [];
    const prevW = prev ? prev.sets.find((s) => s.w != null)?.w ?? null : null;
    const prevMissed = prevVals.length && prevVals.some((v) => v < floor) && (!weighted || (prevW != null && prevW >= w));
    if (prevMissed && weighted) {
      const down = Math.max(0, round(Math.floor((w * 0.9) / inc) * inc));
      return { kind: "down", weight: down, text: `Two short sessions — try ${down} ${unit}` };
    }
    return weighted ? { kind: "repeat", weight: w, text: `Repeat ${w} ${unit} — missed the range once` } : { kind: "repeat", text: "Repeat — missed the target once" };
  }
  return weighted ? { kind: "repeat", weight: w, text: `Repeat ${w} ${unit}` } : { kind: "repeat", text: "Repeat, then push for the top of the range" };
}
const round = (n) => Math.round(n * 100) / 100;

// ---- session drafts ----
export function newEntry(state, x) {
  const e = { exId: x.id, name: x.name, mode: x.mode || "reps", perSide: !!x.perSide, bodyweight: !!x.bodyweight, rest: x.rest ?? 90, notes: "", sets: [] };
  const last = lastFor(state.sessions, x.id);
  const sug = suggest(state, x);
  const k = valKey(e.mode);
  const count = last ? last.entry.sets.length : x.sets || 3;
  const fallback = e.mode === "time" ? x.secs ?? 30 : e.mode === "dist" ? x.dist ?? 30 : x.repsMin ?? 8;
  for (let i = 0; i < count; i++) {
    const ls = last ? last.entry.sets[i] || last.entry.sets[last.entry.sets.length - 1] : null;
    const set = { done: false };
    if (!e.bodyweight) set.w = sug.weight != null ? sug.weight : ls && ls.w != null ? ls.w : x.weight ?? 0;
    set[k] = ls && ls[k] != null ? ls[k] : fallback;
    e.sets.push(set);
  }
  return e;
}

export function startDraft(state, workout) {
  const d = { id: today() + "-" + uid(), date: today(), workoutId: workout ? workout.id : "free", name: workout ? workout.name : "Free session", startedAt: new Date().toISOString(), notes: "", exercises: [] };
  if (workout) for (const x of workout.exercises) d.exercises.push(newEntry(state, x));
  return d;
}

export function finalizeDraft(d) {
  const out = { id: d.id, date: d.date, workoutId: d.workoutId, name: d.name, startedAt: d.startedAt, endedAt: new Date().toISOString(), notes: d.notes || "", exercises: [] };
  for (const e of d.exercises) {
    const sets = e.sets.filter((s) => s.done).map((s) => { const o = {}; if (s.w != null) o.w = s.w; const k = valKey(e.mode); if (s[k] != null) o[k] = s[k]; if (s.note) o.note = s.note; return o; });
    if (!sets.length && !e.notes) continue;
    const entry = { exId: e.exId, name: e.name, mode: e.mode, sets, perSide: e.perSide, bodyweight: e.bodyweight, notes: e.notes || "" };
    out.exercises.push(entry);
  }
  return out;
}

// ---- quick log: "goblet 16 8 8 7 felt easy" ----
export function findExercise(text, pool) {
  const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  let best = null, bestScore = 0;
  for (const x of pool) {
    const words = x.name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
    let score = 0;
    for (const w of words) if (t.includes(w.slice(0, Math.min(w.length, 5)))) score += w.length;
    if (score > bestScore) { bestScore = score; best = x; }
  }
  return bestScore > 0 ? best : null;
}
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; };

export function parseQuickLog(text, entries, unit = "kg") {
  const ex = findExercise(text, entries);
  if (!ex) return { error: "Which exercise? Start with its name, e.g. “goblet 16 8 8 7”." };
  let t = text.toLowerCase();
  let weight = null;
  const wm = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilos|kilogram|lb|lbs)/);
  if (wm) { weight = num(wm[1]); t = t.replace(wm[0], " "); }
  const sx = t.match(/(\d+)\s*[x×]\s*(\d+)/);
  let sets = null, reps = null;
  if (sx) { sets = +sx[1]; reps = +sx[2]; t = t.replace(sx[0], " "); }
  const nums = (t.match(/\d+(?:[.,]\d+)?/g) || []).map(num);
  const nameWords = ex.name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const note = t.replace(/\d+(?:[.,]\d+)?/g, " ").replace(/\b(kg|lbs?|sets?|reps?|seconds?|secs?|sec|s|x|and|then|of|per|side|each|meters?|metres?|m)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w && !nameWords.some((n) => n === w || (w.length > 2 && n.startsWith(w)) || (n.length > 2 && w.startsWith(n))))
    .join(" ").trim();
  const k = valKey(ex.mode);
  let vals = nums.slice();
  const hasWeight = !ex.bodyweight;
  if (sets && reps) {
    // "goblet 16 3x8": the NxM part is already stripped, so a leftover
    // leading number is the weight even when it is the only one.
    if (weight == null && hasWeight && vals.length) weight = vals[0];
    vals = Array(sets).fill(reps);
  } else if (weight == null && hasWeight && vals.length > 1) weight = vals.shift();
  if (!vals.length && weight == null && !note) return { error: "No numbers found." };
  return { ex, weight, vals, k, note: note ? note.charAt(0).toUpperCase() + note.slice(1) : "", unit };
}

// ---- plan from pasted text ----
// Lines starting with # or ending with ":" begin a workout. Exercise lines look like
//   Goblet Squat 3x8-10 16kg rest 90
//   Dead Hang 3 x 30s
//   Suitcase Carry 3x30m 16kg per side
export function parsePlanText(text) {
  const workouts = [];
  let cur = null;
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s*/, "");
    if (!line) continue;
    const head = line.match(/^#+\s*(.+)$/) || (line.endsWith(":") && !/\d/.test(line) ? [null, line.slice(0, -1)] : null);
    if (head) { cur = { id: uid(), name: head[1].trim(), subtitle: "", exercises: [] }; workouts.push(cur); continue; }
    const m = line.match(/^(.+?)\s+(\d+)\s*[x×]\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*(s|sec|secs|m|min|reps?)?\b(.*)$/i);
    if (!m) {
      // A short digit-free line ("Push-ups") is an exercise without a set
      // scheme; anything sentence-like is coach's prose and becomes the
      // workout description instead of a junk exercise.
      const nameLike = !/\d/.test(line) && !/[.,!?;:]/.test(line) && line.split(/\s+/).length <= 4;
      if (!nameLike) { if (cur) cur.intent = (cur.intent ? cur.intent + " " : "") + line; continue; }
      if (!cur) { cur = { id: uid(), name: "Workout", subtitle: "", exercises: [] }; workouts.push(cur); }
      cur.exercises.push(migrateWorkout({ exercises: [{ name: line }] }).exercises[0]);
      continue;
    }
    if (!cur) { cur = { id: uid(), name: "Workout", subtitle: "", exercises: [] }; workouts.push(cur); }
    const [, name, sets, a, b, u, rest] = m;
    const tail = rest.toLowerCase();
    const wm = tail.match(/(\d+(?:[.,]\d+)?)\s*(kg|lb|lbs)/);
    const rm = tail.match(/rest\s*(\d+)\s*(s|sec|min|m)?/);
    const unitL = (u || "").toLowerCase();
    // "min" is time in minutes; a bare "m" is metres.
    const mode = unitL.startsWith("s") || unitL === "min" ? "time" : unitL === "m" ? "dist" : "reps";
    const x = { id: slug(name), name: name.trim(), mode, sets: +sets, perSide: /per side|each side|\/ ?side/.test(tail), bodyweight: !wm && /bodyweight|bw\b/.test(tail) || (!wm && mode !== "reps" ? true : false) };
    if (mode === "reps") { x.repsMin = +a; x.repsMax = b ? +b : +a; } else if (mode === "time") x.secs = unitL === "min" ? +a * 60 : +a; else x.dist = +a;
    if (wm) x.weight = num(wm[1]); else if (!x.bodyweight) x.weight = 0;
    if (rm) x.rest = rm[2] && rm[2].startsWith("m") ? +rm[1] * 60 : +rm[1];
    // Whole-exercise names only: a bare "push"/"pull"/"chin" also matches Lat
    // Pulldown, Cable Push-down or Machine Row, which do take stack weight.
    if (!wm && mode === "reps" && /bodyweight|\bbw\b|push.?ups?|pull.?ups?|chin.?ups?|plank|hang|\bdips?\b/.test((name + tail).toLowerCase())) x.bodyweight = true;
    cur.exercises.push(migrateWorkout({ exercises: [x] }).exercises[0]);
  }
  return workouts.filter((w) => w.exercises.length);
}

// ---- export / import ----
export function summaryText(s, unit) {
  const lines = [`Gym — ${s.name} — ${fmtDate(s.date)}`];
  for (const e of s.exercises) lines.push(`${e.name}: ${fmtEntry(e, unit)}${e.notes ? " — " + e.notes : ""}`);
  if (s.notes) lines.push(`Notes: ${s.notes}`);
  return lines.join("\n");
}

export function exportObject(state, { full = true } = {}) {
  return { type: "gym-export", version: state.version, exportedAt: new Date().toISOString(), settings: { unit: state.settings.unit }, plan: state.plan, sessions: full ? state.sessions : sortedSessions(state.sessions).slice(0, 12) };
}

export function applyImport(state, obj) {
  const next = structuredClone(state);
  const report = [];
  if (obj.plan && (obj.plan.workouts || obj.plan.sessions)) {
    next.plan = { name: obj.plan.name || "", workouts: (obj.plan.workouts || obj.plan.sessions).map(migrateWorkout) };
    report.push("plan replaced");
  }
  if (Array.isArray(obj.workouts)) {
    for (const w of obj.workouts) next.plan.workouts.push(migrateWorkout(w));
    report.push(`${obj.workouts.length} workout(s) added`);
  }
  if (Array.isArray(obj.sessions)) {
    let added = 0, updated = 0;
    for (const raw of obj.sessions) {
      if (!raw || !Array.isArray(raw.exercises)) continue;
      const s = normalizeSession(raw);
      const i = next.sessions.findIndex((x) => x.id === s.id);
      if (i >= 0) { next.sessions[i] = s; updated++; } else { next.sessions.push(s); added++; }
    }
    report.push(`${added} session(s) added, ${updated} updated`);
  }
  if (obj.settings && obj.settings.unit) next.settings.unit = obj.settings.unit;
  if (!report.length) throw new Error("Nothing recognisable in that block (expected plan, workouts or sessions).");
  return { state: next, report: report.join("; ") };
}

// Find the first complete JSON object in free text (prose before or after is
// ignored, including prose containing braces). Walks from each '{' with a
// depth counter that skips string literals; parses the first balanced block
// that is valid JSON.
export function extractJSON(text) {
  const s = String(text);
  for (let start = s.indexOf("{"); start !== -1; start = s.indexOf("{", start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (esc) { esc = false; continue; }
      if (inStr) { if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        // A trivial brace expression in surrounding prose ('use {} if empty')
        // must not hijack the import — only a non-empty object counts.
        try { const v = JSON.parse(s.slice(start, i + 1)); if (v && typeof v === "object" && Object.keys(v).length) return v; } catch (e) { /* keep scanning */ }
        break;
      }
    }
  }
  throw new Error("No JSON found.");
}

export function claudePrompt(state) {
  const ex = allExercises(state).map((x) => `${x.id} (${x.name}, ${x.mode}${x.perSide ? ", per side" : ""}${x.bodyweight ? ", bodyweight" : ""})`).join("; ");
  return `I log gym sessions in a small offline app called Gymmy. I'll describe a session in words; reply with ONE JSON block I can paste into the app, then a one-line summary. Format:
{"type":"gym-import","sessions":[{"id":"YYYY-MM-DD-x","date":"YYYY-MM-DD","workoutId":"<id or free>","name":"Workout name","notes":"","exercises":[{"exId":"goblet_squat","name":"Goblet Squat","mode":"reps","sets":[{"w":16,"r":8},{"w":16,"r":8}],"notes":""}]}]}
Set fields: w = weight ${state.settings.unit} (omit for bodyweight), r = reps, s = seconds (mode "time"), m = metres (mode "dist"). One object per set.
To change the plan instead, reply with {"type":"gym-import","plan":{"name":"...","workouts":[{"id":"a","name":"Workout A","exercises":[{"id":"goblet_squat","name":"Goblet Squat","mode":"reps","sets":3,"repsMin":8,"repsMax":10,"weight":16,"increment":1,"rest":90,"perSide":false,"bodyweight":false,"cue":""}]}]}}
Known exercises: ${ex || "none yet"}.
Workouts: ${state.plan.workouts.map((w) => w.id + " = " + w.name + " (" + w.exercises.map((x) => x.name).join(", ") + ")").join("; ") || "none yet"}.`;
}
