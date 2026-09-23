import { useEffect, useState } from "react";
import { useLog, setState, today } from "./store";
import { fmtDate, fmtEntry, sortedSessions, startDraft, summaryText, draftHasProgress } from "./model";
import { copyText } from "./ui";

export default function Today({ go, justFinished }) {
  const S = useLog();
  const unit = S.settings.unit;
  const d = S.draft;
  const [switchTo, setSwitchTo] = useState(null); // { w } waiting for Cancel / OK
  // Escape closes the pop-up (keyboard users; same as Cancel).
  useEffect(() => {
    if (!switchTo) return;
    const onKey = (e) => { if (e.key === "Escape") setSwitchTo(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [switchTo]);
  const begin = (w) => { setSwitchTo(null); setState((s) => ({ ...s, draft: startDraft(s, w) })); go("session"); };
  // Only one session runs at a time. Tapping the running workout continues it;
  // tapping another one asks first whenever the running session holds data.
  const start = (w) => {
    if (d && d.workoutId === (w ? w.id : "free")) { go("session"); return; }
    if (draftHasProgress(d)) { setSwitchTo({ w }); return; }
    begin(w);
  };
  const confirmBox = switchTo && d && (
    <div className="modal-back" onClick={() => setSwitchTo(null)}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="switch-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="switch-title">Start {switchTo.w ? switchTo.w.name : "a free session"}?</h3>
        <p>If you open this session, the one in progress, <b>{d.name}</b>, will be cancelled and the data you entered in it will be lost.</p>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn grow" autoFocus onClick={() => setSwitchTo(null)}>Cancel</button>
          <button className="btn danger grow" onClick={() => begin(switchTo.w)}>OK</button>
        </div>
      </div>
    </div>
  );
  // A PWA can stay alive for days; only today's finish deserves the card.
  const finished = justFinished ? S.sessions.find((s) => s.id === justFinished && s.date === today()) : null;
  const recent = sortedSessions(S.sessions).slice(0, 5);
  const needBackup = (S.settings.sessionsSinceBackup || 0) >= 3;

  if (!S.plan.workouts.length && !S.sessions.length) {
    return (
      <div className="page">
        <h1>Gymmy</h1>
        <p className="muted">Everything you record stays on this phone. Nothing is uploaded anywhere.</p>
        <h2>Start with a plan</h2>
        <button className="big primary" onClick={() => go("plan", { edit: "new" })}><strong>Build a plan</strong><span>Add workouts and exercises by hand.</span></button>
        <button className="big" onClick={() => go("plan", { paste: true })}><strong>Paste a plan</strong><span>From Notion, a coach, or an AI chat. Lines like “Goblet Squat 3x8-10 16kg”.</span></button>
        <button className="big" onClick={() => go("backup")}><strong>Restore a backup</strong><span>Pick a backup file you saved earlier.</span></button>
        <button className="big" onClick={() => start(null)}><strong>Just log a free session</strong><span>No plan needed. Add exercises as you go.</span></button>
        {confirmBox}
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
          <div className="row"><button className="btn primary" onClick={() => copyText(summaryText(finished, unit), "summary")}>Copy for your AI</button><button className="btn" onClick={() => go("backup")}>Back up</button></div>
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
      {confirmBox}
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
