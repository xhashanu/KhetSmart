import type { ConsultResponse } from "../api";
import { DistressPriceCard } from "./DistressPriceCard";
import { GlutGauge } from "./GlutGauge";
import { RouteFlow } from "./RouteFlow";
import { IconTruck } from "./icons";

type Props = {
  result: ConsultResponse;
  formatInr: (n: number) => string;
  onViewFinance?: () => void;
};

function truncateStorage(name: string, max = 28) {
  if (name.length <= max) return name;
  return `${name.slice(0, max)}…`;
}

function FarmerConsultResults({ result, formatInr, onViewFinance }: Props) {
  const insight = result.yield_signal.insight;
  const shortInsight =
    insight.length > 160 ? `${insight.slice(0, 157)}…` : insight;

  return (
    <div className="farmer-results animate-in">
      <div className="farmer-results__header">
        <span className="farmer-results__badge">Plan ready</span>
        <h2 className="farmer-results__title">Your corridor plan</h2>
        <p className="farmer-results__sub">
          Route and mandi price from your harvest + live GPS
        </p>
      </div>

      <section className="pro-card pro-card--signal">
        <div className="pro-card__head">
          <span className="pro-card__icon pro-card__icon--sky">◎</span>
          <div>
            <span className="pro-card__eyebrow">Market intelligence</span>
            <h3>Yield & glut signal</h3>
          </div>
        </div>
        <div className="pro-signal">
          <GlutGauge
            value={result.yield_signal.glut_risk_pct}
            alertLevel={result.yield_signal.alert_level}
          />
          <div className="pro-signal__copy">
            <p className="pro-signal__insight" title={insight}>
              {shortInsight}
            </p>
            <div className="parsed-chips">
              <span className="chip chip--gold">
                {result.parsed.quantity_quintals} q
              </span>
              <span className="chip">{result.parsed.crop}</span>
              {result.parsed.district && (
                <span className="chip">{result.parsed.district}</span>
              )}
              <span className="chip chip--outline">
                NLP {Math.round(result.parsed.confidence * 100)}%
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="pro-card pro-card--route">
        <div className="pro-card__head">
          <span className="pro-card__icon pro-card__icon--route">
            <IconTruck className="pro-card__icon-svg" />
          </span>
          <div>
            <span className="pro-card__eyebrow">Logistics</span>
            <h3>Optimal cold-storage route</h3>
          </div>
        </div>
        <RouteFlow
          storageName={truncateStorage(result.route.storage_name)}
          storageNameFull={result.route.storage_name}
          distanceKm={result.route.distance_km}
          distanceSource={result.route.distance_source}
          costInr={result.route.logistics_cost_inr}
          profitInr={result.route.estimated_profit_inr}
        />
        {result.route.why && result.route.why.length > 0 && (
          <ul className="pro-checklist">
            {result.route.why.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      {result.price_comparison && (
        <DistressPriceCard
          distressPerQ={result.price_comparison.distress_price_per_quintal}
          livePerQ={result.price_comparison.live_mandi_price_per_quintal}
          cultivationPerQ={result.price_comparison.cultivation_cost_per_quintal}
          quantityQ={result.price_comparison.quantity_quintals}
          revenueLive={result.price_comparison.revenue_at_live_inr}
          revenueDistress={result.price_comparison.revenue_at_distress_inr}
          uplift={result.price_comparison.uplift_vs_distress_inr}
          headline={result.price_comparison.headline}
          detail={result.price_comparison.detail}
          inDistressZone={result.price_comparison.in_distress_zone}
        />
      )}

      {onViewFinance && (
        <section className="pro-card pro-card--finance-teaser">
          <div className="finance-teaser">
            <div>
              <span className="pro-card__eyebrow">Agri-FinTech</span>
              <h3>Micro-loan & GRN</h3>
              <p className="finance-teaser__line">
                {result.loan.approved
                  ? `${formatInr(result.loan.amount_inr)} pre-approved · ${result.loan.interest_rate_pa}% p.a.`
                  : "Check eligibility on Finance tab"}
              </p>
            </div>
            <button type="button" className="finance-teaser__btn" onClick={onViewFinance}>
              Finance →
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

export { FarmerConsultResults };
export default FarmerConsultResults;
