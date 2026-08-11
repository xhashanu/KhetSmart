"""Corridor weather via Open-Meteo (no API key) — temperature, rain, solar radiation."""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

from services.external_api import fetch_json

logger = logging.getLogger(__name__)

# Damodar potato corridor centroid
CORRIDOR_LAT = 24.05
CORRIDOR_LON = 87.70

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Potato tuber bulking stress thresholds (°C, mm)
HEAT_STRESS_TMAX_C = 32.0
DROUGHT_14D_MM = 25.0
WATERLOG_7D_MM = 85.0
LOW_RADIATION_MJ = 12.0  # daily shortwave sum (MJ/m²) — rough floor

_cache: tuple[dict, float] | None = None
_CACHE_TTL_SEC = 3600


def _merge_openweather(base: dict, live: dict) -> dict:
    """Overlay OpenWeather live readings onto Open-Meteo corridor stats."""
    merged = {**base, **live}
    merged["ok"] = base.get("ok", False) or live.get("ok", False)
    merged["is_live_openweather"] = True

    tmin = live.get("temp_min_c_now") or base.get("temp_min_c_30d")
    tmax = live.get("temp_max_c_now") or base.get("temp_max_c_30d")
    if tmin is not None and tmax is not None:
        merged["temp_range"] = f"{float(tmin):.0f}°C – {float(tmax):.0f}°C"

    if live.get("precipitation_mm") is not None:
        merged["precipitation_mm"] = live["precipitation_mm"]
    elif base.get("precip_mm_14d") is not None:
        merged["precipitation_mm"] = f"{base['precip_mm_14d']} mm (14d)"

    if live.get("wet_dry_anomaly"):
        merged["wet_dry_anomaly"] = live["wet_dry_anomaly"]
    elif base.get("drought_risk"):
        merged["wet_dry_anomaly"] = "dry"
    elif base.get("waterlogging_risk"):
        merged["wet_dry_anomaly"] = "wet"
    else:
        merged["wet_dry_anomaly"] = merged.get("wet_dry_anomaly", "normal")

    merged["source"] = "OpenWeatherMap · live + Open-Meteo · 30d"
    stresses = list(base.get("stresses") or [])
    if live.get("weather_description"):
        stresses.insert(0, f"Now: {live['weather_description']} · {live.get('current_temp_c')}°C")
    merged["stresses"] = stresses
    if stresses:
        merged["detail"] = "; ".join(stresses[:3])
    return merged


def fetch_open_meteo_history(lat: float, lng: float, past_days: int = 30) -> dict:
    """Historical daily weather at coordinates — real API only."""
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=past_days)
    params = {
        "latitude": lat,
        "longitude": lng,
        "timezone": "Asia/Kolkata",
        "daily": ",".join(
            [
                "temperature_2m_max",
                "temperature_2m_min",
                "temperature_2m_mean",
                "precipitation_sum",
                "shortwave_radiation_sum",
            ]
        ),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }
    status, payload, err = fetch_json(
        "open_meteo",
        "GET",
        OPEN_METEO_URL,
        params=params,
        timeout=20.0,
        max_attempts=3,
    )
    if status != 200 or payload is None:
        logger.warning("Open-Meteo history failed for %s,%s: %s", lat, lng, err)
        return {"ok": False, "message": err or "Open-Meteo unavailable"}
    summary = _summarize_open_meteo(payload)
    if not summary.get("ok"):
        return summary
    if summary.get("drought_risk"):
        summary["drought_detail"] = (
            f"Dry signal: {summary.get('precip_mm_14d', 0)} mm rain in last 14 days."
        )
    if summary.get("waterlogging_risk"):
        summary["waterlogging_detail"] = (
            f"Heavy rain: {summary.get('precip_mm_7d', 0)} mm in last 7 days."
        )
    return summary


def fetch_corridor_weather(past_days: int = 90) -> dict:
    """Corridor default — delegates to location-based weather engine."""
    from services.weather_engine import fetch_farmer_weather

    return fetch_farmer_weather(CORRIDOR_LAT, CORRIDOR_LON)


def _summarize_open_meteo(data: dict) -> dict:
    daily = data.get("daily") or {}
    dates = daily.get("time") or []
    tmax = daily.get("temperature_2m_max") or []
    tmin = daily.get("temperature_2m_min") or []
    tmean = daily.get("temperature_2m_mean") or []
    precip = daily.get("precipitation_sum") or []
    sw = daily.get("shortwave_radiation_sum") or []

    n = min(len(dates), len(tmax), len(precip))
    if n < 7:
        return _weather_data_unavailable("Insufficient Open-Meteo history (< 7 days)")

    last30_tmax = [float(x) for x in tmax[-30:] if x is not None]
    last14_precip = sum(float(x or 0) for x in precip[-14:])
    last7_precip = sum(float(x or 0) for x in precip[-7:])
    last30_sw = [float(x or 0) for x in sw[-30:] if x is not None]

    last30_tmin = [float(x) for x in tmin[-30:] if x is not None]
    heat_days = sum(1 for t in last30_tmax if t >= HEAT_STRESS_TMAX_C)
    frost_days = sum(1 for t in last30_tmin if t <= 2.0)
    avg_tmax = sum(last30_tmax) / len(last30_tmax) if last30_tmax else 30.0
    avg_tmin = sum(float(x or 0) for x in tmin[-30:]) / max(1, len(tmin[-30:]))
    avg_tmean = sum(float(x or 0) for x in tmean[-30:]) / max(1, len(tmean[-30:]))
    # Open-Meteo daily shortwave_radiation_sum is already MJ/m²
    avg_sw_mj = (sum(last30_sw) / len(last30_sw)) if last30_sw else 18.0

    drought = last14_precip < DROUGHT_14D_MM
    waterlog = last7_precip > WATERLOG_7D_MM
    radiation_ok = avg_sw_mj >= LOW_RADIATION_MJ

    yield_factor = 1.0
    glut_adjust = 0
    stresses = []

    if heat_days >= 8:
        yield_factor -= 0.12
        glut_adjust += 4
        stresses.append(f"Heat stress: {heat_days} days ≥{HEAT_STRESS_TMAX_C}°C (30d)")
    elif heat_days >= 4:
        yield_factor -= 0.06
        stresses.append(f"Moderate heat: {heat_days} hot days (30d)")

    if drought:
        yield_factor -= 0.10
        glut_adjust += 3
        stresses.append(f"Drought signal: {last14_precip:.0f} mm rain (14d)")
    if waterlog:
        yield_factor -= 0.08
        stresses.append(f"Waterlogging risk: {last7_precip:.0f} mm (7d)")
    if not radiation_ok:
        yield_factor -= 0.05
        stresses.append("Below-average solar radiation (30d)")
    elif avg_sw_mj >= 20:
        yield_factor += 0.03

    yield_factor = max(0.78, min(1.12, round(yield_factor, 3)))

    return {
        "ok": True,
        "period_days": n,
        "temp_max_c_30d": round(avg_tmax, 1),
        "temp_min_c_30d": round(avg_tmin, 1),
        "temp_mean_c_30d": round(avg_tmean, 1),
        "precip_mm_14d": round(last14_precip, 1),
        "precip_mm_7d": round(last7_precip, 1),
        "solar_radiation_mj_m2_30d": round(avg_sw_mj, 2),
        "heat_stress_days_30d": heat_days,
        "frost_risk_days_30d": frost_days,
        "drought_risk": drought,
        "waterlogging_risk": waterlog,
        "radiation_ok": radiation_ok,
        "yield_factor": yield_factor,
        "glut_adjust": glut_adjust,
        "stresses": stresses,
        "detail": "; ".join(stresses) if stresses else "Weather within normal potato corridor band.",
        "source": "Open-Meteo",
        "message": "OK",
    }


def _weather_data_unavailable(reason: str) -> dict:
    """No fabricated weather numbers."""
    return {
        "ok": False,
        "available": False,
        "period_days": 0,
        "yield_factor": 1.0,
        "glut_adjust": 0,
        "stresses": [],
        "detail": reason,
        "source": None,
        "message": reason,
    }


def _fallback_weather() -> dict:
    """Deprecated alias — returns unavailable, never fake corridor values."""
    return _weather_data_unavailable("Weather data temporarily unavailable")
