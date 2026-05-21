from sqlalchemy.orm import Session

from models import MandiPrice


def list_markets(db: Session) -> list[dict]:
    rows = db.query(MandiPrice).order_by(MandiPrice.fetched_at.desc()).all()
    # Latest row per market_id
    latest: dict[str, MandiPrice] = {}
    for r in rows:
        if r.market_id not in latest:
            latest[r.market_id] = r
    return [_to_dict(m) for m in latest.values()]


def _to_dict(m: MandiPrice) -> dict:
    return {
        "id": m.market_id,
        "name": m.market_name,
        "district": m.district,
        "lat": m.lat,
        "lng": m.lng,
        "price_per_quintal": m.price_per_quintal,
        "crop": m.crop,
        "fetched_at": m.fetched_at.isoformat() if m.fetched_at else None,
    }
