import { useEffect, useMemo, useRef, useState } from "react";
import type { ColdStorage } from "../api";

export type RoutePath = {
  origin: [number, number];
  storage: [number, number];
  market: [number, number];
  storageName: string;
  marketName: string;
  storageId?: string;
};

type FilterMode = "all" | "critical" | "space" | "route";

const WB_BOUNDS = {
  south: 21.3,
  north: 27.3,
  west: 85.5,
  east: 89.9,
};

const POTATO_BELT = [
  { lat: 27.2, lng: 88.3 }, // Darjeeling/North
  { lat: 26.6, lng: 89.8 }, // Cooch Behar/Northeast
  { lat: 25.6, lng: 88.7 }, // Dinajpur/East
  { lat: 24.5, lng: 88.3 }, // Murshidabad
  { lat: 22.4, lng: 89.0 }, // Sundarbans/Southeast
  { lat: 21.6, lng: 87.5 }, // Digha/South
  { lat: 22.1, lng: 86.7 }, // Gopiballavpur/Midnapore
  { lat: 23.3, lng: 85.8 }, // Purulia/West
  { lat: 24.3, lng: 86.9 }, // Asansol/Western border
  { lat: 25.2, lng: 87.8 }, // Malda/Northwest border
  { lat: 26.2, lng: 88.1 }, // Islampur/Chupri
];

const CITY_MARKERS = [
  { name: "Kolkata", pos: { lat: 22.5726, lng: 88.3639 } },
  { name: "Bardhaman", pos: { lat: 23.2324, lng: 87.8615 } },
  { name: "Malda", pos: { lat: 25.0108, lng: 88.1402 } },
  { name: "Asansol", pos: { lat: 23.6739, lng: 86.9524 } },
];

type Props = {
  storages: ColdStorage[];
  totalCount?: number;
  highlight?: string;
  routePath?: RoutePath | null;
  selectedId?: string | null;
  /** Increment to expand map and zoom to the active route (e.g. from Farmer logistics). */
  focusRouteKey?: number;
  onSelect?: (storage: ColdStorage) => void;
};

export function StorageMap({
  storages,
  totalCount = 496,
  highlight,
  routePath,
  selectedId: selectedIdProp,
  focusRouteKey = 0,
  onSelect,
}: Props) {
  const [selectedIdLocal, setSelectedIdLocal] = useState<string | null>(null);
  const selectedId = selectedIdProp ?? selectedIdLocal;
  const [mapExpanded, setMapExpanded] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [district, setDistrict] = useState("");

  const mapBoxRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<any[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

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

  useEffect(() => {
    if (!focusRouteKey || !routePath) return;
    setFilter("route");
    setMapExpanded(true);
    if (routePath.storageId) {
      setSelectedIdLocal(routePath.storageId);
    }
  }, [focusRouteKey, routePath]);

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
        // Keep all pins visible so the farmer can see other nearby alternative storage locations,
        // while the recommended route and target storage are highlighted prominently in gold.
        return true;
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

  const routeBounds = useMemo(() => {
    if (!routePath) return undefined;
    const lats = [routePath.origin[0], routePath.storage[0], routePath.market[0]];
    const lngs = [routePath.origin[1], routePath.storage[1], routePath.market[1]];
    return {
      south: Math.min(...lats),
      north: Math.max(...lats),
      west: Math.min(...lngs),
      east: Math.max(...lngs),
    };
  }, [routePath]);

  const flyTarget = useMemo((): { lat: number; lng: number } | null => {
    const p =
      filteredPins.find((x) => x.id === selectedId) ??
      filteredPins.find((x) => x.active);
    return p && p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null;
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

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || !window.google) return;

    const infoWindow = new window.google.maps.InfoWindow();
    infoWindowRef.current = infoWindow;

    const bounds = new window.google.maps.LatLngBounds(
      { lat: WB_BOUNDS.south, lng: WB_BOUNDS.west },
      { lat: WB_BOUNDS.north, lng: WB_BOUNDS.east }
    );

    const map = new window.google.maps.Map(mapContainerRef.current, {
      restriction: {
        latLngBounds: {
          north: 27.5,
          south: 21.3,
          west: 85.5,
          east: 90.0,
        },
        strictBounds: false,
      },
      disableDefaultUI: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
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

    map.fitBounds(bounds);
    mapRef.current = map;

    return () => {
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, []);

  // Update Overlays and View bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;

    // Clear previous overlays
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const infoWindow = infoWindowRef.current;

    // 1. Draw Potato Belt Polygon (tracing the whole of West Bengal)
    const potatoBeltPolygon = new window.google.maps.Polygon({
      paths: POTATO_BELT,
      strokeColor: "#c9a227",
      strokeOpacity: 0.7,
      strokeWeight: 2,
      fillColor: "#e8b923",
      fillOpacity: 0.08,
      map,
    });
    overlaysRef.current.push(potatoBeltPolygon);

    // 3. Draw City Markers
    CITY_MARKERS.forEach((c) => {
      const marker = new window.google.maps.Marker({
        position: c.pos,
        map,
        title: c.name,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: "#1a3d2e",
          fillOpacity: 0.9,
          scale: 4,
          strokeColor: "#ffffff",
          strokeWeight: 1.5,
        },
      });
      if (infoWindow) {
        marker.addListener("click", () => {
          infoWindow.setContent(`<div style="font-family: sans-serif; font-size: 12px; font-weight: bold; color: #1a3d2e; padding: 2px;">${c.name}</div>`);
          infoWindow.open(map, marker);
        });
      }
      overlaysRef.current.push(marker);
    });

    // 4. Draw Route Path Line and endpoints
    if (routePath) {
      const routeLinePath = [
        { lat: routePath.origin[0], lng: routePath.origin[1] },
        { lat: routePath.storage[0], lng: routePath.storage[1] },
        { lat: routePath.market[0], lng: routePath.market[1] },
      ];
      const routePolyline = new window.google.maps.Polyline({
        path: routeLinePath,
        strokeColor: "#e8b923",
        strokeOpacity: 0.95,
        strokeWeight: 5,
        map,
      });
      overlaysRef.current.push(routePolyline);

      // Farm Origin
      const farmMarker = new window.google.maps.Marker({
        position: { lat: routePath.origin[0], lng: routePath.origin[1] },
        map,
        title: "Your farm",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: "#81c784",
          fillOpacity: 1,
          scale: 8,
          strokeColor: "#1a3d2e",
          strokeWeight: 2,
        },
      });
      if (infoWindow) {
        farmMarker.addListener("click", () => {
          infoWindow.setContent(`<div style="font-family: sans-serif; font-size: 12px; font-weight: bold; padding: 2px;">Your farm</div>`);
          infoWindow.open(map, farmMarker);
        });
      }
      overlaysRef.current.push(farmMarker);

      // Mandi Destination
      const mandiMarker = new window.google.maps.Marker({
        position: { lat: routePath.market[0], lng: routePath.market[1] },
        map,
        title: routePath.marketName,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: "#5c6bc0",
          fillOpacity: 1,
          scale: 8,
          strokeColor: "#1a3d2e",
          strokeWeight: 2,
        },
      });
      if (infoWindow) {
        mandiMarker.addListener("click", () => {
          infoWindow.setContent(`<div style="font-family: sans-serif; font-size: 12px; padding: 2px;"><strong>${routePath.marketName}</strong><br/>Mandi</div>`);
          infoWindow.open(map, mandiMarker);
        });
      }
      overlaysRef.current.push(mandiMarker);
    }

    // 5. Draw Cold Storage Pins
    filteredPins.forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      const active = highlight === p.name || routePath?.storageName === p.name;
      const selected = selectedId === p.id;

      let fillColor = "#3d8f5f";
      let strokeColor = "#1a3d2e";
      let scale = 6;
      let weight = 2;

      if (active || selected) {
        fillColor = "#e8b923";
        strokeColor = "#1a3d2e";
        scale = 11;
        weight = 3;
      } else if (p.utilization_pct >= 85) {
        fillColor = "#c62828";
        strokeColor = "#7f1d1d";
        scale = 8;
        weight = 2;
      }

      const marker = new window.google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        title: p.name,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor,
          fillOpacity: 0.92,
          scale,
          strokeColor,
          strokeWeight: weight,
        },
      });

      if (infoWindow) {
        marker.addListener("click", () => {
          const activeRouteText = active ? `<div class="storage-map__popup-route" style="margin-top: 0.35rem; color: #8a6d0a; font-weight: 600; font-size: 0.75rem;">Recommended route</div>` : "";
          const popupContent = `
            <div style="font-family: 'DM Sans', sans-serif; color: #333; padding: 4px; min-width: 145px; line-height: 1.35;">
              <strong style="font-size: 13px; display: block; margin-bottom: 2px; color: #1a3d2e;">${p.name}</strong>
              <div style="font-size: 11px; color: #666; margin-bottom: 4px;">${p.district}</div>
              <div style="font-size: 12px; font-weight: bold; color: ${p.utilization_pct >= 85 ? "#c62828" : "#3d8f5f"};">
                ${p.utilization_pct}% full · ${p.available_quintals.toLocaleString("en-IN")} q free
              </div>
              ${activeRouteText}
            </div>
          `;
          infoWindow.setContent(popupContent);
          infoWindow.open(map, marker);
          handleSelect(p);
        });
      }

      overlaysRef.current.push(marker);
    });

    // 6. Fly to active bounds/target
    if (routeBounds && focusRouteKey) {
      const bounds = new window.google.maps.LatLngBounds(
        { lat: routeBounds.south, lng: routeBounds.west },
        { lat: routeBounds.north, lng: routeBounds.east }
      );
      map.fitBounds(bounds, { top: 48, bottom: 48, left: 48, right: 48 });
    } else if (flyTarget) {
      map.panTo(flyTarget);
      map.setZoom(11);
    } else {
      const wbLatLngBounds = new window.google.maps.LatLngBounds(
        { lat: WB_BOUNDS.south, lng: WB_BOUNDS.west },
        { lat: WB_BOUNDS.north, lng: WB_BOUNDS.east }
      );
      map.fitBounds(wbLatLngBounds);
    }

  }, [filteredPins, routePath, highlight, selectedId, focusRouteKey, prominentIds, routeBounds, flyTarget]);

  // Handle Resize on map expand/minimize
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = window.setTimeout(() => {
      window.google?.maps.event.trigger(map, "resize");
    }, 320);
    return () => window.clearTimeout(t);
  }, [mapExpanded]);

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
          if ((e.target as HTMLElement).closest(".gm-style, .gm-ui-hover-effect")) return;
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
        <div
          ref={mapContainerRef}
          className="storage-map__leaflet"
          style={{ width: "100%", height: "100%" }}
        />
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
        {routePath && (
          <span className="storage-map__legend-route">— Farm → storage → mandi</span>
        )}
      </div>
    </div>
  );
}
