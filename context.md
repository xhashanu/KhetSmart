# KhetSmart — Project Context for LLMs

This document summarizes **what KhetSmart is**, **how the codebase is organized**, **how data flows**, and **what was built over the project lifetime**. Use it as onboarding context when continuing work in this repository.

**Repository:** https://github.com/Siya87/KhetSmart  
**Default branch:** `main`  
**Product:** Agri-FinTech PWA for **West Bengal potato farmers** — Predict · Route · Finance.

---

## 1. Product summary

KhetSmart helps farmers:

1. **Describe harvest** (voice or text, often Bangla/Hindi/English mix).
2. **Get a plan** — best cold storage route, transport cost, profit estimate, distress vs mandi price comparison, micro-loan offer.
3. **Watch market pressure** — NDVI/glut risk, mandi prices, storage utilization.
4. **See the network** — ~496 cold storages on a map.
5. **Finance tab** — loan (from consult), **insurance** plans, **mandi auction** listings (demo).
6. **Truck vendors** — logistics partners to move potatoes to cold storage (not the same as cold-storage facilities).

The UI is optimized for **low-literacy farmers**: large taps, Bengali-first defaults, simplified copy, optional English and **Hindi**.

---

## 2. Tech stack

| Layer | Stack |
|--------|--------|
| **Frontend** | React 18 + TypeScript, Vite, PWA (`vite-plugin-pwa`), CSS in `index.css` |
| **Backend** | FastAPI, SQLAlchemy, SQLite (default) or Postgres via `DATABASE_URL` |
| **Maps** | Leaflet (storage pins, farmer location) |
| **Speech** | Web Speech API (`bn-IN`, `hi-IN`, `en-IN`) |
| **Routing distance** | Haversine + optional OSRM (`USE_OSRM`) |
| **Dev proxy** | Vite proxies `/api` → `http://127.0.0.1:8000` |

**Ports:** Frontend `5173`, API `8000`, OpenAPI docs at `/docs`.

---

## 3. Repository layout

```
KhetSmart/
├── context.md              ← this file
├── README.md               ← quick start & demo script
├── backend/
│   ├── main.py             ← FastAPI app, all /api routes
│   ├── config.py           ← env: DB, DEMO_MODE, OSRM, admin keys
│   ├── database.py         ← SQLAlchemy engine/session
│   ├── models.py           ← ColdStorage, MandiPrice, YieldSnapshot
│   ├── deps.py             ← admin auth dependency
│   ├── startup.py          ← DB init on lifespan
│   ├── requirements.txt
│   ├── .env.example        ← copy to .env (never commit .env)
│   ├── data/               ← CSV/JSON seeds & ingest outputs
│   │   ├── cold_storages_registry.csv   ← 496 govt-style registry rows
│   │   ├── mandi_prices.csv
│   │   ├── ndvi_latest.csv / ndvi_history.csv
│   │   ├── insurance_plans.json         ← demo insurance
│   │   ├── auctions.json                ← demo mandi auctions
│   │   └── logistics_vendors.json       ← truck partners
│   ├── services/           ← business logic (no HTTP here)
│   │   ├── router.py       ← cold storage + route scoring
│   │   ├── finance.py      ← loan evaluation
│   │   ├── price_compare.py
│   │   ├── nlp_parser.py   ← farmer text → quantity/crop/district
│   │   ├── insurance.py
│   │   ├── auction.py
│   │   ├── logistics_vendors.py
│   │   ├── yield_service.py / yield_model.py / yield_predictor.py
│   │   ├── mandi_signal.py / weather_signal.py / soil_signal.py
│   │   ├── storage_repo.py / price_repo.py
│   │   └── osrm_client.py
│   └── ingest/             ← CLI jobs: seed, mandi, NDVI, registry
├── frontend/
│   ├── src/
│   │   ├── App.tsx         ← shell: tabs, consult flow, settings
│   │   ├── api.ts          ← types + fetch wrappers for all APIs
│   │   ├── main.tsx
│   │   ├── index.css       ← global + component styles
│   │   ├── components/     ← UI panels (see §6)
│   │   ├── hooks/
│   │   │   ├── useAppSettings.ts   ← language + font size
│   │   │   ├── useFarmerLocation.ts
│   │   │   └── useVoiceInput.ts    ← mic + speech recognition
│   │   ├── i18n/
│   │   │   ├── farmerSimple.ts     ← BN/EN/HI farmer + predict strings
│   │   │   ├── financeSimple.ts    ← BN/EN/HI finance tab strings
│   │   │   └── lang.ts             ← speech codes, insurance display helpers
│   │   └── types/speech.d.ts
│   └── vite.config.ts      ← PWA + /api proxy
├── docs/                   ← PRIORITY1/2, NDVI, registry guides
└── scripts/                ← PowerShell helpers (start backend, ingest schedules)
```

---

## 4. How the system works (end-to-end)

### 4.1 Core farmer flow (`POST /api/consult`)

```
User input (text/voice)
    → nlp_parser.parse_farmer_message()
    → get_latest_yield() → glut_risk_pct, alert_level
    → recommend_route() → best cold storage, distance, logistics cost, profit
    → evaluate_loan() → approved, amount, tenure, GRN id
    → build_price_comparison() → distress vs live mandi uplift
    → JSON ConsultResponse → frontend FarmerConsultResults
```

**Overrides:** Frontend can send `quantity_quintals`, `crop`, `district`, `farmer_lat/lng` after harvest shortcuts or GPS.

**Parse-only path:** `POST /api/nlp/parse` → if low confidence, `FarmerParseConfirm` asks user to confirm before consult.

### 4.2 Route optimizer (`services/router.py`)

- Loads storages from **DB** (`storage_repo.list_storages`).
- Scores candidates by distance (OSRM or haversine), available capacity, mandi price near storage, glut pressure.
- `DEMO_MODE=true` can pin a demo corridor (see `config.py` / README).
- Returns `why[]` bullet reasons for the UI.

### 4.3 Yield / Predict tab

- `GET /api/yield/forecast` — composite glut %, NDVI, mandi layer, weather/soil/moisture/nitrogen advisories, storage pressure stats.
- `GET /api/yield/history` — time series for `NdviChart` (hidden in simple farmer mode on Predict).
- Frontend `PredictPanel` uses **simple mode** always: hero + signals row + next steps (no heavy charts for farmers).

### 4.4 Finance (three sub-features)

| Feature | Backend | Frontend |
|---------|---------|----------|
| **Loan** | Part of `/api/consult` → `loan` object | `FinanceLoanPanel` — hero ₹, apply/share (demo toast) |
| **Insurance** | `GET /api/finance/insurance` | `FinanceInsurancePanel` — plans from JSON, scaled premium |
| **Auction** | `GET /api/finance/auctions` | `FinanceAuctionPanel` — live bids demo |

Insurance/auction are **demo contracts**, not real bank/mandi integrations.

### 4.5 Logistics vendors (trucks)

- **Not** cold storage listings.
- `GET /api/logistics/vendors` reads `data/logistics_vendors.json`, ranks by distance to farmer + destination storage from consult.
- UI: `LogisticsVendorsPanel` on Farmer tab; **hides** voice/text input while open; **Back to plan** restores input.

### 4.6 Ops / Admin

- Settings → **Ops** opens `OpsOverlay` → `AdminPanel`.
- Protected routes under `/api/admin/*` with optional `X-Admin-Key` (`ADMIN_API_KEY` in `.env`).
- Field ops: PATCH storage utilization, trigger mandi/NDVI ingest, re-import registry.

---

## 5. Backend API reference

Base URL: `http://127.0.0.1:8000` (or proxied as `/api` from Vite).

### 5.1 Public / farmer APIs

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | `{ status, demo_mode, storages }` |
| `GET` | `/api/yield/forecast` | Full predict payload (glut, layers, mandi, storage stats) |
| `GET` | `/api/yield/history` | NDVI/glut time series |
| `GET` | `/api/yield/copernicus/status` | Satellite ingest status |
| `GET` | `/api/storages` | All storages; `?for_map=true` limits payload for map |
| `GET` | `/api/prices` | Mandi markets list |
| `POST` | `/api/nlp/parse` | `{ text }` → parsed quantity, crop, district, confidence |
| `POST` | `/api/route/recommend` | Route only (quantity, crop, district, glut) |
| `POST` | `/api/finance/offer` | Loan only for a route context |
| **`POST`** | **`/api/consult`** | **Main farmer bundle** (parsed + yield + route + prices + loan) |
| `GET` | `/api/finance/insurance` | Query: `quantity_quintals`, `glut_risk_pct`, `crop` |
| `GET` | `/api/finance/auctions` | Query: `crop`, `district`, `quantity_quintals` |
| `GET` | `/api/logistics/vendors` | Query: `quantity_quintals`, farmer/destination coords & name |

#### `POST /api/consult` body

```json
{
  "text": "Amar 50 quintal Jyoti aloo ache",
  "farmer_lat": 23.25,
  "farmer_lng": 87.85,
  "quantity_quintals": 50,
  "crop": "Potato",
  "district": null
}
```

#### `POST /api/consult` response (shape)

- `parsed` — quantity, crop, district, confidence
- `yield_signal` — glut_risk_pct, alert_level, ndvi, insight
- `route` — storage_name, distance_km, logistics_cost_inr, estimated_profit_inr, market_price, lat/lng, `why[]`
- `price_comparison` — distress vs live mandi, uplift_inr, headlines
- `loan` — approved, amount_inr, interest_rate_pa, **tenure_days**, bank_partner, grn_id, trigger_reason

### 5.2 Admin APIs (header `X-Admin-Key` when auth enabled)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/config` | Whether auth is required |
| `POST` | `/api/admin/verify` | Validate admin key |
| `POST` | `/api/admin/registry/import` | Re-import cold storage CSV |
| `POST` | `/api/admin/jobs/daily` | Mandi ingest job |
| `POST` | `/api/admin/jobs/weekly` | NDVI ingest job |
| `GET` | `/api/admin/districts` | District list |
| `PATCH` | `/api/admin/storages/{id}` | Update `utilization_pct` |
| `POST` | `/api/admin/ingest/mandi` | Trigger mandi ingest |
| `POST` | `/api/admin/ingest/ndvi` | Trigger NDVI ingest |
| `GET` | `/api/admin/storages` | Admin storage list |

---

## 6. Frontend architecture

### 6.1 App shell (`App.tsx`)

Four bottom tabs (labels localized via `tNav(language)`):

| Tab ID | Role |
|--------|------|
| `farmer` | Voice/text input, harvest shortcuts, consult results, logistics vendors overlay |
| `predict` | Market watch (simplified) |
| `network` | Map of cold storages + selected storage card |
| `finance` | Loan / insurance / auction sub-tabs |

**Global state:** `result: ConsultResponse | null` drives finance tab and route highlight on map.

**Settings:** `SettingsMenu` — language (`en` \| `bn` \| `hi`), font size (`sm` \| `md` \| `lg`), link to Ops.

**CSS:** `app-shell--simple` — large typography; `data-khetsmart-lang` on `<html>` for theming hooks.

### 6.2 Key components

| Component | Responsibility |
|-----------|----------------|
| `FarmerVoiceInput` | Mic top-right + textarea; `useVoiceInput(..., language)` |
| `FarmerHarvestShortcuts` | Quantity chips + crop chips → updates consult overrides |
| `FarmerParseConfirm` | Low-confidence NLP confirmation |
| `FarmerConsultResults` | Plan hero, glut, route flow, distress card, finance CTA, **all truck vendors** |
| `RouteFlow` | Farm → truck → cold storage diagram |
| `DistressPriceCard` | Uplift vs distress sell |
| `LogisticsVendorsPanel` | Truck vendor cards (call, price, vehicle) |
| `PredictPanel` / `PredictHero` / `PredictSignalsRow` / `PredictNextSteps` | Predict tab (simple) |
| `StorageMap` / `StorageMapClusters` | Network map |
| `FinancePanel` | Tab switcher: loan \| insurance \| auction |
| `FinanceLoanPanel` / `FinanceInsurancePanel` / `FinanceAuctionPanel` | Finance sub-views |
| `LoanOfferCard` | Legacy/compact loan card (still used in some flows) |
| `AdminPanel` | Ops: storages, ingest, registry |
| `OpsOverlay` | Full-screen admin host |

### 6.3 API client (`frontend/src/api.ts`)

All HTTP calls should go through this file. Exports:

- Types: `ConsultResponse`, `InsurancePlan`, `MandiAuction`, `ColdStorage`, `LogisticsVendor`, `YieldForecast`, …
- Functions: `consultFarmer`, `parseFarmerText`, `fetchYield`, `fetchStorages`, `fetchLogisticsVendors`, `fetchInsuranceOffers`, `fetchAuctions`, `fetchHealth`, admin helpers (`verifyAdminKey`, `patchStorageUtilization`, …)

### 6.4 Internationalization (i18n)

| File | Contents |
|------|----------|
| `i18n/farmerSimple.ts` | `FARMER_SIMPLE`, `PREDICT_SIMPLE`, `NAV_LABELS` for **en / bn / hi** |
| `i18n/financeSimple.ts` | Finance tab strings for **en / bn / hi** |
| `i18n/lang.ts` | `SPEECH_LANG`, `isSimpleLang()`, `insurancePlanDisplay()` |

**Defaults:** `useAppSettings` → language **`bn`**, font **`lg`**.

**Simple UI rule:** `isSimpleLang(lang)` → true for `bn` and `hi` (hides jargon, GRN details, dense English labels).

**Insurance names:** Backend JSON has `name_bn`, `name_en`, `name_hi` (+ highlights_*). Frontend picks via `insurancePlanDisplay(plan, language)`.

---

## 7. Data layer: real vs demo

| Data | Source | Notes |
|------|--------|-------|
| Cold storages (~496) | SQLite/Postgres from registry CSV | Ops can PATCH utilization |
| Mandi prices | `mandi_prices.csv` + ingest | eNAM/data.gov.in path in ingest |
| NDVI / glut | `ndvi_latest.csv` + DB snapshots | Weekly ingest |
| Route distances | OSRM or haversine | Configurable |
| Loans | `services/finance.py` rules | Demo Bandhan-style partner string |
| Insurance | `data/insurance_plans.json` | Premium scales with qty & glut |
| Auctions | `data/auctions.json` | Static demo lots |
| Logistics vendors | `data/logistics_vendors.json` | Trucks, not storages |
| Bank GRN | Generated ID string | Not a real banking API |

---

## 8. Environment variables (`backend/.env`)

Copy from `backend/.env.example`. Important keys:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | `sqlite:///./khetsmart.db` or Postgres URL |
| `DEMO_MODE` | Pitch/demo anchor route when `true` |
| `ADMIN_API_KEY` | Protects `/api/admin/*` |
| `REQUIRE_ADMIN_AUTH` | Enforce header check |
| `USE_OSRM` / `OSRM_BASE_URL` | Road distance |
| `COPERNICUS_CLIENT_ID` / `SECRET` | Sentinel NDVI pipeline |
| `DATA_GOV_API_KEY` | Mandi price fetch |
| `CORS_ORIGINS` | Frontend origins |

**Never commit** `backend/.env` (contains secrets).

---

## 9. Running locally

```powershell
# Terminal 1 — API
cd backend
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python.exe -m ingest.seed_all
.\.venv\Scripts\uvicorn.exe main:app --reload --port 8000

# Terminal 2 — PWA
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173  
- Swagger: http://127.0.0.1:8000/docs  

---

## 10. Project history (what was built, in order)

Useful for understanding **why** the code looks the way it does:

1. **Initial MVP** — Farmer consult, route optimizer, loan offer, Predict (NDVI/glut), Network map, Ops admin, 496 storages in DB, ingest pipelines (documented in `docs/PRIORITY1.md`).
2. **GitHub** — Repo `Siya87/KhetSmart`, branch `main`.
3. **Harvest shortcuts** — Quantity/crop chips; auto text for consult.
4. **Logistics vendors correction** — “Vendors” = **transport/truck partners**, not cold storage; dedicated `LogisticsVendorsPanel`, API `GET /api/logistics/vendors`; input hidden on vendor page.
5. **Farmer-first UI simplification** — Bengali-first copy, larger UI, `farmerSimple.ts`, simplified Predict/Finance labels, logistics banner contrast fix.
6. **Voice UX** — Single “Speak or write” label, mic outside textarea (top-right); `useVoiceInput` hardened against AbortError / Strict Mode.
7. **Finance tab expansion** — Sub-tabs: Loan | Insurance | Auction; backend insurance + auction services; demo CTAs (toast, share, call).
8. **Hindi language** — Third locale `hi` in settings; full `financeSimple` + `farmerSimple` Hindi strings; speech `hi-IN`; tab labels localized.
9. **Latest push** — Commit `a36c2a2` on `main` (finance + Hindi + insurance/auction APIs).

---

## 11. Conventions for future changes

1. **Add user-facing strings** in `farmerSimple.ts` or `financeSimple.ts` for all three languages (`en`, `bn`, `hi`), not inline ternaries.
2. **Add APIs** in `backend/main.py` + logic in `backend/services/` + types/fetch in `frontend/src/api.ts`.
3. **Farmer-facing features** should work in **simple mode** (large touch targets, minimal English jargon).
4. **“Vendors”** in farmer UX = **trucks/logistics**, not cold storage.
5. **Finance actions** are demo unless integrating real partners (document clearly in UI disclaimer).
6. **Do not commit** `.env`, credentials, or large accidental data dumps.
7. Vite **only** proxies `/api`; production needs reverse proxy or same-origin API.

---

## 12. Known gaps / future integrations

From README and code comments:

- Real **eNAM / state mandi** price APIs
- Production **Copernicus Sentinel-2** NDVI pipeline
- **Bengali/Hindi ASR** beyond browser Web Speech API
- Real **bank GRN / loan** and **insurance** underwriting APIs
- Live **mandi auction** bidding
- Farmer **OTP** identity
- OSRM self-hosted instance for scale

---

## 13. Quick reference — main consult example

**Input (voice or text):**  
`Amar 50 quintal Jyoti aloo ache`

**Frontend call:**  
`consultFarmer(text, farmerLocation, harvestSelection)`

**User sees:**  
Glut level → route to named cold storage → transport cost & profit → distress vs mandi uplift → loan amount (e.g. ₹8,000) → optional truck vendors → Finance tab for insurance/auction.

---

## 14. Related documentation

| Path | Topic |
|------|--------|
| `README.md` | Quick start, demo script |
| `docs/PRIORITY1.md` | Real data ingest (registry, mandi, NDVI) |
| `docs/PRIORITY2.md` | Further production steps |
| `docs/STEP2-registry.md` | Cold storage registry |
| `docs/STEP3-ndvi.md` | NDVI pipeline |
| `docs/PREDICT-ENV-LAYERS.md` | Weather/soil/moisture layers on Predict |

---

*Last updated to reflect `main` through commit `a36c2a2` (finance tabs, Hindi, insurance/auction). Regenerate or extend this file when major features land.*
