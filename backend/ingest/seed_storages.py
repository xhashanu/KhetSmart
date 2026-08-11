"""Seed 496 cold storages: 8 verified demo + 488 corridor facilities (replace with govt registry CSV)."""
import hashlib
import json
from pathlib import Path

from sqlalchemy.orm import Session

from config import DATA_DIR
from models import ColdStorage, utcnow

# Potato-belt districts (lat/lng centroid) → facility count
DISTRICT_SEED = [
    ("Purba Bardhaman", 23.23, 87.86, 78),
    ("Paschim Bardhaman", 23.67, 86.95, 52),
    ("Hooghly", 22.90, 88.40, 48),
    ("Bankura", 23.23, 87.07, 42),
    ("Birbhum", 23.90, 87.52, 38),
    ("Murshidabad", 24.18, 88.27, 55),
    ("Malda", 25.01, 88.14, 44),
    ("Nadia", 23.41, 88.49, 46),
    ("North 24 Parganas", 22.75, 88.65, 35),
    ("South 24 Parganas", 22.35, 88.45, 32),
    ("Jalpaiguri", 26.52, 88.72, 28),
]


def _utilization(storage_id: str) -> int:
    h = int(hashlib.md5(storage_id.encode()).hexdigest()[:4], 16)
    return 15 + (h % 30)


def seed_storages(db: Session) -> int:
    if db.query(ColdStorage).count() > 0:
        return db.query(ColdStorage).count()

    rows: list[ColdStorage] = []

    # Verified demo facilities from JSON
    json_path = DATA_DIR / "cold_storages.json"
    if json_path.exists():
        with open(json_path, encoding="utf-8") as f:
            for item in json.load(f):
                rows.append(
                    ColdStorage(
                        id=item["id"],
                        name=item["name"],
                        district=item["district"],
                        lat=item["lat"],
                        lng=item["lng"],
                        capacity_quintals=item["capacity_quintals"],
                        available_quintals=item["available_quintals"],
                        utilization_pct=item["utilization_pct"],
                        updated_at=utcnow(),
                    )
                )

    existing_ids = {r.id for r in rows}
    n = len(rows) + 1

    for district, clat, clng, count in DISTRICT_SEED:
        for i in range(count):
            sid = f"CS-{n:03d}"
            while sid in existing_ids:
                n += 1
                sid = f"CS-{n:03d}"
            h = int(hashlib.md5(sid.encode()).hexdigest()[:6], 16)
            lat = clat + ((h % 1000) - 500) / 8000
            lng = clng + (((h >> 10) % 1000) - 500) / 8000
            cap = 4000 + (h % 9000)
            util = _utilization(sid)
            avail = int(cap * (100 - util) / 100)
            rows.append(
                ColdStorage(
                    id=sid,
                    name=f"{district.split()[0]} CS #{i + 1}",
                    district=district,
                    lat=round(lat, 4),
                    lng=round(lng, 4),
                    capacity_quintals=cap,
                    available_quintals=avail,
                    utilization_pct=util,
                    updated_at=utcnow(),
                )
            )
            existing_ids.add(sid)
            n += 1
            if len(rows) >= 496:
                break
        if len(rows) >= 496:
            break

    db.add_all(rows[:496])
    db.commit()
    return min(len(rows), 496)
