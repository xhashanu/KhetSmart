import { useCallback, useEffect, useState } from "react";
import {
  fetchYield,
  fetchYieldHistory,
  type NdviHistoryPoint,
  type YieldForecast,
} from "../api";
import { EnvironmentLayers } from "./EnvironmentLayers";
import { NdviChart } from "./NdviChart";
import { PredictHero } from "./PredictHero";
import { PredictSignalsRow } from "./PredictSignalsRow";
import { PredictNextSteps } from "./PredictNextSteps";
import { IconSatellite } from "./icons";

function friendlySource(satelliteSource: string) {
  if (satelliteSource.toLowerCase().includes("copernicus")) {
    return "Sentinel-2 · Copernicus";
  }
  if (satelliteSource.toLowerCase().includes("weekly")) {
    return "Weekly corridor update";
  }
  return "Live prediction";
}

function farmerActions(alert: string, glut: number) {
  if (alert === "HIGH" || glut >= 70) {
    return [
      "Book cold storage early — network filling fast",
      "Micro-loan before distress sell (₹200/q)",
      "Route to spare capacity on Network map",
    ];
  }
  if (alert === "MEDIUM" || glut >= 55) {
    return [
      "Monitor mandi daily — prices may soften",
      "Target storages below 85% fill",
      "Run Farmer tab for route + loan",
    ];
  }
  return [
    "Yield band manageable for corridor",
    "NDVI stable — normal harvest plan",
    "Check Network for spare capacity",
  ];
}

type Props = {
  totalStorages: number;
  onGoNetwork?: () => void;
};

export function PredictPanel({ totalStorages, onGoNetwork }: Props) {
  const [yieldData, setYieldData] = useState<YieldForecast | null>(null);
  const [history, setHistory] = useState<NdviHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [y, h] = await Promise.all([fetchYield(), fetchYieldHistory()]);
      setYieldData(y);
      setHistory(h.points);
    } catch {
      setYieldData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !yieldData) {
    return (
      <div className="predict-view">
        <div className="loading-cards">
          <div className="skeleton skeleton--hero" />
          <div className="skeleton" />
        </div>
      </div>
    );
  }

  if (!yieldData) {
    return (
      <p className="network-hint">Start backend on port 8000 to load yield forecast.</p>
    );
  }

  const actions = farmerActions(yieldData.alert_level, yieldData.glut_risk_pct);
  const utilPct = yieldData.avg_storage_util_pct ?? 60;
  const critical = yieldData.storages_critical ?? 0;

  return (
    <div className="predict-view predict-view--pro animate-in">
      <PredictHero data={yieldData} sourceLabel={friendlySource(yieldData.satellite_source)} />

      <PredictSignalsRow
        mandiAvg={yieldData.mandi_avg_price}
        mandiMin={yieldData.mandi_min_price}
        mandiMarkets={yieldData.mandi_markets}
        mandiGlutAdjust={yieldData.mandi_glut_adjust}
        utilPct={utilPct}
        totalStorages={totalStorages}
        critical={critical}
      />

      <section className="predict-chart-card">
        <NdviChart ndvi={yieldData.ndvi} history={history} />
      </section>

      {yieldData.environment_layers ? (
        <EnvironmentLayers layers={yieldData.environment_layers} />
      ) : null}

      <PredictNextSteps
        actions={actions}
        alertLevel={yieldData.alert_level}
        glutPct={yieldData.glut_risk_pct}
        onGoNetwork={onGoNetwork}
      />

      <p className="predict-lulc-foot">
        <IconSatellite />
        <span>
          <strong>{yieldData.lulc_potato_acres.toLocaleString("en-IN")}</strong> potato acres ·
          Damodar LULC
        </span>
      </p>
    </div>
  );
}
