import type { LogisticsVendor } from "../api";
import type { AppLanguage } from "../hooks/useAppSettings";
import { tFarmer, vehicleSummary } from "../i18n/farmerSimple";
import { IconTruck } from "./icons";

type Props = {
  vendors: LogisticsVendor[];
  recommendedId?: string | null;
  selectedVendorId?: string | null;
  onSelectVendor?: (vendor: LogisticsVendor) => void;
  destinationName?: string;
  quantityQ: number;
  routeDistanceKm?: number;
  loading?: boolean;
  onBack: () => void;
  formatInr: (n: number) => string;
  language?: AppLanguage;
};

function shortName(name: string, max = 32) {
  if (name.length <= max) return name;
  return `${name.slice(0, max)}…`;
}

export function LogisticsVendorsPanel({
  vendors,
  recommendedId,
  selectedVendorId,
  onSelectVendor,
  destinationName,
  quantityQ,
  loading = false,
  onBack,
  formatInr,
  language = "bn",
}: Props) {
  const t = tFarmer(language);

  return (
    <div
      className="logistics-vendors logistics-vendors--simple animate-in"
      role="region"
      aria-labelledby="logistics-vendors-title"
    >
      <header className="logistics-vendors__banner">
        <button
          type="button"
          className="logistics-vendors__back"
          onClick={onBack}
          aria-label={t.vendorsBack}
        >
          <span className="logistics-vendors__back-icon" aria-hidden>
            ←
          </span>
          {t.vendorsBack}
        </button>
        <div className="logistics-vendors__banner-body">
          <h2 id="logistics-vendors-title" className="logistics-vendors__title">
            {t.vendorsTitle}
          </h2>
          <p className="logistics-vendors__sub">
            {quantityQ} {t.unitQuintal}
            {destinationName ? ` → ${shortName(destinationName, 28)}` : ""}
          </p>
        </div>
      </header>

      {loading && (
        <div className="loading-cards">
          <div className="skeleton skeleton--tall" />
        </div>
      )}

      {!loading && vendors.length === 0 && (
        <p className="logistics-vendors__empty">{t.vendorsEmpty}</p>
      )}

      {!loading && (
        <div className="logistics-vendors__list">
          {vendors.map((v) => {
            const isRecommended = v.id === recommendedId;
            const isSelected = v.id === selectedVendorId;
            const readyCount = v.vehicles_available;

            return (
              <article
                key={v.id}
                className={`logistics-vendor-card logistics-vendor-card--simple ${isRecommended ? "logistics-vendor-card--rec" : ""} ${isSelected ? "logistics-vendor-card--selected" : ""}`}
                style={isSelected ? { border: "2px solid #3d8f5f" } : undefined}
              >
                <div className="logistics-vendor-card__head">
                  <span className="logistics-vendor-card__icon" aria-hidden>
                    <IconTruck className="logistics-vendor-card__icon-svg" />
                  </span>
                  <div className="logistics-vendor-card__meta">
                    <strong>{shortName(v.name)}</strong>
                    <span>
                      {Math.round(v.pickup_distance_km)} {t.vendorsKm}
                      {readyCount > 0 &&
                        ` · ${readyCount} ${t.vendorsTrucks}`}
                    </span>
                  </div>
                  {isRecommended && (
                    <span className="logistics-vendor-card__badge">{t.vendorsBest}</span>
                  )}
                </div>

                <div className="logistics-vendor-card__quote logistics-vendor-card__quote--simple">
                  <span className="logistics-vendor-card__quote-lbl">{t.vendorsPrice}</span>
                  <strong className="logistics-vendor-card__quote-amt">
                    {formatInr(v.estimated_quote_inr)}
                  </strong>
                </div>

                <p className="logistics-vendor-card__vehicle-line">
                  🚛 {vehicleSummary(v.vehicles, language)}
                </p>

                <div className="logistics-vendor-card__actions" style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <button
                    type="button"
                    onClick={() => onSelectVendor?.(v)}
                    className={`btn-select ${isSelected ? "btn-select--active" : ""}`}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: isSelected ? "none" : "1px solid #e8b923",
                      backgroundColor: isSelected ? "#3d8f5f" : "transparent",
                      color: isSelected ? "#fff" : "#e8b923",
                      fontWeight: "bold",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px"
                    }}
                  >
                    {isSelected ? `✓ ${t.selectedVendor || "Selected"}` : t.chooseVendor || "Select"}
                  </button>

                  <a
                    className="logistics-vendor-card__call logistics-vendor-card__call--primary"
                    href={`tel:${v.phone.replace(/\s/g, "")}`}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      backgroundColor: "#1e293b",
                      color: "#f8fafc",
                      border: "none",
                      fontSize: "0.9rem",
                      fontWeight: "bold",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    📞 {t.vendorsCall}
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
