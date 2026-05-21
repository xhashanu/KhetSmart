"""Weekly job: NDVI + yield snapshot."""
from database import SessionLocal
from ingest.fetch_ndvi_weekly import run_weekly

if __name__ == "__main__":
    db = SessionLocal()
    try:
        print(run_weekly(db))
    finally:
        db.close()
