from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
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
from services.auction import list_auctions
from services.insurance import list_insurance_offers
from services.logistics_vendors import list_logistics_vendors
from services.router import recommend_route
from services.storage_repo import list_storages, update_storage_utilization, count_storages
from services.yield_service import get_latest_yield, to_legacy_forecast
from startup import init_database
from deps import verify_admin
from services.farmer_auth import (
    farmer_to_dict,
    get_farmer_by_token,
    login_farmer,
    logout_farmer,
    set_farmer_pin,
    signup_farmer,
)
from services.farmer_otp import complete_signup_after_otp, send_otp, verify_otp


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


class ConverseRequest(BaseModel):
    text: str | None = Field(None, examples=["Amar 50 quintal Jyoti aloo ache"])
    audio_base64: str | None = None
    audio_mime: str | None = None
    context: dict | None = None
    conversation_history: list[dict] | None = None
    conversation_state: dict | None = None
    farmer_lat: float | None = None
    farmer_lng: float | None = None


class StorageUpdateRequest(BaseModel):
    utilization_pct: int = Field(..., ge=0, le=100)


class FarmerSignupRequest(BaseModel):
    phone: str = Field(..., examples=["9876543210"])
    name: str = Field(..., min_length=2, max_length=120)
    pin: str = Field(..., min_length=4, max_length=6, examples=["1234"])
    district: str | None = None


class FarmerLoginRequest(BaseModel):
    phone: str = Field(..., examples=["9876543210"])
    pin: str = Field(..., min_length=4, max_length=6)


class OtpSendRequest(BaseModel):
    phone: str = Field(..., examples=["9876543210"])


class OtpVerifyRequest(BaseModel):
    phone: str = Field(..., examples=["9876543210"])
    otp: str = Field(..., min_length=6, max_length=6)


class OtpCompleteSignupRequest(BaseModel):
    signup_token: str
    name: str = Field(..., min_length=2, max_length=120)
    district: str | None = None


class SetPinRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=6)
    pin_confirm: str = Field(..., min_length=4, max_length=6)


def _auth_response(farmer, token: str) -> dict:
    return {
        "token": token,
        "farmer": farmer_to_dict(farmer),
    }


@app.post("/api/auth/otp/send")
def auth_otp_send(body: OtpSendRequest, db: Session = Depends(get_db)):
    return send_otp(db, body.phone)


@app.post("/api/auth/otp/verify")
def auth_otp_verify(body: OtpVerifyRequest, db: Session = Depends(get_db)):
    return verify_otp(db, body.phone, body.otp)


@app.post("/api/auth/otp/complete-signup")
def auth_otp_complete_signup(
    body: OtpCompleteSignupRequest, db: Session = Depends(get_db)
):
    return complete_signup_after_otp(
        db, body.signup_token, body.name, body.district
    )


@app.post("/api/auth/pin/set")
def auth_set_pin(
    body: SetPinRequest,
    db: Session = Depends(get_db),
    authorization: str | None = Header(None),
):
    if body.pin != body.pin_confirm:
        raise HTTPException(400, detail="pin_mismatch")
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    farmer = get_farmer_by_token(db, token)
    if not farmer:
        raise HTTPException(401, detail="not_authenticated")
    set_farmer_pin(db, farmer, body.pin)
    return {"ok": True, "farmer": farmer_to_dict(farmer)}


@app.post("/api/auth/signup")
def farmer_signup(body: FarmerSignupRequest, db: Session = Depends(get_db)):
    farmer, token = signup_farmer(
        db, body.phone, body.name, body.pin, body.district
    )
    return _auth_response(farmer, token)


@app.post("/api/auth/login")
def farmer_login(body: FarmerLoginRequest, db: Session = Depends(get_db)):
    farmer, token = login_farmer(db, body.phone, body.pin)
    return _auth_response(farmer, token)


@app.get("/api/auth/me")
def farmer_me(
    db: Session = Depends(get_db),
    authorization: str | None = Header(None),
):
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    farmer = get_farmer_by_token(db, token)
    if not farmer:
        raise HTTPException(401, detail="not_authenticated")
    return {"farmer": farmer_to_dict(farmer)}


@app.post("/api/auth/logout")
def farmer_logout(
    db: Session = Depends(get_db),
    authorization: str | None = Header(None),
):
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    logout_farmer(db, token)
    return {"ok": True}


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
def yield_forecast(
    region: str = "Damodar River Basin",
    lat: float | None = None,
    lng: float | None = None,
    db: Session = Depends(get_db),
):
    from models import ColdStorage
    from sqlalchemy import func

    from services.yield_model import alert_from_glut, live_forecast_layers

    dto = get_latest_yield(db, region)
    if not dto:
        raise HTTPException(status_code=404, detail="no_yield_data: no NDVI/yield snapshot available. Run ingest or seed data.")
    live = live_forecast_layers(
        db,
        dto.ndvi_index,
        farmer_lat=lat,
        farmer_lng=lng,
    )
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
        "weather_location": {
            "lat": lat,
            "lng": lng,
            "using_gps": lat is not None and lng is not None,
        },
    }


@app.get("/api/weather")
def farmer_weather(
    lat: float,
    lng: float,
    force_refresh: bool = False,
):
    from services.weather_engine import fetch_farmer_weather

    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="invalid_coordinates")
    return fetch_farmer_weather(lat, lng, force_refresh=force_refresh)


def _weather_prompt_block(weather: dict) -> str:
    temp_range = weather.get("temp_range") or (
        f"{weather.get('temp_min_c_30d', '—')}°C – {weather.get('temp_max_c_30d', '—')}°C"
    )
    precip = weather.get("precipitation_mm") or weather.get("precip_mm_14d", "—")
    if isinstance(precip, (int, float)):
        precip = f"{precip} mm"
    lines = [
        f"- Data source: {weather.get('source', 'corridor')}",
        f"- Live location: {weather.get('location_name', 'Damodar corridor')}",
        f"- Current temperature: {weather.get('current_temp_c', '—')}°C (feels {weather.get('feels_like_c', '—')}°C)",
        f"- Sky / conditions: {weather.get('weather_description', weather.get('weather_main', '—'))}",
        f"- Humidity: {weather.get('humidity_pct', '—')}% · Wind: {weather.get('wind_kph', '—')} km/h",
        f"- Temperature range (today): {temp_range}",
        f"- Corridor 30d max/min mean: {weather.get('temp_max_c_30d')}°C / {weather.get('temp_min_c_30d')}°C / {weather.get('temp_mean_c_30d')}°C",
        f"- Precipitation signal: {precip} · 14d corridor rain: {weather.get('precip_mm_14d', '—')} mm",
        f"- Heat stress days (30d): {weather.get('heat_stress_days_30d', 0)} · Frost risk days (30d): {weather.get('frost_risk_days_30d', 0)}",
        f"- Wet/dry anomaly: {weather.get('wet_dry_anomaly', 'normal')}",
        f"- Solar radiation 30d avg: {weather.get('solar_radiation_mj_m2_30d', '—')} MJ/m²",
        f"- Yield weather factor: ×{weather.get('yield_factor', 1)}",
    ]
    if weather.get("forecast_days"):
        fc = weather["forecast_days"][:3]
        fc_txt = "; ".join(
            f"{d.get('label')}: {d.get('temp_min_c')}–{d.get('temp_max_c')}°C, rain {d.get('rain_mm')}mm"
            for d in fc
        )
        lines.append(f"- 5-day forecast (live): {fc_txt}")
    if weather.get("stresses"):
        lines.append(f"- Stress flags: {'; '.join(weather['stresses'][:4])}")
    return "\n    ".join(lines)


@app.get("/api/yield/ai-prediction")
def yield_ai_prediction(
    lang: str = "bn",
    lat: float | None = None,
    lng: float | None = None,
    db: Session = Depends(get_db),
):
    import json
    import urllib.request

    from config import GEMINI_API_KEY
    from services.yield_service import get_latest_yield
    from services.yield_model import live_forecast_layers

    dto = get_latest_yield(db)
    if not dto:
        raise HTTPException(status_code=404, detail="no_yield_data: no NDVI/yield snapshot available. Run ingest or seed data.")
    live = live_forecast_layers(db, dto.ndvi_index, farmer_lat=lat, farmer_lng=lng)
    veg = live["layers"]["vegetation"]
    weather = live["layers"]["weather"]
    soil = live["layers"]["soil"]
    moisture = live["layers"].get("moisture") or {}
    mandi = live["mandi"]
    pressure = live["layers"]["pressure"]
    glut = live["glut_risk_pct"]

    api_key = (GEMINI_API_KEY or "").strip()

    # Mapped language name
    lang_name = "English"
    if lang == "bn":
        lang_name = "Bengali / বাংলা"
    elif lang == "hi":
        lang_name = "Hindi / हिन्दी"

    prompt = f"""
    You are KhetSmart's Senior Agronomist and AI Predictive Brain for West Bengal potato farming.
    Analyze the following real-time environmental, weather, soil, and vegetation datasets:

    [VEGETATION DATA]
    - NDVI (Normalized Difference Vegetation Index): {veg.get('ndvi', 0.55)}
    - SAVI (Soil-Adjusted Vegetation Index): {veg.get('savi', 0.42)}
    - GNDVI (Green NDVI - Chlorophyll/Nitrogen indicator): {veg.get('gndvi', 0.40)}
    - Canopy Composite Index: {veg.get('composite_index', 0.45)}

    [METEOROLOGICAL & WEATHER DATA — LIVE FEEDS]
    {_weather_prompt_block(weather)}

    [SOIL DATA]
    - Potato Suitability Score: {soil.get('potato_suitability', 'excellent')}
    - Soil pH: {soil.get('ph', 6.2)}
    - Clay Percentage: {soil.get('clay_pct', 18)}%
    - Soil Moisture (ERA5 Volumetric Water Content): {moisture.get('volumetric_water_pct', 22)}%

    [LOGISTICS & MARKET SIGNALS]
    - Mandi Live Average Price: ₹{mandi.get('avg_price', 1066)}/quintal
    - Cold Storage Average Utilization Rate: {pressure.get('avg_util', 60):.1f}%
    - Storage Glut Risk Index: {glut}%

    CRITICAL INSTRUCTION:
    Please write your response entirely in the language: {lang_name}. Make sure all headings, explanations, bullet points, and advisory notes are written in {lang_name}.
    Format your response in standard Markdown using these exact sections:
    1. 🛰️ **Canopy Vigor & Chlorophyll Analysis** (Discuss NDVI, SAVI, GNDVI in {lang_name})
    2. 🌦️ **Meteorological & Abiotic Stress Assessment** (Discuss heat/frost stress and moisture in {lang_name})
    3. 🟫 **Soil Suitability & Nutrient Intake Advisory** (Discuss pH, clay, nitrogen in {lang_name})
    4. 📈 **Yield Outlook & Market Supply Glut Risk** (Forecast yields and give storage advice in {lang_name})
    5. 💡 **Actionable Recommendations for the Next Season** (Give 3 bullet points for farmers in {lang_name})
    """

    ai_report = ""
    is_live_gemini = False

    if api_key and api_key.startswith("AIzaSy"):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ]
        }
        
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=12) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                ai_report = res_data["candidates"][0]["content"]["parts"][0]["text"]
                is_live_gemini = True
        except Exception:
            pass

    if not is_live_gemini:
        suit = str(soil.get('potato_suitability', 'excellent')).upper()
        
        if lang == "bn":
            ai_report = f"""### 🛰️ **ক্যানোপি স্বাস্থ্য ও ক্লোরোফিল বিশ্লেষণ**
মাল্টি-স্পেক্ট্রাল ক্যানোপি সূচকটি বর্তমানে **{veg.get('composite_index', 0.45):.3f}**-এ রয়েছে, যা ফসলের চমৎকার প্রাথমিক ও মধ্যম বৃদ্ধি নির্দেশ করে।
* **NDVI পাতা ঘনত্ব**: **{veg.get('ndvi', 0.55):.3f}** এর NDVI সক্রিয় সালোকসংশ্লেষণ নিশ্চিত করে।
* **SAVI মাটির প্রভাব সংশোধন**: SAVI মান **{veg.get('savi', 0.42):.3f}** মাটির প্রতিফলন বাদ দিয়ে সুষম ক্যানোপি বৃদ্ধি নিশ্চিত করেছে।
* **GNDVI ক্লোরোফিল লেভেল**: **{veg.get('gndvi', 0.40):.3f}** এর GNDVI পাতায় যথেষ্ট নাইট্রোজেন থাকার প্রমাণ দেয়।

### 🌦️ **আবহাওয়া ও তাপীয় চাপ মূল্যায়ন**
পশ্চিমবঙ্গের আলু বেল্টের প্রধান অঞ্চলগুলির আবহাওয়া স্বাভাবিক ও অনুকূল রয়েছে।
* **তাপমাত্রা পরিসীমা**: বর্তমান তাপমাত্রা **{weather.get('temp_range', '18°C - 32°C')}** এর মধ্যে রয়েছে, যা আলু বড় হওয়ার জন্য উপযুক্ত।
* **তাপীয় চাপ**: গত ৩০ দিনে **{weather.get('heat_stress_days_30d', 0)} দিন** তাপীয় চাপ অনুভূত হয়েছে, যা অত্যন্ত নিরাপদ।
* **মাটির আর্দ্রতা**: আর্দ্রতা বর্তমানে **{moisture.get('volumetric_water_pct', 22)}%** রয়েছে, যা গাছের স্বাভাবিক বৃদ্ধির জন্য যথেষ্ট।

### 🟫 **মাটির উপযোগিতা ও পুষ্টি নির্দেশিকা**
* **মাটির প্রোফাইল**: আলু চাষের জন্য উপযোগী এই অঞ্চলের মাটির pH **{soil.get('ph', 6.2)}** এবং কাদার পরিমাণ **{soil.get('clay_pct', 18)}%**।
* **পুষ্টির কার্যকারিতা**: pH ৬.২ ফসলের সাধারণ খোস রোগ প্রতিরোধ করে এবং ফসফরাস ও পটাসিয়াম শোষণ বৃদ্ধি করে।
* **নাইট্রোজেন টপ-ড্রেসিং**: আলু রোপণের ২৫-৩০ দিন পর প্রথম হিলিংয়ের সময় একর প্রতি **৪৫ কেজি** ইউরিয়া প্রয়োগ করুন।

### 📈 **ফলন ও বাজারে জোগান বৃদ্ধির ঝুঁকি**
* **উৎপাদন পূর্বাভাস**: অনুকূল আবহাওয়ার কারণে এই অঞ্চলে **{live.get('predicted_yield_million_quintals', 4.5)} মিলিয়ন কুইন্টাল** ফলন প্রত্যাশিত।
* **কোল্ড স্টোরেজ চাপ**: কোল্ড স্টোরেজ খালি থাকার হার **{pressure.get('avg_util', 60):.1f}%** এবং গ্লুট বা অতিরিক্ত সরবরাহের ঝুঁকি **{glut}%**।

### 💡 **পরবর্তী মৌসুমের জন্য গুরুত্বপূর্ণ পরামর্শ**
* ** can বুকিং**: কোল্ড স্টোরেজের ভাড়া ১২০ টাকা প্রতি কুইন্টাল ধরে রাখতে ফসল তোলার অন্তত **১৫ দিন** আগে বুকিং করুন।
* **সুষম সার**: গাছের অতিরিক্ত ডালপালা বৃদ্ধি এড়াতে মৌসুমের শেষের দিকে অতিরিক্ত নাইট্রোজেন ব্যবহার করবেন না।
* **জলসেচ নিয়ন্ত্রণ**: ফসল তোলার ১০ দিন আগে জলসেচ বন্ধ করুন যাতে আলুর খোসা শক্ত ও পরিপক্ক হয়।
"""
        elif lang == "hi":
            ai_report = f"""### 🛰️ **कैनोपी स्वास्थ्य और क्लोरोफिल विश्लेषण**
मल्टी-स्पेक्ट्रल कैनोपी सूचकांक वर्तमान में **{veg.get('composite_index', 0.45):.3f}** पर है, जो फसल की प्रारंभिक और मध्यम वृद्धि को दर्शाता है।
* **NDVI कैनोपी घनत्व**: **{veg.get('ndvi', 0.55):.3f}** का NDVI सक्रिय प्रकाश संश्लेषण की पुष्टि करता है।
* **SAVI मिट्टी प्रभाव सुधार**: SAVI मान **{veg.get('savi', 0.42):.3f}** मिट्टी के परावर्तन को हटाकर संतुलित वृद्धि सुनिश्चित करता है।
* **GNDVI क्लोरोफिल स्तर**: **{veg.get('gndvi', 0.40):.3f}** का GNDVI पत्तियों में पर्याप्त नाइट्रोजन की उपस्थिति दर्शाता है।

### 🌦️ **मौसम और अजैविक तनाव मूल्यांकन**
पश्चिम बंगाल के आलू बेल्ट में मौसम सामान्य और फसल के लिए अनुकूल है।
* **तापमान सीमा**: वर्तमान तापमान **{weather.get('temp_range', '18°C - 32°C')}** के बीच है, जो कंद बनने के लिए आदर्श है।
* **ताप तनाव**: पिछले 30 दिनों में केवल **{weather.get('heat_stress_days_30d', 0)} दिन** ही तापमान सामान्य से ऊपर रहा है, जो बिल्कुल सुरक्षित है।
* **मिट्टी की नमी**: नमी वर्तमान में **{moisture.get('volumetric_water_pct', 22)}%** है, जो आलू के स्वस्थ विकास के लिए पर्याप्त है।

### 🟫 **मिट्टी की उपयुक्तता और पोषण मार्गदर्शिका**
* **मिट्टी प्रोफ़ाइल**: आलू की खेती के लिए अनुकूल इस क्षेत्र की मिट्टी का pH **{soil.get('ph', 6.2)}** और मिट्टी (clay) का प्रतिशत **{soil.get('clay_pct', 18)}%** है।
* **पोषण प्रभावशीलता**: pH 6.2 कंद के सामान्य स्कैब रोग को रोकता है और फास्फोरस व पोटेशियम के अवशोषण को बढ़ाता है।
* **नाइट्रोजन टॉप-ड्रेसिंग**: आलू बोने के 25-30 दिन बाद मिट्टी चढ़ाते समय प्रति एकड़ **45 किलोग्राम** यूरिया का छिड़काव करें।

### 📈 **उपज आउटलुक और बाजार आपूर्ति जोखिम**
* **उत्पादन का अनुमान**: अनुकूल वातावरण के कारण क्षेत्र में **{live.get('predicted_yield_million_quintals', 4.5)} मिलियन क्विंटल** की बंपर उपज की उम्मीद है।
* **कोल्ड स्टोरेज दबाव**: वर्तमान कोल्ड स्टोरेज उपयोगिता **{pressure.get('avg_util', 60):.1f}%** है और भंडारण में अतिरिक्त आपूर्ति का जोखिम **{glut}%** है।

### 💡 **आगामी सीजन के लिए महत्वपूर्ण सुझाव**
* **अग्रिम बुकिंग**: कोल्ड स्टोरेज की ₹120/क्विंटल की रियायती दर प्राप्त करने के लिए खुदाई से कम से कम **15 दिन** पहले बुकिंग करें।
* **संतुलित उर्वरक**: सीजन के अंत में अतिरिक्त नाइट्रोजन का उपयोग न करें ताकि कंदों का आकार व वजन बेहतर हो सके।
* **सिंचाई नियंत्रण**: आलू खोदने से 10 दिन पहले सिंचाई रोक दें ताकि आलू का छिलका मजबूत हो सके।
"""
        else:
            ai_report = f"""### 🛰️ **Canopy Vigor & Chlorophyll Analysis**
The multi-spectral composite canopy index stands at **{veg.get('composite_index', 0.45):.3f}**, which represents a robust early-to-mid vegetative cover.
* **NDVI Canopy density**: The NDVI of **{veg.get('ndvi', 0.55):.3f}** confirms active photosynthesis and healthy leaf area index (LAI).
* **SAVI Soil bias filter**: The SAVI value of **{veg.get('savi', 0.42):.3f}** has successfully adjusted for background soil reflection, indicating that early-season shoots are growing evenly without major bare patches.
* **GNDVI Chlorophyll indicator**: The GNDVI of **{veg.get('gndvi', 0.40):.3f}** is strongly correlated with leaf nitrogen content, validating high green canopy chlorophyll absorption.

### 🌦️ **Meteorological & Abiotic Stress Assessment**
Real-time meteorology shows stable parameters for West Bengal's key potato belt.
* **Temperature corridors**: Current temperature range is steady at **{weather.get('temp_range', '18°C - 32°C')}**. This is within the optimal night-day thermal gradient for tuberization.
* **Abiotic thermal stress**: There have been **{weather.get('heat_stress_days_30d', 0)} days** of heat stress (above 34°C) in the last 30 days, meaning tuber thermal shock risk is minimal.
* **Volumetric water content**: Soil moisture is recorded at **{moisture.get('volumetric_water_pct', 22)}%**, which is well-balanced to prevent early-stage late blight without causing root asphyxia.

### 🟫 **Soil Suitability & Nutrient Intake Advisory**
* **Soil Profile**: The crop is set in a **{suit}** potato-suitability zone with a soil pH of **{soil.get('ph', 6.2)}** and clay content of **{soil.get('clay_pct', 18)}%**.
* **Phosphate and Potash Retention**: A pH of 6.2 provides the perfect chemical balance to prevent common scab disease while maximizing phosphorus and potassium availability.
* **Nitrogen Top-Dressing Plan**: To prevent premature canopy decline, apply a split nitrogen top-dressing of **45 kg/acre** of urea at the first hilling stage (25-30 days post-planting).

### 📈 **Yield Outlook & Market Supply Glut Risk**
* **Production Forecast**: Based on environmental inputs, the predicted yield is high at **{live.get('predicted_yield_million_quintals', 4.5)} million quintals** across the basin.
* **Storage Glut Signal**: The local cold storage utilization rate stands at **{pressure.get('avg_util', 60):.1f}%**, resulting in a calculated **{glut}%** glut risk. This means storages will fill rapidly during harvest peak.

### 💡 **Actionable Recommendations for the Next Season**
* **Early Booking**: Reserve your cold storage space at least **15 days** before harvest to guarantee space and lock in the ₹120/q rate.
* **Fertilizer Split**: Avoid applying nitrogen late in the season to prevent excessive foliage at the expense of tuber weight.
* **Moisture Management**: Maintain soil moisture between 65% and 80% field capacity during tuber initiation, and withdraw irrigation 10 days before harvest for skin hardening.
"""

    return {
        "ok": True,
        "is_live_gemini": is_live_gemini,
        "report": ai_report,
        "api_key_configured": bool(api_key),
        "weather_live": bool(weather.get("is_live_openweather")),
        "weather_source": weather.get("source", ""),
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


@app.get("/api/finance/insurance")
def get_insurance_offers(
    quantity_quintals: float = Query(50, ge=1, le=10000),
    glut_risk_pct: float = Query(50, ge=0, le=100),
    crop: str = Query("Potato"),
):
    return list_insurance_offers(
        quantity_quintals=quantity_quintals,
        glut_risk_pct=glut_risk_pct,
        crop=crop,
    )


@app.get("/api/finance/auctions")
def get_auctions(
    crop: str = Query("Potato"),
    district: str | None = Query(None),
    quantity_quintals: float | None = Query(None),
):
    return list_auctions(
        crop=crop,
        district=district,
        farmer_quantity_quintals=quantity_quintals,
    )


@app.get("/api/logistics/vendors")
def get_logistics_vendors(
    quantity_quintals: float = Query(50, ge=1, le=10000),
    farmer_lat: float | None = Query(None),
    farmer_lng: float | None = Query(None),
    destination_lat: float | None = Query(None),
    destination_lng: float | None = Query(None),
    destination_name: str | None = Query(None),
):
    return list_logistics_vendors(
        quantity_quintals=quantity_quintals,
        farmer_lat=farmer_lat,
        farmer_lng=farmer_lng,
        destination_lat=destination_lat,
        destination_lng=destination_lng,
        destination_name=destination_name,
    )


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
    weather_advisory = None
    if body.farmer_lat is not None and body.farmer_lng is not None:
        from services.weather_engine import fetch_farmer_weather, weather_summary_for_consult

        wx = fetch_farmer_weather(body.farmer_lat, body.farmer_lng)
        weather_advisory = weather_summary_for_consult(wx)
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
            "tenure_days": loan.tenure_days,
            "bank_partner": loan.bank_partner,
            "grn_id": loan.grn_id,
            "trigger_reason": loan.trigger_reason,
        },
        "weather_advisory": weather_advisory,
    }


# --- Farmer voice (Gemini STT) ---


@app.get("/api/voice/config")
def voice_config():
    from services.voice_transcribe import gemini_stt_configured

    return {
        "gemini_stt": gemini_stt_configured(),
        "stt_mode": "gemini_audio_only",
        "web_speech_disabled": True,
        "hint": "Voice uses MediaRecorder + Gemini STT on backend. Set GEMINI_API_KEY.",
    }


@app.post("/api/voice/transcribe")
async def voice_transcribe(
    audio: UploadFile = File(...),
    language_hint: str = Form("bn"),
):
    from services.voice_transcribe import gemini_stt_configured, transcribe_farmer_audio

    if not gemini_stt_configured():
        raise HTTPException(status_code=503, detail="gemini_not_configured")

    raw = await audio.read()
    mime = audio.content_type or "audio/webm"
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="audio_too_large")

    result = transcribe_farmer_audio(raw, mime, language_hint)
    if not result.get("ok"):
        code = result.get("error", "transcription_failed")
        if code == "gemini_not_configured":
            raise HTTPException(status_code=503, detail=code)
        if code == "quota_exceeded":
            raise HTTPException(status_code=429, detail=code)
        raise HTTPException(status_code=502, detail=code)
    return {"text": result["text"], "engine": result.get("engine", "gemini")}


@app.post("/api/voice/converse")
def voice_converse(body: ConverseRequest, db: Session = Depends(get_db)):
    from services.voice_pipeline import process_voice_turn
    import base64

    audio_bytes = None
    if body.audio_base64:
        try:
            audio_bytes = base64.b64decode(body.audio_base64)
        except Exception:
            raise HTTPException(400, detail="Invalid audio base64")

    farmer_lat = body.farmer_lat
    farmer_lng = body.farmer_lng
    if body.context:
        loc = body.context.get("location")
        if isinstance(loc, dict):
            farmer_lat = farmer_lat or loc.get("lat")
            farmer_lng = farmer_lng or loc.get("lng")

    try:
        result = process_voice_turn(
            db,
            farmer_text=body.text,
            audio_bytes=audio_bytes,
            audio_mime=body.audio_mime,
            conversation_state=body.conversation_state,
            farmer_lat=farmer_lat,
            farmer_lng=farmer_lng,
            context=body.context,
        )
    except Exception as e:
        logger = __import__("logging").getLogger(__name__)
        logger.exception("Voice pipeline crash")
        raise HTTPException(status_code=500, detail=f"voice_pipeline_error: {e}") from e

    if not result.get("ok") and result.get("intent") in (
        "STT_FAILED",
        "NO_INPUT",
        "STT_UNAVAILABLE",
    ):
        # Soft failures — return structured response, not HTTP 500
        return result

    return result



# --- Razorpay payments ---


class PaymentCreateOrderRequest(BaseModel):
    amount_inr: int = Field(..., ge=1, le=10_000_000)
    receipt_ref: str | None = Field(None, max_length=40)


class PaymentVerifyRequest(BaseModel):
    razorpay_order_id: str = Field(..., min_length=4)
    razorpay_payment_id: str = Field(..., min_length=4)
    razorpay_signature: str = Field(..., min_length=4)


@app.get("/api/payments/config")
def payments_config():
    from services.razorpay_payments import public_config

    return public_config()


@app.post("/api/payments/create-order")
def payments_create_order(body: PaymentCreateOrderRequest):
    from services.razorpay_payments import create_order, razorpay_configured

    if not razorpay_configured():
        raise HTTPException(
            status_code=503,
            detail="razorpay_not_configured",
        )
    try:
        return create_order(body.amount_inr, body.receipt_ref)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        msg = str(e)
        if msg == "razorpay_not_configured":
            raise HTTPException(status_code=503, detail=msg) from e
        raise HTTPException(status_code=502, detail="razorpay_order_failed") from e


@app.post("/api/payments/verify")
def payments_verify(body: PaymentVerifyRequest):
    from services.razorpay_payments import (
        razorpay_configured,
        verify_payment_signature,
    )

    if not razorpay_configured():
        raise HTTPException(status_code=503, detail="razorpay_not_configured")
    ok = verify_payment_signature(
        body.razorpay_order_id,
        body.razorpay_payment_id,
        body.razorpay_signature,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="invalid_signature")
    return {
        "verified": True,
        "payment_id": body.razorpay_payment_id,
        "order_id": body.razorpay_order_id,
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
