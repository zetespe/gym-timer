import { describe, it, expect } from "vitest";
import { parsePlanText } from "./model";

// Integration check for a realistic multi-line paste (heading + prose +
// mixed exercise forms), complementing the per-feature tests in model.test.js.
describe("session A paste block", () => {
  const plan = `# Session A — Push + Hinge
Test the push-up number, then build the hinge pattern that protects the back.
Push-up 3x3-10 rest 120
Incline Push-up 3x8-10 rest 90
Single-Leg DB Romanian Deadlift 3x8 10kg rest 90 per side
Goblet Squat 3x8 16kg rest 90
Inverted Row 3x8 bodyweight rest 90
Dead Bug 3x8 4kg rest 60 per side`;

  it("parses as one workout with six exercises and the prose as intent", () => {
    const ws = parsePlanText(plan);
    expect(ws).toHaveLength(1);
    const [w] = ws;
    expect(w.name).toBe("Session A — Push + Hinge");
    expect(w.intent).toContain("push-up number");
    expect(w.exercises).toHaveLength(6);
    expect(w.exercises.map((x) => x.name)).toEqual([
      "Push-up", "Incline Push-up", "Single-Leg DB Romanian Deadlift",
      "Goblet Squat", "Inverted Row", "Dead Bug",
    ]);
  });

  it("keeps weights, ranges, rest and per-side flags", () => {
    const [w] = parsePlanText(plan);
    const by = (n) => w.exercises.find((x) => x.name === n);
    expect(by("Push-up")).toMatchObject({ bodyweight: true, repsMin: 3, repsMax: 10, rest: 120 });
    expect(by("Single-Leg DB Romanian Deadlift")).toMatchObject({ weight: 10, perSide: true, rest: 90 });
    expect(by("Goblet Squat")).toMatchObject({ weight: 16, repsMin: 8, repsMax: 8 });
    expect(by("Inverted Row")).toMatchObject({ bodyweight: true });
    expect(by("Dead Bug")).toMatchObject({ weight: 4, perSide: true, rest: 60 });
  });
});
