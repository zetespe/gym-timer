import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { applyImport, aiPrompt, extractJSON } from "./model";
import { emptyState, migrateExercise, normalizeSession } from "./store";

// The AI is told the format by docs/AI-PROTOCOL.md and aiPrompt(); both must
// describe blocks the app actually imports, cardio included.
describe("AI protocol examples", () => {
  const doc = readFileSync(new URL("../../docs/AI-PROTOCOL.md", import.meta.url), "utf8");
  const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]));

  it("imports the documented session, cardio fields intact", () => {
    const { state } = applyImport(emptyState(), blocks.find((b) => b.sessions));
    const walk = state.sessions[0].exercises.find((e) => e.mode === "cardio");
    expect(walk).toMatchObject({ exId: "treadmill_walk", machine: "treadmill", track: ["m", "inc", "spd"], sets: [{ s: 1530, m: 2100, inc: 8, spd: 5.5 }] });
  });

  it("imports the documented plan, cardio goal intact", () => {
    const { state } = applyImport(emptyState(), blocks.find((b) => b.plan));
    const rower = state.plan.workouts[0].exercises.find((x) => x.mode === "cardio");
    expect(rower).toMatchObject({ id: "rower", machine: "rower", track: ["m", "lvl", "spm"], goal: "dist", dist: 2000, rest: 120, bodyweight: true });
  });

  // The prompt's inline examples are what the AI copies most closely.
  const example = (p, start) => extractJSON(p.slice(p.indexOf(start)));
  it("the prompt's own cardio examples import intact", () => {
    const p = aiPrompt(emptyState());
    const walk = normalizeSession({ exercises: [example(p, '{"exId":"treadmill_walk"')] }).exercises[0];
    expect(walk).toMatchObject({ mode: "cardio", machine: "treadmill", track: ["m", "inc", "spd"], sets: [{ s: 1530, m: 2100, inc: 8, spd: 5.5 }] });
    const rower = migrateExercise(example(p, '{"id":"rower"'));
    expect(rower).toMatchObject({ mode: "cardio", machine: "rower", track: ["m", "lvl", "spm"], goal: "dist", dist: 2000, rest: 120 });
  });

  it("forgives what an AI is likely to get slightly wrong", () => {
    // Only a distance, no goal: a distance goal, not a hidden 30:00.
    expect(migrateExercise({ name: "Run", mode: "cardio", machine: "treadmill", dist: 5000 })).toMatchObject({ goal: "dist", dist: 5000 });
    expect(migrateExercise({ name: "Walk", mode: "cardio", machine: "Treadmill" }).machine).toBe("treadmill");
    // A session without the machine takes the known exercise's machine and fields.
    const st = emptyState();
    st.plan.workouts.push({ id: "c", name: "Cardio", exercises: [migrateExercise({ id: "rower", name: "Rower", mode: "cardio", machine: "rower" })] });
    const { state } = applyImport(st, { sessions: [{ id: "s", date: "2026-10-09", exercises: [{ exId: "rower", name: "Rower", mode: "cardio", sets: [{ s: 600, m: 2000, lvl: 5, spm: 24 }] }] }] });
    expect(state.sessions[0].exercises[0]).toMatchObject({ machine: "rower", track: ["m", "lvl", "spm"] });
  });

  it("the prompt explains cardio and lists known cardio exercises with their machine", () => {
    const st = emptyState();
    st.plan.workouts.push({ id: "c", name: "Cardio", exercises: [migrateExercise({ id: "bike", name: "Bike", mode: "cardio", machine: "bike" })] });
    const p = aiPrompt(st);
    expect(p).toContain('mode "cardio"');
    expect(p).toContain('"machine"');
    expect(p).toContain("bike (Bike, cardio, bike)");
  });
});
