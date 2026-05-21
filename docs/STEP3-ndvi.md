# Step 3 — Weekly yield / glut (Predict pillar)

See also **[PREDICT-ENV-LAYERS.md](./PREDICT-ENV-LAYERS.md)** for weather, SAVI/GNDVI, and soil.

After mandi (Step 1) and registry (Step 2), refresh **Predict** from **Sentinel-2 NDVI** + **live cold-storage pressure**.

---

## A. Copernicus Data Space setup (real NDVI)

1. Register at [Copernicus Data Space](https://dataspace.copernicus.eu/).
2. **User Settings → OAuth clients → Create new**
3. Copy **Client ID** and **Client Secret** into `backend/.env`:

```env
COPERNICUS_CLIENT_ID=cdse-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
COPERNICUS_CLIENT_SECRET=your_secret_here
```

4. Test:

```powershell
cd d:\KhetSmart\backend
.\.venv\Scripts\python.exe -m ingest.diagnose_copernicus
```

Expect: `Token: OK` then `NDVI (latest interval): 0.xx` with several intervals.

5. API check:

```powershell
curl http://127.0.0.1:8000/api/yield/copernicus/status
```

---

## B. Run weekly ingest

```powershell
.\.venv\Scripts\python.exe -m ingest.run_weekly
```

Expected:

```text
source: Sentinel-2 L2A · Copernicus Data Space
ndvi: 0.65 (example)
glut_risk_pct: 51
```

Without Copernicus credentials, fallback still works (storage-pressure NDVI estimate).

---

## C. What the backend does

| Step | Module |
|------|--------|
| OAuth token | `services/copernicus_ndvi.py` |
| NDVI + glut blend | `services/yield_model.py` |
| Weekly job | `ingest/fetch_ndvi_weekly.py` |
| DB snapshot | `ingest/ingest_ndvi.py` → `yield_snapshots` |
| API | `GET /api/yield/forecast`, `GET /api/yield/history` |

**Damodar corridor bbox:** 86.85–88.55°E, 22.75–25.2°N (WGS84)

**Glut formula:** blends Sentinel-2 NDVI + avg cold-storage utilization + critical count, then **live mandi bump** (`services/mandi_signal.py`):

| Mandi avg (₹/q) | Glut adjust |
|-----------------|-------------|
| Near distress (≤350) | +20 |
| Below cultivation cost (&lt;950) | +14 |
| Weak (&lt;1200) | +10 |
| Softening (&lt;1600) | +6 |
| Healthy (≥1850) | −4 |

`/api/yield/forecast` recomputes mandi + storage on every request; NDVI from latest weekly snapshot.

---

## D. Schedule (Windows)

```powershell
d:\KhetSmart\scripts\schedule-weekly.ps1
```

---

## E. Verify in app

```powershell
curl http://127.0.0.1:8000/api/yield/forecast
```

**Predict** tab → source should say *Sentinel-2 · Copernicus* when credentials work; NDVI chart uses `/api/yield/history`.

---

## F. Troubleshooting

| Issue | Fix |
|-------|-----|
| `Token: FAILED` | Wrong CLIENT_ID/SECRET; recreate OAuth client |
| `HTTP 400` on stats | Wait 1–2 min; CDSE overload — retry |
| `No valid NDVI intervals` | Cloudy season — widen date range or lower max cloud in code |
| Still “storage pressure only” | Credentials missing; check `.env` and restart uvicorn |
