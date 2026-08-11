import { useEffect, useRef, useState } from "react";
import type { FarmerProfile } from "../api";
import type { AppFontSize, AppLanguage } from "../hooks/useAppSettings";
import { languageMenuLabel } from "../i18n/lang";
import { tAuth } from "../i18n/authSimple";

type Panel = "menu" | "language" | "font" | "profile" | "setpin";

export type SettingsMenuProps = {
  open: boolean;
  onClose: () => void;
  language: AppLanguage;
  fontSize: AppFontSize;
  onLanguageChange: (lang: AppLanguage) => void;
  onFontSizeChange: (size: AppFontSize) => void;
  onOpenOps: () => void;
  isAuthenticated: boolean;
  farmer: FarmerProfile | null;
  onOpenLoginSignup: () => void;
  onLogout: () => void | Promise<void>;
  onSetPin?: (pin: string, pinConfirm: string) => Promise<void>;
  onOpenOrders: () => void;
};

const LABELS = {
  en: {
    settings: "Settings",
    loginSignup: "Log in / Sign up",
    loginSignupHint: "Create account to save your plans",
    myProfile: "My profile",
    profileTitle: "My profile",
    name: "Name",
    phone: "Mobile",
    language: "Language",
    ops: "Ops",
    fontSize: "Font size",
    back: "Back",
    english: "English",
    bengali: "বাংলা (Bengali)",
    hindi: "हिन्दी (Hindi)",
    small: "Small",
    medium: "Medium",
    large: "Large",
    opsHint: "Storage pipeline & admin tools",
    logout: "Log out",
    myOrders: "My Bookings & Orders",
    myOrdersHint: "View receipts and list for auction",
  },
  bn: {
    settings: "সেটিংস",
    loginSignup: "লগ ইন / সাইন আপ",
    loginSignupHint: "অ্যাকাউন্ট খুলে প্ল্যান সংরক্ষণ করুন",
    myProfile: "আমার প্রোফাইল",
    profileTitle: "আমার প্রোফাইল",
    name: "নাম",
    phone: "মোবাইল",
    language: "ভাষা",
    ops: "অপারেশন",
    fontSize: "অক্ষরের আকার",
    back: "ফিরে যান",
    english: "English",
    bengali: "বাংলা",
    hindi: "हिन्दी",
    small: "ছোট",
    medium: "মাঝারি",
    large: "বড়",
    opsHint: "স্টোরেজ ও অ্যাডমিন টুল",
    logout: "লগ আউট",
    myOrders: "আমার বুকিং ও অর্ডার",
    myOrdersHint: "রসিদ দেখুন এবং নিলামে লিস্টিং করুন",
  },
  hi: {
    settings: "सेटिंग्स",
    loginSignup: "लॉग इन / साइन अप",
    loginSignupHint: "खाता बनाकर योजना सहेजें",
    myProfile: "मेरी प्रोफाइल",
    profileTitle: "मेरी प्रोफाइल",
    name: "नाम",
    phone: "मोबाइल",
    language: "भाषा",
    ops: "ऑपरेशन",
    fontSize: "अक्षर का आकार",
    back: "वापस",
    english: "English",
    bengali: "বাংলা",
    hindi: "हिन्दी",
    small: "छोटा",
    medium: "मध्यम",
    large: "बड़ा",
    opsHint: "स्टोरेज और एडमिन टूल",
    logout: "लॉग आउट",
    myOrders: "मेरे बुकिंग और ऑर्डर",
    myOrdersHint: "रसीदें देखें और नीलामी में लिस्ट करें",
  },
} as const;

function formatPhone(phone: string) {
  if (phone.length === 10) return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
  return phone;
}

export function SettingsMenu({
  open,
  onClose,
  language,
  fontSize,
  onLanguageChange,
  onFontSizeChange,
  onOpenOps,
  isAuthenticated,
  farmer,
  onOpenLoginSignup,
  onLogout,
  onSetPin,
  onOpenOrders,
}: SettingsMenuProps) {
  const [panel, setPanel] = useState<Panel>("menu");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = LABELS[language];
  const ta = tAuth(language);

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

  const profileSub = farmer?.name ?? "";

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
              {isAuthenticated ? (
                <button
                  type="button"
                  className="settings-menu__item"
                  onClick={() => setPanel("profile")}
                >
                  <span className="settings-menu__item-icon" aria-hidden>
                    👤
                  </span>
                  <span className="settings-menu__item-text">
                    <strong>{t.myProfile}</strong>
                    <small>{profileSub}</small>
                  </span>
                  <span className="settings-menu__chevron" aria-hidden>
                    ›
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="settings-menu__item settings-menu__item--accent"
                  onClick={() => {
                    onClose();
                    onOpenLoginSignup();
                  }}
                >
                  <span className="settings-menu__item-icon" aria-hidden>
                    🔐
                  </span>
                  <span className="settings-menu__item-text">
                    <strong>{t.loginSignup}</strong>
                    <small>{t.loginSignupHint}</small>
                  </span>
                  <span className="settings-menu__chevron" aria-hidden>
                    ›
                  </span>
                </button>
              )}
            </li>
            <li>
              <button
                type="button"
                className="settings-menu__item"
                onClick={() => {
                  onClose();
                  onOpenOrders();
                }}
              >
                <span className="settings-menu__item-icon" aria-hidden>
                  📋
                </span>
                <span className="settings-menu__item-text">
                  <strong>{t.myOrders}</strong>
                  <small>{t.myOrdersHint}</small>
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
                onClick={() => setPanel("language")}
              >
                <span className="settings-menu__item-icon" aria-hidden>
                  🌐
                </span>
                <span className="settings-menu__item-text">
                  <strong>{t.language}</strong>
                  <small>
                    {languageMenuLabel(language, {
                      english: t.english,
                      bengali: t.bengali,
                      hindi: t.hindi,
                    })}
                  </small>
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

        {panel === "profile" && farmer && (
          <div className="settings-menu__profile">
            <p className="settings-menu__panel-title">{t.profileTitle}</p>
            <dl className="settings-menu__profile-dl">
              <div>
                <dt>{t.name}</dt>
                <dd>{farmer.name}</dd>
              </div>
              <div>
                <dt>{t.phone}</dt>
                <dd>{formatPhone(farmer.phone)}</dd>
              </div>
            </dl>
            {onSetPin && !farmer.has_pin && (
              <button
                type="button"
                className="settings-menu__setpin-btn"
                onClick={() => {
                  setPin("");
                  setPin2("");
                  setPinMsg(null);
                  setPanel("setpin");
                }}
              >
                {ta.setPinTitle}
              </button>
            )}
            {farmer.has_pin && (
              <p className="settings-menu__pin-on">{ta.hasPin}</p>
            )}
            <button
              type="button"
              className="settings-menu__logout-btn"
              onClick={() => void onLogout()}
            >
              {t.logout}
            </button>
          </div>
        )}

        {panel === "setpin" && onSetPin && (
          <div className="settings-menu__profile">
            <p className="settings-menu__panel-title">{ta.setPinTitle}</p>
            <p className="settings-menu__setpin-sub">{ta.setPinSub}</p>
            <label className="settings-menu__pin-field">
              <span>{ta.pin}</span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <label className="settings-menu__pin-field">
              <span>{ta.pinConfirm}</span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            {pinMsg && <p className="settings-menu__pin-msg">{pinMsg}</p>}
            <button
              type="button"
              className="settings-menu__setpin-btn settings-menu__setpin-btn--primary"
              disabled={pinBusy}
              onClick={async () => {
                setPinBusy(true);
                setPinMsg(null);
                try {
                  await onSetPin(pin, pin2);
                  setPinMsg(ta.pinSaved);
                  setPanel("profile");
                } catch {
                  setPinMsg(ta.pinMismatch);
                } finally {
                  setPinBusy(false);
                }
              }}
            >
              {pinBusy ? ta.busy : ta.setPinBtn}
            </button>
          </div>
        )}

        {panel === "language" && (
          <div className="settings-menu__options">
            <p className="settings-menu__panel-title">{t.language}</p>
            {(
              [
                ["en", t.english],
                ["bn", t.bengali],
                ["hi", t.hindi],
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
