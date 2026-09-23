# Gymmy ↔ AI protocol

Gymmy stores everything on the phone. No AI has direct access; any assistant
(Claude, ChatGPT, Gemini, …) works. Data
moves by copy/paste (Backup tab) in either direction.

## From the app to the AI

The user pastes one of:

- A plain-text session summary, e.g.
  ```
  Gym — Workout A — 16 Sep
  Goblet Squat: 16 kg × 10, 10, 10 — Felt easy
  Push-up: 6, 6, 5
  Dead Hang: 40, 30, 25 s
  ```
- A `gym-export` JSON object: `{ "type": "gym-export", "plan": {...}, "sessions": [...] }`.

## From the AI to the app

Reply with exactly one JSON object the user pastes into Backup → Paste from
your AI (or Plan → Paste a plan). Prose and code fences around it are ignored;
the first `{...}` is parsed.

```json
{
  "type": "gym-import",
  "sessions": [
    {
      "id": "2026-09-19-a1",
      "date": "2026-09-19",
      "workoutId": "a",
      "name": "Workout A",
      "notes": "",
      "exercises": [
        { "exId": "goblet_squat", "name": "Goblet Squat", "mode": "reps",
          "sets": [ { "w": 16, "r": 8 }, { "w": 16, "r": 8 }, { "w": 16, "r": 7 } ], "notes": "" },
        { "exId": "dead_hang", "name": "Dead Hang", "mode": "time", "bodyweight": true,
          "sets": [ { "s": 40 }, { "s": 30 }, { "s": 25 } ] },
        { "exId": "suitcase_carry", "name": "Suitcase Carry", "mode": "dist", "perSide": true,
          "sets": [ { "w": 18, "m": 30 }, { "w": 18, "m": 30 }, { "w": 18, "m": 30 } ] }
      ]
    }
  ]
}
```

Rules:

- `sessions[]`: same `id` updates an existing session, a new `id` adds one.
  Use `YYYY-MM-DD-<short>` ids.
- `mode`: `reps` (field `r`), `time` (seconds, `s`), `dist` (metres, `m`).
  `w` is the weight in the user's unit; omit for bodyweight. One object per set.
- `perSide: true` when numbers are per side; `bodyweight: true` hides the weight field.
- `workoutId` is the plan workout id, or `free`.

To change the plan, send `plan` (replaces all workouts) or `workouts` (appends):

```json
{ "type": "gym-import", "plan": {
  "name": "Autumn base",
  "loadNote": "First two sessions back: run everything at ~80% of listed weights.",
  "rules": [ "Last set feels easy → smallest increment next time",
             "Slow reps before heavier load, pauses before volume" ],
  "stopRules": [ "Pain during an exercise = stop",
                 "Back feels worked rather than calm = regress immediately" ],
  "workouts": [
  { "id": "a", "name": "Workout A", "subtitle": "Push + hinge",
    "intent": "Build the hinge pattern that protects the back", "exercises": [
    { "id": "goblet_squat", "name": "Goblet Squat", "mode": "reps", "sets": 3,
      "repsMin": 8, "repsMax": 10, "weight": 16, "increment": 1, "rest": 90,
      "perSide": false, "bodyweight": false,
      "cue": "Elbows inside knees, ribs down",
      "steps": [ "Hold one dumbbell vertically against your chest, elbows tucked",
                 "Feet shoulder-width, toes slightly out",
                 "Sit straight down between your feet, elbows inside the knees",
                 "Drive through the whole foot to stand" ],
      "watchFor": [ "Chest collapsing forward", "Knees caving in", "Heels lifting" ],
      "progression": "2s pause at the bottom, then 18–20 kg" },
    { "id": "dead_hang", "name": "Dead Hang", "mode": "time", "sets": 3, "secs": 30,
      "bodyweight": true, "rest": 90 }
  ] }
] } }
```

Technique fields (all optional per exercise):

- `cue` — one short reminder, always visible during the session.
- `steps` — how to perform it, one step per array entry (shown in order).
- `watchFor` — common faults, one per entry.
- `progression` — when and how to make it harder.

Plan-level fields (all optional):

- `loadNote` — a temporary caution shown at the start of every session
  (e.g. reduced load after a break). The user clears it in the Plan tab.
- `rules` — the plan's progression rules; shown in the Plan tab.
- `stopRules` — when to stop or regress; shown in the Plan tab and one tap
  away inside a session.
- Sending `plan` with only `loadNote`/`rules`/`stopRules` (no `workouts`)
  updates just those without touching the workouts.

Older phase-1 blocks (`plan.sessions[]`, `reps`, `planId`) are accepted and
upgraded on import.

## Next-weight rule (for analysis and advice)

Double progression per exercise, using `repsMin`–`repsMax` (or the time /
distance target) and `increment`:

- every planned set (`sets`) at the top of the range → weight + increment
  next time; for a bodyweight exercise the exercise's `progression` text
  (e.g. "drop the bar one notch") is the next step, or +1 rep without one
- fewer sets than planned, all at the target → same load, add the missing set
- inside the range but not at the top → repeat the weight
- below the bottom once → repeat; twice in a row → about 10% less

The app shows the suggestion together with the plan's `progression` text in
one block under "How to do it"; the user decides. Within a session the user
drops weight whenever reps get ugly or anything hurts.
