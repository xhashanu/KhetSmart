"""Unified yield / glut — NDVI+SAVI+GNDVI, weather, soil, mandi, storage."""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import ColdStorage
from services.copernicus_ndvi import fetch_corridor_ndvi
from services.environment_cache import load_environment, save_environment
from services.era5_moisture import fetch_era5_soil_moisture
from services.mandi_signal import blend_glut_with_mandi, corridor_mandi_stats
from services.nitrogen_advisory import nitrogen_from_gndvi
from services.soil_signal import fetch_corridor_soil
from services.weather_signal import fetch_corridor_weather

REGION = "Damodar River Basin"
DEFAULT_LULC_ACRES = 128_400


def _resolve_weather(
    farmer_lat: float | None = None,
    farmer_lng: float | None = None,
) -> dict:
    if farmer_lat is not None and farmer_lng is not None:
        from services.weather_engine import fetch_farmer_weather

        return fetch_farmer_weather(farmer_lat, farmer_lng)
    return fetch_corridor_weather()


def storage_pressure(db: Session) -> dict:
    avg_util = float(db.query(func.avg(ColdStorage.utilization_pct)).scalar() or 70)
    critical = db.query(ColdStorage).filter(ColdStorage.utilization_pct >= 85).count()
    total = db.query(ColdStorage).count() or 1
    glut = int(min(92, max(25, avg_util * 0.7 + (critical / total) * 40)))
    return {
        "avg_util": avg_util,
        "critical": critical,
        "total": total,
        "glut_risk_pct": glut,
    }


def vegetation_composite(ndvi: float, savi: float, gndvi: float) -> float:
    """
    Weighted canopy signal: SAVI emphasized when NDVI low (early season / bare soil),
    GNDVI for chlorophyll/nitrogen, NDVI for mature canopy.
    """
    if ndvi < 0.50:
        weights = (0.22, 0.48, 0.30)
    elif ndvi < 0.65:
        weights = (0.38, 0.32, 0.30)
    else:
        weights = (0.48, 0.18, 0.34)
    return round(
        weights[0] * ndvi + weights[1] * savi + weights[2] * gndvi,
        4,
    )


def glut_from_signals(
    veg_index: float,
    pressure: dict,
    weather: dict,
    soil: dict,
) -> int:
    """Glut risk from vegetation vigor + logistics + abiotic stress."""
    veg_signal = max(0, min(100, int((veg_index - 0.35) * 115)))
    blended = int(
        0.38 * pressure["glut_risk_pct"]
        + 0.30 * veg_signal
        + 0.17 * pressure["avg_util"]
        + 0.08 * int(weather.get("glut_adjust", 0) * 3)
        + 0.07 * (10 if soil.get("potato_suitability") == "excellent" else 0)
    )
    return max(25, min(92, blended))


def alert_from_glut(glut: int) -> tuple[str, str]:
    if glut >= 70:
        return (
            "HIGH",
            "Macro-intelligence: incoming supply glut likely 3–4 weeks before harvest.",
        )
    if glut >= 55:
        return (
            "MEDIUM",
            "Moderate oversupply risk — route to under-utilized cold storages early.",
        )
    return ("LOW", "Yield within manageable storage band for West Bengal corridor.")


def weeks_to_harvest_from_veg(veg_index: float, weather: dict) -> int:
    weeks = 5
    if veg_index >= 0.72:
        weeks = 2
    elif veg_index >= 0.62:
        weeks = 3
    elif veg_index >= 0.52:
        weeks = 4
    if weather.get("heat_stress_days_30d", 0) >= 8:
        weeks = min(weeks + 1, 6)
    return weeks


def predicted_yield_mq(
    veg_index: float,
    pressure: dict,
    weather: dict,
    soil: dict,
    moisture: dict | None = None,
) -> float:
    base = 3.6 + veg_index * 1.35
    base *= float(weather.get("yield_factor", 1.0))
    base *= float((moisture or {}).get("yield_factor", 1.0))
    base *= float(soil.get("yield_factor", 1.0))
    base += (100 - pressure["avg_util"]) / 120
    return round(max(2.5, min(6.5, base)), 2)


def _finalize_glut(base_glut: int, mandi: dict, weather: dict, moisture: dict) -> int:
    glut = blend_glut_with_mandi(base_glut, mandi)
    glut += int(weather.get("glut_adjust", 0))
    glut += int(moisture.get("glut_adjust", 0))
    return max(25, min(92, glut))


def build_environment_layers(
    db: Session,
    last_csv_ndvi: float | None = None,
    fetch_satellite: bool = True,
    farmer_lat: float | None = None,
    farmer_lng: float | None = None,
) -> dict:
    pressure = storage_pressure(db)
    weather = _resolve_weather(farmer_lat, farmer_lng)
    moisture = fetch_era5_soil_moisture()
    soil = fetch_corridor_soil()
    mandi = corridor_mandi_stats(db)

    savi = 0.42
    gndvi = 0.40
    copernicus_history: list[tuple[str, float]] = []
    source = "Storage + weather + soil (no satellite credentials)"

    if fetch_satellite:
        cop = fetch_corridor_ndvi()
        if cop and cop.ok:
            ndvi = cop.ndvi
            savi = cop.savi
            gndvi = cop.gndvi
            if last_csv_ndvi is not None:
                ndvi = round(last_csv_ndvi * 0.2 + cop.ndvi * 0.8, 3)
            source = cop.source
            copernicus_history = cop.history
        elif cop and not cop.ok:
            ndvi = _fallback_ndvi(pressure, last_csv_ndvi, blend=0.5)
            source = f"Hybrid (CDSE: {cop.message[:60]})"
        else:
            ndvi = _fallback_ndvi(pressure, last_csv_ndvi, blend=0.4)
    else:
        cached = load_environment()
        if cached and cached.get("vegetation"):
            veg = cached["vegetation"]
            ndvi = float(veg.get("ndvi", 0.55))
            savi = float(veg.get("savi", ndvi * 0.85))
            gndvi = float(veg.get("gndvi", ndvi * 0.9))
            source = str(cached.get("satellite_source", source))
        else:
            ndvi = _fallback_ndvi(pressure, last_csv_ndvi, blend=0.4)

    veg_index = vegetation_composite(ndvi, savi, gndvi)
    weeks = weeks_to_harvest_from_veg(veg_index, weather)
    nitrogen = nitrogen_from_gndvi(gndvi, ndvi=ndvi, weeks_to_harvest=weeks)
    base_glut = glut_from_signals(veg_index, pressure, weather, soil)
    glut = _finalize_glut(base_glut, mandi, weather, moisture)

    yield_mq = predicted_yield_mq(veg_index, pressure, weather, soil, moisture)

    layers = {
        "vegetation": {
            "ndvi": ndvi,
            "savi": round(savi, 4),
            "gndvi": round(gndvi, 4),
            "composite_index": veg_index,
            "detail": (
                f"NDVI {ndvi:.3f} · SAVI {savi:.3f} (soil-adjusted early canopy) · "
                f"GNDVI {gndvi:.3f} (chlorophyll / N proxy)"
            ),
        },
        "weather": weather,
        "moisture": moisture,
        "soil": soil,
        "nitrogen": nitrogen,
        "mandi": mandi,
        "pressure": pressure,
        "satellite_source": source,
        "copernicus_history": copernicus_history,
    }

    return {
        "ndvi": ndvi,
        "savi": savi,
        "gndvi": gndvi,
        "veg_index": veg_index,
        "glut_risk_pct": glut,
        "glut_base_pct": base_glut,
        "predicted_yield_million_quintals": yield_mq,
        "lulc_potato_acres": DEFAULT_LULC_ACRES + pressure["critical"] * 120,
        "weeks_to_harvest": weeks,
        "nitrogen": nitrogen,
        "source": source,
        "layers": layers,
        "mandi": mandi,
        "pressure": pressure,
        "copernicus_history": copernicus_history,
    }


def build_yield_payload(
    db: Session,
    last_csv_ndvi: float | None = None,
    fetch_satellite: bool = True,
    persist_environment: bool = True,
    farmer_lat: float | None = None,
    farmer_lng: float | None = None,
) -> dict:
    payload = build_environment_layers(
        db,
        last_csv_ndvi=last_csv_ndvi,
        fetch_satellite=fetch_satellite,
        farmer_lat=farmer_lat,
        farmer_lng=farmer_lng,
    )
    if persist_environment:
        save_environment(
            {
                "vegetation": payload["layers"]["vegetation"],
                "weather": payload["layers"]["weather"],
                "moisture": payload["layers"]["moisture"],
                "soil": payload["layers"]["soil"],
                "nitrogen": payload["layers"]["nitrogen"],
                "satellite_source": payload["source"],
                "glut_risk_pct": payload["glut_risk_pct"],
                "predicted_yield_million_quintals": payload["predicted_yield_million_quintals"],
            }
        )
    return payload


def live_forecast_layers(
    db: Session,
    snapshot_ndvi: float,
    *,
    farmer_lat: float | None = None,
    farmer_lng: float | None = None,
) -> dict:
    """Fast API path: cached satellite indices + live weather/soil/mandi/storage."""
    cached = load_environment() or {}
    veg = cached.get("vegetation") or {}
    ndvi = float(veg.get("ndvi", snapshot_ndvi))
    savi = float(veg.get("savi", ndvi * 0.85))
    gndvi = float(veg.get("gndvi", ndvi * 0.9))
    if not veg:
        ndvi = snapshot_ndvi

    pressure = storage_pressure(db)
    weather = _resolve_weather(farmer_lat, farmer_lng)
    moisture = fetch_era5_soil_moisture()
    soil = fetch_corridor_soil()
    mandi = corridor_mandi_stats(db)

    veg_index = vegetation_composite(ndvi, savi, gndvi)
    weeks = weeks_to_harvest_from_veg(veg_index, weather)
    nitrogen = nitrogen_from_gndvi(gndvi, ndvi=ndvi, weeks_to_harvest=weeks)
    base_glut = glut_from_signals(veg_index, pressure, weather, soil)
    glut = _finalize_glut(base_glut, mandi, weather, moisture)

    return {
        "ndvi": ndvi,
        "savi": savi,
        "gndvi": gndvi,
        "veg_index": veg_index,
        "glut_risk_pct": glut,
        "glut_base_pct": base_glut,
        "predicted_yield_million_quintals": predicted_yield_mq(
            veg_index, pressure, weather, soil, moisture
        ),
        "weeks_to_harvest": weeks,
        "nitrogen": nitrogen,
        "satellite_source": cached.get("satellite_source", "snapshot"),
        "layers": {
            "vegetation": {
                "ndvi": ndvi,
                "savi": round(savi, 4),
                "gndvi": round(gndvi, 4),
                "composite_index": veg_index,
                "detail": veg.get("detail", ""),
            },
            "weather": weather,
            "moisture": moisture,
            "soil": soil,
            "nitrogen": nitrogen,
            "mandi": mandi,
            "pressure": pressure,
        },
        "mandi": mandi,
    }


def _fallback_ndvi(pressure: dict, last_csv: float | None, blend: float) -> float:
    est = round(0.58 + (100 - pressure["avg_util"]) / 500, 3)
    if last_csv is not None:
        return round(last_csv * blend + est * (1 - blend), 3)
    return est


# Back-compat for main.py imports
def glut_from_ndvi_and_storage(ndvi: float, pressure: dict) -> int:
    return glut_from_signals(ndvi, pressure, {}, {})
