import { useLog, setState } from "./store";
import { fmtDate, fmtEntry, sortedSessions, startDraft, summaryText } from "./model";
import { copyText } from "./ui";

export default function Today({ go, justFinished }) {
  const S = useLog();
  const unit = S.settings.unit;
  const d = S.draft;
  const start = (w) => { setState((s) => ({ ...s, draft: startDraft(s, w) })); go("session"); };
  const finished = justFinished ? S.sessions.find((s) => s.id === justFinished) : null;
  const recent = sortedSessions(S.sessions).slice(0, 5);
  const needBackup = (S.settings.sessionsSinceBackup || 0) >= 3;

  if (!S.plan.workouts.length && !S.sessions.length) {
    return (
      <div className="page">
        <h1>Gymmy</h1>
        <p className="muted">Everything you record stays on this phone. Nothing is uploaded anywhere.</p>
        <h2>Start with a plan</h2>
        <button className="big primary" onClick={() => go("plan", { edit: "new" })}><strong>Build a plan</strong><span>Add workouts and exercises by hand.</span></button>
        <button className="big" onClick={() => go("plan", { paste: true })}><strong>Paste a plan</strong><span>From Notion, a coach, or a Claude chat. Lines like “Goblet Squat 3x8-10 16kg”.</span></button>
        <button className="big" onClick={() => go("backup")}><strong>Restore a backup</strong><span>Pick a backup file you saved earlier.</span></button>
        <button className="big" onClick={() => start(null)}><strong>Just log a free session</strong><span>No plan needed. Add exercises as you go.</span></button>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Gymmy</h1>
      {S.plan.name && <p className="muted small">{S.plan.name}</p>}
      {finished && (
        <div className="card">
          <div className="hdr"><h3>Saved ✓ {finished.name}</h3><span className="muted small">{fmtDate(finished.date)}</span></div>
          <pre>{summaryText(finished, unit)}</pre>
          <div className="row"><button className="btn primary" onClick={() => copyText(summaryText(finished, unit), "summary")}>Copy for Claude</button><button className="btn" onClick={() => go("backup")}>Back up</button></div>
        </div>
      )}
      {needBackup && <div className="banner">{S.settings.sessionsSinceBackup} sessions since your last backup. <button className="link" onClick={() => go("backup")}>Save one now</button>.</div>}
      {d && <button className="big primary" onClick={() => go("session")}><strong>Continue {d.name}</strong><span>Started {new Date(d.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {d.exercises.filter((e) => e.sets.some((s) => s.done)).length}/{d.exercises.length} exercises ticked</span></button>}
      <h2>Start a workout</h2>
      {S.plan.workouts.map((w) => {
        const last = sortedSessions(S.sessions).find((s) => s.workoutId === w.id);
        return <button className="big" key={w.id} onClick={() => start(w)}><strong>{w.name}</strong><span>{w.subtitle}{w.subtitle && last ? " · " : ""}{last ? "last " + fmtDate(last.date) : ""}{!w.subtitle && !last ? w.exercises.length + " exercises" : ""}</span></button>;
      })}
      <button className="big" onClick={() => start(null)}><strong>Free session</strong><span>Anything off-plan. Add exercises as you go.</span></button>
      {recent.length > 0 && <h2>Recent</h2>}
      {recent.map((s) => (
        <div className="card" key={s.id}>
          <div className="hdr"><h3>{s.name}</h3><span className="muted small">{fmtDate(s.date)}</span></div>
          <div className="muted small">{s.exercises.map((e) => e.name + " " + fmtEntry(e, unit)).join(" · ")}</div>
        </div>
      ))}
    </div>
  );
}
