import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class YieldForecast:
    region: str
    ndvi_index: float
    predicted_yield_million_quintals: float
    glut_risk_pct: float
    weeks_to_harvest: int
    satellite_source: str
    lulc_potato_acres: int
    alert_level: str
    insight: str


def predict_yield(region: str = "Damodar River Basin") -> YieldForecast:
    # Deterministic demo signal from date + region (stable within a demo day)
    seed = hashlib.md5(f"{region}-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}".encode()).hexdigest()
    ndvi = 0.62 + (int(seed[:4], 16) % 200) / 1000
    glut = 35 + (int(seed[4:8], 16) % 45)
    yield_mq = 4.2 + (int(seed[8:12], 16) % 180) / 100

    if glut >= 70:
        alert = "HIGH"
        insight = "Macro-intelligence: incoming supply glut likely 3–4 weeks before harvest."
    elif glut >= 55:
        alert = "MEDIUM"
        insight = "Moderate oversupply risk — route to under-utilized cold storages early."
    else:
        alert = "LOW"
        insight = "Yield within manageable storage band for West Bengal corridor."

    return YieldForecast(
        region=region,
        ndvi_index=round(ndvi, 3),
        predicted_yield_million_quintals=round(yield_mq, 2),
        glut_risk_pct=glut,
        weeks_to_harvest=3,
        satellite_source="Sentinel-2 (Copernicus) — demo",
        lulc_potato_acres=128400 + (int(seed[12:16], 16) % 5000),
        alert_level=alert,
        insight=insight,
    )
