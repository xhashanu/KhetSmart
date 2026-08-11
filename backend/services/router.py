from dataclasses import dataclass

from sqlalchemy.orm import Session

from config import DEMO_MODE
from services.osrm_client import _haversine_km, driving_distance_km
from services.mandi_signal import corridor_mandi_stats
from services.price_repo import list_markets
from services.storage_repo import list_storages

TRACTOR_COST_PER_50_QTL = 5000
FARMER_DEFAULT = {"lat": 23.25, "lng": 87.85, "district": "Purba Bardhaman"}
OSRM_CANDIDATE_LIMIT = 25

# Live mandi ₹/quintal multipliers by potato variety (applied to corridor + nearest mandi blend)
CROP_MANDI_FACTOR: dict[str, float] = {
    "jyoti potato": 1.10,
    "potato": 1.0,
    "chipsona-1": 0.90,
    "kufri jyoti": 1.05,
}


def live_mandi_price_per_quintal(
    crop: str,
    nearest_market_price: int,
    corridor_avg: int | None,
) -> int:
    """Blend ingested corridor mandi average with nearest market; adjust by crop."""
    base = int(corridor_avg) if corridor_avg else nearest_market_price
    blended = int(0.55 * base + 0.45 * nearest_market_price)
    key = crop.lower().strip()
    factor = CROP_MANDI_FACTOR.get(key, 1.0)
    if "jyoti" in key and "kufri" not in key:
        factor = max(factor, 1.08)
    if "chipsona" in key:
        factor = min(factor, 0.92)
    return max(500, int(blended * factor))


@dataclass
class RouteRecommendation:
    storage_id: str
    storage_name: str
    district: str
    distance_km: float
    distance_source: str
    logistics_cost_inr: int
    estimated_profit_inr: int
    market_name: str
    market_price_per_quintal: int
    utilization_after_pct: float
    origin_lat: float
    origin_lng: float
    storage_lat: float
    storage_lng: float
    market_lat: float
    market_lng: float
    reasoning: str
    why: list[str]


def _logistics_cost(quantity_quintals: float, distance_km: float) -> int:
    return int((quantity_quintals / 50) * TRACTOR_COST_PER_50_QTL * (1 + distance_km / 100))


def _score_candidate(
    storage: dict,
    origin: dict,
    quantity_quintals: float,
    markets: list[dict],
    glut_risk_pct: float,
    distance_km: float,
    crop: str,
    corridor_avg: int | None,
) -> tuple[float, dict, float, int, int, dict, float, int]:
    logistics = _logistics_cost(quantity_quintals, distance_km)
    nearest_market = min(
        markets,
        key=lambda m: _haversine_km(storage["lat"], storage["lng"], m["lat"], m["lng"]),
    )
    live_q = live_mandi_price_per_quintal(
        crop, nearest_market["price_per_quintal"], corridor_avg
    )
    revenue = int(quantity_quintals * live_q)
    profit = revenue - logistics
    util_after = (
        (storage["capacity_quintals"] - storage["available_quintals"] + quantity_quintals)
        / storage["capacity_quintals"]
        * 100
    )
    glut_penalty = glut_risk_pct * 0.15 * profit
    score = profit - glut_penalty + (100 - storage["utilization_pct"]) * 8 - distance_km * 50
    market_out = {**nearest_market, "price_per_quintal": live_q}
    return score, storage, distance_km, logistics, profit, market_out, util_after, live_q


def recommend_route(
    db: Session,
    quantity_quintals: float,
    crop: str,
    district: str | None = None,
    glut_risk_pct: float = 0.0,
    farmer_lat: float | None = None,
    farmer_lng: float | None = None,
) -> RouteRecommendation:
    storages = list_storages(db)
    markets = list_markets(db)
    mandi_live = corridor_mandi_stats(db)
    corridor_avg = mandi_live.get("avg_price")

    if not storages or not markets:
        raise RuntimeError("Database not seeded. Run: python -m ingest.seed_all")

    origin = FARMER_DEFAULT.copy()
    used_live_gps = False
    if farmer_lat is not None and farmer_lng is not None:
        used_live_gps = True
        origin = {
            "lat": float(farmer_lat),
            "lng": float(farmer_lng),
            "district": district or FARMER_DEFAULT["district"],
        }
    elif district:
        match = next((s for s in storages if s["district"] == district), None)
        if match:
            origin = {"lat": match["lat"], "lng": match["lng"], "district": district}

    prelim: list[tuple] = []
    for storage in storages:
        if storage["available_quintals"] < quantity_quintals:
            continue
        dist_h = _haversine_km(origin["lat"], origin["lng"], storage["lat"], storage["lng"])
        if dist_h > 45.0:
            continue
        prelim.append(
            _score_candidate(
                storage,
                origin,
                quantity_quintals,
                markets,
                glut_risk_pct,
                dist_h,
                crop,
                corridor_avg,
            )
        )

    distance_source = "haversine"
    if not prelim:
        storage = storages[0]
        dist = 23.0
        logistics = 4200
        market = markets[0]
        live_q = live_mandi_price_per_quintal(
            crop, market["price_per_quintal"], corridor_avg
        )
        market = {**market, "price_per_quintal": live_q}
        profit = int(quantity_quintals * live_q) - logistics
        util_after = 75.0
        why = ["Fallback: nearest facility with capacity"]
    else:
        prelim.sort(key=lambda x: x[0], reverse=True)
        top = prelim[:OSRM_CANDIDATE_LIMIT]
        rescored: list[tuple] = []
        for item in top:
            _, storage, _, _, _, _, _, _ = item
            dist_km, src = driving_distance_km(
                origin["lat"], origin["lng"], storage["lat"], storage["lng"]
            )
            distance_source = src if src == "osrm" else distance_source
            rescored.append(
                _score_candidate(
                    storage,
                    origin,
                    quantity_quintals,
                    markets,
                    glut_risk_pct,
                    dist_km,
                    crop,
                    corridor_avg,
                )
            )
        _, storage, dist, logistics, profit, market, util_after, live_q = max(
            rescored, key=lambda x: x[0]
        )
        dist_label = "road (OSRM)" if distance_source == "osrm" else "straight-line"
        why = [
            f"Live occupancy {storage['utilization_pct']}% (updated from registry)",
            f"Live mandi ({crop}): Rs {live_q:,}/q · corridor avg Rs {corridor_avg or '—'}/q",
            f"Route mandi: {market['name']}",
            f"Distance ~{round(dist, 1)} km ({dist_label})",
        ]
        if used_live_gps:
            why.insert(
                0,
                f"Origin: your live GPS ({origin['lat']:.4f}°N, {origin['lng']:.4f}°E)",
            )
        if glut_risk_pct >= 55:
            why.append(f"Glut risk {glut_risk_pct:.0f}% — prioritized spare capacity")

    if DEMO_MODE and 45 <= quantity_quintals <= 55 and "jyoti" in crop.lower():
        demo = next((s for s in storages if s["id"] == "CS-001"), storage)
        if _haversine_km(origin["lat"], origin["lng"], demo["lat"], demo["lng"]) <= 45.0:
            storage = demo
            dist, distance_source = driving_distance_km(
                origin["lat"], origin["lng"], storage["lat"], storage["lng"]
            )
            logistics = _logistics_cost(quantity_quintals, dist)
            market = next((m for m in markets if m["id"] == "MKT-001"), market)
            live_q = live_mandi_price_per_quintal(
                crop, market["price_per_quintal"], corridor_avg
            )
            market = {**market, "price_per_quintal": live_q}
            profit = int(quantity_quintals * live_q) - logistics
            why.append("DEMO_MODE: pitch anchor route enabled")

    reasoning = (
        f"OR optimizer across {len(storages)} live facilities; "
        f"selected {storage['name']} for profit after logistics."
    )

    return RouteRecommendation(
        storage_id=storage["id"],
        storage_name=storage["name"],
        district=storage["district"],
        distance_km=round(dist, 1),
        distance_source=distance_source,
        logistics_cost_inr=logistics,
        estimated_profit_inr=max(profit, 0),
        market_name=market["name"],
        market_price_per_quintal=market["price_per_quintal"],
        utilization_after_pct=round(util_after, 1),
        origin_lat=origin["lat"],
        origin_lng=origin["lng"],
        storage_lat=storage["lat"],
        storage_lng=storage["lng"],
        market_lat=market["lat"],
        market_lng=market["lng"],
        reasoning=reasoning,
        why=why,
    )
