from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from models import YieldSnapshot
from services.yield_predictor import YieldForecast


@dataclass
class YieldForecastDTO:
    region: str
    ndvi_index: float
    predicted_yield_million_quintals: float
    glut_risk_pct: float
    weeks_to_harvest: int
    satellite_source: str
    lulc_potato_acres: int
    alert_level: str
    insight: str
    data_source: str
    recorded_at: str | None


def get_latest_yield(db: Session, region: str = "Damodar River Basin") -> Optional[YieldForecastDTO]:
    snap = (
        db.query(YieldSnapshot)
        .filter(YieldSnapshot.region == region)
        .order_by(YieldSnapshot.recorded_at.desc())
        .first()
    )
    if snap:
        return YieldForecastDTO(
            region=snap.region,
            ndvi_index=snap.ndvi_index,
            predicted_yield_million_quintals=snap.predicted_yield_million_quintals,
            glut_risk_pct=snap.glut_risk_pct,
            weeks_to_harvest=snap.weeks_to_harvest,
            satellite_source=snap.satellite_source,
            lulc_potato_acres=snap.lulc_potato_acres,
            alert_level=snap.alert_level,
            insight=snap.insight,
            data_source="database",
            recorded_at=snap.recorded_at.isoformat() if snap.recorded_at else None,
        )
    # No fallback: return None when database has no yield snapshot.
    return None


def to_legacy_forecast(dto: YieldForecastDTO) -> YieldForecast:
    return YieldForecast(
        region=dto.region,
        ndvi_index=dto.ndvi_index,
        predicted_yield_million_quintals=dto.predicted_yield_million_quintals,
        glut_risk_pct=dto.glut_risk_pct,
        weeks_to_harvest=dto.weeks_to_harvest,
        satellite_source=dto.satellite_source,
        lulc_potato_acres=dto.lulc_potato_acres,
        alert_level=dto.alert_level,
        insight=dto.insight,
    )
