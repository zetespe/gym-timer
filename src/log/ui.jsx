import { useEffect, useRef, useState } from "react";

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

// Minutes and seconds in two boxes, so a number pad can't be misread (is
// "22.5" 22:05 or 22½ minutes?). Minutes may go past 59. Empty (or 0:00)
// clears the time; an impossible entry snaps back to the old value.
const splitTime = (v) => (v == null ? ["", ""] : [String(Math.floor(v / 60)), String(Math.round(v % 60)).padStart(2, "0")]);
export function TimeField({ value, onChange }) {
  const [[mm, ss], setParts] = useState(splitTime(value));
  useEffect(() => { setParts(splitTime(value)); }, [value]);
  const commit = () => {
    if (!/^\d*$/.test(mm) || !/^\d*$/.test(ss) || +ss > 59) { setParts(splitTime(value)); return; }
    // 0:00 is never a result: emptying the boxes one at a time passes through it.
    const v = (+mm || 0) * 60 + (+ss || 0) || null;
    if (v === value) setParts(splitTime(value)); else onChange(v);
  };
  const box = (val, i, label, ph) => (
    <input inputMode="numeric" aria-label={label} placeholder={ph} value={val} maxLength={i ? 2 : 3}
      onChange={(e) => setParts(i ? [mm, e.target.value.trim()] : [e.target.value.trim(), ss])} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
  );
  return (
    <div>
      <div className="timefield">{box(mm, 0, "minutes", "min")}<span>:</span>{box(ss, 1, "seconds", "sec")}</div>
      <div className="unitlab">min : sec</div>
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
