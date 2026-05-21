import type { ConsultResponse } from "../api";
import { IconRupee } from "./icons";

type Props = {
  result: ConsultResponse;
  formatInr: (n: number) => string;
  variant?: "full" | "compact";
};

export function LoanOfferCard({ result, formatInr, variant = "full" }: Props) {
  const { loan, parsed, price_comparison: price } = result;

  return (
    <section className={`pro-card pro-card--loan ${variant === "compact" ? "pro-card--compact" : ""}`}>
      <div className="pro-card__head">
        <span className="pro-card__icon pro-card__icon--finance">
          <IconRupee className="pro-card__icon-svg" />
        </span>
        <div>
          <span className="pro-card__eyebrow">Agri-FinTech</span>
          <h3>Smart micro-liquidity</h3>
        </div>
      </div>

      {loan.approved ? (
        <>
          <div className="loan-hero loan-hero--pro">
            <div>
              <span className="loan-hero__amount">{formatInr(loan.amount_inr)}</span>
              <span className="loan-hero__rate">@ {loan.interest_rate_pa}% p.a.</span>
            </div>
            <span className="loan-hero__pill">Pre-approved</span>
          </div>
          <p className="loan-hero__bank">{loan.bank_partner}</p>
          <div className="finance-meta-chips">
            <span className="chip chip--gold">{parsed.quantity_quintals} q</span>
            <span className="chip">{parsed.crop}</span>
            {parsed.district && <span className="chip">{parsed.district}</span>}
          </div>
          <div className="grn-badge grn-badge--pro">
            <span>Digital GRN</span>
            <code>{loan.grn_id}</code>
          </div>
          {variant === "full" && price && (
            <ul className="finance-facts">
              <li>
                Live mandi on your route:{" "}
                <strong>₹{price.live_mandi_price_per_quintal}/q</strong>
              </li>
              <li>
                Distress floor: <strong>₹{price.distress_price_per_quintal}/q</strong>
              </li>
              <li>
                Cultivation cost band:{" "}
                <strong>₹{price.cultivation_cost_per_quintal}/q</strong>
              </li>
              {price.uplift_vs_distress_inr > 0 && (
                <li>
                  Uplift vs distress sell:{" "}
                  <strong>{formatInr(price.uplift_vs_distress_inr)}</strong>
                </li>
              )}
            </ul>
          )}
          <p className="hint pro-hint">{loan.trigger_reason}</p>
        </>
      ) : (
        <p className="hint pro-hint">
          No micro-loan trigger for current market conditions. Try updating your harvest
          quantity on the Farmer tab.
        </p>
      )}
    </section>
  );
}
