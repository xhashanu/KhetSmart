import { useEffect, useState, type FormEvent } from "react";
import type { AppLanguage } from "../hooks/useAppSettings";
import { tAuth } from "../i18n/authSimple";

type Step = "phone" | "otp" | "profile" | "pin";

export type AuthModalProps = {
  open: boolean;
  language: AppLanguage;
  busy?: boolean;
  showGuestOption?: boolean;
  sendOtp: (phone: string) => Promise<{
    dev_otp?: string;
    resend_after_seconds: number;
  }>;
  verifyOtp: (
    phone: string,
    otp: string
  ) => Promise<{ status: "logged_in" } | { status: "needs_profile"; signup_token: string }>;
  completeSignup: (signupToken: string, name: string) => Promise<void>;
  onPinLogin: (phone: string, pin: string) => Promise<void>;
  onSuccess: () => void;
  onGuest: () => void;
  onClose: () => void;
};

function normalizePhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function mapError(msg: string, t: ReturnType<typeof tAuth>): string {
  if (msg === "invalid_phone") return t.invalidPhone;
  if (msg === "invalid_otp" || msg === "otp_not_found") return t.otpWrong;
  if (msg === "otp_expired") return t.otpExpired;
  if (msg === "otp_resend_wait" || msg === "otp_rate_limited") return t.otpWait;
  if (msg === "invalid_name") return t.invalidName;
  if (msg === "invalid_credentials") return t.loginFailed;
  if (msg === "pin_not_set") return t.pinNotSet;
  if (msg === "pin_mismatch") return t.pinMismatch;
  return t.networkError;
}

export function AuthModal({
  open,
  language,
  busy = false,
  showGuestOption = true,
  sendOtp,
  verifyOtp,
  completeSignup,
  onPinLogin,
  onSuccess,
  onGuest,
  onClose,
}: AuthModalProps) {
  const t = tAuth(language);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [resendSec, setResendSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("phone");
      setPhone("");
      setOtp("");
      setName("");
      setPin("");
      setSignupToken("");
      setDevOtp(null);
      setResendSec(0);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (resendSec <= 0) return;
    const id = window.setInterval(() => {
      setResendSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendSec]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const phoneN = normalizePhoneInput(phone);

  async function handleSendOtp(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (phoneN.length !== 10) {
      setError(t.invalidPhone);
      return;
    }
    try {
      const res = await sendOtp(phoneN);
      setDevOtp(res.dev_otp ?? null);
      setResendSec(res.resend_after_seconds);
      setStep("otp");
      setOtp("");
    } catch (err) {
      setError(mapError(err instanceof Error ? err.message : "", t));
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (otp.length !== 6) {
      setError(t.invalidOtp);
      return;
    }
    try {
      const res = await verifyOtp(phoneN, otp);
      if (res.status === "logged_in") {
        onSuccess();
        return;
      }
      setSignupToken(res.signup_token);
      setStep("profile");
    } catch (err) {
      setError(mapError(err instanceof Error ? err.message : "", t));
    }
  }

  async function handleProfile(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError(t.invalidName);
      return;
    }
    try {
      await completeSignup(signupToken, name.trim());
      onSuccess();
    } catch (err) {
      setError(mapError(err instanceof Error ? err.message : "", t));
    }
  }

  async function handlePinLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (phoneN.length !== 10 || pin.length < 4) {
      setError(t.invalidPhone);
      return;
    }
    try {
      await onPinLogin(phoneN, pin);
      onSuccess();
    } catch (err) {
      setError(mapError(err instanceof Error ? err.message : "", t));
    }
  }

  const title =
    step === "profile"
      ? t.profileTitle
      : step === "pin"
        ? t.loginTitle
        : t.loginTitle;

  return (
    <div className="auth-modal" role="dialog" aria-labelledby="auth-modal-title">
      <button
        type="button"
        className="auth-modal__backdrop"
        aria-label={t.close}
        onClick={showGuestOption ? onClose : undefined}
        disabled={busy || !showGuestOption}
      />
      <div className="auth-modal__card">
        {showGuestOption && (
          <button
            type="button"
            className="auth-modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label={t.close}
            title={t.closeHint}
          >
            ×
          </button>
        )}
        <span className="auth-modal__icon" aria-hidden>
          🌾
        </span>
        <h2 id="auth-modal-title">{title}</h2>
        <p className="auth-modal__sub">{t.subtitle}</p>

        {step === "phone" && (
          <form className="auth-modal__form" onSubmit={handleSendOtp}>
            <label className="auth-modal__field">
              <span>{t.phone}</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
                maxLength={14}
              />
              <small>{t.phoneHint}</small>
            </label>
            {error && <p className="auth-modal__error">{error}</p>}
            <button type="submit" className="btn-primary auth-modal__submit" disabled={busy}>
              {busy ? t.busy : t.sendOtp}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form className="auth-modal__form" onSubmit={handleVerifyOtp}>
            <p className="auth-modal__otp-sent">
              {t.otpHint} <strong>+91 {phoneN}</strong>
            </p>
            {devOtp && (
              <p className="auth-modal__dev-otp">
                {t.devOtp}: <strong>{devOtp}</strong>
              </p>
            )}
            <label className="auth-modal__field">
              <span>{t.otp}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={busy}
                maxLength={6}
                className="auth-modal__otp-input"
              />
            </label>
            {error && <p className="auth-modal__error">{error}</p>}
            <button type="submit" className="btn-primary auth-modal__submit" disabled={busy}>
              {busy ? t.busy : t.verifyOtp}
            </button>
            <button
              type="button"
              className="auth-modal__resend"
              disabled={busy || resendSec > 0}
              onClick={() => void handleSendOtp()}
            >
              {resendSec > 0 ? `${t.resendIn} ${resendSec}s` : t.resendOtp}
            </button>
            <button
              type="button"
              className="auth-modal__back-link"
              onClick={() => {
                setStep("phone");
                setError(null);
              }}
            >
              ← {t.phone}
            </button>
          </form>
        )}

        {step === "profile" && (
          <form className="auth-modal__form" onSubmit={handleProfile}>
            <label className="auth-modal__field">
              <span>{t.name}</span>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                maxLength={120}
              />
            </label>
            {error && <p className="auth-modal__error">{error}</p>}
            <button type="submit" className="btn-primary auth-modal__submit" disabled={busy}>
              {busy ? t.busy : t.createAccount}
            </button>
          </form>
        )}

        {step === "pin" && (
          <form className="auth-modal__form" onSubmit={handlePinLogin}>
            <label className="auth-modal__field">
              <span>{t.phone}</span>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
                maxLength={14}
              />
            </label>
            <label className="auth-modal__field">
              <span>{t.pin}</span>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={busy}
                maxLength={6}
              />
            </label>
            {error && <p className="auth-modal__error">{error}</p>}
            <button type="submit" className="btn-primary auth-modal__submit" disabled={busy}>
              {busy ? t.busy : t.loginBtn}
            </button>
            <button
              type="button"
              className="auth-modal__back-link"
              onClick={() => {
                setStep("phone");
                setError(null);
              }}
            >
              {t.backToOtp}
            </button>
          </form>
        )}

        {step === "phone" && (
          <button
            type="button"
            className="auth-modal__guest auth-modal__guest--link"
            onClick={() => {
              setStep("pin");
              setError(null);
            }}
            disabled={busy}
          >
            {t.quickPinLogin}
          </button>
        )}

        {showGuestOption && step === "phone" && (
          <button type="button" className="auth-modal__guest" onClick={onGuest} disabled={busy}>
            {t.guest}
          </button>
        )}
      </div>
    </div>
  );
}
