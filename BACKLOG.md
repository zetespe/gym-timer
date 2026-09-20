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

## 4. Feature: switch between plans (requested 2026-09-20)

**What Zofia wants (plain English):** the app holds one plan at a time. She
wants several plans for different circumstances — e.g. the full gym plan, a
travel plan, a home-only plan (exercises doable without equipment) — and a
way to *switch* between them, not just pile more workouts into one plan.
A longer plan variant for different circumstances is a different thing than
another workout in the same plan. Hard requirement: **it has to be simple** —
and what "simple" means here is deliberately still open. Design before
building: maybe just a named-plans list with one active, maybe something
leaner. Discuss the design with her first.

**What needs to be done (tech notes):** state grows from `plan` to
`plans: []` + `activePlanId` (migration keeps the current plan as the only
entry). Exercise history already links by exercise id, so shared exercises
(push-ups at home and at the gym) keep one history and next-weight thread
across plans if ids match — a real argument for a shared exercise id space.
Today tab shows the active plan's workouts; Plan tab gets the switcher.
AI import needs a decision: does `plan` replace the active plan only, and
how does an AI address a specific plan?

**Expected user experience:** before a trip, one tap switches to "Travel";
Today shows only the travel workouts; back home, switch back. History and
progression survive switching, and shared exercises carry their numbers
between plans.

## 5. Experiment: rest-timer sound while the app is in the background

**The problem (plain English):** when the rest countdown hits zero while
you're in another app (Spotify, messages) or the screen is locked, no beep or
"Go" plays — iPhone freezes web apps completely in the background, so nothing
can make sound. The app already shows the *correct* remaining time the moment
you come back, and now also announces "Go! Rest ended N seconds ago" (in red)
so overlong rests are at least visible — but it cannot warn you *at* zero.
A proper App-Store app could; a web app on iOS cannot schedule sounds or
notifications.

**The experiment:** the trick interval-timer web apps use is to play a
*silent* audio track during the rest. iOS then treats the app like a music
player and keeps it running in the background, so the real beep and "Go" fire
on time even from another app. The catch: starting audio in Gymmy will likely
pause or interrupt Spotify — which may defeat the point at the gym. So this
would ship as an **off-by-default setting** ("Background beeps —
experimental, may interfere with music apps") and needs a real-phone test
with headphones + Spotify before judging it.

**Expected user experience if it works:** flip the toggle once; from then on
the "Go" cue sounds at the right moment even with the phone locked or in
Spotify. If it fights with music playback, the toggle stays off and nothing
changes.

**Tech notes (implementation):** loop a near-silent `<audio>` element
(`loop`, `playsinline`, tiny silent WAV as a data URI) started from the
set-tick tap (user gesture, required by iOS autoplay rules) and stopped when
the rest ends; keep the `AudioContext` resumed off the same gesture so
`beep()`/`speechSynthesis` can fire from the still-running JS timer. Risks:
iOS may still suspend despite audio; the audio session may take over or duck
other apps' playback (test `audio.volume = 0.001` vs true silence — fully
silent tracks are sometimes ignored for keep-alive); battery cost of staying
awake; Media Session metadata leaking into the lock screen. The complete fix
remains a native wrapper (Capacitor) with local notifications — a much bigger
project.

## 6. App icons are placeholders

**What we found:** the home-screen and browser icons are generated stopwatch
placeholders (from `icon.svg`), kept from the original Gym Timer.

**What needs to be done:** design or pick a real Gymmy icon, regenerate the
PNG sizes, and replace the files in `public/`.

**Expected user experience:** a distinctive Gymmy icon on the phone's home
screen instead of the generic stopwatch.
