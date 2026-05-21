# Priority 2 — Production polish

## 1. Distress price vs live mandi (Farmer tab)

After **Get Route + Micro-loan**, the **Distress sell vs KhetSmart route** card shows:

- Distress floor **Rs 200/quintal** (pitch benchmark)
- Live mandi price from the recommended route
- Revenue uplift for your quantity

Backend: `services/price_compare.py` · included in `POST /api/consult` as `price_comparison`.

---

## 2. OSRM road distances

Routing scores top facilities with haversine, then refines **top 25** with OSRM driving distance.

```env
USE_OSRM=true
OSRM_BASE_URL=https://router.project-osrm.org
```

Set `USE_OSRM=false` to use straight-line only (faster, offline-friendly).

Route `why` lines and UI show **km road (OSRM)** when the public router responds.

---

## 3. Secure Ops (ADMIN_API_KEY)

Add to `backend/.env`:

```env
ADMIN_API_KEY=your_long_random_secret_here
REQUIRE_ADMIN_AUTH=true
```

Restart API. In app **Ops** tab → **Unlock Ops** with the same key.

- Without `ADMIN_API_KEY`: dev mode (Ops open).
- With key set: pipelines, occupancy, registry import require unlock.

Verify endpoint: `POST /api/admin/verify` with header `X-Admin-Key`.

---

## Quick test

```powershell
cd d:\KhetSmart\backend
.\.venv\Scripts\python.exe -c "from main import app; print('ok')"

cd d:\KhetSmart\frontend
npm run build
```

Farmer consult → distress card + OSRM km. Ops → lock screen when `ADMIN_API_KEY` is set.
