# KhetSmart — Agri-FinTech (MVP → Production path)

Predict · Route · Finance for West Bengal potato farmers.

## Quick start

**Terminal 1 — API**
```powershell
cd backend
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python.exe -m ingest.seed_all
.\.venv\Scripts\uvicorn.exe main:app --reload --port 8000
```

**Terminal 2 — PWA**
```powershell
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173  
- API docs: http://127.0.0.1:8000/docs  

Copy `backend/.env.example` → `backend/.env` and set `DEMO_MODE=true` only for hackathon pitch anchor.

---

## What’s real vs mock now

| Layer | Status |
|--------|--------|
| **496 cold storages** | SQLite/Postgres DB (8 verified + 488 corridor seed — replace with govt CSV) |
| **Occupancy** | Live via **Ops** tab → slider + PATCH API |
| **Mandi prices** | `data/mandi_prices.csv` ingest (swap for eNAM/API) |
| **NDVI / glut** | `data/ndvi_latest.csv` + storage-pressure hybrid |
| **Route optimizer** | Reads **all DB storages** + latest mandi prices |
| **DEMO_MODE** | Optional pitch anchor (50q Jyoti → Burdwan) |

---

## Priority 1 — Real data (implemented)

Full guide: **`docs/PRIORITY1.md`**

```powershell
cd backend
.\.venv\Scripts\python.exe -m ingest.seed_all
```

| Step | What | Command / UI |
|------|------|----------------|
| **Registry** | `data/cold_storages_registry.csv` (496 rows) | `python -m ingest.sync_registry_ogd` (official OGD) or Ops → Re-import |
| **Daily mandi** | `data.gov.in` + CSV | `python -m ingest.run_daily` or Ops → Run daily mandi job |
| **Weekly NDVI** | `ndvi_history.csv` + DB | `python -m ingest.run_weekly` or Ops → Run weekly NDVI job |
| **Field ops** | Occupancy sliders | Ops tab (+ optional `ADMIN_API_KEY`) |

Replace model data: drop official govt CSV into `cold_storages_registry.csv` (see `cold_storages_registry.template.csv`).

Schedule on Windows: `scripts\schedule-daily.ps1` · `scripts\schedule-weekly.ps1`

---

## API highlights

- `GET /api/health` — storages count, demo_mode  
- `GET /api/storages?for_map=true` — map subset (performance)  
- `GET /api/storages` — full list for routing  
- `POST /api/consult` — farmer flow (live DB)  
- `PATCH /api/admin/storages/{id}` — update occupancy  
- `POST /api/admin/ingest/mandi` · `POST /api/admin/ingest/ndvi`  

---

## Demo script

1. **Farmer** → `Amar 50 quintal Jyoti aloo ache` → route + loan + **why** bullets  
2. **Predict** → NDVI chart + data source timestamp  
3. **Network** → map (subset) + 496 total in header  
4. **Ops** → lower a storage % → **Run NDVI ingest** → see glut change on Predict  

---

## Next integrations

- OSRM for road distance  
- eNAM / state mandi API for prices  
- Copernicus Sentinel-2 pipeline for NDVI  
- Farmer OTP + Bengali ASR  
- Bank GRN API (after compliance)
