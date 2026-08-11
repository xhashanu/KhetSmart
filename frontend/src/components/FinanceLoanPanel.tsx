import { useState } from "react";
import type { ConsultResponse } from "../api";
import type { AppLanguage } from "../hooks/useAppSettings";
import { tFinance } from "../i18n/financeSimple";

type Props = {
  result: ConsultResponse;
  formatInr: (n: number) => string;
  language: AppLanguage;
};

function truncate(name: string, max = 30) {
  return name.length <= max ? name : `${name.slice(0, max)}…`;
}

function simpleWhy(lang: AppLanguage, result: ConsultResponse): string {
  const glut = result.yield_signal.glut_risk_pct;
  if (lang === "bn") {
    if (glut >= 55) return "বাজারে আলু বেশি — স্টোরেজে রাখতে ঋণ সাহায্য করে";
    return "ফসল বিক্রি ও স্টোরেজ খরচের জন্য কাজের মূলধন";
  }
  if (lang === "hi") {
    if (glut >= 55) return "बाजार में आलू ज्यादा — स्टोरेज के लिए ऋण मदद करता है";
    return "फसल बिक्री और स्टोरेज खर्च के लिए पूंजी";
  }
  if (glut >= 55) return "High glut — loan helps you store instead of distress sell";
  return "Working capital for storage and better mandi timing";
}

export function FinanceLoanPanel({ result, formatInr, language }: Props) {
  const t = tFinance(language);
  const { loan, route, price_comparison: price, parsed } = result;
  const [toast, setToast] = useState<string | null>(null);

  const tenure = loan.tenure_days ?? 90;
  const monthly = loan.approved ? Math.round(loan.amount_inr / 3) : 0;

  function handleApply() {
    setToast(t.applySent);
    window.setTimeout(() => setToast(null), 4000);
  }

  function handleShare() {
    const text =
      language === "bn"
        ? `KhetSmart: ${formatInr(loan.amount_inr)} ঋণ, ${parsed.quantity_quintals} কুই, ${route.storage_name}`
        : language === "hi"
          ? `KhetSmart: ${formatInr(loan.amount_inr)} ऋण, ${parsed.quantity_quintals} क्विं, ${route.storage_name}`
          : `KhetSmart loan: ${formatInr(loan.amount_inr)}, ${parsed.quantity_quintals}q, ${route.storage_name}`;
    if (navigator.share) {
      navigator.share({ title: "KhetSmart", text }).catch(() => {});
    } else {
      void navigator.clipboard?.writeText(text);
      setToast(t.copied);
      window.setTimeout(() => setToast(null), 2500);
    }
  }

  return (
    <div className="finance-section finance-section--loan">
      {toast && <p className="finance-toast">{toast}</p>}

      {loan.approved ? (
        <>
          <div className="finance-hero">
            <span className="finance-hero__lbl">{t.loanAmount}</span>
            <strong className="finance-hero__amt">{formatInr(loan.amount_inr)}</strong>
            <span className="finance-hero__pill">{t.approved}</span>
          </div>

          <ul className="finance-facts-simple">
            <li>
              {parsed.quantity_quintals} q · {parsed.crop}
            </li>
            <li>
              {t.storage}: {truncate(route.storage_name)}
            </li>
            <li>
              {t.repay} <strong>{tenure}</strong> {t.days}
              {monthly > 0 && (
                <>
                  {" "}
                  · {t.approxMonthly} <strong>{formatInr(monthly)}</strong>
                </>
              )}
            </li>
          </ul>

          <p className="finance-why-box">
            <span className="finance-why-box__lbl">{t.whyLoan}</span>
            {simpleWhy(language, result)}
          </p>

          {price && price.uplift_vs_distress_inr > 0 && (
            <p className="finance-uplift-strip">
              {t.uplift}: <strong>+{formatInr(price.uplift_vs_distress_inr)}</strong>
            </p>
          )}

          <p className="finance-collateral">{t.collateral}</p>
          <p className="finance-bank-line">{loan.bank_partner}</p>

          <div className="finance-actions">
            <button type="button" className="btn-primary finance-actions__main" onClick={handleApply}>
              {t.applyLoan}
            </button>
            <button type="button" className="finance-actions__sec" onClick={handleShare}>
              {t.share}
            </button>
          </div>
        </>
      ) : (
        <p className="finance-not-approved">{t.notApproved}</p>
      )}

      <p className="finance-disclaimer">{t.disclaimer}</p>
    </div>
  );
}
