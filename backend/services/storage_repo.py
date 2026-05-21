from sqlalchemy.orm import Session

from models import ColdStorage, utcnow


def list_storages(db: Session, for_map: bool = False, limit: int | None = None) -> list[dict]:
    q = db.query(ColdStorage).order_by(ColdStorage.utilization_pct.asc())
    if for_map:
        # Map: critical + district spread (real Leaflet map, ~200 pins)
        critical = (
            db.query(ColdStorage)
            .filter(ColdStorage.utilization_pct >= 85)
            .order_by(ColdStorage.utilization_pct.desc())
            .limit(40)
            .all()
        )
        seen = {s.id for s in critical}
        merged = list(critical)
        districts = [r[0] for r in db.query(ColdStorage.district).distinct().all()]
        per_district = max(8, 160 // max(len(districts), 1))
        for dist in districts:
            batch = (
                db.query(ColdStorage)
                .filter(ColdStorage.district == dist)
                .order_by(ColdStorage.available_quintals.desc())
                .limit(per_district)
                .all()
            )
            for s in batch:
                if s.id not in seen and len(merged) < 200:
                    seen.add(s.id)
                    merged.append(s)
        rows = merged
    else:
        rows = q.all() if limit is None else q.limit(limit).all()
    return [_to_dict(s) for s in rows]


def get_storage(db: Session, storage_id: str) -> dict | None:
    s = db.query(ColdStorage).filter(ColdStorage.id == storage_id).first()
    return _to_dict(s) if s else None


def update_storage_utilization(
    db: Session, storage_id: str, utilization_pct: int
) -> dict | None:
    s = db.query(ColdStorage).filter(ColdStorage.id == storage_id).first()
    if not s:
        return None
    utilization_pct = max(0, min(100, utilization_pct))
    s.utilization_pct = utilization_pct
    s.available_quintals = int(s.capacity_quintals * (100 - utilization_pct) / 100)
    s.updated_at = utcnow()
    db.commit()
    db.refresh(s)
    return _to_dict(s)


def count_storages(db: Session) -> int:
    return db.query(ColdStorage).count()


def _to_dict(s: ColdStorage) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "district": s.district,
        "lat": s.lat,
        "lng": s.lng,
        "capacity_quintals": s.capacity_quintals,
        "available_quintals": s.available_quintals,
        "utilization_pct": s.utilization_pct,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }
