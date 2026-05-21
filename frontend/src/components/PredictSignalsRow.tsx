import { IconWarehouse } from "./icons";

type Props = {
  mandiAvg?: number | null;
  mandiMin?: number | null;
  mandiMarkets?: number;
  mandiGlutAdjust?: number;
  utilPct: number;
  totalStorages: number;
  critical: number;
};

export function PredictSignalsRow({
  mandiAvg,
  mandiMin,
  mandiMarkets,
  mandiGlutAdjust = 0,
  utilPct,
  totalStorages,
  critical,
}: Props) {
  return (
    <div className="predict-signals-row">
      {mandiAvg != null && mandiMarkets ? (
        <article className="predict-mini predict-mini--mandi">
          <span className="predict-mini__label">Mandi live</span>
          <span className="predict-mini__value">₹{mandiAvg.toLocaleString("en-IN")}/q</span>
          <span className="predict-mini__sub">
            {mandiMarkets} markets
            {mandiMin != null && <> · floor ₹{mandiMin.toLocaleString("en-IN")}</>}
          </span>
          {mandiGlutAdjust > 0 && (
            <span className="predict-mini__warn">+{mandiGlutAdjust}% glut</span>
          )}
        </article>
      ) : null}

      <article className="predict-mini predict-mini--storage">
        <span className="predict-mini__label">
          <IconWarehouse /> Storage
        </span>
        <div className="predict-mini__bar">
          <div className="predict-mini__fill" style={{ width: `${Math.min(100, utilPct)}%` }} />
        </div>
        <span className="predict-mini__sub">
          <strong>{utilPct}%</strong> avg · {totalStorages} sites
          {critical > 0 && (
            <span className="predict-mini__warn"> · {critical} critical</span>
          )}
        </span>
      </article>
    </div>
  );
}
