"""Run all ingest steps: python -m ingest.seed_all"""
from database import SessionLocal, engine
from models import Base
from ingest.import_registry import import_registry, REGISTRY_PATH
from ingest.build_registry import main as build_registry
from ingest.ingest_mandi import ingest_mandi_prices
from ingest.ingest_ndvi import ingest_ndvi
from ingest.fetch_mandi_datagov import fetch_and_write_csv
from ingest.fetch_ndvi_weekly import run_weekly


def main():
    Base.metadata.create_all(bind=engine)
    if not REGISTRY_PATH.exists():
        build_registry()

    db = SessionLocal()
    try:
        reg = import_registry(db, replace=True)
        print(f"Registry: {reg}")

        mandi_meta = fetch_and_write_csv()
        print(f"Mandi fetch: {mandi_meta}")
        n_mandi = ingest_mandi_prices(db)
        print(f"Mandi DB rows: {n_mandi}")

        ndvi = run_weekly(db)
        print(f"NDVI weekly: {ndvi}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
