import { describe, it, expect } from "vitest";
import { extractJSON, parseQuickLog, parsePlanText, applyImport, suggest, newEntry, draftHasProgress, matchExercises, findExercise, fmtTime, fmtEntry, fmtTarget, finalizeDraft } from "./model";
import { emptyState, migrate, strList, migrateExercise, normalizeSession } from "./store";

describe("technique fields and training rules", () => {
  const planImport = {
    type: "gym-import",
    plan: {
      name: "Test",
      loadNote: "80% after the break",
      rules: ["Last set easy → increment"],
      stopRules: ["Pain = stop"],
      workouts: [{ id: "a", name: "A", exercises: [{ id: "goblet_squat", name: "Goblet Squat", mode: "reps", sets: 3, repsMin: 8, repsMax: 10, weight: 16, cue: "Ribs down", steps: ["Hold the bell", "Sit down"], watchFor: ["Knees caving"], progression: "Pause, then 18 kg" }] }],
    },
  };

  it("imports steps, watchFor, cue, progression and plan rules", () => {
    const { state } = applyImport(emptyState(), planImport);
    const x = state.plan.workouts[0].exercises[0];
    expect(x.steps).toEqual(["Hold the bell", "Sit down"]);
    expect(x.watchFor).toEqual(["Knees caving"]);
    expect(x.cue).toBe("Ribs down");
    expect(x.progression).toBe("Pause, then 18 kg");
    expect(state.plan.loadNote).toBe("80% after the break");
    expect(state.plan.rules).toEqual(["Last set easy → increment"]);
    expect(state.plan.stopRules).toEqual(["Pain = stop"]);
  });

  it("a full plan replacement resets omitted name, load note and rules", () => {
    const { state: s1 } = applyImport(emptyState(), planImport);
    const { state: s2 } = applyImport(s1, { type: "gym-import", plan: { name: "New block", workouts: [{ id: "b", name: "B", exercises: [] }] } });
    expect(s2.plan.name).toBe("New block");
    expect(s2.plan.loadNote).toBe("");
    expect(s2.plan.rules).toEqual([]);
    expect(s2.plan.stopRules).toEqual([]);
  });

  it("a name-only plan import renames without throwing", () => {
    const { state, report } = applyImport(emptyState(), { type: "gym-import", plan: { name: "Winter block" } });
    expect(state.plan.name).toBe("Winter block");
    expect(report).toContain("renamed");
  });

  it("tolerates a pre-schema-3 base state (replace-restore path)", () => {
    const oldBase = { ...emptyState(), plan: { name: "", workouts: [] } };
    const { state } = applyImport(oldBase, { type: "gym-import", sessions: [{ id: "x", date: "2026-09-20", exercises: [] }] });
    expect(state.plan.rules).toEqual([]);
    expect(state.plan.stopRules).toEqual([]);
    expect(state.plan.loadNote).toBe("");
  });

  it("updates rules alone without touching workouts", () => {
    const { state: s1 } = applyImport(emptyState(), planImport);
    const { state: s2, report } = applyImport(s1, { type: "gym-import", plan: { loadNote: "" } });
    expect(s2.plan.workouts).toHaveLength(1);
    expect(s2.plan.loadNote).toBe("");
    expect(report).toContain("rules updated");
  });

  it("survives a storage migration round-trip", () => {
    const { state } = applyImport(emptyState(), planImport);
    const back = migrate(JSON.parse(JSON.stringify(state)));
    expect(back.plan.workouts[0].exercises[0].steps).toEqual(["Hold the bell", "Sit down"]);
    expect(back.plan.stopRules).toEqual(["Pain = stop"]);
  });

  it("accepts a newline string where a list is expected", () => {
    expect(strList("a\nb\n\n c ")).toEqual(["a", "b", "c"]);
    expect(strList(["x", " y "])).toEqual(["x", "y"]);
    expect(strList(null)).toEqual([]);
  });
});

const entries = [
  { exId: "goblet_squat", name: "Goblet Squat", mode: "reps", bodyweight: false },
  { exId: "push_up", name: "Push-up", mode: "reps", bodyweight: true },
  { exId: "dead_hang", name: "Dead Hang", mode: "time", bodyweight: true },
];
// parseQuickLog matches on a pool shaped like session entries (exId) or plan
// exercises (id); Session.jsx passes draft entries, so tests mirror that, with
// `id` mirrored for findExercise's name matching.
entries.forEach((e) => { e.id = e.exId; });

describe("parseQuickLog", () => {
  it("takes the first number as weight in the list form", () => {
    const r = parseQuickLog("goblet 16 8 8 7", entries);
    expect(r.weight).toBe(16);
    expect(r.vals).toEqual([8, 8, 7]);
  });

  it("keeps the bare leading weight in the sets×reps form (goblet 16 3x8)", () => {
    const r = parseQuickLog("goblet 16 3x8", entries);
    expect(r.weight).toBe(16);
    expect(r.vals).toEqual([8, 8, 8]);
  });

  it("prefers an explicit unit-tagged weight", () => {
    const r = parseQuickLog("goblet 16kg 3x8", entries);
    expect(r.weight).toBe(16);
    expect(r.vals).toEqual([8, 8, 8]);
  });

  it("never treats numbers as weight for bodyweight exercises", () => {
    const r = parseQuickLog("pushup 6 6 5", entries);
    expect(r.weight).toBeNull();
    expect(r.vals).toEqual([6, 6, 5]);
  });

  it("parses time-mode values in seconds", () => {
    const r = parseQuickLog("dead hang 40 30 25", entries);
    expect(r.k).toBe("s");
    expect(r.vals).toEqual([40, 30, 25]);
  });

  it("keeps a trailing note", () => {
    const r = parseQuickLog("goblet 16 8 8 7 felt easy", entries);
    expect(r.note).toBe("Felt easy");
  });
});

describe("parsePlanText", () => {
  it("parses exercise lines with ranges, weight and rest", () => {
    const [w] = parsePlanText("# Workout A\nGoblet Squat 3x8-10 16kg rest 90\nDead Hang 3 x 30s");
    expect(w.name).toBe("Workout A");
    expect(w.exercises).toHaveLength(2);
    expect(w.exercises[0]).toMatchObject({ name: "Goblet Squat", mode: "reps", sets: 3, repsMin: 8, repsMax: 10, weight: 16, rest: 90 });
    expect(w.exercises[1]).toMatchObject({ name: "Dead Hang", mode: "time", secs: 30, bodyweight: true });
  });

  it("turns prose lines into the workout description, not junk exercises", () => {
    const [w] = parsePlanText("# Workout A\nFocus on slow eccentrics this block.\nGoblet Squat 3x8 16kg\nWarm up 5 min before starting");
    expect(w.exercises).toHaveLength(1);
    expect(w.exercises[0].name).toBe("Goblet Squat");
    expect(w.intent).toContain("Focus on slow eccentrics");
    expect(w.intent).toContain("Warm up 5 min");
  });

  it("reads Nx1min as a timed exercise in seconds", () => {
    const [w] = parsePlanText("# A\nPlank 3x1min");
    expect(w.exercises[0]).toMatchObject({ mode: "time", secs: 60 });
  });

  it("marks push-ups bodyweight but not lat pulldowns or cable push-downs", () => {
    const [w] = parsePlanText("# A\nPush-up 3x8\nLat Pulldown 3x8-10\nCable Push-down 3x12");
    expect(w.exercises.map((x) => !!x.bodyweight)).toEqual([true, false, false]);
  });

  it("keeps a bare short name as an exercise", () => {
    const [w] = parsePlanText("# Workout A\nPush-ups");
    expect(w.exercises).toHaveLength(1);
    expect(w.exercises[0].name).toBe("Push-ups");
  });
});

describe("extractJSON", () => {
  const obj = { type: "gym-import", sessions: [{ id: "2026-09-20-a", exercises: [] }] };
  const json = JSON.stringify(obj);

  it("parses a bare object", () => {
    expect(extractJSON(json)).toEqual(obj);
  });

  it("ignores prose after the object, even prose containing braces", () => {
    expect(extractJSON(json + "\nNote: adjust {increment} if it feels easy.")).toEqual(obj);
  });

  it("ignores prose before the object", () => {
    expect(extractJSON("Here you go — paste this into Gymmy:\n" + json)).toEqual(obj);
  });

  it("handles fenced code blocks", () => {
    expect(extractJSON("```json\n" + json + "\n```\nA one-line summary.")).toEqual(obj);
  });

  it("handles braces inside string values", () => {
    const tricky = { notes: "keep {tension}, no } worries", ok: true };
    expect(extractJSON("intro " + JSON.stringify(tricky) + " outro }")).toEqual(tricky);
  });

  it("skips a stray brace and finds the real object", () => {
    expect(extractJSON("weird { fragment\n" + json)).toEqual(obj);
  });

  it("is not hijacked by a trivial {} in leading prose", () => {
    expect(extractJSON('Set "notes": {} if empty, then paste:\n' + json)).toEqual(obj);
  });

  it("throws when there is no JSON", () => {
    expect(() => extractJSON("no data here")).toThrow("No JSON found.");
    expect(() => extractJSON("{ broken")).toThrow("No JSON found.");
  });
});

describe("suggest and prefill follow the planned set count", () => {
  const row = { id: "inverted_row", name: "Inverted Row", mode: "reps", bodyweight: true, sets: 4, repsMin: 6, repsMax: 8, progression: "4×8 clean → drop the bar one notch" };
  const goblet = { id: "goblet_squat", name: "Goblet Squat", mode: "reps", bodyweight: false, sets: 3, repsMin: 8, repsMax: 10, weight: 16, increment: 1 };
  const withHist = (entries) => {
    const st = emptyState();
    st.sessions = entries.map((e, i) => ({ id: "s" + i, date: "2026-09-" + String(10 + i).padStart(2, "0"), workoutId: "b", name: "B", exercises: [e] }));
    return st;
  };
  const rowEntry = (reps) => ({ exId: "inverted_row", name: "Inverted Row", mode: "reps", bodyweight: true, sets: reps.map((r) => ({ r })) });
  const gobEntry = (w, reps) => ({ exId: "goblet_squat", name: "Goblet Squat", mode: "reps", sets: reps.map((r) => ({ w, r })) });

  it("3×8 of a planned 4×6–8 asks for the 4th set, not a 9th rep", () => {
    const s = suggest(withHist([rowEntry([8, 8, 8])]), row);
    expect(s.kind).toBe("repeat");
    expect(s.text).toBe("Repeat 8 reps, add the 4th set");
  });

  it("4×8 at the top of the range uses the plan's progression for bodyweight", () => {
    const s = suggest(withHist([rowEntry([8, 8, 8, 8])]), row);
    expect(s).toMatchObject({ kind: "up", fromPlan: true, text: "4×8 clean → drop the bar one notch" });
  });

  it("falls back to +1 rep for bodyweight without a progression note", () => {
    const s = suggest(withHist([rowEntry([8, 8, 8, 8])]), { ...row, progression: "" });
    expect(s.text).toBe("Next: aim 9 reps");
  });

  it("weighted: missing sets keep the weight; all sets at the top add the increment", () => {
    expect(suggest(withHist([gobEntry(16, [10, 10])]), goblet)).toMatchObject({ kind: "repeat", weight: 16, text: "Repeat 16 kg, add the 3rd set" });
    expect(suggest(withHist([gobEntry(16, [10, 10, 10])]), goblet)).toMatchObject({ kind: "up", weight: 17 });
  });

  it("two or more missing sets say how many to build to", () => {
    expect(suggest(withHist([rowEntry([8, 8])]), row).text).toBe("Repeat 8 reps, build to 4 sets");
  });

  it("prefills the planned number of rows, reusing last time's numbers", () => {
    const e = newEntry(withHist([rowEntry([8, 8, 7])]), row);
    expect(e.sets.map((x) => x.r)).toEqual([8, 8, 7, 7]);
  });
});

describe("draftHasProgress", () => {
  const draft = (over = {}) => ({ id: "d", name: "Session B", notes: "", exercises: [{ exId: "x", name: "X", notes: "", sets: [{ r: 8, done: false }, { r: 8, done: false }] }], ...over });
  it("is false with no draft or only prefilled, unticked sets", () => {
    expect(draftHasProgress(null)).toBe(false);
    expect(draftHasProgress(draft())).toBe(false);
  });
  it("is true once a set is ticked", () => {
    const d = draft(); d.exercises[0].sets[1].done = true;
    expect(draftHasProgress(d)).toBe(true);
  });
  it("is true with an exercise note or a session note, ignoring whitespace", () => {
    const d = draft(); d.exercises[0].notes = "bar at chest";
    expect(draftHasProgress(d)).toBe(true);
    expect(draftHasProgress(draft({ notes: "tired" }))).toBe(true);
    expect(draftHasProgress(draft({ notes: "   " }))).toBe(false);
  });
});

describe("matchExercises", () => {
  const pool = [{ id: "bench", name: "Bench Press" }, { id: "incline", name: "Incline Bench Press" }, { id: "squat", name: "Goblet Squat" }];
  it("lists every match, best first, for the add-exercise picker", () => {
    expect(matchExercises("incline bench", pool).map((x) => x.id)).toEqual(["incline", "bench"]);
    expect(matchExercises("bench", pool).map((x) => x.id)).toEqual(["bench", "incline"]);
  });
  it("finds names from the start of a word", () => {
    expect(matchExercises("gob", pool).map((x) => x.id)).toEqual(["squat"]);
  });
  it("returns nothing for an unknown name", () => {
    expect(matchExercises("deadlift", pool)).toEqual([]);
  });
  it("findExercise keeps picking the single best match", () => {
    expect(findExercise("goblet 16 8 8 7", pool).id).toBe("squat");
  });
});

describe("cardio", () => {
  const walk = migrateExercise({ id: "treadmill_walk", name: "Treadmill walk", mode: "cardio", machine: "treadmill" });
  const logged = (exId, mode, sets, extra = {}) => normalizeSession({ id: exId + mode, date: "2026-10-01", exercises: [{ exId, name: exId, mode, sets, ...extra }] });

  it("shows time as m:ss, or h:mm:ss past an hour", () => {
    expect(fmtTime(1530)).toBe("25:30");
    expect(fmtTime(65)).toBe("1:05");
    expect(fmtTime(3723)).toBe("1:02:03");
  });

  it("sets up each machine with its own fields and a time goal", () => {
    expect(walk).toMatchObject({ mode: "cardio", machine: "treadmill", track: ["m", "inc", "spd"], goal: "time", secs: 1800, bodyweight: true, sets: 1 });
    expect(migrateExercise({ name: "Rower", mode: "cardio", machine: "rower" }).track).toEqual(["m", "lvl", "spm"]);
    expect(migrateExercise({ name: "Horse riding", mode: "cardio", machine: "pony" }).machine).toBe("other");
    expect(fmtTarget(walk, "kg")).toBe("Goal 30:00 · Treadmill · rest 90 s");
    expect(fmtTarget(migrateExercise({ ...walk, goal: "dist", dist: 3000 }), "kg")).toBe("Goal 3.00 km · Treadmill · rest 90 s");
  });

  it("a distance goal always records distance", () => {
    const bike = migrateExercise({ name: "Bike", mode: "cardio", machine: "bike", track: ["lvl"], goal: "dist" });
    expect(bike.track).toEqual(["m", "lvl"]);
    expect(bike.dist).toBe(3000);
  });

  it("prefills the goal and last time's settings, never last time's results", () => {
    const st = emptyState();
    expect(newEntry(st, walk).sets).toEqual([{ done: false, s: 1800, m: null, inc: null, spd: null }]);
    st.sessions.push(logged("treadmill_walk", "cardio", [{ s: 1530, m: 2100, inc: 8, spd: 5.5 }], { machine: "treadmill", track: ["m", "inc", "spd"] }));
    expect(newEntry(st, walk).sets[0]).toEqual({ done: false, s: 1800, m: null, inc: 8, spd: 5.5 });
    // Distance goal: the time is today's result, so it starts empty.
    expect(newEntry(st, migrateExercise({ ...walk, goal: "dist", dist: 2000 })).sets[0]).toEqual({ done: false, s: null, m: 2000, inc: 8, spd: 5.5 });
    expect(suggest(st, walk).kind).toBe("none");
  });

  it("ignores history logged under another type", () => {
    const st = emptyState();
    st.sessions.push(logged("plank", "cardio", [{ s: 1530 }], { machine: "other" }));
    const hold = migrateExercise({ id: "plank", name: "Plank", mode: "time", secs: 30, sets: 2 });
    expect(newEntry(st, hold).sets.map((x) => x.s)).toEqual([30, 30]);
    expect(suggest(st, hold).kind).toBe("none");
  });

  it("saves every field and shows one total line", () => {
    const d = { id: "x", date: "2026-10-06", workoutId: "free", name: "Free", exercises: [newEntry(emptyState(), walk)] };
    Object.assign(d.exercises[0].sets[0], { done: true, s: 1530, m: 2100, inc: 8, spd: 5.5 });
    const e = finalizeDraft(d).exercises[0];
    expect(e).toMatchObject({ mode: "cardio", machine: "treadmill", sets: [{ s: 1530, m: 2100, inc: 8, spd: 5.5 }] });
    expect(fmtEntry(e)).toBe("25:30 · 2.10 km · incline 8% · 5.5 km/h");
    expect(fmtEntry({ ...e, machine: "rower", sets: [{ s: 600, m: 2000, lvl: 6, spm: 24 }] })).toBe("10:00 · 2000 m · level 6 · 24 spm");
  });

  it("keeps cardio through a backup round trip", () => {
    const out = migrate(JSON.parse(JSON.stringify({ version: 3, plan: { workouts: [{ id: "w", name: "W", exercises: [walk] }] },
      sessions: [{ id: "a", date: "2026-10-01", exercises: [{ exId: "bike", name: "Bike", mode: "cardio", machine: "bike", track: ["m", "lvl"], sets: [{ s: 1200, m: 8000, lvl: 7 }] }] }] })));
    expect(out.plan.workouts[0].exercises[0]).toMatchObject({ mode: "cardio", machine: "treadmill", track: ["m", "inc", "spd"] });
    expect(out.sessions[0].exercises[0]).toMatchObject({ mode: "cardio", machine: "bike", sets: [{ s: 1200, m: 8000, lvl: 7 }] });
  });
});
