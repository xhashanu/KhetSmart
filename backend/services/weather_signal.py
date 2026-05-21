"""Corridor weather via Open-Meteo (no API key) — temperature, rain, solar radiation."""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import httpx

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


def fetch_corridor_weather(past_days: int = 90) -> dict:
    """Daily weather summary + stress flags for yield/glut model."""
    global _cache
    if _cache and _cache[1] > time.time():
        return _cache[0]

    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=past_days)

    params = {
        "latitude": CORRIDOR_LAT,
        "longitude": CORRIDOR_LON,
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

    fallback = _fallback_weather()
    try:
        with httpx.Client(timeout=25.0) as client:
            r = client.get(OPEN_METEO_URL, params=params)
        if r.status_code != 200:
            fallback["message"] = f"Open-Meteo HTTP {r.status_code}"
            return fallback
        payload = _summarize_open_meteo(r.json())
        payload["source"] = "Open-Meteo · corridor centroid"
        _cache = (payload, time.time() + _CACHE_TTL_SEC)
        return payload
    except Exception as e:
        fallback["message"] = str(e)
        return fallback


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
        return _fallback_weather()

    last30_tmax = [float(x) for x in tmax[-30:] if x is not None]
    last14_precip = sum(float(x or 0) for x in precip[-14:])
    last7_precip = sum(float(x or 0) for x in precip[-7:])
    last30_sw = [float(x or 0) for x in sw[-30:] if x is not None]

    heat_days = sum(1 for t in last30_tmax if t >= HEAT_STRESS_TMAX_C)
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


def _fallback_weather() -> dict:
    return {
        "ok": False,
        "period_days": 0,
        "temp_max_c_30d": 34.0,
        "temp_min_c_30d": 22.0,
        "temp_mean_c_30d": 28.0,
        "precip_mm_14d": 40.0,
        "precip_mm_7d": 20.0,
        "solar_radiation_mj_m2_30d": 18.0,
        "heat_stress_days_30d": 3,
        "drought_risk": False,
        "waterlogging_risk": False,
        "radiation_ok": True,
        "yield_factor": 1.0,
        "glut_adjust": 0,
        "stresses": [],
        "detail": "Weather API unavailable — using corridor seasonal baseline.",
        "source": "WB corridor baseline",
        "message": "fallback",
    }
