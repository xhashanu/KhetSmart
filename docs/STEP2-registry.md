# Step 2 — Official cold-storage registry CSV

Replace the 488 **model-generated** facilities with a real registry file.

---

## A. Where to get official data

### Option 1 — data.gov.in (recommended)

1. Log in at [data.gov.in](https://data.gov.in) (same account as mandi API).
2. Open: **State/UT-wise Details of Cold Storage Facilities**  
   Search: `cold storage facilities` → West Bengal / All India.
3. Click **Download** → **CSV** (or use **Data API** if export is large).
4. You may get columns like: State, District, Block, Facility name, Capacity, etc.

Direct catalog (may change):  
https://www.data.gov.in/resource/stateut-wise-details-cold-storage-facilities-created-country-31052024

### Option 2 — State / cooperative sources

- WB Horticulture / Agriculture department cold-chain lists  
- FCI / cooperative cold storage directories  
- APMC / cold storage operator associations  

### Option 3 — Keep corridor seed until official file arrives

Your current `cold_storages_registry.csv` has **8 verified** + model rows.  
You can import **only verified rows** you collect manually into the template.

---

## B. Target file format (required columns)

Save as: **`backend/data/cold_storages_registry.csv`**

| Column | Required | Example |
|--------|----------|---------|
| `id` | yes | `CS-001` or `WB-BUR-014` |
| `name` | yes | `Burdwan CS #14` |
| `district` | yes | `Purba Bardhaman` |
| `block` | no | `Burdwan` |
| `lat` | yes | `23.2324` |
| `lng` | yes | `87.8615` |
| `capacity_quintals` | yes | `12000` |
| `utilization_pct` | yes | `72` (0–100, % **full**) |
| `operator_phone` | no | `98XXXXXXXX` |
| `registry_source` | no | `data.gov.in May 2024` |
| `verified` | no | `yes` or `no` |

Template: `backend/data/cold_storages_registry.template.csv`

---

## C. One command (recommended)

Fetches official **state/UT** CSV from data.gov.in (or bundled snapshot), expands **West Bengal** into **496 facilities** (8 verified + 488 district-placed), backs up old registry, imports DB:

```powershell
cd d:\KhetSmart\backend
.\.venv\Scripts\python.exe -m ingest.sync_registry_ogd
```

Offline (use existing download only):

```powershell
.\.venv\Scripts\python.exe -m ingest.sync_registry_ogd --skip-fetch
```

> **Note:** Most OGD cold-storage files are **state-level** (State, Number of storages, Capacity MT) — not facility lat/lng. The converter uses official WB totals and district placement; replace with a facility-level export when you have one.

---

## D. Manual steps (optional)

**Fetch only:**

```powershell
.\.venv\Scripts\python.exe -m ingest.fetch_registry_ogd
```

**Convert** (if you downloaded CSV yourself):

```powershell
.\.venv\Scripts\python.exe -m ingest.convert_ogd_registry --input data\downloads\ogd_cold_storage_latest.csv
```

**Import:**

```powershell
.\.venv\Scripts\python.exe -m ingest.import_registry --replace
```

Expected output:

```text
{'total': 496, 'rows_in_csv': 496, 'verified_in_csv': 120, ...}
```

Or in the app: **Ops** → **Re-import registry CSV**  
(if `ADMIN_API_KEY` is set, enter it in Ops first)

---

## E. Verify

```powershell
curl http://127.0.0.1:8000/api/health
```

Expect `"storages": 496` (or your row count).

Open app → **Network** tab → map + list should reflect new districts.

---

## F. Tips

- **Lat/lng**: Use Google Maps or district centroids if the govt file has only addresses.  
- **Capacity**: Convert tonnes → quintals (×10) if the source uses MT.  
- **496 facilities**: India has many cold storages; filter **West Bengal** + **potato belt districts** if the national file is huge.  
- **Backup** before replace:  
  `copy data\cold_storages_registry.csv data\cold_storages_registry.backup.csv`

---

## G. After import

Run weekly NDVI so glut signal uses new geography:

```powershell
.\.venv\Scripts\python.exe -m ingest.run_weekly
```
