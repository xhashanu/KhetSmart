import { useCallback, useEffect, useState } from "react";
import {
  fetchYield,
  fetchYieldHistory,
  fetchAiPrediction,
  type AiPredictionResponse,
  type NdviHistoryPoint,
  type YieldForecast,
} from "../api";
import { PredictHero } from "./PredictHero";
import { PredictLiveWeather } from "./PredictLiveWeather";
import { PredictSignalsRow } from "./PredictSignalsRow";
import { PredictNextSteps } from "./PredictNextSteps";
import type { AppLanguage } from "../hooks/useAppSettings";

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

function parseBold(text: string) {
  const parts = text.split(/\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} style={{ color: "#fff", fontWeight: "bold" }}>
        {part}
      </strong>
    ) : (
      part
    )
  );
}

function renderMarkdown(md: string) {
  return md.split("\n").map((line, i) => {
    const clean = line.trim();
    if (!clean) return <div key={i} style={{ height: "8px" }} />;

    if (
      clean.startsWith("1.") ||
      clean.startsWith("2.") ||
      clean.startsWith("3.") ||
      clean.startsWith("4.") ||
      clean.startsWith("5.") ||
      clean.startsWith("###") ||
      clean.startsWith("##")
    ) {
      const display = clean
        .replace(/^(1\.|2\.|3\.|4\.|5\.|###|##)\s*/, "")
        .replace(/\*\*/g, "");
      return (
        <h4
          key={i}
          style={{
            color: "#e8b923",
            margin: "20px 0 10px 0",
            fontSize: "1.05rem",
            borderBottom: "1px dashed #334155",
            paddingBottom: "6px",
            display: "flex",
            gap: "6px",
            fontWeight: "bold",
          }}
        >
          {display}
        </h4>
      );
    }

    if (clean.startsWith("-") || clean.startsWith("*")) {
      const display = clean.replace(/^[-*]\s*/, "");
      return (
        <li
          key={i}
          style={{
            marginLeft: "16px",
            marginBottom: "8px",
            listStyleType: "disc",
            color: "#cbd5e1",
            fontSize: "0.9rem",
            lineHeight: "1.4",
          }}
        >
          {parseBold(display)}
        </li>
      );
    }

    return (
      <p
        key={i}
        style={{
          margin: "0 0 10px 0",
          color: "#94a3b8",
          fontSize: "0.9rem",
          lineHeight: "1.5",
        }}
      >
        {parseBold(clean)}
      </p>
    );
  });
}

type Props = {
  totalStorages: number;
  onGoNetwork?: () => void;
  language?: AppLanguage;
  farmerLocation?: { lat: number; lng: number } | null;
};

export function PredictPanel({
  totalStorages,
  onGoNetwork,
  language = "bn",
  farmerLocation = null,
}: Props) {
  const [yieldData, setYieldData] = useState<YieldForecast | null>(null);
  const [, setHistory] = useState<NdviHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // AI Brain state variables
  const [aiReport, setAiReport] = useState<AiPredictionResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [y, h] = await Promise.all([
        fetchYield(farmerLocation ?? null),
        fetchYieldHistory(),
      ]);
      setYieldData(y);
      setHistory(h.points);
    } catch {
      setYieldData(null);
    } finally {
      setLoading(false);
    }
  }, [farmerLocation]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerateAi = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const data = await fetchAiPrediction(language, farmerLocation ?? null);
      setAiReport(data);
    } catch {
      setAiError(
        language === "bn"
          ? "পূর্বাভাস পেতে সমস্যা হয়েছে। আবার চেষ্টা করুন।"
          : "Failed to generate AI crop prediction. Try again."
      );
    } finally {
      setAiLoading(false);
    }
  }, [language, farmerLocation]);

  useEffect(() => {
    if (aiReport) {
      handleGenerateAi();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

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

  const simple = true;

  return (
    <div className="predict-view predict-view--simple animate-in">
      <PredictHero
        data={yieldData}
        sourceLabel={friendlySource(yieldData.satellite_source)}
        simple={simple}
        language={language}
      />

      <PredictSignalsRow
        mandiAvg={yieldData.mandi_avg_price}
        mandiMin={yieldData.mandi_min_price}
        mandiMarkets={yieldData.mandi_markets}
        mandiGlutAdjust={yieldData.mandi_glut_adjust}
        utilPct={utilPct}
        totalStorages={totalStorages}
        critical={critical}
        simple={simple}
        language={language}
      />

      {yieldData.environment_layers?.weather && (
        <PredictLiveWeather
          weather={yieldData.environment_layers.weather}
          language={language}
        />
      )}

      {/* GEMINI AI AGRICULTURAL BRAIN PANEL */}
      <section className="predict-gemini">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.5rem" }} role="img" aria-label="brain">
              🧠
            </span>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  fontWeight: "bold",
                  color: "#fff",
                }}
              >
                {language === "bn" ? "জেমিনি এআই এগ্রিকালচারাল ব্রেন" : "Gemini AI Crop Brain"}
              </h3>
              <span style={{ fontSize: "0.75rem", color: "#a78bfa" }}>
                Multi-spectral meteorological processor
              </span>
            </div>
          </div>
          {aiReport && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "4px 8px",
                  borderRadius: "20px",
                  backgroundColor: aiReport.is_live_gemini
                    ? "rgba(232, 185, 35, 0.2)"
                    : "rgba(139, 92, 246, 0.2)",
                  color: aiReport.is_live_gemini ? "#e8b923" : "#c084fc",
                  fontWeight: "bold",
                  border: aiReport.is_live_gemini
                    ? "1px solid #e8b923"
                    : "1px solid #a78bfa",
                }}
              >
                {aiReport.is_live_gemini ? "⚡ GEMINI LIVE" : "🌱 LOCAL AI"}
              </span>
              {aiReport.weather_live && (
                <span
                  style={{
                    fontSize: "0.65rem",
                    color: "#86efac",
                    fontWeight: 600,
                  }}
                >
                  ● OpenWeather data
                </span>
              )}
            </div>
          )}
        </div>

        <p
          style={{
            fontSize: "0.85rem",
            color: "#94a3b8",
            lineHeight: "1.4",
            marginBottom: "16px",
          }}
        >
          {language === "bn"
            ? "লাইভ OpenWeather + স্যাটেলাইট (NDVI/SAVI/GNDVI), মাটি ও মান্ডি ডেটা বিশ্লেষণ করে পরবর্তী মৌসুমের আলু পূর্বাভাস পান।"
            : language === "hi"
              ? "लाइव OpenWeather + उपग्रह (NDVI/SAVI/GNDVI), मिट्टी और मंडी डेटा से अगले सीजन की आलू भविष्यवाणी।"
              : "Analyzes live OpenWeather feeds plus satellite (NDVI/SAVI/GNDVI), soil, and mandi data for next-season potato outlook."}
        </p>

        {aiError && (
          <p style={{ color: "#ef4444", fontSize: "0.85rem", marginBottom: "12px" }}>
            ❌ {aiError}
          </p>
        )}

        {!aiReport && !aiLoading && (
          <button
            type="button"
            onClick={handleGenerateAi}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              border: "none",
              background: "linear-gradient(90deg, #8b5cf6 0%, #6d28d9 100%)",
              color: "#fff",
              fontWeight: "bold",
              fontSize: "0.95rem",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(139, 92, 246, 0.4)",
              transition: "transform 0.2s ease",
            }}
          >
            {language === "bn" ? "✨ এআই ফসল পূর্বাভাস পান" : "✨ Generate AI Crop Prediction"}
          </button>
        )}

        {aiLoading && (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              className="spinner"
              style={{
                borderColor: "#a78bfa",
                borderTopColor: "transparent",
                width: "36px",
                height: "36px",
              }}
            />
            <span
              style={{
                fontSize: "0.85rem",
                color: "#c084fc",
                animation: "pulse 1.5s infinite",
              }}
            >
              {language === "bn"
                ? "জেমিনি এআই আবহাওয়া এবং উপগ্রহ তথ্য বিশ্লেষণ করছে…"
                : "Gemini is analyzing multi-spectral canopy and weather layers…"}
            </span>
          </div>
        )}

        {aiReport && !aiLoading && (
          <div style={{ marginTop: "16px" }}>
            {/* RENDER REPORT */}
            <div
              style={{
                backgroundColor: "rgba(15, 23, 42, 0.6)",
                borderRadius: "12px",
                padding: "16px",
                border: "1px solid #334155",
                maxHeight: "380px",
                overflowY: "auto",
                textAlign: "left",
              }}
            >
              {renderMarkdown(aiReport.report)}
            </div>

            {/* PROTO TIP IF LOCAL AI */}
            {!aiReport.api_key_configured && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(232, 185, 35, 0.1)",
                  border: "1px solid rgba(232, 185, 35, 0.3)",
                  fontSize: "0.78rem",
                  color: "#e8b923",
                  lineHeight: "1.4",
                }}
              >
                💡{" "}
                {language === "bn"
                  ? "রিয়েল-টাইম লাইভ জেমিনি পূর্বাভাসের জন্য, backend/.env ফাইলে GEMINI_API_KEY=your_key সেট করুন।"
                  : "To activate live Gemini predictions, set GEMINI_API_KEY=your_key in backend/.env file."}
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerateAi}
              style={{
                marginTop: "12px",
                width: "100%",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #334155",
                backgroundColor: "transparent",
                color: "#a78bfa",
                fontSize: "0.85rem",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              🔄 {language === "bn" ? "পূর্বাভাস রিফ্রেশ করুন" : "Refresh Prediction"}
            </button>
          </div>
        )}
      </section>

      <PredictNextSteps
        actions={actions}
        alertLevel={yieldData.alert_level}
        glutPct={yieldData.glut_risk_pct}
        onGoNetwork={onGoNetwork}
        simple={simple}
        language={language}
      />
    </div>
  );
}
