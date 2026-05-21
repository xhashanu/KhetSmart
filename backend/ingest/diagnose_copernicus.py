"""Test Copernicus Data Space NDVI for Damodar corridor.

  python -m ingest.diagnose_copernicus
"""
from config import COPERNICUS_CLIENT_ID, COPERNICUS_CLIENT_SECRET, COPERNICUS_API_KEY
from services.copernicus_ndvi import DAMODAR_BBOX_WGS84, fetch_corridor_ndvi, get_access_token


def main():
    print("=== KhetSmart Copernicus NDVI diagnostic ===\n")
    print(f"CLIENT_ID set: {bool(COPERNICUS_CLIENT_ID)}")
    print(f"CLIENT_SECRET/API_KEY set: {bool(COPERNICUS_CLIENT_SECRET or COPERNICUS_API_KEY)}")
    print(f"Damodar bbox (WGS84): {DAMODAR_BBOX_WGS84}\n")

    if not COPERNICUS_CLIENT_ID or not (COPERNICUS_CLIENT_SECRET or COPERNICUS_API_KEY):
        print("SETUP: Create OAuth client at https://dataspace.copernicus.eu/")
        print("Add to backend/.env:")
        print("  COPERNICUS_CLIENT_ID=cdse-xxxxxxxx")
        print("  COPERNICUS_CLIENT_SECRET=your_secret")
        return

    token = get_access_token()
    if token:
        print("Token: OK (access token received)")
    else:
        print("Token: FAILED — check client id/secret")
        return

    result = fetch_corridor_ndvi()
    if result is None:
        print("Fetch: skipped (no credentials)")
        return

    print(f"Status: {result.ok} — {result.message}")
    print(f"NDVI (latest interval): {result.ndvi}")
    print(f"SAVI: {result.savi}")
    print(f"GNDVI: {result.gndvi}")
    print(f"Intervals: {result.intervals}")
    print(f"Source label: {result.source}")
    if result.history:
        print("\nHistory sample:")
        for ts, v in result.history[-6:]:
            print(f"  {ts[:10]}  NDVI={v}")
    print("\nNext: python -m ingest.run_weekly")


if __name__ == "__main__":
    main()
