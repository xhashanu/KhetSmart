"""OSRM driving distances with in-memory cache and haversine fallback."""

from __future__ import annotations

import logging
import math
import os
import time

from config import OSRM_BASE_URL, USE_OSRM
from services.external_api import fetch_json

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, str, float]] = {}
_CACHE_TTL_SEC = 3600


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _cache_key(lat1: float, lon1: float, lat2: float, lon2: float) -> str:
    return f"{lat1:.4f},{lon1:.4f}|{lat2:.4f},{lon2:.4f}"


def _fetch_osrm_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float | None:
    # OSRM expects lon,lat
    url = (
        f"{OSRM_BASE_URL.rstrip('/')}/route/v1/driving/"
        f"{lon1},{lat1};{lon2},{lat2}"
    )
    status, payload, err = fetch_json(
        "osrm",
        "GET",
        url,
        params={"overview": "false"},
        timeout=8.0,
        max_attempts=2,
    )
    if status != 200 or payload is None:
        logger.warning("OSRM failed (%s), falling back to haversine", err)
        return None
    routes = payload.get("routes") or []
    if not routes:
        return None
    meters = routes[0].get("distance")
    if meters is None:
        return None
    return float(meters) / 1000.0


def driving_distance_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    *,
    prefer_osrm: bool | None = None,
) -> tuple[float, str]:
    """
    Returns (distance_km, source) where source is 'osrm' or 'haversine'.
    """
    use_osrm = USE_OSRM if prefer_osrm is None else prefer_osrm
    key = _cache_key(lat1, lon1, lat2, lon2)
    now = time.time()
    cached = _CACHE.get(key)
    if cached and now - cached[2] < _CACHE_TTL_SEC:
        return cached[0], cached[1]

    dist: float
    source: str
    if use_osrm:
        osrm_km = _fetch_osrm_km(lat1, lon1, lat2, lon2)
        if osrm_km is not None and osrm_km > 0:
            dist, source = round(osrm_km, 2), "osrm"
        else:
            dist = round(_haversine_km(lat1, lon1, lat2, lon2), 2)
            source = "haversine"
    else:
        dist = round(_haversine_km(lat1, lon1, lat2, lon2), 2)
        source = "haversine"

    _CACHE[key] = (dist, source, now)
    return dist, source
