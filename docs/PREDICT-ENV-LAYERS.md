# Predict — Multi-layer environment model

Yield and glut are **not NDVI-only**. KhetSmart blends:

| Layer | Source | Role |
|-------|--------|------|
| **NDVI** | Sentinel-2 L2A (Copernicus) | Mature canopy vigor |
| **SAVI** | Same scene (L=0.5) | Early growth / bare-soil correction |
| **GNDVI** | B03 vs B08 | Chlorophyll & nitrogen proxy |
| **Weather** | [Open-Meteo](https://open-meteo.com/) | Heat, drought, waterlogging, solar radiation |
| **Soil** | [SoilGrids](https://soilgrids.org/) + WB fallback | Texture, pH, organic C → potato suitability |
| **Mandi** | data.gov.in / CSV | Price-driven glut bump |
| **Storage** | 496 cold storages DB | Logistics pressure |
| **ERA5 soil moisture** | Open-Meteo (ERA5-Land hourly) | 0–7 cm & 7–28 cm volumetric m³/m³ |
| **Nitrogen advisory** | GNDVI thresholds | Side-dress kg N/ha recommendation |

---

## ERA5 soil moisture

- API: Open-Meteo hourly `soil_moisture_0_to_7cm`, `soil_moisture_7_to_28cm`
- **Optimal root zone:** 0.20–0.34 m³/m³
- **Dry / severe dry** → yield factor ↓, glut ↑
- **Saturated** → waterlogging messaging

## GNDVI nitrogen thresholds (potato)

| GNDVI | Advisory |
|-------|----------|
| &lt; 0.38 | Critical — 40–60 kg N/ha urgent |
| 0.38–0.43 | Moderate — 25–40 kg N/ha |
| 0.43–0.50 | Borderline — 15–25 or monitor (tuber phase: hold) |
| 0.50–0.56 | Adequate — no side-dress |
| &gt; 0.56 + high NDVI | Excess vigor risk — hold N |

Tuber bulking (NDVI &lt; 0.52 or ≤4 weeks to harvest): suppress high-N advice.

---

## Diagnostics

```powershell
cd d:\KhetSmart\backend
.\.venv\Scripts\python.exe -m ingest.diagnose_environment
.\.venv\Scripts\python.exe -m ingest.diagnose_copernicus
```

---

## API

`GET /api/yield/forecast` returns:

- `savi`, `gndvi`, `veg_index`
- `environment_layers`: `{ vegetation, weather, soil, mandi, pressure }`

Weekly job writes `data/environment_latest.json` for fast reads (satellite refreshed weekly; weather live on each request).

---

## Composite vegetation index

| NDVI band | NDVI weight | SAVI | GNDVI |
|-----------|-------------|------|-------|
| &lt; 0.50 (early) | 22% | **48%** | 30% |
| 0.50–0.65 | 38% | 32% | 30% |
| ≥ 0.65 | **48%** | 18% | 34% |

---

## Weather stress (potato)

- **Heat:** days with Tmax ≥ 32°C (30d) → yield ↓, glut ↑
- **Drought:** &lt; 25 mm rain in 14d
- **Waterlogging:** &gt; 85 mm in 7d
- **Solar:** 30d shortwave radiation vs corridor floor

No API key required for Open-Meteo.
