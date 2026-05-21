"""
Weekly NDVI / glut pipeline:
  1) Copernicus Sentinel-2 NDVI (if credentials set)
  2) Blend with live cold-storage pressure
  3) Append ndvi_history.csv, update ndvi_latest.csv
  4) Snapshot to yield_snapshots

  python -m ingest.fetch_ndvi_weekly
"""
import csv
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from config import DATA_DIR
from services.yield_model import REGION, build_yield_payload

HISTORY_PATH = DATA_DIR / "ndvi_history.csv"
LATEST_PATH = DATA_DIR / "ndvi_latest.csv"


def _read_last_csv_ndvi() -> float | None:
    if not LATEST_PATH.exists():
        return None
    with open(LATEST_PATH, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return None
    return float(rows[-1]["ndvi"])


def _append_history(row: dict):
    write_header = not HISTORY_PATH.exists()
    with open(HISTORY_PATH, "a", newline="", encoding="utf-8") as f:
        fields = list(row.keys())
        w = csv.DictWriter(f, fieldnames=fields)
        if write_header:
            w.writeheader()
        w.writerow(row)


def _write_latest(row: dict):
    with open(LATEST_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(row.keys()))
        w.writeheader()
        w.writerows([row])


def _append_copernicus_history_points(points: list[tuple[str, float]]):
    """Merge CDSE interval means into ndvi_history if not already present today."""
    if not points or not HISTORY_PATH.exists():
        return
    existing_dates = set()
    with open(HISTORY_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            existing_dates.add(row.get("recorded_at", "")[:10])

    for iso_from, ndvi_val in points:
        day = iso_from[:10] if iso_from else ""
        if day in existing_dates:
            continue
        _append_history(
            {
                "recorded_at": iso_from,
                "ndvi": ndvi_val,
                "glut_risk_pct": "",
                "predicted_yield_million_quintals": "",
                "lulc_potato_acres": "",
                "source": "Copernicus interval import",
            }
        )


def build_snapshot(db: Session) -> dict:
    last_ndvi = _read_last_csv_ndvi()
    payload = build_yield_payload(db, last_csv_ndvi=last_ndvi)

    if payload.get("copernicus_history"):
        _append_copernicus_history_points(payload["copernicus_history"])

    now = datetime.now(timezone.utc).isoformat()
    return {
        "recorded_at": now,
        "ndvi": payload["ndvi"],
        "glut_risk_pct": payload["glut_risk_pct"],
        "predicted_yield_million_quintals": payload["predicted_yield_million_quintals"],
        "lulc_potato_acres": payload["lulc_potato_acres"],
        "source": payload["source"],
        "weeks_to_harvest": payload["weeks_to_harvest"],
    }


def run_weekly(db: Session) -> dict:
    row = build_snapshot(db)
    _append_history(row)
    _write_latest(row)

    from ingest.ingest_ndvi import ingest_ndvi

    snap = ingest_ndvi(db)
    return {
        "ndvi": row["ndvi"],
        "glut_risk_pct": row["glut_risk_pct"],
        "source": row["source"],
        "weeks_to_harvest": row.get("weeks_to_harvest", 3),
        "history_path": str(HISTORY_PATH),
        "snapshot_id": snap.id,
    }


def main():
    from database import SessionLocal

    db = SessionLocal()
    try:
        print(run_weekly(db))
    finally:
        db.close()


if __name__ == "__main__":
    main()
