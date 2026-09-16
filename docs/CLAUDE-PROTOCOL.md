# Gym Log ↔ Claude protocol

The log stores everything on the phone. Claude never has direct access. Data
moves by copy/paste (Backup tab) in either direction.

## From the app to Claude

The user pastes one of:

- A plain-text session summary, e.g.
  ```
  Gym — Workout A — 16 Sep
  Goblet Squat: 16 kg × 10, 10, 10 — Felt easy
  Push-up: 6, 6, 5
  Dead Hang: 40, 30, 25 s
  ```
- A `gym-export` JSON object: `{ "type": "gym-export", "plan": {...}, "sessions": [...] }`.

## From Claude to the app

Reply with exactly one JSON object the user pastes into Backup → Paste from
Claude (or Plan → Paste a plan). Prose and code fences around it are ignored;
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
{ "type": "gym-import", "plan": { "name": "Autumn base", "workouts": [
  { "id": "a", "name": "Workout A", "subtitle": "Push + hinge", "exercises": [
    { "id": "goblet_squat", "name": "Goblet Squat", "mode": "reps", "sets": 3,
      "repsMin": 8, "repsMax": 10, "weight": 16, "increment": 1, "rest": 90,
      "perSide": false, "bodyweight": false, "cue": "Elbows inside knees" },
    { "id": "dead_hang", "name": "Dead Hang", "mode": "time", "sets": 3, "secs": 30,
      "bodyweight": true, "rest": 90 }
  ] }
] } }
```

Older phase-1 blocks (`plan.sessions[]`, `reps`, `planId`) are accepted and
upgraded on import.

## Next-weight rule (for analysis and advice)

Double progression per exercise, using `repsMin`–`repsMax` (or the time /
distance target) and `increment`:

- every set at the top of the range → weight + increment next time
- inside the range but not at the top → repeat the weight
- below the bottom once → repeat; twice in a row → about 10% less

The app shows the suggestion; the user decides. Within a session the user
drops weight whenever reps get ugly or anything hurts.
