import { useEffect, useState } from "react";
import GymTimer from "./GymTimer";
import Today from "./log/Today";
import Session from "./log/Session";
import History from "./log/History";
import Plan from "./log/Plan";
import Backup from "./log/Backup";
import { Toaster } from "./log/ui";
import { useLog, requestPersistence } from "./log/store";
import "./log/log.css";

const TABS = [
  ["today", "🏠", "Today"],
  ["history", "📈", "History"],
  ["plan", "📋", "Plan"],
  ["timer", "⏱", "Timer"],
  ["backup", "💾", "Backup"],
];

function App() {
  const S = useLog();
  const [tab, setTab] = useState(() => (location.hash.slice(1).split("?")[0] || "today"));
  const [params, setParams] = useState(null);
  const [justFinished, setJustFinished] = useState(null);
  useEffect(() => { requestPersistence(); }, []);
  useEffect(() => {
    const onHash = () => setTab(location.hash.slice(1) || "today");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (t, p = null) => { setParams(p); setTab(t); if (location.hash !== "#" + t) history.replaceState(null, "", "#" + t); window.scrollTo(0, 0); };
  const view = tab === "session" && !S.draft ? "today" : tab;

  return (
    <div className="log">
      {view === "today" && <Today go={go} justFinished={justFinished} />}
      {view === "session" && <Session onFinished={(id) => { setJustFinished(id); go("today"); }} onExit={() => go("today")} />}
      {view === "history" && <History />}
      {view === "plan" && <Plan params={params} go={go} />}
      {view === "timer" && <div style={{ paddingBottom: "calc(80px + var(--sab))" }}><GymTimer /></div>}
      {view === "backup" && <Backup />}
      <nav className="tabs">
        {TABS.map(([id, ic, label]) => (
          <button key={id} className={(view === id || (id === "today" && view === "session")) ? "on" : ""} onClick={() => go(id)}><span className="ic">{ic}</span>{label}</button>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}

export default App;
