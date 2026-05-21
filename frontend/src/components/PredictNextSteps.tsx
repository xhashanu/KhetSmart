import { IconTruck } from "./icons";

type Props = {
  actions: string[];
  alertLevel: string;
  glutPct: number;
  onGoNetwork?: () => void;
};

function stepIcon(index: number, alert: string) {
  if (index === 0) return alert === "HIGH" ? "⚠" : "①";
  if (index === 1) return "②";
  return "③";
}

export function PredictNextSteps({ actions, alertLevel, glutPct, onGoNetwork }: Props) {
  const urgency =
    alertLevel === "HIGH" ? "high" : alertLevel === "MEDIUM" ? "medium" : "low";

  return (
    <section className={`next-steps next-steps--${urgency}`}>
      <header className="next-steps__head">
        <div className="next-steps__title-row">
          <span className="next-steps__icon-wrap" aria-hidden>
            <IconTruck className="next-steps__icon" />
          </span>
          <div>
            <h3>What to do next</h3>
            <p className="next-steps__sub">Based on glut {glutPct}% · corridor signals</p>
          </div>
        </div>
        <span className={`next-steps__badge next-steps__badge--${urgency}`}>
          {alertLevel}
        </span>
      </header>

      <ol className="next-steps__list">
        {actions.map((line, i) => (
          <li key={line} className="next-steps__item">
            <span className="next-steps__num" aria-hidden>
              {stepIcon(i, alertLevel)}
            </span>
            <span className="next-steps__text">{line}</span>
          </li>
        ))}
      </ol>

      {onGoNetwork && (
        <button type="button" className="next-steps__cta" onClick={onGoNetwork}>
          <span>Open corridor map</span>
          <span className="next-steps__cta-arrow" aria-hidden>
            →
          </span>
        </button>
      )}
    </section>
  );
}
