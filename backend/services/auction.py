import json
from pathlib import Path

_DATA = Path(__file__).resolve().parent.parent / "data" / "auctions.json"


def _load_auctions() -> list[dict]:
    with open(_DATA, encoding="utf-8") as f:
        return json.load(f)


def list_auctions(
    crop: str = "Potato",
    district: str | None = None,
    farmer_quantity_quintals: float | None = None,
) -> dict:
    rows = _load_auctions()
    if district:
        d = district.lower()
        rows = [a for a in rows if d in a["district"].lower() or d in a["mandi_name"].lower()]

    live = [a for a in rows if a.get("status") == "live"]
    upcoming = [a for a in rows if a.get("status") == "upcoming"]

    best_match_id = None
    if farmer_quantity_quintals and live:
        best = max(live, key=lambda a: a["current_bid_per_quintal"])
        best_match_id = best["id"]

    return {
        "auctions": live + upcoming,
        "live_count": len(live),
        "crop": crop,
        "best_match_id": best_match_id,
        "farmer_quantity_quintals": farmer_quantity_quintals,
    }
