"""
Import official / operator registry CSV into cold_storages table.

  python -m ingest.import_registry
  python -m ingest.import_registry --replace
"""
import argparse
import csv
from pathlib import Path

from sqlalchemy.orm import Session

from config import DATA_DIR
from database import SessionLocal, engine
from models import Base, ColdStorage, utcnow

REGISTRY_PATH = DATA_DIR / "cold_storages_registry.csv"
FALLBACK_BUILD = DATA_DIR / "cold_storages_registry.csv"


def _row_to_storage(row: dict) -> ColdStorage:
    cap = int(row["capacity_quintals"])
    util = max(0, min(100, int(float(row.get("utilization_pct", 70)))))
    avail = int(cap * (100 - util) / 100)
    return ColdStorage(
        id=row["id"].strip(),
        name=row["name"].strip(),
        district=row["district"].strip(),
        lat=float(row["lat"]),
        lng=float(row["lng"]),
        capacity_quintals=cap,
        available_quintals=avail,
        utilization_pct=util,
        updated_at=utcnow(),
    )


def load_registry_rows(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def import_registry(db: Session, replace: bool = True) -> dict:
    if not REGISTRY_PATH.exists():
        from ingest.build_registry import main as build

        build()

    rows = load_registry_rows(REGISTRY_PATH)
    if not rows:
        raise ValueError(f"No rows in {REGISTRY_PATH}")

    if replace:
        db.query(ColdStorage).delete()
        db.commit()

    existing = {s.id: s for s in db.query(ColdStorage).all()}
    inserted = updated = 0

    for row in rows:
        sid = row["id"].strip()
        if sid in existing and not replace:
            s = existing[sid]
            cap = int(row["capacity_quintals"])
            util = max(0, min(100, int(float(row.get("utilization_pct", s.utilization_pct)))))
            s.name = row["name"].strip()
            s.district = row["district"].strip()
            s.lat = float(row["lat"])
            s.lng = float(row["lng"])
            s.capacity_quintals = cap
            s.utilization_pct = util
            s.available_quintals = int(cap * (100 - util) / 100)
            s.updated_at = utcnow()
            updated += 1
        else:
            db.add(_row_to_storage(row))
            inserted += 1

    db.commit()
    total = db.query(ColdStorage).count()
    verified = sum(1 for r in rows if str(r.get("verified", "")).lower() == "yes")
    return {
        "total": total,
        "rows_in_csv": len(rows),
        "inserted": inserted,
        "updated": updated,
        "verified_in_csv": verified,
        "source": str(REGISTRY_PATH),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--replace", action="store_true", default=True)
    parser.add_argument("--merge", action="store_true", help="Upsert without deleting")
    args = parser.parse_args()
    replace = not args.merge

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        result = import_registry(db, replace=replace)
        print(result)
    finally:
        db.close()


if __name__ == "__main__":
    main()
