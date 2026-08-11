import type { AppLanguage } from "../hooks/useAppSettings";
import { tFarmer } from "../i18n/farmerSimple";
import { IconFarm, IconTruck, IconWarehouse } from "./icons";

type Props = {
  storageName: string;
  storageNameFull?: string;
  distanceKm: number;
  distanceSource?: string;
  costInr: number;
  profitInr: number;
  language?: AppLanguage;
  simple?: boolean;
};

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function RouteFlow({
  storageName,
  storageNameFull,
  distanceKm,
  costInr,
  profitInr,
  language = "bn",
  simple = false,
}: Props) {
  const t = tFarmer(language);
  const distLabel = simple
    ? `${Math.round(distanceKm)} ${t.km}`
    : `${distanceKm} km`;

  return (
    <div className="route-flow route-flow--simple">
      <div className="route-flow__track">
        <span className="route-flow__dot route-flow__dot--a" />
        <span className="route-flow__line" />
        <span className="route-flow__truck-wrap">
          <IconTruck className="route-flow__icon route-flow__icon--truck" />
        </span>
        <span className="route-flow__line route-flow__line--b" />
        <span className="route-flow__dot route-flow__dot--b" />
      </div>
      <div className="route-flow__nodes">
        <div className="route-flow__node">
          <span className="route-flow__bubble route-flow__bubble--farm">
            <IconFarm />
          </span>
          <span className="route-flow__node-label">{t.farm}</span>
        </div>
        <div className="route-flow__node route-flow__node--mid">
          <span className="route-flow__km">{distLabel}</span>
          <span className="route-flow__cost">{formatInr(costInr)}</span>
        </div>
        <div className="route-flow__node">
          <span className="route-flow__bubble route-flow__bubble--storage">
            <IconWarehouse />
          </span>
          <span className="route-flow__node-label" title={storageNameFull ?? storageName}>
            {storageName}
          </span>
        </div>
      </div>
      {!simple && (
        <div className="route-flow__profit">
          <span>Est. profit</span>
          <strong>{formatInr(profitInr)}</strong>
        </div>
      )}
    </div>
  );
}
