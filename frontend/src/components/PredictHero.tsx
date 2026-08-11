import { useState } from "react";
import type { YieldForecast } from "../api";
import { GlutGauge } from "./GlutGauge";

import type { AppLanguage } from "../hooks/useAppSettings";
import { glutLabelBnEn, tPredict } from "../i18n/farmerSimple";

type Props = {
  data: YieldForecast;
  sourceLabel: string;
  simple?: boolean;
  language?: AppLanguage;
};

export function PredictHero({ data, sourceLabel, simple = false, language = "bn" }: Props) {
  const [showFull, setShowFull] = useState(false);
  const insight = data.insight;
  const long = insight.length > 140;
  const short = long ? `${insight.slice(0, 137)}…` : insight;
  const tp = tPredict(language);
  const glutWord = glutLabelBnEn(language, data.alert_level);

  if (simple) {
    return (
      <section className="predict-hero predict-hero--simple">
        <div className="predict-hero__top">
          <div className="predict-hero__copy">
            <h2 className="predict-hero__title-simple">{tp.title}</h2>
            <p className="predict-hero__region-simple">
              {tp.glut}: <strong>{data.glut_risk_pct}%</strong> ({glutWord})
            </p>
          </div>
          <GlutGauge value={data.glut_risk_pct} alertLevel={data.alert_level} />
        </div>
      </section>
    );
  }

  return (
    <section className="predict-hero">
      <div className="predict-hero__glow" aria-hidden />
      <div className="predict-hero__top">
        <div className="predict-hero__copy">
          <span className="predict-hero__tag">Eye in the sky</span>
          <h2>Yield & glut signal</h2>
          <p className="predict-hero__region">{data.region}</p>
        </div>
        <GlutGauge value={data.glut_risk_pct} alertLevel={data.alert_level} />
      </div>

      <p className="predict-hero__insight">{showFull || !long ? insight : short}</p>
      {long && (
        <button
          type="button"
          className="predict-hero__more"
          onClick={() => setShowFull((v) => !v)}
        >
          {showFull ? "Show less" : "Read full signal"}
        </button>
      )}

      <div className="predict-metrics">
        <div className="predict-metric">
          <span className="predict-metric__val">{data.ndvi}</span>
          <span className="predict-metric__lbl">NDVI</span>
        </div>
        <div className="predict-metric predict-metric--gold">
          <span className="predict-metric__val">{data.glut_risk_pct}%</span>
          <span className="predict-metric__lbl">Glut</span>
        </div>
        <div className="predict-metric">
          <span className="predict-metric__val">{data.predicted_yield_million_quintals}M</span>
          <span className="predict-metric__lbl">Yield</span>
        </div>
        <div className="predict-metric">
          <span className="predict-metric__val">{data.weeks_to_harvest}w</span>
          <span className="predict-metric__lbl">Harvest</span>
        </div>
      </div>

      <footer className="predict-hero__foot">
        <span>{sourceLabel}</span>
        {data.recorded_at && (
          <time dateTime={data.recorded_at}>
            {new Date(data.recorded_at).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        )}
      </footer>
    </section>
  );
}
