import { useState } from "react";
import { useLog, setState } from "./store";
import { fmtDate, fmtEntry, sortedSessions, historyFor, allExercises, summaryText } from "./model";
import { copyText } from "./ui";

export default function History() {
  const S = useLog();
  const unit = S.settings.unit;
  const [exId, setExId] = useState(null);
  const list = sortedSessions(S.sessions);
  const exs = allExercises(S);

  if (exId) {
    const x = exs.find((e) => e.id === exId);
    const rows = historyFor(S.sessions, exId);
    return (
      <div className="page">
        <p><button className="link" onClick={() => setExId(null)}>‹ History</button></p>
        <h1>{x ? x.name : exId}</h1>
        <table><tbody>
          <tr><th>Date</th><th>Result</th></tr>
          {rows.map((r, i) => <tr key={i}><td className="muted">{fmtDate(r.date)}<div className="dim small">{r.session}</div></td><td>{fmtEntry(r.entry, unit)}{r.entry.notes && <div className="muted small">{r.entry.notes}</div>}</td></tr>)}
          {!rows.length && <tr><td colSpan={2} className="muted">No records</td></tr>}
        </tbody></table>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>History</h1>
      {exs.length > 0 && <><h2>By exercise</h2><div className="row wrap" style={{ gap: 8 }}>{exs.map((x) => <button className="pill" key={x.id} onClick={() => setExId(x.id)}>{x.name}</button>)}</div></>}
      <h2>Sessions</h2>
      {!list.length && <p className="muted">Nothing yet.</p>}
      {list.map((s) => (
        <details className="card" key={s.id}>
          <summary><b>{s.name}</b> <span className="muted small">· {fmtDate(s.date)}{s.source ? " · " + s.source : ""}</span></summary>
          <table style={{ marginTop: 8 }}><tbody>{s.exercises.map((e, i) => <tr key={i}><td>{e.name}</td><td>{fmtEntry(e, unit)}{e.notes && <div className="muted small">{e.notes}</div>}</td></tr>)}</tbody></table>
          {s.notes && <p className="muted small">{s.notes}</p>}
          <div className="ex-actions">
            <button className="btn sm" onClick={() => copyText(summaryText(s, unit), "summary")}>Copy summary</button>
            <button className="btn sm ghost danger" onClick={() => { if (confirm(`Delete ${s.name} from ${fmtDate(s.date)}?`)) setState((st) => ({ ...st, sessions: st.sessions.filter((x) => x.id !== s.id) })); }}>Delete</button>
          </div>
        </details>
      ))}
    </div>
  );
}
