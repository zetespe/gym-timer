import { useEffect, useRef, useState } from "react";
import { useLog, patch, setState, getState, slug } from "./store";
import { fmtDate, fmtEntry, lastFor, valKey, valUnit, newEntry, finalizeDraft, parseQuickLog, suggest, allExercises, findExercise } from "./model";
import { Stepper, toast } from "./ui";
import { beep, doubleBeep, speak } from "../audio";
import GymTimer from "../GymTimer";

export default function Session({ onFinished, onExit }) {
  const S = useLog();
  const d = S.draft;
  const [rest, setRest] = useState(null); // { total, endAt, left, name }
  const [timerFor, setTimerFor] = useState(null); // exercise index
  const [now, setNow] = useState(() => Date.now());
  const wakeRef = useRef(null);
  const restPrev = useRef(null); // previous `left`, to fire each cue beep once

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  // keep the screen on for the whole session where supported
  useEffect(() => {
    let active = true;
    const req = async () => { try { if (navigator.wakeLock && document.visibilityState === "visible") wakeRef.current = await navigator.wakeLock.request("screen"); } catch (e) {} };
    req();
    const vis = () => { if (active && document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", vis);
    return () => { active = false; document.removeEventListener("visibilitychange", vis); try { if (wakeRef.current) wakeRef.current.release(); } catch (e) {} };
  }, []);
  // Rest countdown. `left` is always derived from the wall clock (endAt), not
  // from tick counting: browsers throttle or suspend timers when the app is
  // backgrounded, so on return the remaining time must still be correct.
  useEffect(() => {
    if (!rest) return;
    if (rest.left <= 0) {
      // Announce "Go" once, even if we resumed long after the rest ended.
      if (restPrev.current !== 0) { doubleBeep(); speak("Go"); }
      restPrev.current = 0;
      const t = setTimeout(() => setRest(null), 1500);
      return () => clearTimeout(t);
    }
    const sync = () => setRest((r) => {
      if (!r) return r;
      const left = Math.max(0, Math.ceil((r.endAt - Date.now()) / 1000));
      if (left === r.left) return r;
      // Cue beeps only on single-step transitions — skipped seconds after a
      // background resume stay silent.
      if (left <= 4 && left > 1 && restPrev.current === left + 1) beep(660, 80, 0.3);
      if (left > 0) restPrev.current = left; // 0 is recorded by the finish branch, after it announces "Go"
      return { ...r, left };
    });
    const t = setInterval(sync, 250);
    document.addEventListener("visibilitychange", sync);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", sync); };
  }, [rest]);

  if (!d) return null;
  const unit = S.settings.unit;
  const workout = S.plan.workouts.find((w) => w.id === d.workoutId);
  const mins = Math.max(0, Math.round((now - new Date(d.startedAt)) / 60000));

  const mut = (fn) => patch((s) => { fn(s.draft); });
  const startRest = (e) => { if (S.settings.restTimer && e.rest > 0) { restPrev.current = e.rest; setRest({ total: e.rest, endAt: Date.now() + e.rest * 1000, left: e.rest, name: e.name }); } };
  const toggleSet = (ei, si) => { const was = d.exercises[ei].sets[si].done; mut((dr) => { dr.exercises[ei].sets[si].done = !was; }); if (!was) startRest(d.exercises[ei]); };

  const onQuick = (text) => {
    const r = parseQuickLog(text, d.exercises, unit);
    if (r.error) { toast(r.error, 3500); return; }
    mut((dr) => {
      const ex = dr.exercises.find((x) => x.exId === r.ex.exId);
      if (r.vals.length) ex.sets = r.vals.map((v) => { const o = { done: true }; if (!ex.bodyweight) o.w = r.weight != null ? r.weight : ex.sets[0] && ex.sets[0].w != null ? ex.sets[0].w : 0; o[r.k] = v; return o; });
      else if (r.weight != null) ex.sets.forEach((s) => { s.w = r.weight; s.done = true; });
      if (r.note) ex.notes = (ex.notes ? ex.notes + " " : "") + r.note;
    });
    const ex = getState().draft.exercises.find((x) => x.exId === r.ex.exId);
    toast("✓ " + ex.name + ": " + fmtEntry(ex, unit) + (r.note ? " · “" + r.note + "”" : ""), 3500);
  };

  const addExercise = () => {
    const name = prompt("Exercise name:"); if (!name) return;
    const pool = allExercises(S);
    let x = pool.find((p) => p.name.toLowerCase() === name.trim().toLowerCase()) || findExercise(name, pool);
    if (!x || !confirm(`Use "${x.name}"?`)) {
      const mode = (prompt("Measured in: reps, time (seconds) or dist (metres)?", "reps") || "reps").toLowerCase();
      x = { id: slug(name), name: name.trim(), mode: ["time", "dist"].includes(mode) ? mode : "reps", bodyweight: confirm("Bodyweight only (no weight field)?"), perSide: false, sets: 3, repsMin: 8, repsMax: 8, weight: 0, rest: 90 };
    }
    const e = newEntry(S, Object.assign({ sets: 3, repsMin: 8, repsMax: 8, rest: 90 }, x));
    mut((dr) => { dr.exercises.push(e); });
  };

  const finish = () => {
    const out = finalizeDraft(d);
    if (!out.exercises.length) { if (confirm("Nothing ticked yet. Discard this session?")) { setState((s) => ({ ...s, draft: null })); onExit(); } return; }
    setState((s) => ({ ...s, sessions: [...s.sessions, out], draft: null, settings: { ...s.settings, sessionsSinceBackup: (s.settings.sessionsSinceBackup || 0) + 1 } }));
    onFinished(out.id);
  };

  return (
    <div className="page">
      <div className="hdr"><h1>{d.name}</h1><span className="muted small">{fmtDate(d.date)} · {mins} min</span></div>
      {workout && workout.intent && <p className="muted small">{workout.intent}</p>}
      {d.exercises.map((e, ei) => {
        const px = workout ? workout.exercises.find((x) => x.id === e.exId) : null;
        const last = lastFor(S.sessions, e.exId, { excludeId: d.id });
        const sug = px ? suggest(S, px) : { kind: "none", text: "" };
        const allDone = e.sets.length > 0 && e.sets.every((s) => s.done);
        const k = valKey(e.mode);
        const hasW = !e.bodyweight;
        const targetText = px ? (px.target || `${px.sets}×${px.mode === "reps" ? (px.repsMin === px.repsMax ? px.repsMin : px.repsMin + "–" + px.repsMax) : px.mode === "time" ? px.secs + " s" : px.dist + " m"}${px.perSide ? " / side" : ""}${!px.bodyweight && px.weight != null ? " · " + px.weight + " " + unit : ""}`) : "";
        return (
          <div className={"card" + (allDone ? " done" : "")} key={ei}>
            <div className="hdr"><h3>{e.name}{e.perSide && <> <span className="pill">per side</span></>}</h3>{allDone && <span className="pill ok">✓ done</span>}</div>
            {targetText && <div className="target">{targetText}{px && px.rest ? ` · rest ${px.rest} s` : ""}</div>}
            <div className="last">{last ? <>Last ({fmtDate(last.date)}): <b>{fmtEntry(last.entry, unit)}</b>{last.entry.notes ? " — " + last.entry.notes : ""}</> : "No previous record"}</div>
            {sug.text && <div className={"next " + sug.kind}>{sug.text}</div>}
            {px && (px.cue || px.progression) && <details className="small muted" style={{ marginTop: 6 }}><summary>Cues</summary>{px.cue && <p>{px.cue}</p>}{px.progression && <p>{px.progression}</p>}</details>}
            <div className="sets">
              {e.sets.map((s, si) => (
                <div className={"set" + (hasW ? "" : " nw")} key={si}>
                  <div className="n">{si + 1}</div>
                  {hasW && <Stepper value={s.w} step={unit === "kg" ? 1 : 2.5} unit={unit} onChange={(v) => mut((dr) => { dr.exercises[ei].sets[si].w = v; })} />}
                  <Stepper value={s[k]} step={e.mode === "reps" ? 1 : 5} unit={valUnit(e.mode)} inputMode="numeric" onChange={(v) => mut((dr) => { dr.exercises[ei].sets[si][k] = v; })} />
                  <div><button className={"check" + (s.done ? " on" : "")} onClick={() => toggleSet(ei, si)} aria-label="set done">✓</button></div>
                </div>
              ))}
            </div>
            <div className="ex-actions">
              <button className="btn sm" onClick={() => { const all = e.sets.every((s) => s.done); mut((dr) => { dr.exercises[ei].sets.forEach((s) => (s.done = !all)); }); if (!all) startRest(e); }}>✓ All as shown</button>
              <button className="btn sm" onClick={() => mut((dr) => { const ss = dr.exercises[ei].sets; const l = ss[ss.length - 1]; ss.push(l ? { ...l, done: false } : { done: false, w: e.bodyweight ? undefined : 0, [k]: 8 }); })}>+ set</button>
              {e.sets.length > 0 && <button className="btn sm ghost" onClick={() => mut((dr) => { dr.exercises[ei].sets.pop(); })}>− set</button>}
              {e.mode === "time" && <button className="btn sm" onClick={() => setTimerFor(ei)}>⏱ Timer</button>}
              <button className="btn sm ghost danger" onClick={() => { if (confirm("Remove " + e.name + " from this session?")) mut((dr) => { dr.exercises.splice(ei, 1); }); }}>remove</button>
            </div>
            <textarea rows={1} placeholder="Note (felt easy, bar height, knee…)" value={e.notes || ""} onChange={(ev) => mut((dr) => { dr.exercises[ei].notes = ev.target.value; })} />
          </div>
        );
      })}
      <button className="btn" onClick={addExercise}>+ Add exercise</button>
      <h2>Session notes</h2>
      <textarea rows={2} placeholder="Anything about the whole session" value={d.notes || ""} onChange={(ev) => mut((dr) => { dr.notes = ev.target.value; })} />
      <div className="quick">
        <form onSubmit={(ev) => { ev.preventDefault(); const i = ev.target.elements.q; if (i.value.trim()) onQuick(i.value.trim()); i.value = ""; }}>
          <input className="text" name="q" enterKeyHint="done" placeholder="Quick log: “goblet 16 8 8 7 felt easy”" autoComplete="off" />
          <button className="btn primary" type="submit">Log</button>
        </form>
        <div className="muted small">Tap the mic on the keyboard to dictate. Weight first, then reps per set.</div>
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn primary grow" onClick={finish}>Finish session</button>
        <button className="btn ghost danger" onClick={() => { if (confirm("Discard this session? Nothing will be saved.")) { setState((s) => ({ ...s, draft: null })); onExit(); } }}>Discard</button>
      </div>

      {rest && (
        <div className="rest" onClick={() => setRest(null)}>
          <div className="t">{rest.left}</div>
          <div className="grow"><div className="small muted">Rest · {rest.name}</div><div className="bar"><div style={{ width: `${(100 * rest.left) / rest.total}%` }} /></div></div>
          <button className="btn sm ghost">Skip</button>
        </div>
      )}

      {timerFor != null && d.exercises[timerFor] && (
        <div className="overlay">
          <button className="btn sm close" onClick={() => setTimerFor(null)}>‹ Back</button>
          <GymTimer
            preset={{ hold: d.exercises[timerFor].sets[0]?.s || 20, swap: d.exercises[timerFor].perSide ? S.settings.timer.swap : 4 }}
            onResult={({ reps, hold }) => {
              // Carry the entered weight over set by set — a weighted hold
              // (e.g. weighted dead hang) must not come back as bodyweight.
              if (reps > 0) mut((dr) => { const ex = dr.exercises[timerFor]; const old = ex.sets; ex.sets = Array.from({ length: reps }, (_, i) => { const o = { done: true, s: hold }; const w = old[i]?.w ?? old[old.length - 1]?.w; if (!ex.bodyweight && w != null) o.w = w; return o; }); });
              setTimerFor(null);
              if (reps > 0) toast(`${reps} × ${hold} s recorded for ${d.exercises[timerFor].name}`);
            }}
          />
        </div>
      )}
    </div>
  );
}
