import type { ConsultResponse } from "../api";
import type { AppLanguage } from "../hooks/useAppSettings";
import { tFinance } from "../i18n/financeSimple";
import { isSimpleLang } from "../i18n/lang";
import { IconRupee } from "./icons";

type Props = {
  result: ConsultResponse;
  formatInr: (n: number) => string;
  variant?: "full" | "compact";
  language?: AppLanguage;
};

export function LoanOfferCard({
  result,
  formatInr,
  variant = "full",
  language = "bn",
}: Props) {
  const { loan, parsed } = result;
  const t = tFinance(language);
  const simple = isSimpleLang(language);

  return (
    <section
      className={`pro-card pro-card--loan ${variant === "compact" ? "pro-card--compact" : ""} ${simple ? "pro-card--simple" : ""}`}
    >
      {!simple && (
        <div className="pro-card__head">
          <span className="pro-card__icon pro-card__icon--finance">
            <IconRupee className="pro-card__icon-svg" />
          </span>
          <div>
            <span className="pro-card__eyebrow">Agri-FinTech</span>
            <h3>Smart micro-liquidity</h3>
          </div>
        </div>
      )}

      {loan.approved ? (
        <>
          <div className="loan-hero loan-hero--pro loan-hero--simple">
            <div>
              <span className="loan-hero__amount">{formatInr(loan.amount_inr)}</span>
              {!simple && (
                <span className="loan-hero__rate">@ {loan.interest_rate_pa}% p.a.</span>
              )}
            </div>
            <span className="loan-hero__pill">{t.approved}</span>
          </div>
          <p className="loan-hero__bank">{loan.bank_partner}</p>
          <div className="finance-meta-chips">
            <span className="chip chip--gold">{parsed.quantity_quintals} q</span>
            <span className="chip">{parsed.crop}</span>
          </div>
          {!simple && (
            <div className="grn-badge grn-badge--pro">
              <span>Digital GRN</span>
              <code>{loan.grn_id}</code>
            </div>
          )}
        </>
      ) : (
        <p className="hint pro-hint">{t.notApproved}</p>
      )}
    </section>
  );
}
