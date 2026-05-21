import { useCallback, useEffect, useRef, useState } from "react";

export type FarmerCoords = {
  lat: number;
  lng: number;
  accuracy: number;
  updatedAt: number;
};

export type LocationStatus =
  | "prompt"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable";

const STORAGE_KEY = "khetsmart_location_granted";

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 10000,
};

export function useFarmerLocation() {
  const [status, setStatus] = useState<LocationStatus>("prompt");
  const [coords, setCoords] = useState<FarmerCoords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(true);
  const watchId = useRef<number | null>(null);

  const stopWatch = useCallback(() => {
    if (watchId.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const handleError = useCallback(
    (err: GeolocationPositionError) => {
      stopWatch();
      setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      if (err.code === err.PERMISSION_DENIED) {
        setError("Location permission denied. Enable location in browser settings.");
      } else {
        setError("Could not read GPS. Check device location is on.");
      }
    },
    [stopWatch]
  );

  const handlePosition = useCallback((pos: GeolocationPosition) => {
    setCoords({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      updatedAt: pos.timestamp,
    });
    setStatus("active");
    setError(null);
    setShowModal(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const startWatch = useCallback(() => {
    if (!navigator.geolocation || watchId.current != null) return;
    watchId.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      WATCH_OPTIONS
    );
  }, [handlePosition, handleError]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      setError("Geolocation not supported on this device.");
      return;
    }
    setStatus("requesting");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handlePosition(pos);
        startWatch();
      },
      handleError,
      GEO_OPTIONS
    );
  }, [handlePosition, handleError, startWatch]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      setShowModal(false);
      return;
    }

    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") {
        setShowModal(false);
        requestLocation();
      }
    } catch {
      /* show modal */
    }

    return () => stopWatch();
  }, [requestLocation, stopWatch]);

  const openPermissionModal = useCallback(() => {
    setShowModal(true);
  }, []);

  return {
    status,
    coords,
    error,
    showModal,
    setShowModal,
    requestLocation,
    openPermissionModal,
    hasLocation: status === "active" && coords != null,
  };
}
