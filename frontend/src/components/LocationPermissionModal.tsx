import type { AppLanguage } from "../hooks/useAppSettings";
import { tFarmer } from "../i18n/farmerSimple";

type Props = {
  open: boolean;
  status: "prompt" | "requesting" | "denied" | "unavailable";
  error: string | null;
  language: AppLanguage;
  onAllow: () => void;
  onDismiss?: () => void;
};

export function LocationPermissionModal({
  open,
  status,
  error,
  language,
  onAllow,
  onDismiss,
}: Props) {
  const t = tFarmer(language);
  if (!open) return null;

  const busy = status === "requesting";

  return (
    <div className="location-modal" role="dialog" aria-labelledby="location-modal-title">
      <div className="location-modal__backdrop" aria-hidden />
      <div className="location-modal__card">
        <span className="location-modal__pin" aria-hidden>
          📍
        </span>
        <h2 id="location-modal-title">{t.locationTitle}</h2>
        <p className="location-modal__text">{t.locationSub}</p>
        {error && <p className="location-modal__error">{error}</p>}
        <button
          type="button"
          className="btn-primary location-modal__allow"
          onClick={onAllow}
          disabled={busy}
        >
          {busy ? t.locationBusy : t.locationAllow}
        </button>
        {onDismiss && status !== "requesting" && (
          <button type="button" className="location-modal__skip" onClick={onDismiss}>
            {t.locationSkip}
          </button>
        )}
      </div>
    </div>
  );
}
