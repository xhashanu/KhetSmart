import type { AppLanguage } from "../hooks/useAppSettings";

export function formatGpsCoords(lat: number, lng: number) {
  const latAbs = Math.abs(lat).toFixed(5);
  const lngAbs = Math.abs(lng).toFixed(5);
  const latH = lat >= 0 ? "N" : "S";
  const lngH = lng >= 0 ? "E" : "W";
  return `${latAbs}° ${latH}, ${lngAbs}° ${lngH}`;
}

export function formatGpsTime(ts: number, language: AppLanguage) {
  const locale = language === "bn" ? "bn-IN" : language === "hi" ? "hi-IN" : "en-IN";
  return new Date(ts).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAccuracyMeters(m: number) {
  return `±${Math.round(m)} m`;
}
