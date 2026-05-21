import { useState } from "react";
import type { FarmerCoords, LocationStatus } from "../hooks/useFarmerLocation";
import { FarmerLocationMap } from "./FarmerLocationMap";

type Props = {
  status: LocationStatus;
  coords: FarmerCoords | null;
  error: string | null;
  onEnable: () => void;
};

export function FarmerHeaderLocation({ status, coords, error, onEnable }: Props) {
  const [mapOpen, setMapOpen] = useState(false);

  if (status === "requesting") {
    return (
      <div className="header-loc header-loc--pending">
        <span className="spinner header-loc__spinner" />
        <span>Getting GPS…</span>
      </div>
    );
  }

  if (status === "active" && coords) {
    return (
      <div className="header-loc-wrap">
        <div className="header-loc header-loc--live">
          <span className="header-loc__pin" aria-hidden>
            📍
          </span>
          <div className="header-loc__text">
            <span className="header-loc__title">Your farm · live GPS</span>
            <span className="header-loc__coords">
              {coords.lat.toFixed(4)}°N, {coords.lng.toFixed(4)}°E · ±
              {Math.round(coords.accuracy)} m
            </span>
          </div>
          <button
            type="button"
            className="header-loc__map-btn"
            onClick={() => setMapOpen((o) => !o)}
            aria-expanded={mapOpen}
          >
            {mapOpen ? "Hide" : "Map"}
          </button>
        </div>
        {mapOpen && (
          <div className="header-loc__map">
            <FarmerLocationMap coords={coords} compact />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="header-loc header-loc--off">
      <span className="header-loc__pin header-loc__pin--muted" aria-hidden>
        ○
      </span>
      <div className="header-loc__text">
        <span className="header-loc__title">Location off</span>
        <span className="header-loc__coords">
          {error ?? "Allow GPS for routes from your field"}
        </span>
      </div>
      <button type="button" className="header-loc__enable" onClick={onEnable}>
        Enable
      </button>
    </div>
  );
}
