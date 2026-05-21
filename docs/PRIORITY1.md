# Priority 1 — Real data operations

## 1. Cold storage registry (496 facilities)

### Official CSV (replace model data)
1. Get WB cold-storage list from govt / FCI / cooperative registry.
2. Map columns to `backend/data/cold_storages_registry.template.csv`.
3. Save as `backend/data/cold_storages_registry.csv`.
4. Import:
   ```powershell
   cd backend
   .\.venv\Scripts\python.exe -m ingest.import_registry --replace
   ```
   Or in app: **Ops → Import registry** (API).

### Build corridor CSV (until official file arrives)
```powershell
.\.venv\Scripts\python.exe -m ingest.build_registry
.\.venv\Scripts\python.exe -m ingest.import_registry --replace
```

---

## 2. Daily mandi prices

### With data.gov.in API key (recommended)
1. Register at https://data.gov.in/
2. Add to `backend/.env`:
   ```
   DATA_GOV_API_KEY=your_key_here
   ```
3. Run daily:
   ```powershell
   .\.venv\Scripts\python.exe -m ingest.run_daily
   ```
   Or **Ops → Run daily job**.

### Without API key
- Edit `backend/data/mandi_prices.csv` manually.
- **Ops → Refresh mandi prices** loads CSV into DB.

### Windows Task Scheduler
```powershell
.\scripts\schedule-daily.ps1
```
Runs at 6:00 AM daily.

---

## 3. Weekly NDVI / glut

```powershell
.\.venv\Scripts\python.exe -m ingest.run_weekly
```
- Appends `backend/data/ndvi_history.csv`
- Updates `backend/data/ndvi_latest.csv`
- Writes `yield_snapshots` in DB

Set `COPERNICUS_API_KEY` when Sentinel pipeline is ready.

### Weekly schedule
```powershell
.\scripts\schedule-weekly.ps1
```
Sundays 5:00 AM.

---

## 4. Field operators (occupancy)

1. Open app → **Ops** tab.
2. Search facility or filter **district**.
3. Move slider = **% full** (not empty).
4. Tap **Save** — updates DB + recalculates glut signal.

### Production
Set in `.env`:
```
ADMIN_API_KEY=long_random_secret
```
Operators enter key once in Ops screen (stored in browser).

Share only with cold-storage managers.

---

## Quick health check

```powershell
curl http://127.0.0.1:8000/api/health
```
Expect `"storages": 496`.
