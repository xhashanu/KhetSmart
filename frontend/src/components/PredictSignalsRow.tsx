import { IconWarehouse } from "./icons";
import type { AppLanguage } from "../hooks/useAppSettings";
import { tPredict } from "../i18n/farmerSimple";

type Props = {
  mandiAvg?: number | null;
  mandiMin?: number | null;
  mandiMarkets?: number;
  mandiGlutAdjust?: number;
  utilPct: number;
  totalStorages: number;
  critical: number;
  simple?: boolean;
  language?: AppLanguage;
};

export function PredictSignalsRow({
  mandiAvg,
  mandiMarkets,
  utilPct,
  totalStorages,
  critical,
  simple = false,
  language = "bn",
}: Props) {
  const tp = tPredict(language);

  if (simple) {
    return (
      <div className="predict-signals-row predict-signals-row--simple">
        {mandiAvg != null && mandiMarkets ? (
          <article className="predict-mini predict-mini--mandi">
            <span className="predict-mini__label">{tp.mandi}</span>
            <span className="predict-mini__value">₹{mandiAvg.toLocaleString("en-IN")}/q</span>
          </article>
        ) : null}
        <article className="predict-mini predict-mini--storage">
          <span className="predict-mini__label">
            <IconWarehouse /> {tp.storage}
          </span>
          <div className="predict-mini__bar">
            <div className="predict-mini__fill" style={{ width: `${Math.min(100, utilPct)}%` }} />
          </div>
          <span className="predict-mini__sub">
            <strong>{utilPct}%</strong> · {critical} {tp.storageFull}
          </span>
        </article>
      </div>
    );
  }

  return (
    <div className="predict-signals-row">
      {mandiAvg != null && mandiMarkets ? (
        <article className="predict-mini predict-mini--mandi">
          <span className="predict-mini__label">Mandi live</span>
          <span className="predict-mini__value">₹{mandiAvg.toLocaleString("en-IN")}/q</span>
          <span className="predict-mini__sub">{mandiMarkets} markets</span>
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
        </span>
      </article>
    </div>
  );
}
