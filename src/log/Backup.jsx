import { useRef, useState } from "react";
import { useLog, setState, patch } from "./store";
import { exportObject, applyImport, extractJSON, summaryText, sortedSessions, claudePrompt } from "./model";
import { copyText, toast } from "./ui";

function fileName() { return `gym-log-${new Date().toISOString().slice(0, 10)}.json`; }

export default function Backup() {
  const S = useLog();
  const fileRef = useRef(null);
  const [pasteText, setPasteText] = useState("");
  const unit = S.settings.unit;
  const last = sortedSessions(S.sessions)[0];

  const markBackedUp = () => patch((s) => { s.settings.lastBackupAt = new Date().toISOString(); s.settings.sessionsSinceBackup = 0; });

  // Save where the user chooses: share sheet (iOS → "Save to Files", AirDrop, Notes),
  // native save dialog (Chrome/Edge), or a plain download as the last resort.
  const saveBackup = async () => {
    const json = JSON.stringify(exportObject(S), null, 1);
    const name = fileName();
    try {
      const file = new File([json], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Gym Log backup" });
        markBackedUp(); toast("Backup shared"); return;
      }
    } catch (e) { if (e.name === "AbortError") return; }
    try {
      if (window.showSaveFilePicker) {
        const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "JSON", accept: { "application/json": [".json"] } }] });
        const w = await h.createWritable(); await w.write(json); await w.close();
        markBackedUp(); toast("Backup saved"); return;
      }
    } catch (e) { if (e.name === "AbortError") return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    markBackedUp(); toast("Backup downloaded");
  };

  const restoreFile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const obj = extractJSON(text);
      const mode = S.sessions.length || S.plan.workouts.length ? (confirm("Merge into what is on this phone? Cancel = replace everything with the backup.") ? "merge" : "replace") : "merge";
      if (mode === "replace") {
        const fresh = applyImport({ ...S, plan: { name: "", workouts: [] }, sessions: [] }, obj);
        setState(fresh.state); toast("Restored: " + fresh.report, 4000);
      } else {
        const r = applyImport(S, obj); setState(r.state); toast("Restored: " + r.report, 4000);
      }
    } catch (e) { toast("Restore failed: " + e.message, 4000); }
  };

  const doPaste = () => {
    try { const r = applyImport(S, extractJSON(pasteText)); setState(r.state); toast("Imported: " + r.report, 4000); setPasteText(""); }
    catch (e) { toast("Import failed: " + e.message, 4000); }
  };

  return (
    <div className="page">
      <h1>Backup</h1>
      <p className="muted small">Your data lives only on this phone. A backup is a single file you keep wherever you choose: Files, iCloud Drive, Notes, AirDrop to a computer.</p>
      <div className={"banner" + ((S.settings.sessionsSinceBackup || 0) >= 3 ? "" : " info")}>
        {S.settings.lastBackupAt ? `Last backup ${new Date(S.settings.lastBackupAt).toLocaleDateString()}` : "No backup yet"} · {S.sessions.length} sessions · {S.plan.workouts.length} workouts
      </div>
      <button className="big primary" onClick={saveBackup}><strong>Save backup…</strong><span>Opens the share sheet or a save dialog. Pick the folder yourself.</span></button>
      <button className="big" onClick={() => fileRef.current && fileRef.current.click()}><strong>Restore from a backup file</strong><span>Merge into this phone, or replace everything.</span></button>
      <input ref={fileRef} type="file" accept=".json,application/json,text/plain" style={{ display: "none" }} onChange={(e) => { restoreFile(e.target.files[0]); e.target.value = ""; }} />

      <h2>Talk to Claude</h2>
      <button className="big" onClick={() => last && copyText(summaryText(last, unit), "session")}><strong>Copy last session</strong><span>{last ? `${last.name} · ${last.date}` : "No sessions yet"}</span></button>
      <button className="big" onClick={() => copyText(JSON.stringify(exportObject(S, { full: false })), "JSON")}><strong>Copy recent history (JSON)</strong><span>Last 12 sessions plus the plan, for “how am I doing?”.</span></button>
      <button className="big" onClick={() => copyText(claudePrompt(S), "prompt")}><strong>Copy the prompt for Claude</strong><span>Paste it first when you dictate a session or ask for a new plan, so the answer imports cleanly.</span></button>
      <h3 style={{ marginTop: 16 }}>Paste from Claude</h3>
      <p className="muted small">A gym-import block: new sessions, added workouts, or a replacement plan.</p>
      <textarea rows={4} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder='{"type":"gym-import","sessions":[...]}' />
      <div className="row" style={{ marginTop: 8 }}><button className="btn primary" onClick={doPaste} disabled={!pasteText.trim()}>Import</button></div>
    </div>
  );
}
