"""
One-shot: fetch official OGD CSV → convert → backup → replace registry → DB import.

  python -m ingest.sync_registry_ogd
  python -m ingest.sync_registry_ogd --skip-fetch   # use existing download only
"""
from __future__ import annotations

import argparse
import shutil
from datetime import datetime
from pathlib import Path

from config import DATA_DIR
from ingest.convert_ogd_registry import convert_file
from ingest.fetch_registry_ogd import DEFAULT_OUTPUT, fetch_registry_csv
from ingest.import_registry import import_registry

REGISTRY_PATH = DATA_DIR / "cold_storages_registry.csv"
BACKUP_DIR = DATA_DIR / "backups"


def sync_registry(skip_fetch: bool = False) -> dict:
    download_path = DEFAULT_OUTPUT

    if skip_fetch:
        if not download_path.exists():
            raise FileNotFoundError(
                f"No download at {download_path}. Run without --skip-fetch first."
            )
        print(f"Using existing download: {download_path}")
    else:
        download_path = fetch_registry_csv()

    if REGISTRY_PATH.exists():
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup = BACKUP_DIR / f"cold_storages_registry_{stamp}.csv"
        shutil.copy(REGISTRY_PATH, backup)
        print(f"Backed up previous registry -> {backup}")

    n = convert_file(
        download_path,
        REGISTRY_PATH,
        wb_only=True,
        source_label="data.gov.in - State/UT cold storage distribution (Jan 2025)",
    )

    from database import SessionLocal, engine
    from models import Base

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        imp = import_registry(db, replace=True)
    finally:
        db.close()

    return {"converted_rows": n, "import": imp, "registry": str(REGISTRY_PATH)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-fetch",
        action="store_true",
        help="Convert/import existing data/downloads/ogd_cold_storage_latest.csv",
    )
    args = parser.parse_args()
    result = sync_registry(skip_fetch=args.skip_fetch)
    print(result)


if __name__ == "__main__":
    main()
