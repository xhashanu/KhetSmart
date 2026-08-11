"""
Build data/cold_storages_registry.csv (496 rows) from verified facilities + potato-belt grid.
Replace this file with official govt export when available.

  python -m ingest.build_registry
"""
import csv
import hashlib
import json
from pathlib import Path

from config import DATA_DIR

DISTRICT_SEED = [
    ("Purba Bardhaman", "Burdwan", 23.23, 87.86, 78),
    ("Paschim Bardhaman", "Asansol", 23.67, 86.95, 52),
    ("Hooghly", "Chinsurah", 22.90, 88.40, 48),
    ("Bankura", "Bankura", 23.23, 87.07, 42),
    ("Birbhum", "Suri", 23.90, 87.52, 38),
    ("Murshidabad", "Berhampore", 24.18, 88.27, 55),
    ("Malda", "English Bazar", 25.01, 88.14, 44),
    ("Nadia", "Krishnanagar", 23.41, 88.49, 46),
    ("North 24 Parganas", "Barasat", 22.75, 88.65, 35),
    ("South 24 Parganas", "Alipore", 22.35, 88.45, 32),
    ("Jalpaiguri", "Jalpaiguri", 26.52, 88.72, 28),
]

FIELDS = [
    "id",
    "name",
    "district",
    "block",
    "lat",
    "lng",
    "capacity_quintals",
    "utilization_pct",
    "operator_phone",
    "registry_source",
    "verified",
]


def _util(sid: str) -> int:
    h = int(hashlib.md5(sid.encode()).hexdigest()[:4], 16)
    return 15 + (h % 30)


def build_rows() -> list[dict]:
    rows: list[dict] = []
    json_path = DATA_DIR / "cold_storages.json"
    if json_path.exists():
        with open(json_path, encoding="utf-8") as f:
            for item in json.load(f):
                util = item.get("utilization_pct", _util(item["id"]))
                rows.append(
                    {
                        "id": item["id"],
                        "name": item["name"],
                        "district": item["district"],
                        "block": item["district"].split()[0],
                        "lat": item["lat"],
                        "lng": item["lng"],
                        "capacity_quintals": item["capacity_quintals"],
                        "utilization_pct": util,
                        "operator_phone": "",
                        "registry_source": "KhetSmart verified (8-facility seed)",
                        "verified": "yes",
                    }
                )

    ids = {r["id"] for r in rows}
    n = len(rows) + 1

    for district, block, clat, clng, count in DISTRICT_SEED:
        for i in range(count):
            sid = f"CS-{n:03d}"
            while sid in ids:
                n += 1
                sid = f"CS-{n:03d}"
            h = int(hashlib.md5(sid.encode()).hexdigest()[:6], 16)
            lat = round(clat + ((h % 1000) - 500) / 8000, 4)
            lng = round(clng + (((h >> 10) % 1000) - 500) / 8000, 4)
            cap = 4000 + (h % 9000)
            rows.append(
                {
                    "id": sid,
                    "name": f"{block} Cold Storage #{i + 1}",
                    "district": district,
                    "block": block,
                    "lat": lat,
                    "lng": lng,
                    "capacity_quintals": cap,
                    "utilization_pct": _util(sid),
                    "operator_phone": "",
                    "registry_source": "OGD/WB corridor model (replace with govt CSV)",
                    "verified": "no",
                }
            )
            ids.add(sid)
            n += 1
            if len(rows) >= 496:
                return rows[:496]
    return rows[:496]


def main():
    out = DATA_DIR / "cold_storages_registry.csv"
    data = build_rows()
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(data)
    verified = sum(1 for r in data if r["verified"] == "yes")
    print(f"Wrote {len(data)} rows to {out} ({verified} verified)")


if __name__ == "__main__":
    main()
