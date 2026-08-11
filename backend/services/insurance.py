import json
from pathlib import Path

_DATA = Path(__file__).resolve().parent.parent / "data" / "insurance_plans.json"


def _load_plans() -> list[dict]:
    with open(_DATA, encoding="utf-8") as f:
        return json.load(f)


def list_insurance_offers(
    quantity_quintals: float = 50,
    glut_risk_pct: float = 50,
    crop: str = "Potato",
) -> dict:
    qty = max(1, min(quantity_quintals, 500))
    scale = qty / 50
    glut_boost = 1.15 if glut_risk_pct >= 55 else 1.0

    offers = []
    for plan in _load_plans():
        premium = int(plan["premium_per_50_qtl_inr"] * scale * glut_boost)
        coverage = int(plan["coverage_inr"] * scale)
        recommended = plan["type"] == "storage" and glut_risk_pct >= 50
        if glut_risk_pct >= 65 and plan["type"] == "crop":
            recommended = True

        offers.append(
            {
                **plan,
                "premium_inr": premium,
                "coverage_inr": coverage,
                "quantity_quintals": qty,
                "recommended": recommended,
            }
        )

    offers.sort(key=lambda x: (0 if x["recommended"] else 1, x["premium_inr"]))
    return {
        "plans": offers,
        "quantity_quintals": qty,
        "crop": crop,
        "recommended_plan_id": next((p["id"] for p in offers if p["recommended"]), offers[0]["id"] if offers else None),
    }
