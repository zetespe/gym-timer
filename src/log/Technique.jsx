// How-to details for one plan exercise: steps, common faults, progression.
// The progression block is the ONE place for progression advice: the app's
// suggestion for today (`sug`, from suggest()) first, the plan's rule beneath.
// Collapsed inside a session (open={false}), fully expanded on the exercise
// library page (open). Renders nothing when the exercise has no technique
// content, so plans without it stay exactly as clean as before.
import { strList } from "./store";

export function hasTechnique(x, sug) {
  return !!(x && (strList(x.steps).length || strList(x.watchFor).length || x.progression || (sug && sug.text)));
}

export default function Technique({ x, sug, open = false }) {
  if (!hasTechnique(x, sug)) return null;
  // Live state can hold not-yet-cleaned arrays (textareas store the raw split
  // until blur); render from the cleaned view.
  const steps = strList(x.steps);
  const watch = strList(x.watchFor);
  const body = (
    <div className="tech">
      {steps.length > 0 && <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      {watch.length > 0 && (
        <div className="watch">
          <div className="lab">Watch for</div>
          <ul>{watch.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {((sug && sug.text) || x.progression) && (
        <div className="prog">
          <div className="lab">Progression</div>
          {sug && sug.text && <div className={"act " + (sug.kind || "")}>{sug.text}</div>}
          {x.progression && !(sug && sug.fromPlan) && <div className={sug && sug.text ? "rule" : "act"}>{x.progression}</div>}
        </div>
      )}
    </div>
  );
  if (open) return body;
  const label = steps.length ? "How to do it" : watch.length ? "Watch for" : "Progression";
  return (
    <details className="techbox">
      <summary>{label}</summary>
      {body}
    </details>
  );
}
