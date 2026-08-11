import { useEffect, useState } from "react";
import type { FarmerCoords } from "./useFarmerLocation";
import type { AppLanguage } from "./useAppSettings";
import { formatAccuracyMeters, formatGpsCoords } from "../utils/locationFormat";
import { tFarmer } from "../i18n/farmerSimple";

type PlaceLabel = {
  title: string;
  subtitle: string;
  loading: boolean;
};

/** Nearest WB potato-corridor district when Geocoder is unavailable. */
const WB_DISTRICTS: { name: string; lat: number; lng: number }[] = [
  { name: "Kolkata", lat: 22.5726, lng: 88.3639 },
  { name: "North 24 Parganas", lat: 22.6167, lng: 88.45 },
  { name: "South 24 Parganas", lat: 22.45, lng: 88.38 },
  { name: "Hooghly", lat: 22.9, lng: 88.39 },
  { name: "Nadia", lat: 23.4, lng: 88.5 },
  { name: "Murshidabad", lat: 24.18, lng: 88.27 },
  { name: "Bardhaman", lat: 23.24, lng: 87.86 },
  { name: "Purba Bardhaman", lat: 23.23, lng: 88.14 },
  { name: "Malda", lat: 25.01, lng: 88.14 },
];

function nearestDistrict(lat: number, lng: number) {
  let best = WB_DISTRICTS[0];
  let bestD = Infinity;
  for (const d of WB_DISTRICTS) {
    const dist = (d.lat - lat) ** 2 + (d.lng - lng) ** 2;
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best.name;
}

function pickComponent(
  components: google.maps.GeocoderAddressComponent[],
  ...types: string[]
) {
  for (const type of types) {
    const hit = components.find((c) => c.types.includes(type));
    if (hit?.long_name) return hit.long_name;
  }
  return null;
}

function parseGeocode(
  result: google.maps.GeocoderResult,
  coords: FarmerCoords,
  language: AppLanguage
): { title: string; subtitle: string } {
  const t = tFarmer(language);
  const comp = result.address_components ?? [];

  const neighborhood = pickComponent(comp, "neighborhood", "sublocality_level_2");
  const sublocality = pickComponent(comp, "sublocality", "sublocality_level_1");
  const locality = pickComponent(comp, "locality", "administrative_area_level_3");
  const district = pickComponent(comp, "administrative_area_level_2");
  const route = pickComponent(comp, "route");

  const title =
    sublocality || locality || neighborhood || district || t.yourFarm;

  const subParts = [route, neighborhood, district].filter(
    (p, i, arr) => p && arr.indexOf(p) === i && p !== title
  );
  const subtitle =
    subParts.length > 0
      ? `${subParts.join(", ")} · ${formatAccuracyMeters(coords.accuracy)}`
      : `${formatGpsCoords(coords.lat, coords.lng)} · ${formatAccuracyMeters(coords.accuracy)}`;

  return { title, subtitle };
}

function fallbackLabel(coords: FarmerCoords, language: AppLanguage): PlaceLabel {
  const t = tFarmer(language);
  const district = nearestDistrict(coords.lat, coords.lng);
  return {
    title: `${t.nearFarm} ${district}`,
    subtitle: `${formatGpsCoords(coords.lat, coords.lng)} · ${formatAccuracyMeters(coords.accuracy)}`,
    loading: false,
  };
}

export function usePlaceLabel(
  coords: FarmerCoords | null,
  active: boolean,
  language: AppLanguage
): PlaceLabel {
  const t = tFarmer(language);
  const [label, setLabel] = useState<PlaceLabel>({
    title: t.yourFarm,
    subtitle: "",
    loading: true,
  });

  useEffect(() => {
    if (!active || !coords) {
      setLabel({ title: t.yourFarm, subtitle: "", loading: false });
      return;
    }

    let cancelled = false;
    setLabel((prev) => ({ ...prev, loading: true }));

    const applyFallback = () => {
      if (!cancelled) setLabel(fallbackLabel(coords, language));
    };

    if (!window.google?.maps?.Geocoder) {
      applyFallback();
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { location: { lat: coords.lat, lng: coords.lng } },
      (results, status) => {
        if (cancelled) return;
        if (status === "OK" && results?.[0]) {
          const parsed = parseGeocode(results[0], coords, language);
          setLabel({ ...parsed, loading: false });
        } else {
          applyFallback();
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [active, coords?.lat, coords?.lng, coords?.accuracy, language]);

  return label;
}
