import { describe, it, expect } from "vitest";
import { extractJSON, parseQuickLog } from "./model";

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

  it("throws when there is no JSON", () => {
    expect(() => extractJSON("no data here")).toThrow("No JSON found.");
    expect(() => extractJSON("{ broken")).toThrow("No JSON found.");
  });
});
