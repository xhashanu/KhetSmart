import type { NdviHistoryPoint } from "../api";

type Props = {
  ndvi: number;
  history?: NdviHistoryPoint[];
};

function formatLabel(iso: string | null, index: number, total: number) {
  if (!iso) {
    if (index === 0) return "Earlier";
    if (index === total - 1) return "Now";
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return index === total - 1 ? "Now" : "";
  if (index === total - 1) return "Now";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function NdviChart({ ndvi, history = [] }: Props) {
  const series =
    history.length >= 2
      ? history.map((h) => h.ndvi)
      : [0.52, 0.58, 0.61, 0.64, 0.67, 0.69, ndvi];

  const labels =
    history.length >= 2
      ? history.map((h, i) => formatLabel(h.recorded_at, i, history.length))
      : ["−6w", "−3w", "Now"];

  const min = Math.min(0.45, ...series) - 0.02;
  const max = Math.max(0.75, ...series) + 0.02;
  const w = 300;
  const h = 100;
  const pad = 10;

  const coords = series.map((v, i) => {
    const x = pad + (i / Math.max(series.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    return { x, y, v };
  });

  const area = `${pad},${h - pad} ${coords.map((c) => `${c.x},${c.y}`).join(" ")} ${w - pad},${h - pad}`;
  const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const trend =
    series.length >= 2 && series[series.length - 1] > series[series.length - 2]
      ? "Rising"
      : series.length >= 2
        ? "Stable"
        : "";

  return (
    <div className="ndvi-chart">
      <div className="ndvi-chart__header">
        <span>NDVI trend (Sentinel-2 corridor)</span>
        <div className="ndvi-chart__header-right">
          {trend && <span className="ndvi-chart__trend">{trend}</span>}
          <strong>{ndvi.toFixed(3)}</strong>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="ndvi-chart__svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ndviFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2d5a45" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#2d5a45" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((frac) => {
          const y = h - pad - frac * (h - pad * 2);
          return (
            <line
              key={frac}
              x1={pad}
              y1={y}
              x2={w - pad}
              y2={y}
              stroke="rgba(26,61,46,0.06)"
              strokeWidth="1"
            />
          );
        })}
        <polygon points={area} fill="url(#ndviFill)" />
        <polyline
          points={line}
          fill="none"
          stroke="#2d5a45"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === coords.length - 1 ? 5 : 3}
            fill={i === coords.length - 1 ? "#e8b923" : "#2d5a45"}
            stroke="#1a3d2e"
            strokeWidth={i === coords.length - 1 ? 2 : 1}
            opacity={i === coords.length - 1 ? 1 : 0.7}
          />
        ))}
      </svg>
      <div className="ndvi-chart__labels">
        {labels.map((lab, i) => (
          <span key={`${lab}-${i}`}>{lab || " "}</span>
        ))}
      </div>
    </div>
  );
}
