import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { applyImport, aiPrompt } from "./model";
import { emptyState, migrateExercise } from "./store";

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

  it("the prompt explains cardio and lists known cardio exercises with their machine", () => {
    const st = emptyState();
    st.plan.workouts.push({ id: "c", name: "Cardio", exercises: [migrateExercise({ id: "bike", name: "Bike", mode: "cardio", machine: "bike" })] });
    const p = aiPrompt(st);
    expect(p).toContain('mode "cardio"');
    expect(p).toContain('"machine"');
    expect(p).toContain("bike (Bike, cardio, bike)");
  });
});
