import { useState } from "react";
import type { FarmerCoords, LocationStatus } from "../hooks/useFarmerLocation";
import { FarmerLocationMap } from "./FarmerLocationMap";

type Props = {
  status: LocationStatus;
  coords: FarmerCoords | null;
  error: string | null;
  onEnable: () => void;
};

export function FarmerLocationPanel({ status, coords, error, onEnable }: Props) {
  const [mapOpen, setMapOpen] = useState(false);

  if (status === "requesting") {
    return (
      <div className="loc-strip loc-strip--pending">
        <span className="spinner loc-strip__spinner" />
        <span>Getting GPS…</span>
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
          aria-label="Toggle location map"
        >
          <span className="loc-strip__pin" aria-hidden>
            📍
          </span>
          <span className="loc-strip__text">
            <span className="loc-strip__title">Your farm · live GPS</span>
            <span className="loc-strip__sub">
              {coords.lat.toFixed(4)}°N, {coords.lng.toFixed(4)}°E · ±
              {Math.round(coords.accuracy)} m
            </span>
          </span>
          <span className="loc-strip__action">{mapOpen ? "Hide" : "Map"}</span>
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
        <span className="loc-strip__title">Location off</span>
        <span className="loc-strip__sub">
          {error ?? "Allow GPS for routes from your field"}
        </span>
      </span>
      <button type="button" className="loc-strip__link" onClick={onEnable}>
        Enable
      </button>
    </div>
  );
}
