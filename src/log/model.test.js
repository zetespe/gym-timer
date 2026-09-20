import { describe, it, expect } from "vitest";
import { extractJSON } from "./model";

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
