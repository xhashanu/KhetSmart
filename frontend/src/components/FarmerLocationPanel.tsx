import { useState } from "react";
import type { FarmerCoords, LocationStatus } from "../hooks/useFarmerLocation";
import type { AppLanguage } from "../hooks/useAppSettings";
import { tFarmer } from "../i18n/farmerSimple";
import { formatAccuracyMeters, formatGpsCoords, formatGpsTime } from "../utils/locationFormat";
import { FarmerLocationMap } from "./FarmerLocationMap";

type Props = {
  status: LocationStatus;
  coords: FarmerCoords | null;
  error: string | null;
  onEnable: () => void;
  language?: AppLanguage;
};

export function FarmerLocationPanel({
  status,
  coords,
  error,
  onEnable,
  language = "bn",
}: Props) {
  const [mapOpen, setMapOpen] = useState(false);
  const t = tFarmer(language);

  if (status === "requesting") {
    return (
      <div className="loc-strip loc-strip--pending" role="status">
        <span className="spinner loc-strip__spinner" aria-hidden />
        <span>{t.gpsAcquiring}</span>
      </div>
    );
  }

  if (status === "active" && coords) {
    return (
      <div className="loc-strip-wrap">
        <button
          type="button"
          className="loc-strip loc-strip--live"
          onClick={() => setMapOpen((o) => !o)}
          aria-expanded={mapOpen}
          aria-label={mapOpen ? t.gpsHideMap : t.gpsShowMap}
        >
          <span className="loc-strip__pulse" aria-hidden />
          <span className="loc-strip__pin" aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18" className="loc-strip__pin-svg">
              <path
                fill="currentColor"
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
              />
            </svg>
          </span>
          <span className="loc-strip__text">
            <span className="loc-strip__title">{t.gpsFarmLive}</span>
            <span className="loc-strip__sub">
              {formatGpsCoords(coords.lat, coords.lng)} · {formatAccuracyMeters(coords.accuracy)} ·{" "}
              {formatGpsTime(coords.updatedAt, language)}
            </span>
          </span>
          <span className="loc-strip__action">{mapOpen ? t.gpsHideMap : t.gpsShowMap}</span>
        </button>
        {mapOpen && (
          <div className="loc-strip__map">
            <FarmerLocationMap coords={coords} compact />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="loc-strip loc-strip--off">
      <span className="loc-strip__pin loc-strip__pin--muted" aria-hidden>
        ○
      </span>
      <span className="loc-strip__text">
        <span className="loc-strip__title">{t.farmGpsOff}</span>
        <span className="loc-strip__sub">{error ?? t.gpsOffHint}</span>
      </span>
      <button type="button" className="loc-strip__link" onClick={onEnable}>
        {t.enableGps}
      </button>
    </div>
  );
}
