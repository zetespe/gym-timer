import { useEffect, useRef, useState } from "react";
import { useLog, patch, setState, getState, slug, migrateExercise } from "./store";
import { fmtDate, fmtEntry, fmtTarget, lastFor, valKey, valUnit, newEntry, finalizeDraft, entryHasResults, sessionHasContent, SKIP_REASONS, findExercise, parseQuickLog, suggest, allExercises, matchExercises, CARDIO_FIELDS, MACHINES, distUnit, toDisplayDist, fromDisplayDist } from "./model";
import { Stepper, TimeField, toast, ask, confirmAction } from "./ui";
import { beep, doubleBeep, speak } from "../audio";
import { useWakeLock } from "../useWakeLock";
import Technique from "./Technique";
import GymTimer from "../GymTimer";

export default function Session({ onFinished, onExit }) {
  const S = useLog();
  const d = S.draft;
  const [rest, setRest] = useState(null); // { total, endAt, left, name }
  const [timerFor, setTimerFor] = useState(null); // exercise index
  const [now, setNow] = useState(() => Date.now());
  const restPrev = useRef(null); // previous `left`, to fire each cue beep once

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  // keep the screen on for the whole session where supported
  useWakeLock(true);
  // Rest countdown. `left` is always derived from the wall clock (endAt), not
  // from tick counting: browsers throttle or suspend timers when the app is
  // backgrounded, so on return the remaining time must still be correct.
  useEffect(() => {
    if (!rest) return;
    if (rest.left <= 0) {
      // Announce "Go" once, even if we resumed long after the rest ended.
      // iOS freezes the app in the background, so the announcement can only
      // happen on return — say HOW LATE it is, so overlong rests are visible.
      const over = Math.max(0, Math.round((Date.now() - rest.endAt) / 1000));
      if (restPrev.current !== 0) { doubleBeep(); speak(over > 5 ? `Go! Rest ended ${over} seconds ago` : "Go"); }
      restPrev.current = 0;
      const t = setTimeout(() => setRest(null), over > 5 ? 4000 : 1500);
      return () => clearTimeout(t);
    }
    // Side effects stay outside the setRest updater — React may invoke
    // updaters more than once (StrictMode does), which would double the beeps.
    const sync = () => {
      const left = Math.max(0, Math.ceil((rest.endAt - Date.now()) / 1000));
      if (left === rest.left) return;
      // Cue beeps only on single-step transitions — skipped seconds after a
      // background resume stay silent.
      if (left <= 4 && left > 1 && restPrev.current === left + 1) beep(660, 80, 0.3);
      // Long rests get a spoken warning so you can get into position.
      if (left === 15 && rest.total >= 25 && restPrev.current === 16) { beep(880, 120, 0.4); setTimeout(() => speak("15 seconds. Get ready."), 150); }
      if (left > 0) restPrev.current = left; // 0 is recorded by the finish branch, after it announces "Go"
      setRest((r) => (r ? { ...r, left } : r));
    };
    const t = setInterval(sync, 250);
    document.addEventListener("visibilitychange", sync);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", sync); };
  }, [rest]);
  // Which card's "⋯" menu is open. Escape closes it, like tapping outside.
  const [menuFor, setMenuFor] = useState(null);
  useEffect(() => {
    if (menuFor == null) return;
    const onKey = (ev) => { if (ev.key === "Escape") setMenuFor(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuFor]);

  if (!d) return null;
  const unit = S.settings.unit;
  const workout = S.plan.workouts.find((w) => w.id === d.workoutId);
  const mins = Math.max(0, Math.round((now - new Date(d.startedAt)) / 60000));

  const mut = (fn) => patch((s) => { fn(s.draft); });
  // The countdown remembers its card (index and name), so changing rest on
  // one card never shifts a countdown another card started.
  const startRest = (ei) => { const e = d.exercises[ei]; if (S.settings.restTimer && e.rest > 0) { restPrev.current = e.rest; setRest({ total: e.rest, endAt: Date.now() + e.rest * 1000, left: e.rest, name: e.name, ei }); } };
  // Un-ticking also drops a cardio block's "typed" mark: an explicit untick means don't save it.
  const toggleSet = (ei, si) => { const was = d.exercises[ei].sets[si].done; mut((dr) => { const st = dr.exercises[ei].sets[si]; st.done = !was; if (was) delete st.typed; }); if (!was) startRest(ei); };

  const onQuick = (text) => {
    const r = parseQuickLog(text, d.exercises.filter((x) => !x.skipped), unit);
    if (r.error) {
      // Name an exercise that is skipped or swapped out instead of "Which exercise?".
      const hidden = !r.error.startsWith("Which exercise") ? null : findExercise(text, [...d.exercises.filter((x) => x.skipped).map((x) => ({ ...x, why: "is skipped today. Undo it first." })),
        ...d.exercises.filter((x) => x.swappedFrom).map((x) => ({ name: x.swappedFrom.name, why: `was swapped for ${x.name}.` }))]);
      toast(hidden ? `${hidden.name} ${hidden.why}` : r.error, 4000);
      return false;
    }
    // Write into the card that was matched, not the first with that id: a
    // skipped twin would swallow the sets.
    const i = d.exercises.indexOf(r.ex);
    mut((dr) => {
      const ex = dr.exercises[i];
      if (r.vals.length) ex.sets = r.vals.map((v) => { const o = { done: true }; if (!ex.bodyweight) o.w = r.weight != null ? r.weight : ex.sets[0] && ex.sets[0].w != null ? ex.sets[0].w : 0; o[r.k] = v; return o; });
      else if (r.weight != null) ex.sets.forEach((s) => { s.w = r.weight; s.done = true; });
      if (r.note) ex.notes = (ex.notes ? ex.notes + " " : "") + r.note;
    });
    const ex = getState().draft.exercises[i];
    toast("✓ " + ex.name + ": " + fmtEntry(ex, unit) + (r.note ? " · “" + r.note + "”" : ""), 3500);
    return true;
  };

  // The add-exercise questions, one at a time (Back returns to the previous
  // one). Resolves with a new session entry, or null when cancelled.
  const pickExercise = async (title = "Exercise name") => {
    const pool = allExercises(S);
    let step = "name", name = "", matches = [], mode = "reps", x = null;
    while (!x) {
      if (step === "name") {
        const v = await ask({ title, input: { value: name, placeholder: "e.g. Goblet squat" }, buttons: [{ label: "Next", kind: "primary" }], back: "Cancel" });
        if (v == null) return null;
        name = v;
        x = pool.find((p) => p.name.toLowerCase() === name.toLowerCase());
        matches = x ? [] : matchExercises(name, pool);
        step = matches.length ? "pick" : "mode";
      } else if (step === "pick") {
        const v = await ask({ title: "Which one?", buttons: [...matches.map((m) => ({ label: m.name, value: m })), { label: `+ New: “${name}”`, value: "new" }], back: "Back", stack: true });
        if (v == null) step = "name"; else if (v === "new") step = "mode"; else x = v;
      } else if (step === "mode") {
        const v = await ask({ title: "Measured in?", buttons: [{ label: "Reps", value: "reps" }, { label: "Time", value: "time" }, { label: "Distance", value: "dist" }, { label: "Cardio", value: "cardio" }], back: "Back", stack: true });
        if (v == null) step = matches.length ? "pick" : "name"; else { mode = v; step = v === "cardio" ? "machine" : "weight"; }
      } else if (step === "machine") {
        const v = await ask({ title: "Which machine?", buttons: Object.entries(MACHINES).map(([k, m]) => ({ label: m.label, value: k })), back: "Back", stack: true });
        if (v == null) step = "mode"; else x = migrateExercise({ id: slug(name), name, mode: "cardio", machine: v });
      } else {
        const v = await ask({ title: "Weights or bodyweight?", buttons: [{ label: "Weights", value: false }, { label: "Bodyweight", value: true }], back: "Back", stack: true });
        if (v == null) step = "mode";
        else x = { id: slug(name), name, mode, bodyweight: v, perSide: false, sets: 3, repsMin: 8, repsMax: 8, weight: 0, rest: 90 };
      }
    }
    // A known exercise brings its planned sets, weight and rest from any workout.
    x = planExercise(x.id) || x;
    // State may have moved on while the questions were open.
    return newEntry(getState(), Object.assign({ sets: 3, repsMin: 8, repsMax: 8, rest: 90 }, x));
  };
  // "Why?" for not following the plan: a quick reason, your own words, or
  // none. Resolves with the reason ("" for none), or null when cancelled.
  const askReason = async (title) => {
    for (;;) {
      const v = await ask({ title, text: "Saved in History.", buttons: [...SKIP_REASONS.map((r) => ({ label: r, value: r })), { label: "Other reason…", value: "other" }, { label: "No reason", value: "" }], back: "Cancel", stack: true });
      if (v !== "other") return v;
      const own = await ask({ title: "Your reason", input: { placeholder: "e.g. shoulder felt tight" }, buttons: [{ label: "Save", kind: "primary" }], back: "Back" });
      if (own != null) return own;
    }
  };
  const skipExercise = async (ei) => {
    const why = await askReason(`Skip ${d.exercises[ei].name}?`);
    if (why != null) mut((dr) => { Object.assign(dr.exercises[ei], { skipped: true, skipReason: why }); });
  };
  // This workout's version first: the same exercise can differ between workouts.
  const planExercise = (id) => (workout && workout.exercises.find((p) => p.id === id)) || S.plan.workouts.flatMap((w) => w.exercises).find((p) => p.id === id);
  const addExercise = async () => { const e = await pickExercise(); if (e) mut((dr) => { dr.exercises.push(e); }); };
  // Swap puts the new exercise in the old one's place, for today only. Results
  // on the old card would be lost, so that asks first. Replacing a plan
  // exercise asks why, and History records it as swapped.
  const swapExercise = async (ei) => {
    const old = d.exercises[ei];
    if (entryHasResults(old) && !(await confirmAction(`Swap ${old.name}?`, "Its ticked sets, typed results and note won't be saved.", "Swap", "Keep"))) return;
    // Only leaving the plan exercise asks why; swapping its replacement again
    // keeps that first reason.
    const planned = old.swappedFrom || (old.fromPlan && { exId: old.exId, name: old.name, mode: old.mode, perSide: old.perSide, bodyweight: old.bodyweight });
    const why = old.fromPlan ? await askReason(`Why swap ${old.name}?`) : "";
    if (why == null) return;
    const e = await pickExercise(`Swap ${old.name} for…`);
    if (!e) return;
    setRest((r) => (r && r.ei === ei ? null : r));
    // Picking the planned exercise again simply puts it back.
    const next = !planned ? e : e.exId === planned.exId ? { ...e, fromPlan: true } : { ...e, swappedFrom: old.swappedFrom || { ...planned, reason: why } };
    mut((dr) => { dr.exercises[ei] = next; });
  };
  // Rest is per exercise and can change mid-session; a countdown already
  // running for this exercise moves with it.
  const changeRest = (ei, delta) => {
    const e = d.exercises[ei], cur = e.rest ?? 90, next = Math.max(0, cur + delta);
    if (next === cur) return;
    mut((dr) => { dr.exercises[ei].rest = next; });
    setRest((r) => (r && r.ei === ei && r.name === e.name ? { ...r, total: Math.max(1, r.total + next - cur), endAt: r.endAt + (next - cur) * 1000 } : r));
  };

  const finish = async () => {
    const out = finalizeDraft(d);
    if (!sessionHasContent(out)) { if (await confirmAction("Nothing ticked yet", "Discard this session?", "Discard", "Keep going")) { setState((s) => ({ ...s, draft: null })); onExit(); } return; }
    setState((s) => ({ ...s, sessions: [...s.sessions, out], draft: null, settings: { ...s.settings, sessionsSinceBackup: (s.settings.sessionsSinceBackup || 0) + 1 } }));
    onFinished(out.id);
  };

  return (
    <div className={"page" + (rest ? " resting" : "")}>
      <div className="hdr"><h1>{d.name}</h1><span className="muted small">{fmtDate(d.date)} · {mins} min</span></div>
      {workout && workout.intent && <p className="muted small">{workout.intent}</p>}
      {S.plan.loadNote && <div className="banner">{S.plan.loadNote}</div>}
      {d.exercises.map((e, ei) => {
        const px = planExercise(e.exId) || null;
        const last = lastFor(S.sessions, e.exId, { excludeId: d.id, mode: e.mode });
        const sug = px ? suggest(S, px) : { kind: "none", text: "" };
        const allDone = e.sets.length > 0 && e.sets.every((s) => s.done);
        const k = valKey(e.mode);
        const hasW = !e.bodyweight;
        // Rest has its own control on the card, so the target line leaves it out.
        const targetText = px ? px.target || fmtTarget({ ...px, rest: 0 }, unit) : "";
        if (e.skipped) return (
          <div className="card skipped" key={ei}>
            <div className="hdr"><h3>{e.name}</h3><span className="pill">skipped</span></div>
            <div className="row" style={{ marginTop: 6 }}><span className="muted small grow">Saved as skipped, no sets</span>
              <button className="btn sm" onClick={() => mut((dr) => { delete dr.exercises[ei].skipped; delete dr.exercises[ei].skipReason; })}>Undo</button></div>
            <textarea rows={2} placeholder="Why? (optional, saved in History)" value={e.skipReason || ""} onChange={(ev) => mut((dr) => { dr.exercises[ei].skipReason = ev.target.value; })} />
          </div>
        );
        return (
          <div className={"card" + (allDone ? " done" : "")} key={ei}>
            <div className="hdr"><h3>{e.name}{e.perSide && <> <span className="pill">per side</span></>}</h3>
              <div className="row" style={{ gap: 8 }}>{allDone && <span className="pill ok">✓ done</span>}
                <div className="menuwrap">
                  <button className="dots" aria-label={`More for ${e.name}`} aria-expanded={menuFor === ei} onClick={() => setMenuFor(menuFor === ei ? null : ei)}>⋯</button>
                  {menuFor === ei && <>
                    <div className="menu-back" onClick={() => setMenuFor(null)} />
                    <div className="menu" role="menu">
                      <button role="menuitem" onClick={() => { setMenuFor(null); swapExercise(ei); }}><span className="ic">⇄</span><span>Swap<small>Do another exercise instead</small></span></button>
                      <button role="menuitem" onClick={() => { setMenuFor(null); skipExercise(ei); }}><span className="ic">⏭</span><span>Skip today<small>Not doing it today; History notes why</small></span></button>
                      {/* Plan exercises can't vanish from the record: Swap or Skip them. */}
                      {!e.fromPlan && !e.swappedFrom && <button role="menuitem" className="red" onClick={async () => { setMenuFor(null); if (await confirmAction(`Remove ${e.name} from this session?`, entryHasResults(e) ? "Its ticked sets and note won't be saved." : "", "Remove")) { mut((dr) => { dr.exercises.splice(ei, 1); }); setRest((r) => (!r ? r : r.ei === ei ? null : r.ei > ei ? { ...r, ei: r.ei - 1 } : r)); } }}><span className="ic">✕</span><span>Remove<small>Added by mistake? Take it off</small></span></button>}
                    </div>
                  </>}
                </div>
              </div>
            </div>
            {e.swappedFrom && <div className="target">instead of {e.swappedFrom.name}{e.swappedFrom.reason ? ` · “${e.swappedFrom.reason}”` : ""}</div>}
            {targetText && <div className="target">{targetText}</div>}
            <div className="last">{last ? <>Last ({fmtDate(last.date)}): <b>{fmtEntry(last.entry, unit)}</b>{last.entry.notes ? " — " + last.entry.notes : ""}</> : "No previous record"}</div>
            {px && px.cue && <div className="cue">{px.cue}</div>}
            {px && <Technique x={px} sug={sug} />}
            {e.mode === "cardio" ? e.sets.map((s, si) => (
              <div className="cgrid" key={si}>
                <TimeField value={s.s} onChange={(v) => mut((dr) => { Object.assign(dr.exercises[ei].sets[si], { s: v, typed: true }); })} />
                {e.track.map((k) => k === "m"
                  ? <Stepper key={k} value={toDisplayDist(s.m, e.machine)} step={distUnit(e.machine) === "km" ? 0.1 : 50} unit={distUnit(e.machine)}
                      onChange={(v) => mut((dr) => { Object.assign(dr.exercises[ei].sets[si], { m: fromDisplayDist(v, e.machine), typed: true }); })} />
                  : <Stepper key={k} value={s[k]} step={CARDIO_FIELDS[k].step} unit={CARDIO_FIELDS[k].unit} inputMode={CARDIO_FIELDS[k].step < 1 ? "decimal" : "numeric"} onChange={(v) => mut((dr) => { dr.exercises[ei].sets[si][k] = v; })} />)}
                <button className={"check" + (s.done ? " on" : "")} onClick={() => toggleSet(ei, si)} aria-label="done">✓</button>
              </div>
            )) : <div className="sets">
              {e.sets.map((s, si) => (
                <div className={"set" + (hasW ? "" : " nw")} key={si}>
                  <div className="n">{si + 1}</div>
                  {hasW && <Stepper value={s.w} step={unit === "kg" ? 1 : 2.5} unit={unit} onChange={(v) => mut((dr) => { dr.exercises[ei].sets[si].w = v; })} />}
                  <Stepper value={s[k]} step={e.mode === "dist" ? 5 : 1} unit={valUnit(e.mode)} inputMode="numeric" onChange={(v) => mut((dr) => { dr.exercises[ei].sets[si][k] = v; })} />
                  <div><button className={"check" + (s.done ? " on" : "")} onClick={() => toggleSet(ei, si)} aria-label="set done">✓</button></div>
                </div>
              ))}
            </div>}
            <div className="ex-actions">
              {/* Cardio is one block for now; interval blocks come later. */}
              {e.mode !== "cardio" && <><button className="btn sm" onClick={() => { const all = e.sets.every((s) => s.done); mut((dr) => { dr.exercises[ei].sets.forEach((s) => (s.done = !all)); }); if (!all) startRest(ei); }}>✓ All as shown</button>
              <button className="btn sm" onClick={() => mut((dr) => { const ss = dr.exercises[ei].sets; const l = ss[ss.length - 1]; ss.push(l ? { ...l, done: false } : { done: false, w: e.bodyweight ? undefined : 0, [k]: 8 }); })}>+ set</button>
              {e.sets.length > 0 && <button className="btn sm ghost" onClick={() => mut((dr) => { dr.exercises[ei].sets.pop(); })}>− set</button>}</>}
              {e.mode === "time" && <button className="btn sm" onClick={() => setTimerFor(ei)}>⏱ Timer</button>}
            </div>
            <div className="restctl"><span className="muted small grow">{e.mode === "cardio" ? "Rest after" : "Rest between sets"}</span>
              <button aria-label="Shorter rest" onClick={() => changeRest(ei, -15)}>−</button><b>{e.rest ?? 90} s</b><button aria-label="Longer rest" onClick={() => changeRest(ei, 15)}>+</button></div>
            <textarea rows={1} placeholder="Note (felt easy, bar height, knee…)" value={e.notes || ""} onChange={(ev) => mut((dr) => { dr.exercises[ei].notes = ev.target.value; })} />
          </div>
        );
      })}
      <button className="btn" onClick={addExercise}>+ Add exercise</button>
      {S.plan.stopRules.length > 0 && (
        <details className="techbox" style={{ marginTop: 14 }}>
          <summary>Stop rules</summary>
          <div className="tech"><ul>{S.plan.stopRules.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
        </details>
      )}
      <h2>Session notes</h2>
      <textarea rows={2} placeholder="Anything about the whole session" value={d.notes || ""} onChange={(ev) => mut((dr) => { dr.notes = ev.target.value; })} />
      <div className="quick">
        <form onSubmit={(ev) => { ev.preventDefault(); const i = ev.target.elements.q; if (i.value.trim() && onQuick(i.value.trim())) i.value = ""; }}>
          <input className="text" name="q" enterKeyHint="done" placeholder="Quick log: “goblet 16 8 8 7 felt easy”" autoComplete="off" />
          <button className="btn primary" type="submit">Log</button>
        </form>
        <div className="muted small">Tap the mic on the keyboard to dictate. Weight first, then reps per set.</div>
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn primary grow" onClick={finish}>Finish session</button>
        <button className="btn ghost danger" onClick={async () => { if (await confirmAction("Discard this session?", "Nothing will be saved.", "Discard", "Keep going")) { setState((s) => ({ ...s, draft: null })); onExit(); } }}>Discard</button>
      </div>

      {rest && (() => {
        const over = rest.left <= 0 ? Math.max(0, Math.round((Date.now() - rest.endAt) / 1000)) : 0;
        return (
          <div className={"rest" + (over > 5 ? " late" : "")} onClick={() => setRest(null)}>
            <div className="t">{rest.left > 0 ? rest.left : "GO"}</div>
            <div className="grow"><div className="small muted">{over > 5 ? `Rest ended ${over} s ago` : `Rest · ${rest.name}`}</div><div className="bar"><div style={{ width: `${Math.max(0, (100 * rest.left) / rest.total)}%` }} /></div></div>
            <button className="btn sm ghost">Skip</button>
          </div>
        );
      })()}

      {timerFor != null && d.exercises[timerFor] && (
        <div className="overlay">
          <button className="btn sm close" onClick={() => setTimerFor(null)}>‹ Back</button>
          <GymTimer
            preset={{
              hold: d.exercises[timerFor].sets[0]?.s || 20,
              swap: (S.settings.timer && S.settings.timer.swap) || 4,
              rest: d.exercises[timerFor].rest ?? 90, // 0 = sets back to back (e.g. a superset)
              perSet: d.exercises[timerFor].perSide ? 2 : 1,
              // Run only the sets not ticked yet; the timer stops by itself after the last one.
              sets: d.exercises[timerFor].sets.filter((s) => !s.done).length || d.exercises[timerFor].sets.length || 3,
            }}
            onResult={({ sets: reps, hold, partial }) => {
              // Sets already ticked (earlier timer runs, manual logging) are
              // kept and the new holds appended after them; only untouched
              // prefilled sets are replaced. Weight carries over set by set —
              // a weighted hold must not come back as bodyweight.
              // A hold stopped early (to failure) is logged with its real length.
              const secs = [...Array.from({ length: reps }, () => hold), ...(partial > 0 ? [partial] : [])];
              if (secs.length) mut((dr) => { const ex = dr.exercises[timerFor]; const old = ex.sets; const kept = old.filter((s) => s.done); ex.sets = [...kept, ...secs.map((sec, i) => { const o = { done: true, s: sec }; const w = old[kept.length + i]?.w ?? old[old.length - 1]?.w; if (!ex.bodyweight && w != null) o.w = w; return o; })]; });
              setTimerFor(null);
              // The timer runs no rest after the last set, so the rest before
              // the next exercise starts here, as it does for a manual tick.
              if (secs.length) startRest(timerFor);
              if (secs.length) toast(`${secs.join(", ")} s recorded for ${d.exercises[timerFor].name}`);
            }}
          />
        </div>
      )}
    </div>
  );
}
