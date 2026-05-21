from database import SessionLocal, engine
from models import Base
from ingest.import_registry import import_registry, REGISTRY_PATH
from ingest.ingest_mandi import ingest_mandi_prices
from ingest.ingest_ndvi import ingest_ndvi
from services.storage_repo import count_storages
from models import MandiPrice, YieldSnapshot


def init_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        n = count_storages(db)
        if n == 0:
            if REGISTRY_PATH.exists():
                import_registry(db, replace=True)
            else:
                from ingest.build_registry import main as build_reg
                from ingest.import_registry import import_registry as imp

                build_reg()
                imp(db, replace=True)
        if db.query(MandiPrice).count() == 0:
            ingest_mandi_prices(db)
        if db.query(YieldSnapshot).count() == 0:
            ingest_ndvi(db)
    finally:
        db.close()
