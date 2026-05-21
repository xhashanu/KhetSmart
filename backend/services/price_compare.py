"""Distress-sell vs live mandi comparison for farmer impact messaging."""

from dataclasses import dataclass

from services.finance import CULTIVATION_COST_PER_QTL, DISTRESS_SELL_PRICE_PER_QTL


@dataclass
class PriceComparison:
    distress_price_per_quintal: int
    live_mandi_price_per_quintal: int
    cultivation_cost_per_quintal: int
    quantity_quintals: float
    revenue_at_live_inr: int
    revenue_at_distress_inr: int
    uplift_vs_distress_inr: int
    below_cultivation_cost: bool
    in_distress_zone: bool
    headline: str
    detail: str


def build_price_comparison(
    quantity_quintals: float,
    live_mandi_price_per_quintal: int,
) -> PriceComparison:
    q = quantity_quintals
    live = live_mandi_price_per_quintal
    distress = DISTRESS_SELL_PRICE_PER_QTL
    cult = CULTIVATION_COST_PER_QTL

    revenue_live = int(q * live)
    revenue_distress = int(q * distress)
    uplift = revenue_live - revenue_distress
    below_cost = live < cult
    in_distress = live <= distress + 100 or below_cost

    if uplift > 0:
        headline = f"Routing saves {uplift:,} vs distress-sell at Rs {distress}/q"
        detail = (
            f"Live mandi near your route: Rs {live:,}/quintal. "
            f"Distress floor in glut: Rs {distress:,}/q (pitch benchmark)."
        )
    else:
        headline = "Live mandi near distress band — micro-loan + cold route critical"
        detail = (
            f"Mandi Rs {live:,}/q vs distress Rs {distress:,}/q. "
            f"Cultivation cost ~Rs {cult:,}/q."
        )

    return PriceComparison(
        distress_price_per_quintal=distress,
        live_mandi_price_per_quintal=live,
        cultivation_cost_per_quintal=cult,
        quantity_quintals=q,
        revenue_at_live_inr=revenue_live,
        revenue_at_distress_inr=revenue_distress,
        uplift_vs_distress_inr=uplift,
        below_cultivation_cost=below_cost,
        in_distress_zone=in_distress,
        headline=headline,
        detail=detail,
    )
