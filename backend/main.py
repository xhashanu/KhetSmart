from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

load_dotenv()

from config import ADMIN_API_KEY, CORS_ORIGINS, DEMO_MODE
from database import get_db
from ingest.ingest_mandi import ingest_mandi_prices
from ingest.ingest_ndvi import ingest_ndvi
from services.finance import evaluate_loan
from services.price_compare import build_price_comparison
from services.nlp_parser import needs_confirmation, parse_farmer_message
from services.router import recommend_route
from services.storage_repo import list_storages, update_storage_utilization, count_storages
from services.yield_service import get_latest_yield, to_legacy_forecast
from startup import init_database
from deps import verify_admin


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_database()
    yield


app = FastAPI(
    title="KhetSmart API",
    description="Predict · Route · Finance — production data layer",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ParseRequest(BaseModel):
    text: str = Field(..., examples=["Amar 50 quintal Jyoti aloo ache"])


class RouteRequest(BaseModel):
    quantity_quintals: float = 50
    crop: str = "Jyoti Potato"
    district: str | None = None
    glut_risk_pct: float = 0


class ConsultRequest(BaseModel):
    text: str
    farmer_lat: float | None = None
    farmer_lng: float | None = None
    quantity_quintals: float | None = None
    crop: str | None = None
    district: str | None = None


class StorageUpdateRequest(BaseModel):
    utilization_pct: int = Field(..., ge=0, le=100)


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    return {
        "status": "ok",
        "product": "KhetSmart",
        "demo_mode": DEMO_MODE,
        "storages": count_storages(db),
        "data_layer": "sqlite/postgres",
    }


@app.get("/api/yield/forecast")
def yield_forecast(region: str = "Damodar River Basin", db: Session = Depends(get_db)):
    from models import ColdStorage
    from sqlalchemy import func

    from services.yield_model import alert_from_glut, live_forecast_layers

    dto = get_latest_yield(db, region)
    live = live_forecast_layers(db, dto.ndvi_index)
    mandi = live["mandi"]
    weather = live["layers"]["weather"]
    soil = live["layers"]["soil"]
    veg = live["layers"]["vegetation"]

    alert, insight = alert_from_glut(live["glut_risk_pct"])
    extras = []
    moisture = live["layers"].get("moisture") or {}
    nitrogen = live.get("nitrogen") or live["layers"].get("nitrogen") or {}
    if nitrogen.get("headline") and nitrogen.get("priority") in ("high", "medium"):
        extras.append(nitrogen["recommendation"])
    if moisture.get("detail"):
        extras.append(moisture["detail"])
    elif weather.get("detail"):
        extras.append(weather["detail"])
    if soil.get("detail"):
        extras.append(soil["detail"])
    if mandi.get("glut_adjust", 0) >= 6 and mandi.get("detail"):
        extras.append(mandi["detail"])
    if extras:
        insight = f"{insight} {' '.join(extras[:2])}"

    avg_util = db.query(func.avg(ColdStorage.utilization_pct)).scalar() or 0
    critical = db.query(ColdStorage).filter(ColdStorage.utilization_pct >= 85).count()
    total = count_storages(db)
    return {
        "region": dto.region,
        "ndvi": live["ndvi"],
        "savi": live["savi"],
        "gndvi": live["gndvi"],
        "veg_index": live["veg_index"],
        "predicted_yield_million_quintals": live["predicted_yield_million_quintals"],
        "glut_risk_pct": live["glut_risk_pct"],
        "glut_base_pct": live["glut_base_pct"],
        "weeks_to_harvest": live["weeks_to_harvest"],
        "satellite_source": live["satellite_source"],
        "lulc_potato_acres": dto.lulc_potato_acres,
        "alert_level": alert,
        "insight": insight,
        "data_source": dto.data_source,
        "recorded_at": dto.recorded_at,
        "storages_total": total,
        "storages_critical": critical,
        "avg_storage_util_pct": round(float(avg_util), 1),
        "mandi_avg_price": mandi.get("avg_price"),
        "mandi_min_price": mandi.get("min_price"),
        "mandi_markets": mandi.get("markets"),
        "mandi_glut_adjust": mandi.get("glut_adjust"),
        "mandi_signal": mandi.get("signal"),
        "environment_layers": live["layers"],
        "nitrogen_advisory": nitrogen,
    }


@app.get("/api/yield/copernicus/status")
def copernicus_status():
    from services.copernicus_ndvi import fetch_corridor_ndvi, get_access_token
    from config import COPERNICUS_CLIENT_ID, COPERNICUS_CLIENT_SECRET, COPERNICUS_API_KEY

    has_creds = bool(COPERNICUS_CLIENT_ID and (COPERNICUS_CLIENT_SECRET or COPERNICUS_API_KEY))
    token_ok = bool(get_access_token()) if has_creds else False
    result = fetch_corridor_ndvi() if has_creds else None
    return {
        "configured": has_creds,
        "token_ok": token_ok,
        "ndvi_ok": result.ok if result else False,
        "ndvi": result.ndvi if result and result.ok else None,
        "savi": result.savi if result and result.ok else None,
        "gndvi": result.gndvi if result and result.ok else None,
        "intervals": result.intervals if result else 0,
        "message": result.message if result else "Add COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET to .env",
        "source": result.source if result else None,
    }


@app.get("/api/yield/history")
def yield_history(
    region: str = "Damodar River Basin",
    limit: int = Query(12, le=52),
    db: Session = Depends(get_db),
):
    from models import YieldSnapshot

    snaps = (
        db.query(YieldSnapshot)
        .filter(YieldSnapshot.region == region)
        .order_by(YieldSnapshot.recorded_at.asc())
        .limit(limit)
        .all()
    )
    if not snaps:
        import csv
        from config import DATA_DIR

        path = DATA_DIR / "ndvi_history.csv"
        if path.exists():
            with open(path, newline="", encoding="utf-8") as f:
                rows = list(csv.DictReader(f))[-limit:]
            return {
                "points": [
                    {
                        "recorded_at": r["recorded_at"],
                        "ndvi": float(r["ndvi"]),
                        "glut_risk_pct": int(r["glut_risk_pct"]),
                    }
                    for r in rows
                ]
            }
        return {"points": []}

    return {
        "points": [
            {
                "recorded_at": s.recorded_at.isoformat() if s.recorded_at else None,
                "ndvi": s.ndvi_index,
                "glut_risk_pct": s.glut_risk_pct,
            }
            for s in snaps
        ]
    }


@app.get("/api/storages")
def get_storages(
    for_map: bool = Query(False),
    db: Session = Depends(get_db),
):
    return list_storages(db, for_map=for_map)


@app.get("/api/prices")
def get_prices(db: Session = Depends(get_db)):
    from services.price_repo import list_markets

    return list_markets(db)


@app.post("/api/nlp/parse")
def nlp_parse(body: ParseRequest):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text_required")
    parsed = parse_farmer_message(text)
    return {
        "quantity_quintals": parsed.quantity_quintals,
        "crop": parsed.crop,
        "district": parsed.district,
        "confidence": parsed.confidence,
        "raw_text": parsed.raw_text,
        "quantity_found": parsed.quantity_found,
        "needs_confirmation": needs_confirmation(parsed),
    }


@app.post("/api/route/recommend")
def route_recommend(body: RouteRequest, db: Session = Depends(get_db)):
    r = recommend_route(
        db, body.quantity_quintals, body.crop, body.district, body.glut_risk_pct
    )
    return {
        "storage_id": r.storage_id,
        "storage_name": r.storage_name,
        "district": r.district,
        "distance_km": r.distance_km,
        "distance_source": r.distance_source,
        "origin_lat": r.origin_lat,
        "origin_lng": r.origin_lng,
        "storage_lat": r.storage_lat,
        "storage_lng": r.storage_lng,
        "market_lat": r.market_lat,
        "market_lng": r.market_lng,
        "logistics_cost_inr": r.logistics_cost_inr,
        "estimated_profit_inr": r.estimated_profit_inr,
        "market_name": r.market_name,
        "market_price_per_quintal": r.market_price_per_quintal,
        "utilization_after_pct": r.utilization_after_pct,
        "reasoning": r.reasoning,
        "why": r.why,
    }


@app.post("/api/finance/offer")
def finance_offer(body: RouteRequest, db: Session = Depends(get_db)):
    forecast = to_legacy_forecast(get_latest_yield(db))
    route = recommend_route(
        db,
        body.quantity_quintals,
        body.crop,
        body.district,
        forecast.glut_risk_pct,
    )
    loan = evaluate_loan(
        body.quantity_quintals,
        route.market_price_per_quintal,
        route.logistics_cost_inr,
        forecast.glut_risk_pct,
        route.storage_id,
    )
    return {
        "approved": loan.approved,
        "amount_inr": loan.amount_inr,
        "interest_rate_pa": loan.interest_rate_pa,
        "tenure_days": loan.tenure_days,
        "bank_partner": loan.bank_partner,
        "grn_id": loan.grn_id,
        "trigger_reason": loan.trigger_reason,
        "secured_by_grn": loan.secured_by_grn,
    }


@app.post("/api/consult")
def farmer_consult(body: ConsultRequest, db: Session = Depends(get_db)):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text_required")
    parsed = parse_farmer_message(text)
    qty = body.quantity_quintals if body.quantity_quintals is not None else parsed.quantity_quintals
    crop = body.crop or parsed.crop
    district = body.district if body.district is not None else parsed.district
    if qty <= 0 or qty > 10_000:
        raise HTTPException(status_code=400, detail="invalid_quantity")
    dto = get_latest_yield(db)
    forecast = to_legacy_forecast(dto)
    route = recommend_route(
        db,
        qty,
        crop,
        district,
        forecast.glut_risk_pct,
        farmer_lat=body.farmer_lat,
        farmer_lng=body.farmer_lng,
    )
    loan = evaluate_loan(
        qty,
        route.market_price_per_quintal,
        route.logistics_cost_inr,
        forecast.glut_risk_pct,
        route.storage_id,
    )
    price_cmp = build_price_comparison(
        qty,
        route.market_price_per_quintal,
    )
    return {
        "parsed": {
            "quantity_quintals": qty,
            "crop": crop,
            "district": district,
            "confidence": parsed.confidence,
            "quantity_found": parsed.quantity_found,
            "user_confirmed": body.quantity_quintals is not None or body.crop is not None,
        },
        "yield_signal": {
            "glut_risk_pct": forecast.glut_risk_pct,
            "alert_level": forecast.alert_level,
            "ndvi": forecast.ndvi_index,
            "insight": forecast.insight,
            "data_source": dto.data_source,
            "recorded_at": dto.recorded_at,
        },
        "route": {
            "storage_id": route.storage_id,
            "storage_name": route.storage_name,
            "district": route.district,
            "distance_km": route.distance_km,
            "distance_source": route.distance_source,
            "logistics_cost_inr": route.logistics_cost_inr,
            "estimated_profit_inr": route.estimated_profit_inr,
            "market_price_per_quintal": route.market_price_per_quintal,
            "market_name": route.market_name,
            "origin_lat": route.origin_lat,
            "origin_lng": route.origin_lng,
            "storage_lat": route.storage_lat,
            "storage_lng": route.storage_lng,
            "market_lat": route.market_lat,
            "market_lng": route.market_lng,
            "why": route.why,
        },
        "price_comparison": {
            "distress_price_per_quintal": price_cmp.distress_price_per_quintal,
            "live_mandi_price_per_quintal": price_cmp.live_mandi_price_per_quintal,
            "cultivation_cost_per_quintal": price_cmp.cultivation_cost_per_quintal,
            "quantity_quintals": price_cmp.quantity_quintals,
            "revenue_at_live_inr": price_cmp.revenue_at_live_inr,
            "revenue_at_distress_inr": price_cmp.revenue_at_distress_inr,
            "uplift_vs_distress_inr": price_cmp.uplift_vs_distress_inr,
            "below_cultivation_cost": price_cmp.below_cultivation_cost,
            "in_distress_zone": price_cmp.in_distress_zone,
            "headline": price_cmp.headline,
            "detail": price_cmp.detail,
        },
        "loan": {
            "approved": loan.approved,
            "amount_inr": loan.amount_inr,
            "interest_rate_pa": loan.interest_rate_pa,
            "bank_partner": loan.bank_partner,
            "grn_id": loan.grn_id,
            "trigger_reason": loan.trigger_reason,
        },
    }


# --- Admin / ops (set ADMIN_API_KEY in .env) ---


@app.get("/api/admin/config")
def admin_config():
    from deps import admin_auth_required

    return {
        "auth_required": admin_auth_required(),
        "hint": "Set ADMIN_API_KEY in backend/.env and pass X-Admin-Key from Ops tab.",
    }


@app.post("/api/admin/verify")
def admin_verify(x_admin_key: str | None = Header(None, alias="X-Admin-Key")):
    from deps import admin_auth_required

    if not admin_auth_required():
        return {"ok": True, "auth_required": False}
    if x_admin_key != ADMIN_API_KEY:
        raise HTTPException(401, "Invalid admin key")
    return {"ok": True, "auth_required": True}


@app.post("/api/admin/registry/import", dependencies=[Depends(verify_admin)])
def admin_import_registry(
    replace: bool = True,
    db: Session = Depends(get_db),
):
    from ingest.import_registry import import_registry

    return import_registry(db, replace=replace)


@app.post("/api/admin/jobs/daily", dependencies=[Depends(verify_admin)])
def admin_run_daily_job():
    from ingest.fetch_mandi_datagov import fetch_and_write_csv
    from database import SessionLocal
    from ingest.ingest_mandi import ingest_mandi_prices

    meta = fetch_and_write_csv()
    db = SessionLocal()
    try:
        meta["db_rows"] = ingest_mandi_prices(db)
    finally:
        db.close()
    return meta


@app.post("/api/admin/jobs/weekly", dependencies=[Depends(verify_admin)])
def admin_run_weekly_job(db: Session = Depends(get_db)):
    from ingest.fetch_ndvi_weekly import run_weekly

    return run_weekly(db)


@app.get("/api/admin/districts", dependencies=[Depends(verify_admin)])
def admin_districts(db: Session = Depends(get_db)):
    from models import ColdStorage
    from sqlalchemy import func

    rows = (
        db.query(ColdStorage.district, func.count(ColdStorage.id))
        .group_by(ColdStorage.district)
        .order_by(ColdStorage.district)
        .all()
    )
    return [{"district": d, "count": c} for d, c in rows]


@app.patch("/api/admin/storages/{storage_id}", dependencies=[Depends(verify_admin)])
def admin_update_storage(
    storage_id: str,
    body: StorageUpdateRequest,
    db: Session = Depends(get_db),
):
    updated = update_storage_utilization(db, storage_id, body.utilization_pct)
    if not updated:
        raise HTTPException(404, "Storage not found")
    ingest_ndvi(db)
    return updated


@app.post("/api/admin/ingest/mandi", dependencies=[Depends(verify_admin)])
def admin_ingest_mandi(db: Session = Depends(get_db)):
    n = ingest_mandi_prices(db)
    return {"ingested": n, "source": "mandi_prices.csv or markets.json"}


@app.post("/api/admin/ingest/ndvi", dependencies=[Depends(verify_admin)])
def admin_ingest_ndvi(db: Session = Depends(get_db)):
    snap = ingest_ndvi(db)
    return {
        "glut_risk_pct": snap.glut_risk_pct,
        "ndvi": snap.ndvi_index,
        "recorded_at": snap.recorded_at.isoformat(),
    }


@app.get("/api/admin/storages", dependencies=[Depends(verify_admin)])
def admin_list_storages(
    q: str | None = None,
    district: str | None = None,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    from models import ColdStorage

    query = db.query(ColdStorage)
    if district:
        query = query.filter(ColdStorage.district == district)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (ColdStorage.name.ilike(like)) | (ColdStorage.district.ilike(like))
        )
    rows = query.order_by(ColdStorage.utilization_pct.desc()).limit(limit).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "district": s.district,
            "utilization_pct": s.utilization_pct,
            "available_quintals": s.available_quintals,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in rows
    ]
