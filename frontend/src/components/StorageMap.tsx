import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ColdStorage } from "../api";
import { StorageMapClusters } from "./StorageMapClusters";

export type RoutePath = {
  origin: [number, number];
  storage: [number, number];
  market: [number, number];
  storageName: string;
  marketName: string;
  storageId?: string;
};

type FilterMode = "all" | "critical" | "space" | "route";

const CORRIDOR_CENTER: LatLngExpression = [23.55, 87.75];
const DEFAULT_ZOOM = 8;

const POTATO_BELT: LatLngExpression[] = [
  [22.82, 86.88],
  [25.05, 86.92],
  [25.15, 88.55],
  [22.78, 88.48],
];

const DAMODAR_RIVER: LatLngExpression[] = [
  [23.72, 86.92],
  [23.58, 87.15],
  [23.42, 87.42],
  [23.28, 87.68],
  [23.12, 87.95],
  [22.98, 88.18],
];

const CITY_MARKERS: { name: string; pos: LatLngExpression }[] = [
  { name: "Kolkata", pos: [22.5726, 88.3639] },
  { name: "Bardhaman", pos: [23.2324, 87.8615] },
  { name: "Malda", pos: [25.0108, 88.1402] },
  { name: "Asansol", pos: [23.6739, 86.9524] },
];

function pinColor(util: number, active: boolean) {
  if (active) return { fill: "#e8b923", stroke: "#1a3d2e" };
  if (util >= 85) return { fill: "#c62828", stroke: "#7f1d1d" };
  return { fill: "#3d8f5f", stroke: "#1a3d2e" };
}

function MapFlyTo({ target, bounds }: { target: LatLngExpression | null; bounds?: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.flyToBounds(bounds, { padding: [40, 40], duration: 0.6 });
    } else if (target) {
      map.flyTo(target, 11, { duration: 0.5 });
    }
  }, [target, bounds, map]);
  return null;
}

function MapResizeOnExpand({ expanded }: { expanded: boolean }) {
  const map = useMap();
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 320);
    return () => window.clearTimeout(t);
  }, [expanded, map]);
  return null;
}

type Props = {
  storages: ColdStorage[];
  totalCount?: number;
  highlight?: string;
  routePath?: RoutePath | null;
  selectedId?: string | null;
  onSelect?: (storage: ColdStorage) => void;
};

export function StorageMap({
  storages,
  totalCount = 496,
  highlight,
  routePath,
  selectedId: selectedIdProp,
  onSelect,
}: Props) {
  const [selectedIdLocal, setSelectedIdLocal] = useState<string | null>(null);
  const selectedId = selectedIdProp ?? selectedIdLocal;
  const [mapExpanded, setMapExpanded] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [district, setDistrict] = useState("");
  const mapBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapExpanded) return;
    function onPointerDown(e: PointerEvent) {
      if (mapBoxRef.current && !mapBoxRef.current.contains(e.target as Node)) {
        setMapExpanded(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mapExpanded]);

  useEffect(() => {
    if (routePath?.storageId) {
      setSelectedIdLocal(routePath.storageId);
    }
  }, [routePath?.storageId]);

  const allPins = useMemo(() => {
    return storages
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => {
        const hot = s.utilization_pct >= 85;
        const active = highlight === s.name || routePath?.storageName === s.name;
        const selected = selectedId === s.id;
        return { ...s, hot, active, selected };
      });
  }, [storages, highlight, routePath, selectedId]);

  const districts = useMemo(() => {
    const set = new Set(allPins.map((p) => p.district));
    return Array.from(set).sort();
  }, [allPins]);

  const filteredPins = useMemo(() => {
    return allPins.filter((p) => {
      if (district && p.district !== district) return false;
      if (filter === "critical") return p.hot;
      if (filter === "space") return p.utilization_pct < 85 && p.available_quintals >= 5000;
      if (filter === "route") {
        if (routePath?.storageId) return p.id === routePath.storageId;
        if (highlight) return p.name === highlight;
        return p.active;
      }
      return true;
    });
  }, [allPins, district, filter, routePath, highlight]);

  const prominentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of filteredPins) {
      if (p.active || p.selected) ids.add(p.id);
    }
    return ids;
  }, [filteredPins]);

  const routeBounds = useMemo((): L.LatLngBoundsExpression | undefined => {
    if (!routePath) return undefined;
    const lats = [routePath.origin[0], routePath.storage[0], routePath.market[0]];
    const lngs = [routePath.origin[1], routePath.storage[1], routePath.market[1]];
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
  }, [routePath]);

  const flyTarget = useMemo((): LatLngExpression | null => {
    const p =
      filteredPins.find((x) => x.id === selectedId) ??
      filteredPins.find((x) => x.active);
    return p ? [p.lat!, p.lng!] : null;
  }, [filteredPins, selectedId]);

  const avgUtil =
    filteredPins.length > 0
      ? Math.round(
          filteredPins.reduce((a, s) => a + s.utilization_pct, 0) / filteredPins.length
        )
      : 0;

  function handleSelect(s: ColdStorage) {
    setSelectedIdLocal(s.id);
    onSelect?.(s);
  }

  const routeLine: LatLngExpression[] | null = routePath
    ? [routePath.origin, routePath.storage, routePath.market]
    : null;

  return (
    <div className="storage-map">
      <div className="storage-map__header">
        <div>
          <h4 className="storage-map__heading">Potato corridor · West Bengal</h4>
          <p className="storage-map__sub">
            {filteredPins.length} shown · {totalCount} total · sample on map
            {!mapExpanded && (
              <span className="storage-map__expand-hint"> · Tap map to expand</span>
            )}
          </p>
        </div>
        <div className="storage-map__stats">
          <span>
            <strong>{avgUtil}%</strong> avg fill
          </span>
          <span>
            <strong>{filteredPins.filter((s) => s.hot).length}</strong> critical
          </span>
        </div>
      </div>

      <div className="storage-map__filters">
        {(
          [
            ["all", "All"],
            ["critical", "Critical"],
            ["space", "Has space"],
            ["route", "Route"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`storage-map__filter ${filter === id ? "storage-map__filter--on" : ""}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
        <select
          className="storage-map__district"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          aria-label="Filter by district"
        >
          <option value="">All districts</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div
        ref={mapBoxRef}
        className={`storage-map__canvas storage-map__canvas--leaflet ${mapExpanded ? "storage-map__canvas--expanded" : ""}`}
        role="button"
        tabIndex={0}
        aria-expanded={mapExpanded}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest(".leaflet-marker-pane, .leaflet-popup")) return;
          setMapExpanded(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setMapExpanded(true);
          if (e.key === "Escape") setMapExpanded(false);
        }}
      >
        {mapExpanded && (
          <span className="storage-map__expand-badge">Tap outside to minimise</span>
        )}
        <MapContainer
          center={CORRIDOR_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={true}
          className="storage-map__leaflet"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Polygon
            positions={POTATO_BELT}
            pathOptions={{
              color: "#c9a227",
              weight: 2,
              fillColor: "#e8b923",
              fillOpacity: 0.1,
              dashArray: "6 4",
            }}
          />

          <Polyline
            positions={DAMODAR_RIVER}
            pathOptions={{ color: "#4a90c4", weight: 4, opacity: 0.7 }}
          />

          {routeLine && (
            <>
              <Polyline
                positions={routeLine}
                pathOptions={{
                  color: "#e8b923",
                  weight: 5,
                  opacity: 0.9,
                  dashArray: "8 6",
                }}
              />
              <CircleMarker
                center={routePath!.origin}
                radius={8}
                pathOptions={{ fillColor: "#81c784", color: "#1a3d2e", weight: 2, fillOpacity: 1 }}
              >
                <Popup>Your farm</Popup>
              </CircleMarker>
              <CircleMarker
                center={routePath!.storage}
                radius={11}
                pathOptions={{ fillColor: "#e8b923", color: "#1a3d2e", weight: 3, fillOpacity: 1 }}
              >
                <Popup>
                  <strong>{routePath!.storageName}</strong>
                  <br />
                  Cold storage (route)
                </Popup>
              </CircleMarker>
              <CircleMarker
                center={routePath!.market}
                radius={8}
                pathOptions={{ fillColor: "#5c6bc0", color: "#1a3d2e", weight: 2, fillOpacity: 1 }}
              >
                <Popup>
                  <strong>{routePath!.marketName}</strong>
                  <br />
                  Mandi
                </Popup>
              </CircleMarker>
            </>
          )}

          {CITY_MARKERS.map((c) => (
            <CircleMarker
              key={c.name}
              center={c.pos}
              radius={4}
              pathOptions={{
                fillColor: "#1a3d2e",
                color: "#fff",
                weight: 2,
                fillOpacity: 0.9,
              }}
            >
              <Popup>{c.name}</Popup>
            </CircleMarker>
          ))}

          <StorageMapClusters
            pins={filteredPins}
            onSelect={handleSelect}
            prominentIds={prominentIds}
          />

          {filteredPins
            .filter((p) => prominentIds.has(p.id))
            .map((p) => {
              const c = pinColor(p.utilization_pct, true);
              return (
                <CircleMarker
                  key={`prominent-${p.id}`}
                  center={[p.lat!, p.lng!]}
                  radius={11}
                  pathOptions={{
                    fillColor: c.fill,
                    color: c.stroke,
                    weight: 3,
                    fillOpacity: 1,
                  }}
                  eventHandlers={{ click: () => handleSelect(p) }}
                >
                  <Popup>
                    <strong>{p.name}</strong>
                    <div>{p.district}</div>
                    {p.active && (
                      <div className="storage-map__popup-route">Recommended route</div>
                    )}
                  </Popup>
                </CircleMarker>
              );
            })}

          <MapFlyTo target={routeBounds ? null : flyTarget} bounds={routeBounds} />
          <MapResizeOnExpand expanded={mapExpanded} />
        </MapContainer>
      </div>

      <div className="storage-map__legend">
        <span>
          <i className="storage-map__dot storage-map__dot--ok" /> &lt;85%
        </span>
        <span>
          <i className="storage-map__dot storage-map__dot--hot" /> Critical
        </span>
        <span>
          <i className="storage-map__dot storage-map__dot--active" /> Route
        </span>
        {routeLine && (
          <span className="storage-map__legend-route">— Farm → storage → mandi</span>
        )}
      </div>
    </div>
  );
}
