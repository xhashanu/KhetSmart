import json
from pathlib import Path

from services.osrm_client import _haversine_km
from services.router import _logistics_cost

_DATA = Path(__file__).resolve().parent.parent / "data" / "logistics_vendors.json"


def _load_vendors() -> list[dict]:
    with open(_DATA, encoding="utf-8") as f:
        return json.load(f)


def _max_vehicle_capacity(vendor: dict) -> int:
    vehicles = vendor.get("vehicles") or []
    if not vehicles:
        return 0
    return max(v["capacity_quintals"] for v in vehicles)


def _total_available_units(vendor: dict) -> int:
    return sum(v.get("available", 0) for v in vendor.get("vehicles") or [])


def _quote_inr(vendor: dict, quantity_quintals: float, distance_km: float) -> int:
    base = vendor.get("price_per_50_qtl_base") or 5000
    corridor = _logistics_cost(quantity_quintals, distance_km)
    blended = int(base * (quantity_quintals / 50) * (1 + distance_km / 120))
    return min(blended, int(corridor * 1.15))


def list_logistics_vendors(
    quantity_quintals: float = 50,
    farmer_lat: float | None = None,
    farmer_lng: float | None = None,
    destination_lat: float | None = None,
    destination_lng: float | None = None,
    destination_name: str | None = None,
) -> dict:
    origin_lat = farmer_lat if farmer_lat is not None else 23.25
    origin_lng = farmer_lng if farmer_lng is not None else 87.85
    dest_lat = destination_lat if destination_lat is not None else origin_lat
    dest_lng = destination_lng if destination_lng is not None else origin_lng

    route_distance_km = _haversine_km(origin_lat, origin_lng, dest_lat, dest_lng)

    ranked: list[dict] = []
    for v in _load_vendors():
        pickup_km = _haversine_km(origin_lat, origin_lng, v["lat"], v["lng"])
        max_cap = _max_vehicle_capacity(v)
        can_carry = max_cap >= quantity_quintals or _total_available_units(v) >= 2
        vehicles_available = _total_available_units(v)
        quote = _quote_inr(v, quantity_quintals, route_distance_km + pickup_km * 0.3)

        ranked.append(
            {
                "id": v["id"],
                "name": v["name"],
                "district": v["district"],
                "phone": v["phone"],
                "rating": v["rating"],
                "services": v["services"],
                "vehicles": v["vehicles"],
                "pickup_distance_km": round(pickup_km, 1),
                "route_distance_km": round(route_distance_km, 1),
                "estimated_quote_inr": quote,
                "vehicles_available": vehicles_available,
                "max_capacity_quintals": max_cap,
                "can_carry_load": can_carry,
                "destination_name": destination_name,
            }
        )

    ranked.sort(
        key=lambda x: (
            0 if x["can_carry_load"] else 1,
            x["pickup_distance_km"],
            -x["rating"],
        )
    )

    recommended_id = ranked[0]["id"] if ranked else None

    return {
        "vendors": ranked,
        "recommended_vendor_id": recommended_id,
        "quantity_quintals": quantity_quintals,
        "destination_name": destination_name,
        "route_distance_km": round(route_distance_km, 1),
    }
