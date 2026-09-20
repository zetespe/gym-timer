import { useEffect, useState } from "react";

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
