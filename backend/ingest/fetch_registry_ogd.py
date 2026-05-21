"""
Download official cold-storage CSV from data.gov.in (with bundled fallback).

  python -m ingest.fetch_registry_ogd
  python -m ingest.fetch_registry_ogd --output data/downloads/my_download.csv
"""
from __future__ import annotations

import csv
import os
import time
from pathlib import Path

import httpx

from config import DATA_DIR, DATA_GOV_API_KEY

# MoFPI / OGD: State/UT-wise distribution (Jan 2025 catalog page)
DEFAULT_RESOURCE = "f74278bb-fe8a-41b1-af9b-a38690edf197"
DATAGOV_RESOURCE = os.getenv("DATAGOV_REGISTRY_RESOURCE_ID", DEFAULT_RESOURCE)

DOWNLOADS_DIR = DATA_DIR / "downloads"
BUNDLED_SNAPSHOT = DOWNLOADS_DIR / "ogd_cold_storage_distribution_31012025.csv"
DEFAULT_OUTPUT = DOWNLOADS_DIR / "ogd_cold_storage_latest.csv"

# Normalized export columns for convert_ogd_registry
EXPORT_FIELDS = [
    "sl_no",
    "state_ut",
    "number_of_cold_storages",
    "capacity_mt",
]


def _api_get(params: dict, timeout: float = 45.0) -> tuple[int, dict | None, str]:
    url = f"https://api.data.gov.in/resource/{DATAGOV_RESOURCE}"
    headers = {"Accept": "application/json", "User-Agent": "KhetSmart/1.0"}
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            r = client.get(
                url, params={**params, "api-key": DATA_GOV_API_KEY}, headers=headers
            )
        if r.status_code != 200:
            return r.status_code, None, (r.text or "")[:200]
        return 200, r.json(), ""
    except httpx.TimeoutException:
        return 0, None, "timeout"
    except Exception as e:
        return 0, None, str(e)


def _normalize_record(rec: dict, idx: int) -> dict:
    state = (
        rec.get("state_ut")
        or rec.get("State/UT")
        or rec.get("state")
        or rec.get("Location")
        or ""
    )
    n = (
        rec.get("no__of_project")
        or rec.get("no__of_cold_storages")
        or rec.get("Number of Cold Storages")
        or rec.get("number_of_cold_storages")
        or ""
    )
    cap = (
        rec.get("capacity__mt_")
        or rec.get("Capacity (in MT)")
        or rec.get("capacity_mt")
        or ""
    )
    return {
        "sl_no": str(rec.get("sl__no_") or rec.get("Sl. No.") or idx),
        "state_ut": str(state).strip(),
        "number_of_cold_storages": str(n).strip(),
        "capacity_mt": str(cap).strip(),
    }


def fetch_from_api(max_records: int = 50) -> list[dict]:
    if not DATA_GOV_API_KEY:
        return []

    rows: list[dict] = []
    offset = 0
    page_size = 50
    last_err = ""

    while len(rows) < max_records:
        params = {"format": "json", "limit": page_size, "offset": offset}
        ok = False
        for attempt in range(1, 4):
            status, payload, err = _api_get(params, timeout=60.0)
            if status == 200 and payload:
                batch = payload.get("records") or []
                if not batch:
                    return rows
                for i, rec in enumerate(batch, start=len(rows) + 1):
                    rows.append(_normalize_record(rec, i))
                ok = True
                if len(batch) < page_size:
                    return rows
                offset += page_size
                break
            last_err = err or str(status)
            time.sleep(1.5 * attempt)
        if not ok:
            if not rows:
                print(f"data.gov.in registry API failed: {last_err}")
            break

    return rows


def write_csv(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=EXPORT_FIELDS)
        w.writeheader()
        w.writerows(rows)


def fetch_registry_csv(output: Path | None = None) -> Path:
    out = output or DEFAULT_OUTPUT

    print(f"Fetching cold-storage registry (resource ...{DATAGOV_RESOURCE[-8:]})")
    rows = fetch_from_api()

    if rows:
        write_csv(rows, out)
        print(f"Saved {len(rows)} state/UT rows from data.gov.in -> {out}")
        return out

    if BUNDLED_SNAPSHOT.exists():
        import shutil

        shutil.copy(BUNDLED_SNAPSHOT, out)
        print(
            f"API unavailable - using bundled OGD snapshot -> {out}\n"
            f"  (source: {BUNDLED_SNAPSHOT.name}, Jan 2025 distribution)"
        )
        return out

    raise FileNotFoundError(
        f"No API data and no bundled snapshot at {BUNDLED_SNAPSHOT}"
    )


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--output", "-o", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()
    fetch_registry_csv(Path(args.output))


if __name__ == "__main__":
    main()
