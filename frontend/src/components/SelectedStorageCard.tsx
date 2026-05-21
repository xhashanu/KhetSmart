import type { ColdStorage } from "../api";

type Props = {
  storage: ColdStorage;
  isRouteTarget?: boolean;
};

export function SelectedStorageCard({ storage, isRouteTarget }: Props) {
  const hot = storage.utilization_pct >= 85;

  return (
    <article
      className={`storage-card storage-card--detail ${hot ? "storage-card--hot" : ""} ${isRouteTarget ? "storage-card--selected" : ""}`}
    >
      <div
        className="storage-card__ring"
        style={{ "--pct": `${storage.utilization_pct}` } as React.CSSProperties}
      >
        <span>{storage.utilization_pct}%</span>
      </div>
      <div className="storage-card__body">
        <strong>{storage.name}</strong>
        <span>{storage.district}</span>
        <span className="storage-card__free">
          {storage.available_quintals.toLocaleString("en-IN")} q free
        </span>
        {isRouteTarget && (
          <span className="storage-card__route-badge">Recommended route (Farmer)</span>
        )}
      </div>
    </article>
  );
}
