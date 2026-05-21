"""Nitrogen recommendation from GNDVI thresholds — West Bengal potato corridor."""
from __future__ import annotations

# GNDVI chlorophyll / N proxy bands (Sentinel-2 corridor calibration)
GNDVI_CRITICAL = 0.38
GNDVI_LOW = 0.43
GNDVI_ADEQUATE = 0.50
GNDVI_HIGH = 0.56

# Suggested side-dress N (kg/ha) — indicative for demo / extension messaging
N_DOSE_URGENT = "40–60"
N_DOSE_MODERATE = "25–40"
N_DOSE_LIGHT = "15–25"
N_DOSE_NONE = "0"


def nitrogen_from_gndvi(
    gndvi: float,
    ndvi: float | None = None,
    weeks_to_harvest: int | None = None,
) -> dict:
    """
    Potato-specific advisory from GNDVI (chlorophyll-sensitive index).

    Tuber bulking (low NDVI, late season): suppress high-N advice to avoid overshoot.
    """
    g = round(float(gndvi), 4)
    ndvi = float(ndvi) if ndvi is not None else 0.55
    weeks = int(weeks_to_harvest) if weeks_to_harvest is not None else 4
    tuber_phase = ndvi < 0.52 or weeks <= 4

    if tuber_phase and g >= GNDVI_ADEQUATE:
        return _pack(
            level="hold",
            priority="low",
            headline="Hold nitrogen — tuber bulking phase",
            recommendation=(
                "GNDVI adequate for late canopy; avoid extra N to prevent vine overshoot "
                "and poor tuber sizing."
            ),
            suggested_kg_ha=N_DOSE_NONE,
            gndvi=g,
            band="tuber_bulking_adequate",
        )

    if g < GNDVI_CRITICAL:
        return _pack(
            level="critical",
            priority="high",
            headline="Critical N stress (GNDVI)",
            recommendation=(
                f"GNDVI {g:.3f} below {GNDVI_CRITICAL:.2f} — chlorophyll/N deficiency likely. "
                f"Urgent side-dress {N_DOSE_URGENT} kg N/ha (urea split) within 3–5 days if "
                "before final tuber swell; else focus on irrigation."
            ),
            suggested_kg_ha=N_DOSE_URGENT,
            gndvi=g,
            band="critical",
        )

    if g < GNDVI_LOW:
        dose = N_DOSE_LIGHT if tuber_phase else N_DOSE_MODERATE
        return _pack(
            level="moderate",
            priority="medium",
            headline="Moderate N deficiency (GNDVI)",
            recommendation=(
                f"GNDVI {g:.3f} in {GNDVI_CRITICAL:.2f}–{GNDVI_LOW:.2f} band — "
                f"consider side-dress {dose} kg N/ha and verify with petiole nitrate if possible."
            ),
            suggested_kg_ha=dose,
            gndvi=g,
            band="moderate",
        )

    if g < GNDVI_ADEQUATE:
        dose = N_DOSE_NONE if tuber_phase else N_DOSE_LIGHT
        msg = (
            f"GNDVI {g:.3f} borderline — monitor weekly; light {dose} kg N/ha only if "
            "vegetative stage persists."
            if dose != N_DOSE_NONE
            else f"GNDVI {g:.3f} borderline but tuber phase — monitor only, no side-dress."
        )
        return _pack(
            level="watch",
            priority="low",
            headline="Borderline chlorophyll (GNDVI)",
            recommendation=msg,
            suggested_kg_ha=dose,
            gndvi=g,
            band="borderline",
        )

    if g < GNDVI_HIGH:
        return _pack(
            level="adequate",
            priority="low",
            headline="Adequate canopy nitrogen",
            recommendation=(
                f"GNDVI {g:.3f} in optimal chlorophyll band ({GNDVI_ADEQUATE:.2f}–{GNDVI_HIGH:.2f}) — "
                "maintain scheduled N; no extra side-dress."
            ),
            suggested_kg_ha=N_DOSE_NONE,
            gndvi=g,
            band="adequate",
        )

    if ndvi >= 0.60:
        return _pack(
            level="excess_risk",
            priority="medium",
            headline="High vigor — excess N risk",
            recommendation=(
                f"GNDVI {g:.3f} high with NDVI {ndvi:.2f} — delay any N; risk of lush canopy "
                "and reduced tuber dry matter."
            ),
            suggested_kg_ha=N_DOSE_NONE,
            gndvi=g,
            band="high_vigor",
        )

    return _pack(
        level="adequate",
        priority="low",
        headline="Strong chlorophyll signal",
        recommendation=f"GNDVI {g:.3f} — canopy N status strong; follow standard program.",
        suggested_kg_ha=N_DOSE_NONE,
        gndvi=g,
        band="high_chlorophyll",
    )


def _pack(
    level: str,
    priority: str,
    headline: str,
    recommendation: str,
    suggested_kg_ha: str,
    gndvi: float,
    band: str,
) -> dict:
    return {
        "ok": True,
        "level": level,
        "priority": priority,
        "headline": headline,
        "recommendation": recommendation,
        "suggested_n_kg_per_ha": suggested_kg_ha,
        "gndvi": gndvi,
        "gndvi_band": band,
        "thresholds": {
            "critical_below": GNDVI_CRITICAL,
            "low_below": GNDVI_LOW,
            "adequate_below": GNDVI_ADEQUATE,
            "high_above": GNDVI_HIGH,
        },
        "source": "GNDVI chlorophyll thresholds (potato corridor)",
    }
