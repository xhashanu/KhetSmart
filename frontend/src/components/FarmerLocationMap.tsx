import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { FarmerCoords } from "../hooks/useFarmerLocation";

type Props = {
  coords: FarmerCoords;
  /** Compact inline map (expandable strip) */
  compact?: boolean;
};

export function FarmerLocationMap({ coords, compact = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [coords.lat, coords.lng],
      zoom: compact ? 14 : 13,
      zoomControl: false,
      attributionControl: !compact,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    markerRef.current = L.circleMarker([coords.lat, coords.lng], {
      radius: 10,
      color: "#1b5e3b",
      fillColor: "#4caf50",
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [compact]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const { lat, lng } = coords;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], mapRef.current.getZoom(), { animate: true });
    mapRef.current.invalidateSize();
  }, [coords.lat, coords.lng, coords.updatedAt]);

  return (
    <div className={`farmer-location-map ${compact ? "farmer-location-map--compact" : ""}`}>
      {!compact && <p className="farmer-location-map__label">You are here</p>}
      <div ref={containerRef} className="farmer-location-map__canvas" />
    </div>
  );
}
