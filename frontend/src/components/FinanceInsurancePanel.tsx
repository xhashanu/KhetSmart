import { useEffect, useState } from "react";
import { fetchInsuranceOffers, type InsurancePlan } from "../api";
import type { ConsultResponse } from "../api";
import type { AppLanguage } from "../hooks/useAppSettings";
import { tFinance } from "../i18n/financeSimple";
import { insurancePlanDisplay } from "../i18n/lang";

type Props = {
  result: ConsultResponse | null;
  language: AppLanguage;
  formatInr: (n: number) => string;
};

export function FinanceInsurancePanel({ result, language, formatInr }: Props) {
  const t = tFinance(language);
  const [plans, setPlans] = useState<InsurancePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const qty = result?.parsed.quantity_quintals ?? 50;
    const glut = result?.yield_signal.glut_risk_pct ?? 50;
    const crop = result?.parsed.crop ?? "Potato";
    setLoading(true);
    fetchInsuranceOffers({ quantity_quintals: qty, glut_risk_pct: glut, crop })
      .then((data) => setPlans(data.plans))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, [result]);

  function handleInsure(plan: InsurancePlan) {
    const { name } = insurancePlanDisplay(plan, language);
    setToast(`${name} — ${t.applySent}`);
    window.setTimeout(() => setToast(null), 3500);
  }

  if (loading) {
    return <div className="skeleton skeleton--tall" />;
  }

  return (
    <div className="finance-section finance-section--insurance">
      <p className="finance-section__lead">{t.insuranceSub}</p>
      {toast && <p className="finance-toast">{toast}</p>}

      <div className="finance-card-list">
        {plans.map((plan) => {
          const { name, highlights } = insurancePlanDisplay(plan, language);
          return (
            <article
              key={plan.id}
              className={`finance-offer-card ${plan.recommended ? "finance-offer-card--rec" : ""}`}
            >
              <div className="finance-offer-card__head">
                <strong>{name}</strong>
                {plan.recommended && (
                  <span className="finance-offer-card__badge">{t.bestPlan}</span>
                )}
              </div>
              <p className="finance-offer-card__provider">{plan.provider}</p>
              <div className="finance-offer-card__nums">
                <span>
                  {t.premium}: <strong>{formatInr(plan.premium_inr)}</strong>
                </span>
                <span>
                  {t.coverage}: <strong>{formatInr(plan.coverage_inr)}</strong>
                </span>
              </div>
              <ul className="finance-offer-card__tags">
                {highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              <div className="finance-offer-card__actions">
                <button
                  type="button"
                  className="btn-primary finance-offer-card__btn"
                  onClick={() => handleInsure(plan)}
                >
                  {t.insure}
                </button>
                <a className="finance-offer-card__call" href={`tel:${plan.phone.replace(/\s/g, "")}`}>
                  📞
                </a>
              </div>
            </article>
          );
        })}
      </div>
      <p className="finance-disclaimer">{t.disclaimer}</p>
    </div>
  );
}
