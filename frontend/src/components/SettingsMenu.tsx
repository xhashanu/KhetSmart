import { useEffect, useRef, useState } from "react";
import type { AppFontSize, AppLanguage } from "../hooks/useAppSettings";

type Panel = "menu" | "language" | "font";

type Props = {
  open: boolean;
  onClose: () => void;
  language: AppLanguage;
  fontSize: AppFontSize;
  onLanguageChange: (lang: AppLanguage) => void;
  onFontSizeChange: (size: AppFontSize) => void;
  onOpenOps: () => void;
};

const LABELS = {
  en: {
    settings: "Settings",
    language: "Language",
    ops: "Ops",
    fontSize: "Font size",
    back: "Back",
    english: "English",
    bengali: "বাংলা (Bengali)",
    small: "Small",
    medium: "Medium",
    large: "Large",
    opsHint: "Storage pipeline & admin tools",
  },
  bn: {
    settings: "সেটিংস",
    language: "ভাষা",
    ops: "অপারেশন",
    fontSize: "অক্ষরের আকার",
    back: "ফিরে যান",
    english: "English",
    bengali: "বাংলা",
    small: "ছোট",
    medium: "মাঝারি",
    large: "বড়",
    opsHint: "স্টোরেজ ও অ্যাডমিন টুল",
  },
} as const;

export function SettingsMenu({
  open,
  onClose,
  language,
  fontSize,
  onLanguageChange,
  onFontSizeChange,
  onOpenOps,
}: Props) {
  const [panel, setPanel] = useState<Panel>("menu");
  const menuRef = useRef<HTMLDivElement>(null);
  const t = LABELS[language];

  useEffect(() => {
    if (!open) setPanel("menu");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="settings-menu__backdrop"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        ref={menuRef}
        className="settings-menu"
        role="dialog"
        aria-label={t.settings}
      >
        <div className="settings-menu__head">
          {panel !== "menu" ? (
            <button
              type="button"
              className="settings-menu__back"
              onClick={() => setPanel("menu")}
            >
              ← {t.back}
            </button>
          ) : (
            <span className="settings-menu__title">{t.settings}</span>
          )}
          <button
            type="button"
            className="settings-menu__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {panel === "menu" && (
          <ul className="settings-menu__list">
            <li>
              <button
                type="button"
                className="settings-menu__item"
                onClick={() => setPanel("language")}
              >
                <span className="settings-menu__item-icon" aria-hidden>
                  🌐
                </span>
                <span className="settings-menu__item-text">
                  <strong>{t.language}</strong>
                  <small>{language === "bn" ? t.bengali : t.english}</small>
                </span>
                <span className="settings-menu__chevron" aria-hidden>
                  ›
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className="settings-menu__item"
                onClick={() => {
                  onClose();
                  onOpenOps();
                }}
              >
                <span className="settings-menu__item-icon" aria-hidden>
                  ⚙
                </span>
                <span className="settings-menu__item-text">
                  <strong>{t.ops}</strong>
                  <small>{t.opsHint}</small>
                </span>
                <span className="settings-menu__chevron" aria-hidden>
                  ›
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className="settings-menu__item"
                onClick={() => setPanel("font")}
              >
                <span className="settings-menu__item-icon" aria-hidden>
                  Aa
                </span>
                <span className="settings-menu__item-text">
                  <strong>{t.fontSize}</strong>
                  <small>
                    {fontSize === "sm"
                      ? t.small
                      : fontSize === "lg"
                        ? t.large
                        : t.medium}
                  </small>
                </span>
                <span className="settings-menu__chevron" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          </ul>
        )}

        {panel === "language" && (
          <div className="settings-menu__options">
            <p className="settings-menu__panel-title">{t.language}</p>
            {(
              [
                ["en", t.english],
                ["bn", t.bengali],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                className={`settings-menu__option ${language === code ? "settings-menu__option--on" : ""}`}
                onClick={() => onLanguageChange(code)}
              >
                {label}
                {language === code && <span className="settings-menu__check">✓</span>}
              </button>
            ))}
          </div>
        )}

        {panel === "font" && (
          <div className="settings-menu__options">
            <p className="settings-menu__panel-title">{t.fontSize}</p>
            {(
              [
                ["sm", t.small],
                ["md", t.medium],
                ["lg", t.large],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                className={`settings-menu__option ${fontSize === code ? "settings-menu__option--on" : ""}`}
                onClick={() => onFontSizeChange(code)}
              >
                {label}
                {fontSize === code && <span className="settings-menu__check">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
