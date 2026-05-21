"""Test all Predict environment layers.

  python -m ingest.diagnose_environment
"""
from database import SessionLocal
from services.era5_moisture import fetch_era5_soil_moisture
from services.nitrogen_advisory import nitrogen_from_gndvi
from services.soil_signal import fetch_corridor_soil
from services.weather_signal import fetch_corridor_weather
from services.yield_model import build_environment_layers


def main():
    print("=== KhetSmart environment layers ===\n")

    w = fetch_corridor_weather()
    print(f"Weather: {w.get('source')} — OK={w.get('ok')}")
    print(f"  30d Tmax avg: {w.get('temp_max_c_30d')}°C · heat days: {w.get('heat_stress_days_30d')}")
    print(f"  14d rain: {w.get('precip_mm_14d')} mm · yield factor: {w.get('yield_factor')}")
    print(f"  {w.get('detail')}\n")

    m = fetch_era5_soil_moisture()
    print(f"ERA5 soil moisture: {m.get('source')} — OK={m.get('ok')}")
    print(
        f"  Surface {m.get('depth_surface_cm')} cm: {m.get('surface_moisture_m3_m3')} m³/m³ · "
        f"Root {m.get('depth_rootzone_cm')} cm: {m.get('rootzone_moisture_m3_m3')} m³/m³"
    )
    print(f"  Status: {m.get('status')} · {m.get('detail')}\n")

    s = fetch_corridor_soil()
    print(f"Soil: {s.get('source')} — OK={s.get('ok')}")
    print(
        f"  {s.get('texture_class')} — sand {s.get('sand_pct')}% · "
        f"clay {s.get('clay_pct')}% · pH {s.get('ph')}"
    )
    print(f"  Suitability: {s.get('potato_suitability')} · {s.get('detail')}\n")

    db = SessionLocal()
    try:
        p = build_environment_layers(db, fetch_satellite=True)
        veg = p["layers"]["vegetation"]
        print(f"Satellite: {p['source']}")
        print(
            f"  NDVI {veg['ndvi']} · SAVI {veg['savi']} · GNDVI {veg['gndvi']} · "
            f"composite {veg['composite_index']}"
        )
        n = p.get("nitrogen") or p["layers"].get("nitrogen", {})
        print(f"  Glut {p['glut_risk_pct']}% · Yield {p['predicted_yield_million_quintals']}M q")
        print(f"  Nitrogen: {n.get('headline')} — {n.get('suggested_n_kg_per_ha')} kg N/ha")
    finally:
        db.close()

    print("\nNext: python -m ingest.run_weekly")


if __name__ == "__main__":
    main()
