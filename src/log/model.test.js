import { describe, it, expect } from "vitest";
import { extractJSON, parseQuickLog, parsePlanText, applyImport } from "./model";
import { emptyState, migrate, strList } from "./store";

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
