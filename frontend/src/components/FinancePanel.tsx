import { useState } from "react";
import type { ConsultResponse } from "../api";
import type { AppLanguage } from "../hooks/useAppSettings";
import { tFinance } from "../i18n/financeSimple";
import { FinanceAuctionPanel } from "./FinanceAuctionPanel";
import { FinanceInsurancePanel } from "./FinanceInsurancePanel";
import { FinanceLoanPanel } from "./FinanceLoanPanel";
import { IconRupee } from "./icons";

type Props = {
  result: ConsultResponse | null;
  formatInr: (n: number) => string;
  onGoFarmer: () => void;
  language: AppLanguage;
  activeSubTab?: "loan" | "insurance" | "auction";
  onTabChange?: (tab: "loan" | "insurance" | "auction") => void;
};

type FinanceTab = "loan" | "insurance" | "auction";

export function FinancePanel({ result, formatInr, onGoFarmer, language, activeSubTab, onTabChange }: Props) {
  const t = tFinance(language);
  const [localTab, setLocalTab] = useState<FinanceTab>("loan");

  const tab = activeSubTab ?? localTab;
  const setTab = onTabChange ?? setLocalTab;

  const tabs: { id: FinanceTab; label: string }[] = [
    { id: "loan", label: t.tabLoan },
    { id: "insurance", label: t.tabInsurance },
    { id: "auction", label: t.tabAuction },
  ];

  return (
    <div className="finance-view animate-in">
      <header className="finance-view__head finance-view__head--simple">
        <h2 className="finance-view__title finance-view__title--simple">
          <IconRupee className="finance-view__title-icon" aria-hidden />
          {t.title}
        </h2>
      </header>

      <div className="finance-tabs" role="tablist" aria-label={t.title}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`finance-tabs__btn ${tab === item.id ? "finance-tabs__btn--on" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!result ? (
        <section className="finance-empty pro-card">
          <span className="finance-empty__icon" aria-hidden>
            ₹
          </span>
          <h3>{t.emptyTitle}</h3>
          <p>{t.emptyBody}</p>
          <button type="button" className="btn-primary" onClick={onGoFarmer}>
            {t.emptyCta}
          </button>
        </section>
      ) : (
        <>
          {tab === "loan" && (
            <FinanceLoanPanel result={result} formatInr={formatInr} language={language} />
          )}
          {tab === "insurance" && (
            <FinanceInsurancePanel result={result} language={language} formatInr={formatInr} />
          )}
          {tab === "auction" && (
            <FinanceAuctionPanel language={language} formatInr={formatInr} />
          )}
        </>
      )}
    </div>
  );
}
