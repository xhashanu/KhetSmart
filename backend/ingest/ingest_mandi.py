"""Ingest mandi / wholesale potato prices (CSV seed → DB; plug eNAM/API later)."""
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from config import DATA_DIR
from models import MandiPrice

# Base prices ₹/quintal — updated by ingest; replace with live API
DEFAULT_MARKETS = [
    ("MKT-001", "Burdwan Mandi", "Purba Bardhaman", 23.24, 87.87, 1850),
    ("MKT-002", "Kolkata Wholesale", "Kolkata", 22.57, 88.36, 2100),
    ("MKT-003", "Siliguri Hub", "Darjeeling", 26.73, 88.40, 1950),
    ("MKT-004", "Malda APMC", "Malda", 25.01, 88.15, 1720),
    ("MKT-005", "Asansol Mandi", "Paschim Bardhaman", 23.68, 86.96, 1780),
    ("MKT-006", "Krishnanagar Mandi", "Nadia", 23.41, 88.49, 1800),
    ("MKT-007", "Berhampore APMC", "Murshidabad", 24.10, 88.25, 1750),
    ("MKT-008", "Bankura Mandi", "Bankura", 23.23, 87.07, 1700),
]


def _load_csv_prices() -> list[tuple] | None:
    path = DATA_DIR / "mandi_prices.csv"
    if not path.exists():
        return None
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(
                (
                    row["market_id"],
                    row["market_name"],
                    row["district"],
                    float(row["lat"]),
                    float(row["lng"]),
                    int(row["price_per_quintal"]),
                )
            )
    return rows


def ingest_mandi_prices(db: Session) -> int:
    """Refresh mandi prices. Returns rows inserted."""
    db.query(MandiPrice).delete()
    now = datetime.now(timezone.utc)

    markets = _load_csv_prices()
    if markets is None:
        json_path = DATA_DIR / "markets.json"
        if json_path.exists():
            with open(json_path, encoding="utf-8") as f:
                raw = json.load(f)
            markets = [
                (m["id"], m["name"], m["district"], m["lat"], m["lng"], m["price_per_quintal"])
                for m in raw
            ]
        else:
            markets = DEFAULT_MARKETS

    for mid, name, district, lat, lng, price in markets:
        db.add(
            MandiPrice(
                market_id=mid,
                market_name=name,
                district=district,
                crop="Potato",
                lat=lat,
                lng=lng,
                price_per_quintal=price,
                fetched_at=now,
            )
        )
    db.commit()
    return len(markets)
