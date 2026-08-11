import type { AppLanguage } from "../hooks/useAppSettings";
import { tFarmer } from "../i18n/farmerSimple";

type Props = {
  distressPerQ: number;
  livePerQ: number;
  cultivationPerQ: number;
  quantityQ: number;
  revenueLive: number;
  revenueDistress: number;
  uplift: number;
  headline: string;
  detail: string;
  inDistressZone: boolean;
  simple?: boolean;
  language?: AppLanguage;
};

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function DistressPriceCard({
  distressPerQ,
  livePerQ,
  cultivationPerQ,
  quantityQ,
  revenueLive,
  revenueDistress,
  uplift,
  headline,
  detail,
  inDistressZone,
  simple = false,
  language = "bn",
}: Props) {
  const t = tFarmer(language);

  if (simple) {
    return (
      <article
        className={`distress-card-simple ${inDistressZone ? "distress-card-simple--alert" : ""}`}
      >
        <p className="distress-card-simple__title">{t.betterPrice}</p>
        <p className="distress-card-simple__amount">+{formatInr(uplift)}</p>
        <p className="distress-card-simple__sub">
          {quantityQ} q · {t.notDistressSell}
        </p>
      </article>
    );
  }

  const maxRev = Math.max(revenueLive, revenueDistress, 1);
  const livePct = (revenueLive / maxRev) * 100;
  const distressPct = (revenueDistress / maxRev) * 100;

  return (
    <article
      className={`pro-card pro-card--distress distress-card ${inDistressZone ? "distress-card--alert" : ""}`}
    >
      <div className="pro-card__head">
        <span className="pro-card__icon pro-card__icon--distress">₹</span>
        <div>
          <span className="pro-card__eyebrow">Price impact</span>
          <h3>Distress vs your route</h3>
        </div>
      </div>
      {uplift > 0 && (
        <p className="distress-card__banner">
          +{formatInr(uplift)} uplift vs distress for {quantityQ} q
        </p>
      )}
      <p className="distress-card__headline">{headline}</p>
      <div className="distress-bars">
        <div className="distress-bar distress-bar--distress">
          <span className="distress-bar__label">Distress floor</span>
          <div className="distress-bar__track">
            <div
              className="distress-bar__fill distress-bar__fill--red"
              style={{ width: `${distressPct}%` }}
            />
          </div>
          <span className="distress-bar__price">
            Rs {distressPerQ}/q · {formatInr(revenueDistress)}
          </span>
        </div>
        <div className="distress-bar distress-bar--live">
          <span className="distress-bar__label">Live mandi (route)</span>
          <div className="distress-bar__track">
            <div
              className="distress-bar__fill distress-bar__fill--green"
              style={{ width: `${livePct}%` }}
            />
          </div>
          <span className="distress-bar__price">
            Rs {livePerQ.toLocaleString("en-IN")}/q · {formatInr(revenueLive)}
          </span>
        </div>
      </div>
      <p className="hint pro-hint">
        Cultivation cost ~Rs {cultivationPerQ.toLocaleString("en-IN")}/q · {detail}
      </p>
    </article>
  );
}
