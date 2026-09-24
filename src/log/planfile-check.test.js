import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { applyImport } from "./model";
import { emptyState } from "./store";

// End-to-end import of a full plan file (the checked-in synthetic fixture),
// covering the whole gym-import shape: plan metadata, rules, and exercises
// with technique fields. Read inside beforeAll so a malformed fixture shows
// up as a named failure, not an aborted test-file collection.
describe("plan file import (fixture)", () => {
  let obj;
  beforeAll(() => {
    obj = JSON.parse(readFileSync(new URL("./fixtures/sample-plan.json", import.meta.url), "utf8"));
  });

  it("imports the whole file cleanly", () => {
    const { state, report } = applyImport(emptyState(), obj);
    expect(report).toContain("plan replaced");
    expect(state.plan.name).toBe("Sample plan");
    expect(state.plan.loadNote).toMatch(/lighter/);
    expect(state.plan.rules).toHaveLength(1);
    expect(state.plan.stopRules).toHaveLength(1);
    expect(state.plan.workouts).toHaveLength(1);
  });

  it("keeps technique fields and modes intact through import", () => {
    const { state } = applyImport(emptyState(), obj);
    const [w] = state.plan.workouts;
    const goblet = w.exercises.find((x) => x.id === "goblet_squat");
    const hang = w.exercises.find((x) => x.id === "dead_hang");
    expect(goblet).toMatchObject({ mode: "reps", weight: 16, rest: 90, cue: "Elbows inside knees" });
    expect(goblet.steps).toHaveLength(3);
    expect(goblet.watchFor).toEqual(["Knees caving in", "Heels lifting"]);
    expect(hang).toMatchObject({ mode: "time", secs: 30, bodyweight: true });
    expect(hang.steps.length).toBeGreaterThan(0);
  });
});
