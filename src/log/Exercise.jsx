import { useLog } from "./store";
import { fmtDate, fmtEntry, fmtTarget, historyFor, suggest } from "./model";
import Technique from "./Technique";

// Library page for one exercise: full technique, progression and recent
// history in one place, for reading between sessions. Opened from the Plan
// tab; not part of the bottom navigation.
export default function Exercise({ params, go }) {
  const S = useLog();
  const unit = S.settings.unit;
  const id = params?.id;
  let px = null, wname = null;
  for (const w of S.plan.workouts) {
    const f = w.exercises.find((x) => x.id === id);
    if (f) { px = f; wname = w.name; break; }
  }
  const hist = id ? historyFor(S.sessions, id).slice(0, 10) : [];

  if (!id || (!px && !hist.length)) {
    return (
      <div className="page">
        <h1>Exercise</h1>
        <p className="muted">Pick an exercise from the Plan tab to see its technique and history.</p>
        <button className="btn primary" onClick={() => go("plan")}>Go to Plan</button>
      </div>
    );
  }

  const name = px ? px.name : hist[0].entry.name;
  const target = px ? fmtTarget(px, unit) : "";
  const sug = px ? suggest(S, px) : { text: "" };

  return (
    <div className="page">
      <p><button className="link" onClick={() => go("plan")}>‹ Plan</button></p>
      <div className="hdr"><h1>{name}</h1>{px && <span className="muted small">{wname}</span>}</div>
      {target && <div className="target" style={{ marginTop: 2 }}>{target}</div>}
      {px && px.cue && <div className="cue">{px.cue}</div>}
      {px && <Technique x={px} sug={sug} open />}
      <h2>History</h2>
      {!hist.length && <p className="muted">No sessions logged yet.</p>}
      {hist.map((h, i) => (
        <div className="list-item" key={i}>
          <span className="muted small" style={{ minWidth: 74 }}>{fmtDate(h.date)}</span>
          <span className="grow"><b>{fmtEntry(h.entry, unit)}</b>{h.entry.notes ? <span className="muted small"> — {h.entry.notes}</span> : null}</span>
        </div>
      ))}
    </div>
  );
}
