// How-to details for one plan exercise: steps, common faults, progression.
// Collapsed inside a session (open={false}), fully expanded on the exercise
// library page (open). Renders nothing when the exercise has no technique
// content, so plans without it stay exactly as clean as before.
export function hasTechnique(x) {
  return !!(x && ((x.steps && x.steps.length) || (x.watchFor && x.watchFor.length) || x.progression));
}

export default function Technique({ x, open = false }) {
  if (!hasTechnique(x)) return null;
  const body = (
    <div className="tech">
      {x.steps && x.steps.length > 0 && <ol>{x.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      {x.watchFor && x.watchFor.length > 0 && (
        <div className="watch">
          <div className="lab">Watch for</div>
          <ul>{x.watchFor.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {x.progression && <div className="prog"><span className="lab">Progression:</span> {x.progression}</div>}
    </div>
  );
  if (open) return body;
  return (
    <details className="techbox">
      <summary>How to do it</summary>
      {body}
    </details>
  );
}
