"""Test data.gov.in mandi API — run: python -m ingest.diagnose_datagov"""
import os

from config import DATA_GOV_API_KEY, DATA_DIR
from ingest.fetch_mandi_datagov import DATAGOV_RESOURCE, _api_get

def main():
    print("=== KhetSmart data.gov.in diagnostic ===\n")
    print(f"API key loaded: {bool(DATA_GOV_API_KEY)} (len={len(DATA_GOV_API_KEY or '')})")
    print(f"Resource ID: {DATAGOV_RESOURCE}")
    print(f"CSV fallback: {DATA_DIR / 'mandi_prices.csv'}\n")

    if not DATA_GOV_API_KEY:
        print("FIX: Add DATA_GOV_API_KEY=... to backend/.env")
        return

    params = {"format": "json", "limit": 3, "offset": 0}
    status, payload, err = _api_get(params, timeout=35.0)

    if status == 200 and payload:
        records = payload.get("records") or []
        print(f"SUCCESS: HTTP 200, {len(records)} sample records")
        if records:
            print(f"Fields: {list(records[0].keys())}")
            print(f"Sample: {records[0]}")
        print("\nRun: python -m ingest.run_daily")
        return

    print(f"FAILED: status={status or 'n/a'} error={err}")
    print("\nThis is usually NOT your code:")
    print("  - data.gov.in returns 502 / timeout often (server overload)")
    print("  - Try again in 1–2 hours or use mandi_prices.csv (already works)")
    print("\nOptional: set SKIP_DATAGOV_MANDI=true in .env to skip API calls")


if __name__ == "__main__":
    main()
