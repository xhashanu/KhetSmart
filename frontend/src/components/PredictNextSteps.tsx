import { IconTruck } from "./icons";
import type { AppLanguage } from "../hooks/useAppSettings";
import { tPredict } from "../i18n/farmerSimple";

type Props = {
  actions: string[];
  alertLevel: string;
  glutPct: number;
  onGoNetwork?: () => void;
  simple?: boolean;
  language?: AppLanguage;
};

function simpleActions(lang: AppLanguage, alert: string): string[] {
  if (lang === "bn") {
    if (alert === "HIGH") {
      return ["আগে কোল্ড স্টোরেজ বুক করুন", "ফার্মার ট্যাবে রুট দেখুন"];
    }
    return ["ফার্মার ট্যাবে রুট + ঋণ দেখুন", "ম্যাপে খালি স্টোরেজ খুঁজুন"];
  }
  if (lang === "hi") {
    if (alert === "HIGH") {
      return ["पहले कोल्ड स्टोरेज बुक करें", "किसान टैब पर रास्ता देखें"];
    }
    return ["किसान टैब पर रास्ता + ऋण", "मैप पर खाली स्टोरेज खोजें"];
  }
  if (alert === "HIGH") {
    return ["Book cold storage early", "Check route on Farmer tab"];
  }
  return ["Get route + loan on Farmer tab", "Find space on map"];
}

export function PredictNextSteps({
  actions,
  alertLevel,
  glutPct,
  onGoNetwork,
  simple = false,
  language = "bn",
}: Props) {
  const tp = tPredict(language);
  const lines = simple ? simpleActions(language, alertLevel) : actions.slice(0, 3);
  const urgency =
    alertLevel === "HIGH" ? "high" : alertLevel === "MEDIUM" ? "medium" : "low";

  return (
    <section className={`next-steps next-steps--${urgency} ${simple ? "next-steps--simple" : ""}`}>
      <header className="next-steps__head">
        <div className="next-steps__title-row">
          <span className="next-steps__icon-wrap" aria-hidden>
            <IconTruck className="next-steps__icon" />
          </span>
          <div>
            <h3>{tp.next}</h3>
            {!simple && (
              <p className="next-steps__sub">Based on glut {glutPct}% · corridor signals</p>
            )}
          </div>
        </div>
      </header>

      <ol className="next-steps__list next-steps__list--simple">
        {lines.map((line, i) => (
          <li key={line} className="next-steps__item">
            <span className="next-steps__num" aria-hidden>
              {i + 1}
            </span>
            <span className="next-steps__text">{line}</span>
          </li>
        ))}
      </ol>

      {onGoNetwork && (
        <button type="button" className="next-steps__cta next-steps__cta--simple" onClick={onGoNetwork}>
          {tp.map} →
        </button>
      )}
    </section>
  );
}
