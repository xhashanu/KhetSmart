import type { FarmerCoords, LocationStatus } from "../hooks/useFarmerLocation";
import type { AppLanguage } from "../hooks/useAppSettings";
import { usePlaceLabel } from "../hooks/usePlaceLabel";
import { tFarmer } from "../i18n/farmerSimple";

type Props = {
  status: LocationStatus;
  coords: FarmerCoords | null;
  error: string | null;
  onEnable: () => void;
  language?: AppLanguage;
};

function PinIcon() {
  return (
    <svg className="header-loc-zomato__pin" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
      />
    </svg>
  );
}

export function FarmerHeaderLocation({
  status,
  coords,
  error,
  onEnable,
  language = "bn",
}: Props) {
  const t = tFarmer(language);
  const live = status === "active" && coords != null;
  const place = usePlaceLabel(coords, live, language);

  if (status === "requesting") {
    return (
      <button type="button" className="header-loc-zomato header-loc-zomato--pending" disabled>
        <PinIcon />
        <span className="header-loc-zomato__text">
          <span className="header-loc-zomato__row">
            <span className="header-loc-zomato__title">{t.gpsAcquiring}</span>
            <span className="spinner header-loc-zomato__spinner" aria-hidden />
          </span>
          <span className="header-loc-zomato__sub">{t.locationBusy}</span>
        </span>
      </button>
    );
  }

  if (live && coords) {
    return (
      <button
        type="button"
        className="header-loc-zomato header-loc-zomato--live"
        onClick={onEnable}
        aria-label={place.title}
      >
        <PinIcon />
        <span className="header-loc-zomato__text">
          <span className="header-loc-zomato__row">
            <span className="header-loc-zomato__title">
              {place.loading ? t.yourFarm : place.title}
            </span>
          </span>
          <span className="header-loc-zomato__sub">
            {place.loading ? "…" : place.subtitle}
          </span>
        </span>
      </button>
    );
  }

  return (
    <button type="button" className="header-loc-zomato header-loc-zomato--off" onClick={onEnable}>
      <PinIcon />
      <span className="header-loc-zomato__text">
        <span className="header-loc-zomato__row">
          <span className="header-loc-zomato__title">{t.setLocation}</span>
        </span>
        <span className="header-loc-zomato__sub">{error ?? t.gpsOffHint}</span>
      </span>
    </button>
  );
}
