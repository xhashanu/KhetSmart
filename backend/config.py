import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# sqlite:///./khetsmart.db  or  postgresql://user:pass@localhost/khetsmart
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'khetsmart.db'}")

DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() in ("1", "true", "yes")

# Copernicus Data Space (Sentinel-2 NDVI) — OAuth client from dataspace.copernicus.eu
COPERNICUS_CLIENT_ID = os.getenv("COPERNICUS_CLIENT_ID", "")
COPERNICUS_CLIENT_SECRET = os.getenv(
    "COPERNICUS_CLIENT_SECRET", os.getenv("COPERNICUS_API_KEY", "")
)
# Legacy single-key alias (use as client_secret if CLIENT_ID is set)
COPERNICUS_API_KEY = os.getenv("COPERNICUS_API_KEY", "")

# data.gov.in — daily mandi prices (https://data.gov.in/)
DATA_GOV_API_KEY = os.getenv("DATA_GOV_API_KEY", "")

# Protect /api/admin/* — set in production; empty = open (dev only)
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")

# Ops: when true and ADMIN_API_KEY is set, /api/admin/* requires X-Admin-Key
REQUIRE_ADMIN_AUTH = os.getenv("REQUIRE_ADMIN_AUTH", "true").lower() in (
    "1",
    "true",
    "yes",
)

# Routing: OSRM driving distance (public demo server; set USE_OSRM=false to disable)
USE_OSRM = os.getenv("USE_OSRM", "true").lower() in ("1", "true", "yes")
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

DATA_DIR = BASE_DIR / "data"
