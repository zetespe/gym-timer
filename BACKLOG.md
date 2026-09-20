# Gymmy backlog

Known improvements deliberately deferred. Each entry: what was found, what
needs to be done, and what the user should notice once it's done. Found during
the September 2026 code reviews of the workout-log feature.

## 1. Typing can get laggy as history grows (performance)

**What we found:** Every keystroke in a notes or name field makes the app copy
the *entire* workout history in memory (a `structuredClone` of the whole
state in `src/log/store.js` `patch()`), and while a session is open, every
re-render re-sorts the full session list about twice per exercise card
(`lastFor` + `suggest` both call `historyFor`, which sorts all sessions).
Saving to storage is already batched (fixed), but the in-memory copying and
re-sorting are not. With a handful of sessions this is invisible; after a year
of training it grows into visible input lag on a phone.

**What needs to be done:**
- In `patch()`, clone only the part of the state being changed (usually the
  draft session) instead of everything.
- In `Session.jsx`, compute the sorted session list once per render and reuse
  it (`useMemo` keyed on the sessions array) instead of re-sorting per
  exercise.

**Expected user experience:** none today — the point is that typing notes
mid-workout stays instant even after years of logged sessions.

## 2. The same logic lives in several places (duplication)

**What we found:** Two cases of copy-paste logic that will drift apart:
- Rest-time parsing exists twice: `parseRest` in `src/log/store.js` and an
  inline regex in `parsePlanText` (`src/log/model.js`), and the two already
  disagree subtly about how a bare "m" (minutes vs metres) is treated.
- The "3×8–10 · 16 kg · rest 90 s" target string is hand-built in three
  places (`Plan.jsx` twice, `Session.jsx` once) with small differences
  (dash style, bodyweight handling).

**What needs to be done:** extract one shared `fmtTarget(exercise, unit)`
helper into `src/log/model.js` and make `parsePlanText` call `parseRest`;
delete the copies.

**Expected user experience:** targets look identical everywhere in the app,
and a future formatting fix lands once instead of needing three edits. Risk of
"fixed in one screen, still broken in another" bugs goes away.

## 3. A bare exercise name in a pasted plan isn't recognised as bodyweight

**What we found:** in "Paste a plan", a line with a set scheme ("Push-up
3x6-8") is correctly marked bodyweight, but a bare name line ("Push-ups")
takes a different code path and comes out as a weighted exercise at 0 kg with
default 3×8. Seen during smoke testing.

**What needs to be done:** run the bare-name path through the same bodyweight
heuristic used for full exercise lines in `parsePlanText`.

**Expected user experience:** pasting a minimal plan that just lists names
gives sensible defaults — push-ups won't show a pointless 0 kg weight field
in every session.

## 4. App icons are placeholders

**What we found:** the home-screen and browser icons are generated stopwatch
placeholders (from `icon.svg`), kept from the original Gym Timer.

**What needs to be done:** design or pick a real Gymmy icon, regenerate the
PNG sizes, and replace the files in `public/`.

**Expected user experience:** a distinctive Gymmy icon on the phone's home
screen instead of the generic stopwatch.
