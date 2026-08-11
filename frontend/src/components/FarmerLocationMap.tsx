import { useEffect, useRef } from "react";
import type { FarmerCoords } from "../hooks/useFarmerLocation";

type Props = {
  coords: FarmerCoords;
  /** Compact inline map (expandable strip) */
  compact?: boolean;
};

export function FarmerLocationMap({ coords, compact = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || !window.google) return;

    const map = new window.google.maps.Map(containerRef.current, {
      center: { lat: coords.lat, lng: coords.lng },
      zoom: compact ? 14 : 13,
      disableDefaultUI: true,
      zoomControl: false,
      styles: [
        {
          featureType: "all",
          elementType: "geometry",
          stylers: [{ color: "#f5f5f5" }],
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#c9c9c9" }],
        },
        {
          featureType: "water",
          elementType: "labels.text.fill",
          stylers: [{ color: "#9e9e9e" }],
        },
      ],
    });

    const marker = new window.google.maps.Marker({
      position: { lat: coords.lat, lng: coords.lng },
      map,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: "#4caf50",
        fillOpacity: 0.9,
        scale: 10,
        strokeColor: "#1b5e3b",
        strokeWeight: 2,
      },
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      if (markerRef.current) {
        markerRef.current.setMap(null);
      }
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [compact]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !window.google) return;
    const { lat, lng } = coords;
    const pos = { lat, lng };
    markerRef.current.setPosition(pos);
    mapRef.current.panTo(pos);
  }, [coords.lat, coords.lng, coords.updatedAt]);

  return (
    <div className={`farmer-location-map ${compact ? "farmer-location-map--compact" : ""}`}>
      {!compact && <p className="farmer-location-map__label">You are here</p>}
      <div ref={containerRef} className="farmer-location-map__canvas" style={{ height: "100%", width: "100%", minHeight: "150px" }} />
    </div>
  );
}
