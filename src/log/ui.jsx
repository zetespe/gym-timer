import { useEffect, useRef, useState } from "react";
import { fmtTime, parseTime } from "./model";

// ---- toast (module-level so any helper can call it) ----
let toastListener = null;
export function toast(msg, ms = 2400) { if (toastListener) toastListener(msg, ms); }
export function Toaster() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let t;
    toastListener = (m, ms) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(null), ms); };
    return () => { toastListener = null; clearTimeout(t); };
  }, []);
  return msg ? <div className="toast">{msg}</div> : null;
}

// ---- dialog (module-level like toast; replaces the browser's white confirm/prompt) ----
// ask() resolves with the tapped button's value, the typed text for an input
// dialog, or null for the safe way out: the back button, the backdrop, Escape.
let dialogListener = null;
export function ask(opts) {
  return new Promise((resolve) => { if (dialogListener) dialogListener({ buttons: [], ...opts, resolve }); else resolve(null); });
}
// Destructive yes/no: a red action button and a safe one named after what it does.
export const confirmAction = (title, text, yes, no = "Keep") =>
  ask({ title, text, buttons: [{ label: yes, value: true, kind: "danger" }], back: no }).then((v) => v === true);

export function Dialog() {
  const [d, setD] = useState(null);
  const [text, setText] = useState("");
  const open = useRef(null);
  useEffect(() => {
    // One dialog at a time: a second one (e.g. a button reached with Tab under
    // the backdrop) is refused as if Back was tapped, and the open one stays.
    dialogListener = (o) => { if (open.current) { o.resolve(null); return; } open.current = o; setText(o.input ? o.input.value || "" : ""); setD(o); };
    return () => { dialogListener = null; };
  }, []);
  useEffect(() => {
    if (!d) return;
    const onKey = (e) => { if (e.key === "Escape") { d.resolve(null); open.current = null; setD(null); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [d]);
  if (!d) return null;
  const close = (v) => { d.resolve(v); open.current = null; setD(null); };
  const typed = text.trim();
  const back = d.back && <button key="back" type="button" className="btn back" autoFocus={!d.input} onClick={() => close(null)}>{d.back}</button>;
  const actions = d.buttons.map((b, i) => d.input
    ? <button key={i} type="submit" className={"btn " + (b.kind || "")} disabled={!typed}>{b.label}</button>
    : <button key={i} type="button" className={"btn " + (b.kind || "")} onClick={() => close(b.value)}>{b.label}</button>);
  return (
    <div className="modal-back" onClick={() => close(null)}>
      <form className="modal dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (d.input && typed) close(typed); }}>
        <h3 id="dlg-title">{d.title}</h3>
        {d.text && <p>{d.text}</p>}
        {d.input && <input className="text" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={d.input.placeholder} enterKeyHint="next" autoComplete="off" autoCapitalize="words" />}
        {/* A red button goes left, so the thumb's easy reach on the right is the
            safe choice. Stacked lists: safe button last. */}
        <div className={"dlg-btns" + (d.stack ? " stack" : "")}>{d.stack || d.buttons.some((b) => b.kind === "danger") ? [...actions, back] : [back, ...actions]}</div>
      </form>
    </div>
  );
}

export function Stepper({ value, onChange, step = 1, unit, inputMode = "decimal", min = 0 }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => { setText(value == null ? "" : String(value)); }, [value]);
  const commit = (t) => { const n = parseFloat(String(t).replace(",", ".")); onChange(isFinite(n) ? n : null); };
  return (
    <div>
      <div className="stepper">
        <button type="button" onClick={() => onChange(Math.max(min, Math.round(((value || 0) - step) * 100) / 100))}>−</button>
        <input inputMode={inputMode} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => commit(text)} />
        <button type="button" onClick={() => onChange(Math.round(((value || 0) + step) * 100) / 100)}>+</button>
      </div>
      {unit && <div className="unitlab">{unit}</div>}
    </div>
  );
}

// Time typed like the machine shows it: "25:30" (or "25.30" on a number pad).
// A bare number is minutes. Anything unreadable snaps back to the old value.
export function TimeField({ value, onChange }) {
  const [text, setText] = useState(fmtTime(value));
  useEffect(() => { setText(fmtTime(value)); }, [value]);
  const commit = () => { const v = parseTime(text); if (v == null) setText(fmtTime(value)); else onChange(v); };
  return (
    <div>
      <input className="timefield" inputMode="decimal" placeholder="mm:ss" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
      <div className="unitlab">mm:ss</div>
    </div>
  );
}

export function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

export async function copyText(text, label = "") {
  try { await navigator.clipboard.writeText(text); toast("Copied " + label); return true; }
  catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied " + label); return true; } catch (e2) { toast("Copy failed"); return false; } finally { ta.remove(); }
  }
}
