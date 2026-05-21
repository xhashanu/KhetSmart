"""
Fetch WB potato mandi prices → data/mandi_prices.csv → DB ingest.

Set DATA_GOV_API_KEY from https://data.gov.in/
Catalog: Current daily price of various commodities (Mandi)

  python -m ingest.fetch_mandi_datagov
  python -m ingest.diagnose_datagov   # test API connectivity
"""
import csv
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from config import DATA_DIR, DATA_GOV_API_KEY

# Correct OGD resource ID (Agmarknet daily mandi prices)
# Old/wrong ID in early builds: ...98afe0991c5f
DEFAULT_RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070"
DATAGOV_RESOURCE = os.getenv("DATAGOV_MANDI_RESOURCE_ID", DEFAULT_RESOURCE)

CORRIDOR_MARKETS = {
    "Burdwan": ("MKT-001", "Burdwan Mandi", "Purba Bardhaman", 23.24, 87.87),
    "Kolkata": ("MKT-002", "Kolkata Wholesale", "Kolkata", 22.57, 88.36),
    "Malda": ("MKT-004", "Malda APMC", "Malda", 25.01, 88.15),
    "Asansol": ("MKT-005", "Asansol Mandi", "Paschim Bardhaman", 23.68, 86.96),
    "Krishnanagar": ("MKT-006", "Krishnanagar Mandi", "Nadia", 23.41, 88.49),
    "Berhampore": ("MKT-007", "Berhampore APMC", "Murshidabad", 24.10, 88.25),
    "Bankura": ("MKT-008", "Bankura Mandi", "Bankura", 23.23, 87.07),
    "Siliguri": ("MKT-003", "Siliguri Hub", "Darjeeling", 26.73, 88.40),
}

# Map corridor keys → substrings in API market names
MARKET_ALIASES = {
    "Burdwan": ["bardhaman", "burdwan", "burdhaman", "guskara"],
    "Kolkata": ["kolkata", "calcutta", "barasat", "howrah", "hooghly"],
    "Malda": ["malda", "raiganj", "dinajpur"],
    "Asansol": ["asansol", "durgapur", "raniganj"],
    "Krishnanagar": ["krishnanagar", "krishnan", "nadia apmc", "nadia"],
    "Berhampore": ["berhampore", "baharampur", "murshidabad"],
    "Bankura": ["bankura", "bishnupur", "indus"],
    "Siliguri": ["siliguri", "jalpaiguri", "cooch"],
}

# District names from API → corridor key (WB potato rows often lack exact mandi names)
DISTRICT_TO_CORRIDOR = {
    "purba bardhaman": "Burdwan",
    "paschim bardhaman": "Asansol",
    "bardhaman": "Burdwan",
    "kolkata": "Kolkata",
    "north 24 parganas": "Kolkata",
    "south 24 parganas": "Kolkata",
    "howrah": "Kolkata",
    "malda": "Malda",
    "uttar dinajpur": "Malda",
    "paschim medinipur": "Asansol",
    "purba medinipur": "Asansol",
    "bankura": "Bankura",
    "nadia": "Krishnanagar",
    "murshidabad": "Berhampore",
    "darjeeling": "Siliguri",
    "jalpaiguri": "Siliguri",
    "cooch behar": "Siliguri",
    "birbhum": "Burdwan",
}


def _load_existing_csv() -> dict[str, int]:
    path = DATA_DIR / "mandi_prices.csv"
    if not path.exists():
        return {}
    out = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out[row["market_id"]] = int(row["price_per_quintal"])
    return out


def _parse_price(modal) -> float | None:
    if modal is None or str(modal).strip() in ("", "NA", "N/A", "-"):
        return None
    try:
        p = float(str(modal).replace(",", "").strip())
        if p < 500:
            p *= 100
        return p
    except ValueError:
        return None


def _record_field(rec: dict, *keys: str) -> str:
    for k in keys:
        if k in rec and rec[k] not in (None, ""):
            return str(rec[k]).strip()
    return ""


def _api_get(params: dict, timeout: float = 25.0) -> tuple[int, dict | None, str]:
    """Returns (status_code, json_payload|None, error_message)."""
    url = f"https://api.data.gov.in/resource/{DATAGOV_RESOURCE}"
    headers = {"Accept": "application/json", "User-Agent": "KhetSmart/1.0"}
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            r = client.get(url, params={**params, "api-key": DATA_GOV_API_KEY}, headers=headers)
        if r.status_code != 200:
            snippet = (r.text or "")[:200].strip()
            return r.status_code, None, snippet or f"HTTP {r.status_code}"
        return 200, r.json(), ""
    except httpx.TimeoutException:
        return 0, None, "timeout"
    except httpx.ConnectError as e:
        return 0, None, f"connection failed: {e}"
    except Exception as e:
        return 0, None, str(e)


def _fetch_records_paginated(
    max_pages: int | None = None,
    page_size: int = 100,
    *,
    min_corridor_markets: int = 6,
) -> list[dict]:
    """Fetch without server filters (filters often cause 502); filter in Python."""
    if max_pages is None:
        max_pages = int(os.getenv("DATAGOV_MANDI_MAX_PAGES", "30"))
    all_records: list[dict] = []
    last_err = ""

    for page in range(max_pages):
        offset = page * page_size
        params = {"format": "json", "limit": page_size, "offset": offset}
        ok = False
        for attempt in range(1, 4):
            status, payload, err = _api_get(params, timeout=30.0)
            if status == 200 and payload:
                batch = payload.get("records") or payload.get("data") or []
                if not batch:
                    return all_records
                all_records.extend(batch)
                ok = True
                if len(batch) < page_size:
                    return all_records
                break
            last_err = f"page={page} attempt={attempt}: {err or status}"
            time.sleep(1.5 * attempt)

        if not ok:
            if page == 0:
                print(f"data.gov.in API failed: {last_err}")
            break

        if min_corridor_markets > 0:
            keys: set[str] = set()
            for rec in all_records:
                state = _record_field(rec, "state", "State").lower()
                commodity = _record_field(rec, "commodity", "Commodity").lower()
                if "bengal" not in state or "potato" not in commodity:
                    continue
                market = _record_field(rec, "market", "Market", "market_name")
                district = _record_field(rec, "district", "District")
                k = _corridor_key_for_record(market, district)
                if k:
                    keys.add(k)
            if len(keys) >= min_corridor_markets:
                break

    return all_records


def _corridor_key_for_record(market: str, district: str) -> str | None:
    m = market.lower()
    for key, aliases in MARKET_ALIASES.items():
        if any(a in m for a in aliases):
            return key
    d = district.lower()
    for frag, key in DISTRICT_TO_CORRIDOR.items():
        if frag in d:
            return key
    return None


def _fetch_datagov_wb_potato() -> dict[str, float]:
    if not DATA_GOV_API_KEY:
        print("DATA_GOV_API_KEY missing — add to backend/.env")
        return {}

    if os.getenv("SKIP_DATAGOV_MANDI", "").lower() in ("1", "true", "yes"):
        print("SKIP_DATAGOV_MANDI set — using mandi_prices.csv only.")
        return {}

    print(f"Fetching mandi data (resource …{DATAGOV_RESOURCE[-8:]}) …")
    min_markets = int(os.getenv("DATAGOV_MANDI_MIN_MARKETS", "6"))
    records = _fetch_records_paginated(page_size=100, min_corridor_markets=min_markets)

    if not records:
        print(
            "data.gov.in unavailable (502/timeout) — using mandi_prices.csv (app still works)."
        )
        return {}

    corridor_prices: dict[str, list[float]] = {}
    wb_potato = 0
    for rec in records:
        state = _record_field(rec, "state", "State", "state_name").lower()
        commodity = _record_field(rec, "commodity", "Commodity", "crop").lower()
        if state and "bengal" not in state:
            continue
        if commodity and "potato" not in commodity and "alu" not in commodity:
            continue
        wb_potato += 1
        market = _record_field(
            rec, "market", "Market", "mandi", "Mandi", "market_name", "Market Name"
        )
        district = _record_field(rec, "district", "District", "district_name")
        modal = (
            rec.get("modal_price")
            or rec.get("Modal_Price")
            or rec.get("Modal Price")
            or rec.get("modal_price_in_quintal")
        )
        p = _parse_price(modal)
        if p is None:
            continue
        key = _corridor_key_for_record(market, district)
        if key:
            corridor_prices.setdefault(key, []).append(p)

    corridor_matched = {k: sum(v) / len(v) for k, v in corridor_prices.items()}

    if corridor_matched:
        print(
            f"data.gov.in OK: {wb_potato} WB potato rows, "
            f"{len(corridor_matched)}/{len(CORRIDOR_MARKETS)} corridor markets updated"
        )
        return corridor_matched

    print(
        f"data.gov.in: {len(records)} rows, {wb_potato} WB potato — "
        f"no corridor match; keeping mandi_prices.csv."
    )
    return {}


def _match_corridor_price(market_key: str, api_prices: dict[str, float], fallback: int) -> int:
    if market_key in api_prices:
        return int(round(api_prices[market_key]))
    return fallback


def fetch_and_write_csv() -> dict:
    existing = _load_existing_csv()
    api_prices = _fetch_datagov_wb_potato()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []

    for key, (mid, name, district, lat, lng) in CORRIDOR_MARKETS.items():
        fallback = existing.get(mid, 1800)
        price = _match_corridor_price(key, api_prices, fallback)
        if not api_prices and existing.get(mid):
            price = existing[mid]
        rows.append(
            {
                "market_id": mid,
                "market_name": name,
                "district": district,
                "lat": lat,
                "lng": lng,
                "price_per_quintal": price,
                "fetched_at": now,
                "source": "data.gov.in" if api_prices else "csv_fallback",
            }
        )

    out = DATA_DIR / "mandi_prices.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "market_id",
                "market_name",
                "district",
                "lat",
                "lng",
                "price_per_quintal",
                "fetched_at",
                "source",
            ],
        )
        w.writeheader()
        w.writerows(rows)

    live = bool(api_prices)
    return {
        "markets": len(rows),
        "api_markets_matched": len(api_prices),
        "api_key_loaded": bool(DATA_GOV_API_KEY),
        "resource_id": DATAGOV_RESOURCE,
        "source": "data.gov.in" if live else "local_csv",
        "path": str(out),
    }


def main():
    result = fetch_and_write_csv()
    print(result)

    from database import SessionLocal
    from ingest.ingest_mandi import ingest_mandi_prices

    db = SessionLocal()
    try:
        n = ingest_mandi_prices(db)
        print(f"DB mandi rows: {n}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
