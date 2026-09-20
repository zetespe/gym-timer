import { useEffect, useState } from "react";
import { useLog, patch, setState, uid, slug, migrateExercise, resetAll } from "./store";
import { parsePlanText, applyImport, extractJSON, fmtTarget } from "./model";
import { Field, Stepper, toast } from "./ui";

export default function Plan({ params, go }) {
  const S = useLog();
  const [editing, setEditing] = useState(null); // workout id
  const [pasting, setPasting] = useState(false);
  useEffect(() => {
    if (params?.edit === "new") { addWorkout(); }
    if (params?.paste) setPasting(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const addWorkout = () => {
    const id = uid();
    patch((s) => { s.plan.workouts.push({ id, name: "Workout " + String.fromCharCode(65 + s.plan.workouts.length), subtitle: "", intent: "", exercises: [] }); });
    setEditing(id);
  };
  const move = (arr, i, dir) => { const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

  if (pasting) return <PastePlan onDone={() => setPasting(false)} />;

  if (editing) {
    const w = S.plan.workouts.find((x) => x.id === editing);
    if (!w) { setEditing(null); return null; }
    return <WorkoutEditor w={w} unit={S.settings.unit} onBack={() => setEditing(null)} />;
  }

  return (
    <div className="page">
      <h1>Plan</h1>
      <Field label="Plan name (optional)"><input className="text" value={S.plan.name} placeholder="e.g. Strength base, autumn" onChange={(e) => patch((s) => { s.plan.name = e.target.value; })} /></Field>
      {!S.plan.workouts.length && <p className="muted">No workouts yet. Add one, or paste a plan as text.</p>}
      {S.plan.workouts.map((w, i) => (
        <div className="card" key={w.id}>
          <div className="hdr"><h3>{w.name}</h3><span className="muted small">{w.exercises.length} exercises</span></div>
          {w.subtitle && <div className="muted small">{w.subtitle}</div>}
          <div style={{ marginTop: 4 }}>{w.exercises.map((x, j) => <button key={j} className="exlink" onClick={() => go("exercise", { id: x.id })}>{x.name}</button>)}</div>
          <div className="ex-actions">
            <button className="btn sm" onClick={() => setEditing(w.id)}>Edit</button>
            <button className="btn sm ghost" onClick={() => patch((s) => move(s.plan.workouts, i, -1))}>↑</button>
            <button className="btn sm ghost" onClick={() => patch((s) => move(s.plan.workouts, i, 1))}>↓</button>
            <button className="btn sm ghost" onClick={() => patch((s) => { const c = structuredClone(w); c.id = uid(); c.name += " copy"; s.plan.workouts.splice(i + 1, 0, c); })}>Duplicate</button>
            <button className="btn sm ghost danger" onClick={() => { if (confirm(`Delete ${w.name}? Logged sessions are kept.`)) patch((s) => { s.plan.workouts = s.plan.workouts.filter((x) => x.id !== w.id); }); }}>Delete</button>
          </div>
        </div>
      ))}
      <div className="row wrap"><button className="btn primary" onClick={addWorkout}>+ Add workout</button><button className="btn" onClick={() => setPasting(true)}>Paste a plan</button></div>
      {(S.plan.workouts.length > 0 || S.plan.loadNote || S.plan.rules.length > 0 || S.plan.stopRules.length > 0) && (
        <>
          <h2>Training rules</h2>
          <Field label="Load note (shown at the start of every session — clear it when it no longer applies)">
            <textarea rows={2} value={S.plan.loadNote} onChange={(e) => patch((s) => { s.plan.loadNote = e.target.value; })} />
          </Field>
        </>
      )}
      {S.plan.rules.length > 0 && (
        <div className="card"><h3>Progression</h3><div className="tech"><ul>{S.plan.rules.map((r, i) => <li key={i}>{r}</li>)}</ul></div></div>
      )}
      {S.plan.stopRules.length > 0 && (
        <div className="card"><h3>Stop rules</h3><div className="tech"><ul>{S.plan.stopRules.map((r, i) => <li key={i}>{r}</li>)}</ul></div></div>
      )}
      <h2>Settings</h2>
      <div className="row"><span className="grow">Weight unit</span><select className="text" style={{ width: "auto" }} value={S.settings.unit} onChange={(e) => patch((s) => { s.settings.unit = e.target.value; })}><option value="kg">kg</option><option value="lb">lb</option></select></div>
      <div className="row" style={{ marginTop: 8 }}><span className="grow">Rest countdown after each set</span><input type="checkbox" checked={!!S.settings.restTimer} onChange={(e) => patch((s) => { s.settings.restTimer = e.target.checked; })} style={{ width: 24, height: 24 }} /></div>
      <h2>Danger zone</h2>
      <button className="btn ghost danger" onClick={() => { if (confirm("Erase the plan AND every session on this phone? Save a backup first.")) { resetAll(); go("today"); } }}>Erase everything</button>
      <p className="muted small" style={{ marginTop: 24 }}><a className="link" href={import.meta.env.BASE_URL + "about/"} target="_blank" rel="noreferrer">About Gymmy</a> · free for personal use · your data never leaves your phone</p>
    </div>
  );
}

function WorkoutEditor({ w, unit, onBack }) {
  const [exIdx, setExIdx] = useState(null);
  const up = (fn) => patch((s) => { const ww = s.plan.workouts.find((x) => x.id === w.id); fn(ww); });
  const move = (i, dir) => up((ww) => { const j = i + dir; if (j < 0 || j >= ww.exercises.length) return; [ww.exercises[i], ww.exercises[j]] = [ww.exercises[j], ww.exercises[i]]; });

  if (exIdx != null) {
    const x = w.exercises[exIdx];
    if (!x) { setExIdx(null); return null; }
    const set = (k, v) => up((ww) => { ww.exercises[exIdx][k] = v; });
    return (
      <div className="page">
        <p><button className="link" onClick={() => setExIdx(null)}>‹ {w.name}</button></p>
        <h1>{x.name || "Exercise"}</h1>
        <Field label="Name"><input className="text" value={x.name} onChange={(e) => { set("name", e.target.value); }} onBlur={(e) => { if (!x.id || x.id.startsWith("new_")) set("id", slug(e.target.value)); }} /></Field>
        <Field label="Measured in"><select className="text" value={x.mode} onChange={(e) => set("mode", e.target.value)}><option value="reps">Reps</option><option value="time">Seconds</option><option value="dist">Metres</option></select></Field>
        <div className="grid2">
          <Field label="Sets"><Stepper value={x.sets} inputMode="numeric" onChange={(v) => set("sets", v || 1)} min={1} /></Field>
          {x.mode === "reps" && <Field label="Reps, bottom of range"><Stepper value={x.repsMin} inputMode="numeric" onChange={(v) => { set("repsMin", v); if (x.repsMax < v) set("repsMax", v); }} min={1} /></Field>}
          {x.mode === "reps" && <Field label="Reps, top of range"><Stepper value={x.repsMax} inputMode="numeric" onChange={(v) => set("repsMax", Math.max(v || 1, x.repsMin || 1))} min={1} /></Field>}
          {x.mode === "time" && <Field label="Target seconds"><Stepper value={x.secs} step={5} inputMode="numeric" onChange={(v) => set("secs", v)} /></Field>}
          {x.mode === "dist" && <Field label="Target metres"><Stepper value={x.dist} step={5} inputMode="numeric" onChange={(v) => set("dist", v)} /></Field>}
          <Field label="Rest between sets (s)"><Stepper value={x.rest} step={15} inputMode="numeric" onChange={(v) => set("rest", v)} /></Field>
        </div>
        <div className="row" style={{ marginTop: 8 }}><span className="grow">Bodyweight (no weight field)</span><input type="checkbox" checked={!!x.bodyweight} onChange={(e) => set("bodyweight", e.target.checked)} style={{ width: 24, height: 24 }} /></div>
        <div className="row" style={{ marginTop: 8 }}><span className="grow">Per side (left and right)</span><input type="checkbox" checked={!!x.perSide} onChange={(e) => set("perSide", e.target.checked)} style={{ width: 24, height: 24 }} /></div>
        {!x.bodyweight && <div className="grid2" style={{ marginTop: 8 }}>
          <Field label={`Starting weight (${unit})`}><Stepper value={x.weight} step={unit === "kg" ? 1 : 2.5} onChange={(v) => set("weight", v)} /></Field>
          <Field label={`Increase by (${unit})`}><Stepper value={x.increment} step={0.5} onChange={(v) => set("increment", v || 0.5)} min={0.5} /></Field>
        </div>}
        <Field label="Cue (one short reminder, always visible during the session)"><textarea rows={2} value={x.cue} onChange={(e) => set("cue", e.target.value)} /></Field>
        <Field label="How to do it (one step per line)"><textarea rows={4} value={(x.steps || []).join("\n")} onChange={(e) => set("steps", e.target.value.split("\n"))} onBlur={(e) => set("steps", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} /></Field>
        <Field label="Watch for (common faults, one per line)"><textarea rows={3} value={(x.watchFor || []).join("\n")} onChange={(e) => set("watchFor", e.target.value.split("\n"))} onBlur={(e) => set("watchFor", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} /></Field>
        <Field label="Progression note"><textarea rows={2} value={x.progression} onChange={(e) => set("progression", e.target.value)} /></Field>
        <p className="muted small">Next-weight rule: all sets at the top of the range → weight goes up by the increment. In range but short of the top → repeat. Below the bottom twice in a row → about 10% less.</p>
        <button className="btn primary" onClick={() => setExIdx(null)}>Done</button>
      </div>
    );
  }

  return (
    <div className="page">
      <p><button className="link" onClick={onBack}>‹ Plan</button></p>
      <Field label="Workout name"><input className="text" value={w.name} onChange={(e) => up((ww) => { ww.name = e.target.value; })} /></Field>
      <Field label="Subtitle (optional)"><input className="text" value={w.subtitle} placeholder="e.g. Push + hinge · 50 min" onChange={(e) => up((ww) => { ww.subtitle = e.target.value; })} /></Field>
      <h2>Exercises</h2>
      {!w.exercises.length && <p className="muted">No exercises yet.</p>}
      <div className="card" style={{ padding: "0 14px" }}>
        {w.exercises.map((x, i) => (
          <div className="list-item" key={i}>
            <button className="grow" style={{ textAlign: "left", padding: "4px 0" }} onClick={() => setExIdx(i)}>
              <div>{x.name}</div>
              <div className="muted small">{fmtTarget(x, unit)}</div>
            </button>
            <button className="iconbtn" onClick={() => move(i, -1)}>↑</button>
            <button className="iconbtn" onClick={() => move(i, 1)}>↓</button>
            <button className="iconbtn" style={{ color: "var(--red)" }} onClick={() => { if (confirm(`Remove ${x.name}?`)) up((ww) => { ww.exercises.splice(i, 1); }); }}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn primary" onClick={() => { up((ww) => { ww.exercises.push(migrateExercise({ id: "new_" + uid(), name: "", mode: "reps", sets: 3, repsMin: 8, repsMax: 10, weight: 0, rest: 90 })); }); setExIdx(w.exercises.length); }}>+ Add exercise</button>
    </div>
  );
}

function PastePlan({ onDone }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const S = useLog();
  const run = () => {
    try {
      const t = text.trim();
      if (t.startsWith("{") || /"type"\s*:\s*"gym-(import|export)"/.test(t)) {
        const { state, report } = applyImport(S, extractJSON(t));
        setState(state); toast("Imported: " + report, 4000); onDone(); return;
      }
      const ws = parsePlanText(t);
      if (!ws.length) { toast("Couldn't find any exercise lines. Try “Goblet Squat 3x8-10 16kg”.", 4000); return; }
      setPreview(ws);
    } catch (e) { toast("Import failed: " + e.message, 4000); }
  };
  const accept = (replace) => {
    patch((s) => { if (replace) s.plan.workouts = preview; else s.plan.workouts.push(...preview); });
    toast(`${preview.length} workout(s) ${replace ? "set" : "added"}`); onDone();
  };
  return (
    <div className="page">
      <p><button className="link" onClick={onDone}>‹ Plan</button></p>
      <h1>Paste a plan</h1>
      <p className="muted small">One workout per heading, one exercise per line. Weights, rest and “per side” are optional. A JSON block from your AI works here too.</p>
      <pre className="small">{`# Workout A
Goblet Squat 3x8-10 16kg rest 90
Push-up 3x6-8 bodyweight
Dead Hang 3x30s
Suitcase Carry 3x30m 16kg per side`}</pre>
      <textarea rows={8} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} placeholder="Paste here" />
      <div className="row" style={{ marginTop: 8 }}><button className="btn primary" onClick={run}>Read it</button></div>
      {preview && (
        <>
          <h2>Found</h2>
          {preview.map((w) => <div className="card" key={w.id}><h3>{w.name}</h3><table><tbody>{w.exercises.map((x, i) => <tr key={i}><td>{x.name}</td><td className="muted small">{fmtTarget(x, S.settings.unit)}</td></tr>)}</tbody></table></div>)}
          <div className="row wrap"><button className="btn primary" onClick={() => accept(false)}>Add to my plan</button>{S.plan.workouts.length > 0 && <button className="btn" onClick={() => { if (confirm("Replace the current workouts with these?")) accept(true); }}>Replace my plan</button>}</div>
        </>
      )}
    </div>
  );
}
