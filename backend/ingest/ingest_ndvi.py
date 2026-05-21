"""NDVI / yield snapshot ingest — Copernicus Sentinel-2 + storage pressure."""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from models import YieldSnapshot
from services.yield_model import REGION, alert_from_glut, build_yield_payload


def ingest_ndvi(db: Session) -> YieldSnapshot:
    from config import DATA_DIR
    import csv

    last_csv = None
    path = DATA_DIR / "ndvi_latest.csv"
    if path.exists():
        with open(path, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
            if rows:
                last_csv = float(rows[-1]["ndvi"])

    payload = build_yield_payload(db, last_csv_ndvi=last_csv)
    alert, insight = alert_from_glut(payload["glut_risk_pct"])
    mandi = payload.get("mandi") or {}
    if mandi.get("glut_adjust", 0) >= 6 and mandi.get("detail"):
        insight = f"{insight} {mandi['detail']}"
    now = datetime.now(timezone.utc)

    snap = YieldSnapshot(
        region=REGION,
        ndvi_index=payload["ndvi"],
        glut_risk_pct=payload["glut_risk_pct"],
        predicted_yield_million_quintals=payload["predicted_yield_million_quintals"],
        weeks_to_harvest=payload["weeks_to_harvest"],
        lulc_potato_acres=payload["lulc_potato_acres"],
        satellite_source=payload["source"],
        alert_level=alert,
        insight=insight,
        recorded_at=now,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap
