import type { ConsultResponse } from "../api";
import { LoanOfferCard } from "./LoanOfferCard";
import { IconRupee } from "./icons";

type Props = {
  result: ConsultResponse | null;
  formatInr: (n: number) => string;
  onGoFarmer: () => void;
  language: "en" | "bn";
};

const COPY = {
  en: {
    eyebrow: "Agri-FinTech · West Bengal",
    title: "Finance",
    sub: "GRN-backed micro-liquidity tied to your corridor plan",
    emptyTitle: "No loan offer yet",
    emptyBody:
      "Get your route and harvest plan on the Farmer tab first. Your pre-approved micro-loan and digital GRN appear here.",
    cta: "Go to Farmer tab",
    howTitle: "How it works",
    steps: [
      "Cold-storage route locks your potato as collateral (digital GRN).",
      "Loan amount scales with quintals and live mandi / glut risk.",
      "4% p.a. demo offer via partner bank — avoid distress sell at ₹200/q.",
    ],
    disclaimer: "Demo only — not a binding credit offer.",
  },
  bn: {
    eyebrow: "অ্যাগ্রি-ফিনটেক · পশ্চিমবঙ্গ",
    title: "অর্থ",
    sub: "আপনার করিডর প্ল্যানের সাথে জড়িয়ে জিআরএন-ভিত্তিক ক্ষুদ্র ঋণ",
    emptyTitle: "এখনও ঋণ অফার নেই",
    emptyBody:
      "আগে ফার্মার ট্যাবে রুট ও ফসলের পরিকল্পনা নিন। প্রি-অ্যাপ্রুভড ক্ষুদ্র ঋণ ও ডিজিটাল জিআরএন এখানে দেখাবে।",
    cta: "ফার্মার ট্যাবে যান",
    howTitle: "কীভাবে কাজ করে",
    steps: [
      "কোল্ড স্টোরেজ রুটে আলু জামানত (ডিজিটাল জিআরএন)।",
      "ঋণের পরিমাণ কুইন্টাল ও মান্ডি / গ্লাট ঝুঁকি অনুযায়ী।",
      "৪% বার্ষিক ডেমো অফার — ₹২০০/কুইন্টাল বিপন্ন বিক্রি এড়ান।",
    ],
    disclaimer: "শুধু ডেমো — বাধ্যতামূলক ঋণ নয়।",
  },
} as const;

export function FinancePanel({ result, formatInr, onGoFarmer, language }: Props) {
  const t = COPY[language];

  return (
    <div className="finance-view animate-in">
      <header className="finance-view__head">
        <p className="finance-view__eyebrow">{t.eyebrow}</p>
        <h2 className="finance-view__title">
          <IconRupee className="finance-view__title-icon" />
          {t.title}
        </h2>
        <p className="finance-view__sub">{t.sub}</p>
      </header>

      {result ? (
        <>
          <LoanOfferCard result={result} formatInr={formatInr} variant="full" />
          {result.price_comparison && (
            <section className="finance-distress pro-card">
              <h3>Price context for your loan</h3>
              <p className="finance-distress__headline">
                {result.price_comparison.headline}
              </p>
              <p className="hint">{result.price_comparison.detail}</p>
              {result.price_comparison.in_distress_zone && (
                <p className="finance-distress__alert">
                  You are in the distress zone — micro-loan helps bridge storage until
                  mandi recovers.
                </p>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="finance-empty pro-card">
          <span className="finance-empty__icon" aria-hidden>
            ₹
          </span>
          <h3>{t.emptyTitle}</h3>
          <p>{t.emptyBody}</p>
          <button type="button" className="btn-primary" onClick={onGoFarmer}>
            {t.cta}
          </button>
        </section>
      )}

      <section className="finance-how pro-card">
        <h3>{t.howTitle}</h3>
        <ol className="finance-how__list">
          {t.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="finance-how__disclaimer">{t.disclaimer}</p>
      </section>
    </div>
  );
}
