// How-to details for one plan exercise: steps, common faults, progression.
// Collapsed inside a session (open={false}), fully expanded on the exercise
// library page (open). Renders nothing when the exercise has no technique
// content, so plans without it stay exactly as clean as before.
import { strList } from "./store";

export function hasTechnique(x) {
  return !!(x && (strList(x.steps).length || strList(x.watchFor).length || x.progression));
}

export default function Technique({ x, open = false }) {
  if (!hasTechnique(x)) return null;
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
      {x.progression && <div className="prog"><span className="lab">Progression:</span> {x.progression}</div>}
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
