import { AdminPanel } from "./AdminPanel";

type Props = {
  open: boolean;
  onClose: () => void;
  language: "en" | "bn";
};

const TITLE = { en: "Ops", bn: "অপারেশন" } as const;
const BACK = { en: "Back", bn: "ফিরে যান" } as const;

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
