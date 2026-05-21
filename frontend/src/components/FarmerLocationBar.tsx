import type { FarmerCoords, LocationStatus } from "../hooks/useFarmerLocation";

type Props = {
  status: LocationStatus;
  coords: FarmerCoords | null;
  error: string | null;
  onEnable: () => void;
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function FarmerLocationBar({ status, coords, error, onEnable }: Props) {
  if (status === "active" && coords) {
    return (
      <div className="farmer-location farmer-location--live">
        <span className="farmer-location__pulse" aria-hidden />
        <div className="farmer-location__body">
          <strong>Your live location</strong>
          <span className="farmer-location__coords">
            {coords.lat.toFixed(5)}°N, {coords.lng.toFixed(5)}°E
          </span>
          <span className="farmer-location__meta">
            ±{Math.round(coords.accuracy)} m · updated {formatTime(coords.updatedAt)}
          </span>
        </div>
      </div>
    );
  }

  if (status === "requesting") {
    return (
      <div className="farmer-location farmer-location--pending">
        <span className="spinner farmer-location__spinner" />
        <span>Finding your GPS…</span>
      </div>
    );
  }

  return (
    <div className="farmer-location farmer-location--off">
      <p>
        {error ??
          "Location off — routes use default corridor point until you allow GPS."}
      </p>
      <button type="button" className="btn-secondary farmer-location__enable" onClick={onEnable}>
        Enable live location
      </button>
    </div>
  );
}
