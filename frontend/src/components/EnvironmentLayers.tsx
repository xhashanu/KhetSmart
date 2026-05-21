import { useState } from "react";
import type { YieldForecast } from "../api";

type Layers = NonNullable<YieldForecast["environment_layers"]>;

type Props = {
  layers: Layers;
};

function priorityClass(priority?: string) {
  if (priority === "high") return "env-nitrogen--high";
  if (priority === "medium") return "env-nitrogen--medium";
  return "";
}

function LayerPill({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <span className={`env-pill ${warn ? "env-pill--warn" : ""}`}>
      <span className="env-pill__k">{label}</span>
      <span className="env-pill__v">{value}</span>
    </span>
  );
}

export function EnvironmentLayers({ layers }: Props) {
  const [open, setOpen] = useState(false);
  const veg = layers.vegetation;
  const weather = layers.weather;
  const moisture = layers.moisture;
  const soil = layers.soil;
  const nitrogen = layers.nitrogen;

  const summary = [
    <LayerPill key="ndvi" label="NDVI" value={veg?.ndvi?.toFixed(2) ?? "—"} />,
    <LayerPill
      key="heat"
      label="Heat"
      value={`${weather?.heat_stress_days_30d ?? "—"}d`}
      warn={(weather?.heat_stress_days_30d ?? 0) >= 8}
    />,
    <LayerPill
      key="moist"
      label="Soil H₂O"
      value={moisture?.status ?? "—"}
      warn={moisture?.drought_stress}
    />,
    <LayerPill
      key="n"
      label="N"
      value={nitrogen?.level === "moderate" || nitrogen?.level === "critical" ? "Low" : "OK"}
      warn={nitrogen?.priority === "high" || nitrogen?.priority === "medium"}
    />,
  ];

  return (
    <section className="env-panel">
      <button
        type="button"
        className="env-panel__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="env-panel__toggle-text">
          <strong>Environment layers</strong>
          <span>Sentinel-2 · ERA5 · SoilGrids · GNDVI-N</span>
        </div>
        <span className="env-panel__chev">{open ? "▲" : "▼"}</span>
      </button>

      {!open && <div className="env-pills">{summary}</div>}

      {open && (
        <div className="env-panel__body animate-in">
          <div className="env-panel__grid">
            <article className="env-layer env-layer--sat">
              <h4>Remote sensing</h4>
              <ul>
                <li>
                  <strong>NDVI</strong> {veg?.ndvi?.toFixed(3) ?? "—"}
                </li>
                <li>
                  <strong>SAVI</strong> {veg?.savi?.toFixed(3) ?? "—"}
                </li>
                <li>
                  <strong>GNDVI</strong> {veg?.gndvi?.toFixed(3) ?? "—"}
                </li>
                <li>
                  Composite <strong>{veg?.composite_index?.toFixed(3) ?? "—"}</strong>
                </li>
              </ul>
            </article>

            <article className="env-layer env-layer--wx">
              <h4>Weather · 30d</h4>
              <ul>
                <li>
                  T<sub>max</sub> {weather?.temp_max_c_30d ?? "—"}°C · {weather?.heat_stress_days_30d ?? 0}{" "}
                  hot days
                </li>
                <li>
                  Rain {weather?.precip_mm_14d ?? "—"} mm (14d)
                </li>
                <li>Factor ×{weather?.yield_factor ?? 1}</li>
              </ul>
            </article>

            <article className="env-layer env-layer--soil">
              <h4>Soil</h4>
              <ul>
                <li>
                  {soil?.texture_class} · pH {soil?.ph}
                </li>
                <li>{soil?.potato_suitability} suitability</li>
              </ul>
            </article>

            <article className="env-layer env-layer--moisture">
              <h4>ERA5 moisture</h4>
              <ul>
                <li>
                  Root {moisture?.rootzone_moisture_m3_m3 ?? "—"} m³/m³
                </li>
                <li>
                  <strong>{moisture?.status}</strong>
                  {moisture?.drought_stress && (
                    <span className="env-layer__warn"> · stress</span>
                  )}
                </li>
              </ul>
            </article>
          </div>

          <article
            className={`env-layer env-nitrogen env-nitrogen--full ${priorityClass(nitrogen?.priority)}`}
          >
            <h4>Nitrogen · GNDVI</h4>
            <p className="env-nitrogen__headline">{nitrogen?.headline}</p>
            <p className="env-nitrogen__rec">{nitrogen?.recommendation}</p>
            <p className="env-nitrogen__dose">
              Side-dress <strong>{nitrogen?.suggested_n_kg_per_ha ?? "—"} kg N/ha</strong>
            </p>
          </article>
        </div>
      )}
    </section>
  );
}
