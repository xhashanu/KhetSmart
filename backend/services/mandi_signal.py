"""Live corridor mandi prices → glut-risk adjustment for Predict pillar."""
from __future__ import annotations

from sqlalchemy.orm import Session

from models import MandiPrice
from services.finance import CULTIVATION_COST_PER_QTL, DISTRESS_SELL_PRICE_PER_QTL

# Typical WB potato wholesale band (₹/quintal) for corridor markets
CORRIDOR_HEALTHY_PRICE = 1850
CORRIDOR_SOFT_PRICE = 1600
CORRIDOR_WEAK_PRICE = 1200


def corridor_mandi_stats(db: Session) -> dict:
    """Latest mandi rows from DB (refreshed by daily ingest / data.gov.in)."""
    rows = db.query(MandiPrice.price_per_quintal).all()
    prices = [int(r[0]) for r in rows if r[0] is not None]
    if not prices:
        return {
            "markets": 0,
            "avg_price": None,
            "min_price": None,
            "max_price": None,
            "glut_adjust": 0,
            "signal": "no_mandi_data",
            "detail": "Run daily mandi ingest for live price signal.",
        }

    avg = sum(prices) / len(prices)
    mn = min(prices)
    mx = max(prices)
    adjust, signal, detail = _adjust_from_prices(avg, mn)

    return {
        "markets": len(prices),
        "avg_price": int(round(avg)),
        "min_price": mn,
        "max_price": mx,
        "glut_adjust": adjust,
        "signal": signal,
        "detail": detail,
    }


def _adjust_from_prices(avg: float, min_price: int) -> tuple[int, str, str]:
    """
    Lower mandi → higher glut risk (oversupply / distress selling).
    Returns (adjustment points to add to base glut, signal code, human detail).
    """
    adjust = 0

    if avg <= DISTRESS_SELL_PRICE_PER_QTL + 150:
        adjust = 20
        signal = "distress_band"
        detail = (
            f"Corridor mandi avg Rs {int(avg):,}/q near distress floor "
            f"(Rs {DISTRESS_SELL_PRICE_PER_QTL}/q) — glut pressure elevated."
        )
    elif avg < CULTIVATION_COST_PER_QTL:
        adjust = 14
        signal = "below_cost"
        detail = (
            f"Mandi avg Rs {int(avg):,}/q below cultivation cost "
            f"(Rs {CULTIVATION_COST_PER_QTL:,}/q) — farmers at loss risk."
        )
    elif avg < CORRIDOR_WEAK_PRICE:
        adjust = 10
        signal = "weak_market"
        detail = f"Mandi avg Rs {int(avg):,}/q — soft corridor prices, oversupply likely."
    elif avg < CORRIDOR_SOFT_PRICE:
        adjust = 6
        signal = "softening"
        detail = f"Mandi avg Rs {int(avg):,}/q below healthy band (Rs {CORRIDOR_HEALTHY_PRICE:,}/q)."
    elif avg < CORRIDOR_HEALTHY_PRICE:
        adjust = 2
        signal = "neutral"
        detail = f"Mandi avg Rs {int(avg):,}/q — moderate corridor prices."
    else:
        adjust = -4
        signal = "firm_prices"
        detail = f"Mandi avg Rs {int(avg):,}/q — firm prices ease glut signal slightly."

    if min_price < CORRIDOR_WEAK_PRICE and adjust < 18:
        adjust += 4
        detail += f" Floor market at Rs {min_price:,}/q pulls signal up."

    return max(-8, min(22, adjust)), signal, detail


def blend_glut_with_mandi(base_glut: int, mandi: dict) -> int:
    """Apply mandi adjustment on top of NDVI + storage base glut."""
    adj = int(mandi.get("glut_adjust") or 0)
    return max(25, min(92, base_glut + adj))
