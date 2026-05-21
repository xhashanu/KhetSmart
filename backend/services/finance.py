from dataclasses import dataclass

CULTIVATION_COST_PER_QTL = 950
DISTRESS_SELL_PRICE_PER_QTL = 200
DISTRESS_PRICE_THRESHOLD = 1200


@dataclass
class LoanOffer:
    approved: bool
    amount_inr: int
    interest_rate_pa: float
    tenure_days: int
    bank_partner: str
    grn_id: str
    trigger_reason: str
    secured_by_grn: bool


def evaluate_loan(
    quantity_quintals: float,
    market_price_per_quintal: int,
    logistics_cost_inr: int,
    glut_risk_pct: float,
    storage_id: str,
) -> LoanOffer:
    effective_price = market_price_per_quintal
    if glut_risk_pct >= 65:
        effective_price = min(effective_price, DISTRESS_PRICE_THRESHOLD)

    below_cost = effective_price < CULTIVATION_COST_PER_QTL
    high_glut = glut_risk_pct >= 55
    approved = below_cost or high_glut or quantity_quintals >= 40

    if 45 <= quantity_quintals <= 55:
        amount = 8000 if approved else 0
    else:
        base = int(min(quantity_quintals * 160, 25000))
        amount = max(8000, base) if approved else 0

    if below_cost:
        reason = "Predictive model: prices below cultivation cost — distress sell risk"
    elif high_glut:
        reason = "Satellite yield signal: regional glut risk elevated"
    else:
        reason = "Pre-approved working capital against digital GRN collateral"

    grn_id = f"GRN-{storage_id}-{int(quantity_quintals)}Q"

    return LoanOffer(
        approved=approved,
        amount_inr=amount,
        interest_rate_pa=4.0 if approved else 0.0,
        tenure_days=90,
        bank_partner="Bandhan Bank (demo)",
        grn_id=grn_id,
        trigger_reason=reason,
        secured_by_grn=True,
    )
