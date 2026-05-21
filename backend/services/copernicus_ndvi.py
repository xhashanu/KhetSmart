"""
Fetch mean NDVI for West Bengal potato corridor via Copernicus Data Space (Sentinel Hub Statistical API).

Register OAuth client: https://dataspace.copernicus.eu/
Dashboard → User Settings → OAuth clients → Create client

Env (backend/.env):
  COPERNICUS_CLIENT_ID=your_client_id
  COPERNICUS_CLIENT_SECRET=your_client_secret

Legacy: COPERNICUS_API_KEY alone is treated as client_secret if CLIENT_ID is set separately.

  python -m ingest.diagnose_copernicus
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx

from config import COPERNICUS_API_KEY, COPERNICUS_CLIENT_ID, COPERNICUS_CLIENT_SECRET

# Damodar / WB potato corridor (WGS84: west, south, east, north)
DAMODAR_BBOX_WGS84 = (86.85, 22.75, 88.55, 25.2)

CDSE_TOKEN_URL = os.getenv(
    "CDSE_TOKEN_URL",
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
)
CDSE_STATS_URL = os.getenv(
    "CDSE_STATS_URL",
    "https://sh.dataspace.copernicus.eu/api/v1/statistics",
)

NDVI_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03", "B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1 },
      { id: "savi", bands: 1 },
      { id: "gndvi", bands: 1 },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(samples) {
  let ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04);
  let L = 0.5;
  let savi = ((samples.B08 - samples.B04) / (samples.B08 + samples.B04 + L)) * (1.0 + L);
  let gndvi = (samples.B08 - samples.B03) / (samples.B08 + samples.B03);
  let valid = (samples.B08 + samples.B04 != 0) ? 1 : 0;
  let noWater = (samples.SCL == 6) ? 0 : 1;
  let mask = samples.dataMask * valid * noWater;
  return {
    ndvi: [ndvi],
    savi: [savi],
    gndvi: [gndvi],
    dataMask: [mask]
  };
}
"""

VEGETATION_BANDS = ("ndvi", "savi", "gndvi")

_token_cache: tuple[str, float] | None = None


@dataclass
class CopernicusNdviResult:
    ndvi: float
    history: list[tuple[str, float]]  # (iso_date, ndvi_mean)
    source: str
    intervals: int
    ok: bool
    message: str
    savi: float = 0.0
    gndvi: float = 0.0
    savi_history: list[tuple[str, float]] | None = None
    gndvi_history: list[tuple[str, float]] | None = None


def _credentials() -> tuple[str, str] | None:
    cid = COPERNICUS_CLIENT_ID.strip()
    secret = (COPERNICUS_CLIENT_SECRET or COPERNICUS_API_KEY or "").strip()
    if cid and secret:
        return cid, secret
    return None


def get_access_token() -> str | None:
    global _token_cache
    creds = _credentials()
    if not creds:
        return None

    if _token_cache and _token_cache[1] > time.time() + 60:
        return _token_cache[0]

    client_id, client_secret = creds
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(
                CDSE_TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if r.status_code != 200:
            return None
        token = r.json().get("access_token")
        expires_in = int(r.json().get("expires_in", 3600))
        if token:
            _token_cache = (token, time.time() + expires_in)
            return token
    except Exception:
        return None
    return None


def _build_stats_request(days_back: int = 84, interval_days: int = 14) -> dict:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days_back)
    west, south, east, north = DAMODAR_BBOX_WGS84

    return {
        "input": {
            "bounds": {
                "bbox": [west, south, east, north],
                "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
            },
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "mosaickingOrder": "leastCC",
                        "maxCloudCoverage": 80,
                    },
                }
            ],
        },
        "aggregation": {
            "timeRange": {
                "from": start.strftime("%Y-%m-%dT00:00:00Z"),
                "to": now.strftime("%Y-%m-%dT00:00:00Z"),
            },
            "aggregationInterval": {"of": f"P{interval_days}D"},
            "evalscript": NDVI_EVALSCRIPT,
            "resx": 0.01,
            "resy": 0.01,
        },
    }


def _parse_band_series(payload: dict, band_id: str) -> list[tuple[str, float]]:
    history: list[tuple[str, float]] = []
    for item in payload.get("data") or []:
        interval = item.get("interval") or {}
        from_ts = interval.get("from", "")
        outputs = item.get("outputs") or {}
        band_out = outputs.get(band_id) or {}
        bands = band_out.get("bands") or {}
        b0 = bands.get("B0") or {}
        stats = b0.get("stats") or {}
        if stats.get("sampleCount", 0) <= stats.get("noDataCount", 0):
            continue
        mean = stats.get("mean")
        if mean is not None:
            history.append((from_ts, round(float(mean), 4)))
    return history


def _parse_ndvi_response(payload: dict) -> CopernicusNdviResult:
    history = _parse_band_series(payload, "ndvi")
    savi_hist = _parse_band_series(payload, "savi")
    gndvi_hist = _parse_band_series(payload, "gndvi")

    if not history:
        return CopernicusNdviResult(
            ndvi=0.0,
            history=[],
            source="copernicus_failed",
            intervals=0,
            ok=False,
            message="No valid NDVI intervals (cloud cover or no scenes)",
        )

    ndvi_latest = history[-1][1]
    return CopernicusNdviResult(
        ndvi=ndvi_latest,
        history=history,
        source="Sentinel-2 L2A · Copernicus Data Space (NDVI+SAVI+GNDVI)",
        intervals=len(history),
        ok=True,
        message=f"OK: {len(history)} intervals",
        savi=savi_hist[-1][1] if savi_hist else ndvi_latest * 0.85,
        gndvi=gndvi_hist[-1][1] if gndvi_hist else ndvi_latest * 0.9,
        savi_history=savi_hist,
        gndvi_history=gndvi_hist,
    )


def fetch_corridor_ndvi(days_back: int = 84) -> CopernicusNdviResult | None:
    """
    Returns None if credentials missing (caller uses fallback).
    Returns CopernicusNdviResult with ok=False on API errors.
    """
    if not _credentials():
        return None

    token = get_access_token()
    if not token:
        return CopernicusNdviResult(
            ndvi=0.0,
            history=[],
            source="copernicus_auth_failed",
            intervals=0,
            ok=False,
            message="Could not obtain CDSE access token — check CLIENT_ID/SECRET",
        )

    body = _build_stats_request(days_back=days_back)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        with httpx.Client(timeout=120.0) as client:
            r = client.post(CDSE_STATS_URL, json=body, headers=headers)
        if r.status_code != 200:
            snippet = (r.text or "")[:300]
            return CopernicusNdviResult(
                ndvi=0.0,
                history=[],
                source="copernicus_api_error",
                intervals=0,
                ok=False,
                message=f"HTTP {r.status_code}: {snippet}",
            )
        return _parse_ndvi_response(r.json())
    except httpx.TimeoutException:
        return CopernicusNdviResult(
            ndvi=0.0,
            history=[],
            source="copernicus_timeout",
            intervals=0,
            ok=False,
            message="CDSE Statistical API timeout (try again)",
        )
    except Exception as e:
        return CopernicusNdviResult(
            ndvi=0.0,
            history=[],
            source="copernicus_error",
            intervals=0,
            ok=False,
            message=str(e),
        )
