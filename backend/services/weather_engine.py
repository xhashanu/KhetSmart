"""Location-based weather intelligence for potato farming.

REAL API DATA ONLY — never fabricates observations or forecasts.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from services.external_api import fetch_json
from services.openweather_signal import fetch_openweather_at
from services.weather_signal import (
    HEAT_STRESS_TMAX_C,
    fetch_open_meteo_history,
)

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

# Potato-specific thresholds
HARVEST_RAIN_POP_HIGH = 60  # % — risky to harvest/transport
HARVEST_RAIN_MM_24H = 12.0
TRANSPORT_WIND_KPH_HIGH = 45.0
HEAT_STRESS_CURRENT_C = 34.0
DISEASE_HUMIDITY_HIGH = 85
DISEASE_TEMP_RANGE_LO = 15
DISEASE_TEMP_RANGE_HI = 25

_location_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL_SEC = 600  # 10 min refresh


def _cache_key(lat: float, lng: float) -> str:
    return f"{round(lat, 3)}:{round(lng, 3)}"


def _minutes_ago(iso_ts: str | None) -> int | None:
    if not iso_ts:
        return None
    try:
        dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - dt.astimezone(timezone.utc)
        return max(0, int(delta.total_seconds() // 60))
    except (ValueError, TypeError):
        return None


def _format_updated(iso_ts: str | None) -> str | None:
    mins = _minutes_ago(iso_ts)
    if mins is None:
        return None
    if mins < 1:
        return "Updated just now"
    return f"Updated {mins} min ago"


def weather_unavailable(reason: str, lat: float | None = None, lng: float | None = None) -> dict:
    """Explicit unavailable state — NO fabricated numbers."""
    return {
        "ok": False,
        "available": False,
        "message": reason,
        "source": None,
        "provider": None,
        "lat": lat,
        "lng": lng,
        "location_name": None,
        "location_accuracy": "unavailable",
        "fetched_at": None,
        "updated_label": None,
        "is_stale": False,
        "observation": None,
        "forecast": None,
        "hourly": [],
        "historical": None,
        "agricultural_risks": [],
        "alerts": [],
        "ai_interpretation_hint": None,
        "detail": reason,
    }


def compute_agricultural_risks(
    observation: dict | None,
    forecast: dict | None,
    historical: dict | None,
) -> list[dict]:
    """Derive potato-farming risk signals from verified weather data only."""
    risks: list[dict] = []

    if not observation and not forecast:
        return risks

    obs = observation or {}
    fc = forecast or {}
    hist = historical or {}

    # --- Heat stress (current + historical count) ---
    cur_temp = obs.get("temperature_c")
    if cur_temp is not None and cur_temp >= HEAT_STRESS_CURRENT_C:
        risks.append({
            "id": "heat_stress_now",
            "severity": "high" if cur_temp >= 36 else "medium",
            "title": "Heat stress",
            "detail": f"Current temperature {cur_temp}°C exceeds safe tuber bulking range.",
            "source": "OpenWeather observation",
        })

    heat_days = hist.get("heat_stress_days_30d")
    hist_period = hist.get("period_days")
    if heat_days is not None and hist_period:
        if hist_period >= 14:
            risks.append({
                "id": "heat_stress_history",
                "severity": "high" if heat_days >= 8 else "medium" if heat_days >= 4 else "low",
                "title": "Heat stress (30d)",
                "detail": f"{heat_days} days ≥{HEAT_STRESS_TMAX_C}°C in last {hist_period} days.",
                "source": "Open-Meteo historical",
            })
        else:
            risks.append({
                "id": "heat_stress_history",
                "severity": "info",
                "title": "Heat stress data",
                "detail": f"Insufficient history ({hist_period} days). Need 14+ days for reliable count.",
                "source": "Open-Meteo historical",
            })

    # --- Heavy rain / harvest risk ---
    pop_24 = fc.get("pop_max_24h_pct")
    rain_24 = fc.get("rain_mm_next_24h")
    if pop_24 is not None and pop_24 >= HARVEST_RAIN_POP_HIGH:
        risks.append({
            "id": "harvest_rain_risk",
            "severity": "high" if pop_24 >= 75 else "medium",
            "title": "Harvest / field work risk",
            "detail": f"Rain probability next 24h: {pop_24}%. Field harvest may be risky.",
            "source": "OpenWeather forecast",
        })
    elif rain_24 is not None and rain_24 >= HARVEST_RAIN_MM_24H:
        risks.append({
            "id": "harvest_rain_risk",
            "severity": "medium",
            "title": "Harvest / field work risk",
            "detail": f"Expected rainfall next 24h: {rain_24} mm. Wet soil may delay harvest.",
            "source": "OpenWeather forecast",
        })

    # --- Transport risk ---
    wind = obs.get("wind_kph")
    if wind is not None and wind >= TRANSPORT_WIND_KPH_HIGH:
        risks.append({
            "id": "transport_wind",
            "severity": "medium",
            "title": "Transport risk",
            "detail": f"Wind {wind} km/h — open truck transport of potatoes may be affected.",
            "source": "OpenWeather observation",
        })
    if pop_24 is not None and pop_24 >= 50 and rain_24 and rain_24 >= 5:
        risks.append({
            "id": "transport_rain",
            "severity": "high" if pop_24 >= 70 else "medium",
            "title": "Transport timing risk",
            "detail": "Rain expected during typical transport windows. Plan movement in dry hours.",
            "source": "OpenWeather forecast",
        })

    # --- Storage / post-harvest ---
    humidity = obs.get("humidity_pct")
    if humidity is not None and humidity >= 90 and cur_temp and cur_temp >= 28:
        risks.append({
            "id": "storage_humidity",
            "severity": "medium",
            "title": "Post-harvest humidity",
            "detail": f"High humidity ({humidity}%) with warm air — ensure ventilation before storage.",
            "source": "OpenWeather observation",
        })

    # --- Disease-favorable (never claim disease present) ---
    if (
        humidity is not None
        and humidity >= DISEASE_HUMIDITY_HIGH
        and cur_temp is not None
        and DISEASE_TEMP_RANGE_LO <= cur_temp <= DISEASE_TEMP_RANGE_HI
    ):
        risks.append({
            "id": "disease_conditions",
            "severity": "low",
            "title": "Disease-favorable conditions",
            "detail": "Warm, humid conditions may favor late blight. Monitor crop — this is not a diagnosis.",
            "source": "OpenWeather observation",
        })

    # --- Drought / waterlogging from historical ---
    if hist.get("drought_risk"):
        risks.append({
            "id": "drought",
            "severity": "medium",
            "title": "Dry soil signal",
            "detail": hist.get("drought_detail") or "Below-normal rainfall in recent weeks.",
            "source": "Open-Meteo historical",
        })
    if hist.get("waterlogging_risk"):
        risks.append({
            "id": "waterlogging",
            "severity": "medium",
            "title": "Waterlogging signal",
            "detail": hist.get("waterlogging_detail") or "Heavy recent rainfall may saturate soil.",
            "source": "Open-Meteo historical",
        })

    return risks


def fetch_farmer_weather(
    lat: float,
    lng: float,
    *,
    force_refresh: bool = False,
) -> dict[str, Any]:
    """Full weather package for farmer GPS coordinates."""
    key = _cache_key(lat, lng)
    if not force_refresh and key in _location_cache:
        cached, exp = _location_cache[key]
        if exp > time.time():
            return cached

    ow = fetch_openweather_at(lat, lng)
    if not ow or not ow.get("ok"):
        reason = (ow or {}).get("error") or "Weather data temporarily unavailable."
        if not ow:
            reason = "Set OPENWEATHER_API_KEY in backend/.env for live weather."
        payload = weather_unavailable(reason, lat, lng)
        _location_cache[key] = (payload, time.time() + 120)
        return payload

    historical = fetch_open_meteo_history(lat, lng, past_days=30)

    observation = {
        "temperature_c": ow.get("current_temp_c"),
        "feels_like_c": ow.get("feels_like_c"),
        "humidity_pct": ow.get("humidity_pct"),
        "wind_kph": ow.get("wind_kph"),
        "wind_speed_ms": ow.get("wind_speed_ms"),
        "pressure_hpa": ow.get("pressure_hpa"),
        "visibility_m": ow.get("visibility_m"),
        "cloud_pct": ow.get("cloud_pct"),
        "rain_mm_h": ow.get("rain_mm_h", 0),
        "condition_main": ow.get("weather_main"),
        "condition": ow.get("weather_description"),
        "icon": ow.get("weather_icon"),
        "icon_url": ow.get("weather_icon_url"),
        "observed_at": ow.get("observation_time") or ow.get("fetched_at"),
    }

    forecast = {
        "pop_max_24h_pct": ow.get("pop_max_24h_pct"),
        "pop_max_48h_pct": ow.get("pop_max_48h_pct"),
        "rain_mm_next_24h": ow.get("precip_mm_next_24h"),
        "rain_mm_next_48h": ow.get("precip_mm_next_48h"),
        "daily": ow.get("forecast_days") or [],
        "forecast_period": ow.get("forecast_period"),
        "uncertainty": ow.get("forecast_uncertainty"),
    }

    hourly = ow.get("hourly") or []

    fetched_at = ow.get("fetched_at") or datetime.now(timezone.utc).isoformat()
    risks = compute_agricultural_risks(observation, forecast, historical)

    # Yield adjustments only from real historical when available
    glut_adjust = 0
    yield_factor = 1.0
    if historical and historical.get("ok"):
        glut_adjust = int(historical.get("glut_adjust") or 0)
        yield_factor = float(historical.get("yield_factor") or 1.0)

    payload: dict[str, Any] = {
        "ok": True,
        "available": True,
        "message": "OK",
        "source": "OpenWeatherMap",
        "provider": "OpenWeatherMap + Open-Meteo",
        "lat": round(lat, 5),
        "lng": round(lng, 5),
        "location_name": ow.get("location_name"),
        "location_accuracy": "gps",
        "fetched_at": fetched_at,
        "updated_label": _format_updated(fetched_at),
        "is_stale": (_minutes_ago(fetched_at) or 0) > 30,
        "is_live_openweather": True,
        "observation": observation,
        "forecast": forecast,
        "hourly": hourly,
        "historical": historical if historical and historical.get("ok") else None,
        "agricultural_risks": risks,
        "alerts": ow.get("alerts") or [],
        "glut_adjust": glut_adjust,
        "yield_factor": yield_factor,
        # Legacy flat fields for yield_model / AI prompt compatibility
        "current_temp_c": observation.get("temperature_c"),
        "feels_like_c": observation.get("feels_like_c"),
        "humidity_pct": observation.get("humidity_pct"),
        "wind_kph": observation.get("wind_kph"),
        "weather_main": observation.get("condition_main"),
        "weather_description": observation.get("condition"),
        "weather_icon": observation.get("icon"),
        "weather_icon_url": observation.get("icon_url"),
        "forecast_days": forecast.get("daily"),
        "precip_mm_next_24h": forecast.get("rain_mm_next_24h"),
        "pop_max_48h_pct": forecast.get("pop_max_48h_pct"),
        "heat_stress_days_30d": (historical or {}).get("heat_stress_days_30d"),
        "precip_mm_14d": (historical or {}).get("precip_mm_14d"),
        "precip_mm_7d": (historical or {}).get("precip_mm_7d"),
        "temp_max_c_30d": (historical or {}).get("temp_max_c_30d"),
        "temp_min_c_30d": (historical or {}).get("temp_min_c_30d"),
        "stresses": [r["detail"] for r in risks[:4]],
        "detail": "; ".join(r["detail"] for r in risks[:2]) if risks else "Weather within normal range for potato.",
    }

    _location_cache[key] = (payload, time.time() + _CACHE_TTL_SEC)
    return payload


def weather_summary_for_consult(weather: dict) -> dict | None:
    """Compact weather context for farmer consult / voice."""
    if not weather.get("available"):
        return {"available": False, "message": weather.get("message")}
    obs = weather.get("observation") or {}
    fc = weather.get("forecast") or {}
    risks = weather.get("agricultural_risks") or []
    high = [r for r in risks if r.get("severity") in ("high", "medium")]
    return {
        "available": True,
        "temperature_c": obs.get("temperature_c"),
        "humidity_pct": obs.get("humidity_pct"),
        "rain_prob_24h_pct": fc.get("pop_max_24h_pct"),
        "rain_mm_24h": fc.get("rain_mm_next_24h"),
        "harvest_risk": any(r["id"] == "harvest_rain_risk" for r in risks),
        "transport_risk": any(r["id"].startswith("transport") for r in risks),
        "top_risk": high[0]["title"] if high else None,
        "top_risk_detail": high[0]["detail"] if high else None,
        "updated_label": weather.get("updated_label"),
    }
