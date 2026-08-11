"""ERA5-Land soil moisture (volumetric) via Open-Meteo — corridor centroid."""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

from services.external_api import fetch_json

logger = logging.getLogger(__name__)

CORRIDOR_LAT = 24.05
CORRIDOR_LON = 87.70

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Volumetric soil moisture m³/m³ — potato on sandy loam (corridor)
SURFACE_VERY_DRY = 0.12
SURFACE_DRY = 0.16
ROOT_OPTIMAL_LO = 0.20
ROOT_OPTIMAL_HI = 0.34
ROOT_SATURATED = 0.42

_cache: tuple[dict, float] | None = None
_CACHE_TTL_SEC = 3600


def fetch_era5_soil_moisture(past_days: int = 30) -> dict:
    global _cache
    if _cache and _cache[1] > time.time():
        return _cache[0]

    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=past_days)

    params = {
        "latitude": CORRIDOR_LAT,
        "longitude": CORRIDOR_LON,
        "timezone": "Asia/Kolkata",
        "hourly": "soil_moisture_0_to_7cm,soil_moisture_7_to_28cm",
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }

    fallback = _fallback_moisture()
    status, payload, err = fetch_json(
        "open_meteo",
        "GET",
        OPEN_METEO_URL,
        params=params,
        timeout=20.0,
        max_attempts=3,
    )
    if status != 200 or payload is None:
        fallback["message"] = f"Open-Meteo unavailable — {err}"
        logger.warning("ERA5 moisture fetch failed: %s", err)
        return fallback

    payload = _summarize_moisture(payload)
    payload["source"] = "ERA5-Land · Open-Meteo (hourly)"
    _cache = (payload, time.time() + _CACHE_TTL_SEC)
    return payload


def _summarize_moisture(data: dict) -> dict:
    hourly = data.get("hourly") or {}
    surf = [float(x) for x in (hourly.get("soil_moisture_0_to_7cm") or []) if x is not None]
    root = [float(x) for x in (hourly.get("soil_moisture_7_to_28cm") or []) if x is not None]

    if len(root) < 24:
        return _fallback_moisture()

    surf_now = surf[-1] if surf else root[-1]
    root_now = root[-1]
    surf_7d = sum(surf[-168:]) / min(168, len(surf)) if surf else root_now
    root_7d = sum(root[-168:]) / min(168, len(root))
    root_30d = sum(root) / len(root)

    status, detail, yield_factor, glut_adjust = _classify_moisture(
        surf_now, root_now, root_7d, root_30d
    )

    return {
        "ok": True,
        "surface_moisture_m3_m3": round(surf_now, 3),
        "rootzone_moisture_m3_m3": round(root_now, 3),
        "rootzone_moisture_7d_avg": round(root_7d, 3),
        "rootzone_moisture_30d_avg": round(root_30d, 3),
        "depth_surface_cm": "0–7",
        "depth_rootzone_cm": "7–28",
        "status": status,
        "detail": detail,
        "yield_factor": yield_factor,
        "glut_adjust": glut_adjust,
        "drought_stress": root_now < ROOT_OPTIMAL_LO and root_7d < ROOT_OPTIMAL_LO,
        "waterlogging_risk": root_now > ROOT_SATURATED or surf_now > 0.38,
        "source": "ERA5-Land",
        "message": "OK",
    }


def _classify_moisture(
    surf: float, root: float, root_7d: float, root_30d: float
) -> tuple[str, str, float, int]:
    yield_factor = 1.0
    glut_adjust = 0

    if root < SURFACE_VERY_DRY or (root < SURFACE_DRY and root_7d < SURFACE_DRY):
        return (
            "severe_dry",
            f"Root-zone moisture {root:.2f} m³/m³ — severe water stress for tuber bulking.",
            0.88,
            5,
        )

    if root < ROOT_OPTIMAL_LO:
        yield_factor = 0.93
        glut_adjust = 2
        return (
            "dry",
            f"Root-zone {root:.2f} m³/m³ below optimal ({ROOT_OPTIMAL_LO:.2f}–{ROOT_OPTIMAL_HI:.2f}) — irrigation risk.",
            yield_factor,
            glut_adjust,
        )

    if root > ROOT_SATURATED:
        return (
            "saturated",
            f"Root-zone {root:.2f} m³/m³ — waterlogging risk for potato (avoid field traffic).",
            0.90,
            0,
        )

    if ROOT_OPTIMAL_LO <= root <= ROOT_OPTIMAL_HI:
        return (
            "optimal",
            f"Root-zone {root:.2f} m³/m³ in optimal band for corridor potato.",
            1.02,
            0,
        )

    if root > ROOT_OPTIMAL_HI:
        yield_factor = 0.97
        return (
            "wet",
            f"Root-zone {root:.2f} m³/m³ — adequate water; monitor saturation if rains continue.",
            yield_factor,
            0,
        )

    return (
        "moderate",
        f"Root-zone {root:.2f} m³/m³ (30d avg {root_30d:.2f}) — acceptable moisture.",
        1.0,
        0,
    )


def _fallback_moisture() -> dict:
    return {
        "ok": False,
        "surface_moisture_m3_m3": 0.18,
        "rootzone_moisture_m3_m3": 0.24,
        "rootzone_moisture_7d_avg": 0.23,
        "rootzone_moisture_30d_avg": 0.25,
        "depth_surface_cm": "0–7",
        "depth_rootzone_cm": "7–28",
        "status": "moderate",
        "detail": "ERA5 moisture unavailable — monsoon-season corridor estimate.",
        "yield_factor": 1.0,
        "glut_adjust": 0,
        "drought_stress": False,
        "waterlogging_risk": False,
        "source": "WB corridor baseline",
        "message": "fallback",
    }
