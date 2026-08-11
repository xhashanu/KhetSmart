"""Soil baseline for Damodar corridor — SoilGrids API with alluvial fallback."""
from __future__ import annotations

import logging
import time

from services.external_api import fetch_json

logger = logging.getLogger(__name__)

CORRIDOR_LAT = 24.05
CORRIDOR_LON = 87.70

SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"

# WB Damodar alluvial potato belt (literature / district soil surveys)
CORRIDOR_SOIL_FALLBACK = {
    "ok": True,
    "sand_pct": 42.0,
    "silt_pct": 38.0,
    "clay_pct": 20.0,
    "texture_class": "sandy loam",
    "ph": 6.3,
    "organic_carbon_pct": 0.85,
    "drainage": "well_drained",
    "potato_suitability": "good",
    "yield_factor": 1.0,
    "detail": "Alluvial sandy loam — well-drained, suitable for potato tuber expansion.",
    "source": "WB Damodar corridor baseline",
    "message": "baseline",
}

_cache: tuple[dict, float] | None = None
_CACHE_TTL_SEC = 86400 * 7  # 7 days


def fetch_corridor_soil() -> dict:
    global _cache
    if _cache and _cache[1] > time.time():
        return _cache[0]

    try:
        result = _fetch_soilgrids()
        if result.get("ok"):
            _cache = (result, time.time() + _CACHE_TTL_SEC)
            return result
    except Exception as exc:
        logger.warning("SoilGrids request error: %s", exc)

    fb = dict(CORRIDOR_SOIL_FALLBACK)
    fb["message"] = "SoilGrids unavailable — corridor baseline"
    _cache = (fb, time.time() + _CACHE_TTL_SEC)
    return fb


def _fetch_soilgrids() -> dict:
    params = {
        "lon": CORRIDOR_LON,
        "lat": CORRIDOR_LAT,
        "property": ["clay", "sand", "silt", "phh2o", "soc"],
        "depth": "0-30cm",
        "value": "mean",
    }
    status, payload, err = fetch_json(
        "soilgrids",
        "GET",
        SOILGRIDS_URL,
        params=params,
        timeout=25.0,
        max_attempts=3,
    )
    if status != 200 or payload is None:
        return {"ok": False, "message": f"SoilGrids unavailable — {err}"}

    props = payload.get("properties") or {}
    clay = _extract_pct(props, "clay")
    sand = _extract_pct(props, "sand")
    silt = _extract_pct(props, "silt")
    ph = _extract_ph(props, "phh2o")
    oc = _extract_soc_pct(props, "soc")

    if clay is None or sand is None:
        return {"ok": False, "message": "SoilGrids parse failed"}

    texture = _texture_class(sand, silt, clay)
    suitability, yield_factor, detail = _potato_suitability(sand, clay, ph, oc, texture)

    return {
        "ok": True,
        "sand_pct": round(sand, 1),
        "silt_pct": round(silt or max(0, 100 - sand - clay), 1),
        "clay_pct": round(clay, 1),
        "texture_class": texture,
        "ph": round(ph, 2) if ph else 6.5,
        "organic_carbon_pct": round(oc, 2) if oc else 0.8,
        "drainage": "well_drained" if sand >= 35 and clay <= 28 else "moderate",
        "potato_suitability": suitability,
        "yield_factor": yield_factor,
        "detail": detail,
        "source": "ISRIC SoilGrids 0–30 cm",
        "message": "OK",
    }


def _extract_pct(props: dict, name: str) -> float | None:
    layer = props.get(name, {}).get("layers") or []
    for item in layer:
        depths = item.get("depths") or []
        for d in depths:
            vals = d.get("values") or {}
            mean = vals.get("mean")
            if mean is not None:
                # SoilGrids clay/sand/silt in g/kg → divide by 10 for %
                return float(mean) / 10.0
    return None


def _extract_ph(props: dict, name: str) -> float | None:
    layer = props.get(name, {}).get("layers") or []
    for item in layer:
        for d in item.get("depths") or []:
            mean = (d.get("values") or {}).get("mean")
            if mean is not None:
                return float(mean) / 10.0
    return None


def _extract_soc_pct(props: dict, name: str) -> float | None:
    layer = props.get(name, {}).get("layers") or []
    for item in layer:
        for d in item.get("depths") or []:
            mean = (d.get("values") or {}).get("mean")
            if mean is not None:
                # SOC g/kg → rough % organic matter proxy
                return float(mean) / 10.0
    return None


def _texture_class(sand: float, silt: float, clay: float) -> str:
    if clay >= 35:
        return "clay loam"
    if sand >= 50:
        return "sandy loam"
    if silt >= 40:
        return "silt loam"
    return "loam"


def _potato_suitability(
    sand: float, clay: float, ph: float | None, oc: float | None, texture: str
) -> tuple[str, float, str]:
    score = 1.0
    notes = []

    if 5.5 <= (ph or 6.5) <= 6.8:
        score += 0.04
        notes.append("pH in optimal potato range")
    elif (ph or 6.5) < 5.2 or (ph or 6.5) > 7.5:
        score -= 0.08
        notes.append("pH suboptimal for potato")

    if clay > 32:
        score -= 0.10
        notes.append("Higher clay — tuber expansion risk")
    elif sand >= 35 and clay <= 25:
        score += 0.05
        notes.append("Loose, well-drained texture")

    if (oc or 0.8) >= 0.6:
        notes.append("Adequate organic carbon")

    if score >= 1.05:
        return "excellent", min(1.1, score), f"{texture}: " + "; ".join(notes)
    if score >= 0.95:
        return "good", 1.0, f"{texture}: " + "; ".join(notes)
    if score >= 0.88:
        return "moderate", 0.94, f"{texture}: " + "; ".join(notes)
    return "fair", 0.88, f"{texture}: " + "; ".join(notes)
