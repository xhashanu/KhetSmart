type Props = {
  open: boolean;
  status: "prompt" | "requesting" | "denied" | "unavailable";
  error: string | null;
  onAllow: () => void;
  onDismiss?: () => void;
};

export function LocationPermissionModal({
  open,
  status,
  error,
  onAllow,
  onDismiss,
}: Props) {
  if (!open) return null;

  const busy = status === "requesting";

  return (
    <div className="location-modal" role="dialog" aria-labelledby="location-modal-title">
      <div className="location-modal__backdrop" aria-hidden />
      <div className="location-modal__card">
        <span className="location-modal__pin" aria-hidden>
          📍
        </span>
        <h2 id="location-modal-title">Allow your farm location</h2>
        <p className="location-modal__bn">আপনার খামারের লোকেশন অনুমতি দিন</p>
        <p className="location-modal__text">
          KhetSmart needs your live GPS to show where you are on the map and route
          harvest to the nearest cold storage from <strong>your field</strong>, not a
          generic point.
        </p>
        {error && <p className="location-modal__error">{error}</p>}
        <button
          type="button"
          className="btn-primary location-modal__allow"
          onClick={onAllow}
          disabled={busy}
        >
          {busy ? "Getting location…" : "Allow location"}
        </button>
        {onDismiss && status !== "requesting" && (
          <button type="button" className="location-modal__skip" onClick={onDismiss}>
            Not now (use corridor default)
          </button>
        )}
      </div>
    </div>
  );
}
