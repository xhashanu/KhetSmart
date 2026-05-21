import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { ColdStorage } from "../api";

type Pin = ColdStorage & { hot: boolean; active: boolean; selected: boolean };

function pinStyle(p: Pin) {
  if (p.active || p.selected) {
    return { fillColor: "#e8b923", color: "#1a3d2e", radius: 10 };
  }
  if (p.hot) {
    return { fillColor: "#c62828", color: "#7f1d1d", radius: 8 };
  }
  return { fillColor: "#3d8f5f", color: "#1a3d2e", radius: 6 };
}

type Props = {
  pins: Pin[];
  onSelect: (s: ColdStorage) => void;
  /** Route / selected pins rendered outside cluster for visibility */
  prominentIds: Set<string>;
};

export function StorageMapClusters({ pins, onSelect, prominentIds }: Props) {
  const map = useMap();

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 42,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });

    for (const p of pins) {
      if (prominentIds.has(p.id) || p.lat == null || p.lng == null) continue;
      const style = pinStyle(p);
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: style.radius,
        fillColor: style.fillColor,
        color: style.color,
        weight: 2,
        fillOpacity: 0.92,
      });
      marker.bindPopup(
        `<strong>${p.name}</strong><br/>${p.district}<br/>${p.utilization_pct}% full · ${p.available_quintals.toLocaleString("en-IN")} q free`
      );
      marker.on("click", () => onSelect(p));
      cluster.addLayer(marker);
    }

    map.addLayer(cluster);

    return () => {
      map.removeLayer(cluster);
    };
  }, [pins, map, onSelect, prominentIds]);

  return null;
}
