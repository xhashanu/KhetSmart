import { AdminPanel } from "./AdminPanel";
import type { AppLanguage } from "../hooks/useAppSettings";

type Props = {
  open: boolean;
  onClose: () => void;
  language: AppLanguage;
};

const TITLE = { en: "Ops", bn: "অপারেশন", hi: "ऑपरेशन" } as const;
const BACK = { en: "Back", bn: "ফিরে যান", hi: "वापस" } as const;

export function OpsOverlay({ open, onClose, language }: Props) {
  if (!open) return null;

  return (
    <div className="ops-overlay" role="dialog" aria-label={TITLE[language]}>
      <div className="ops-overlay__bar">
        <button type="button" className="ops-overlay__back" onClick={onClose}>
          ← {BACK[language]}
        </button>
        <h2 className="ops-overlay__title">{TITLE[language]}</h2>
      </div>
      <div className="ops-overlay__body">
        <AdminPanel />
      </div>
    </div>
  );
}
