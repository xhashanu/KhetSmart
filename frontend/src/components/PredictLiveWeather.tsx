import type { YieldForecast } from "../api";
import type { AppLanguage } from "../hooks/useAppSettings";

type WeatherLayer = NonNullable<
  NonNullable<YieldForecast["environment_layers"]>["weather"]
>;

type Props = {
  weather: WeatherLayer;
  language: AppLanguage;
};

const LABELS = {
  en: {
    title: "Live weather",
    live: "LIVE",
    now: "Now",
    feels: "Feels",
    humidity: "Humidity",
    wind: "Wind",
    rain14d: "Rain (14d)",
    heatDays: "Hot days (30d)",
    forecast: "5-day forecast",
    stress: "Stress signals",
    source: "Source",
    statusLocation: "Location",
    locationUnknown: "Unknown location",
    stale: "Data may be stale",
    fallback: "Using corridor baseline — check OpenWeather API key in backend/.env",
  },
  bn: {
    title: "লাইভ আবহাওয়া",
    live: "লাইভ",
    now: "এখন",
    feels: "অনুভূত",
    humidity: "আর্দ্রতা",
    wind: "বাতাস",
    rain14d: "বৃষ্টি (১৪ দিন)",
    heatDays: "গরম দিন (৩০ দিন)",
    forecast: "৫ দিনের পূর্বাভাস",
    stress: "চাপের সংকেত",
    source: "উৎস",
    statusLocation: "অবস্থান",
    locationUnknown: "অজানা অবস্থান",
    stale: "ডেটা পুরনো হতে পারে",
    fallback: "করিডর বেসলাইন — backend/.env এ OPENWEATHER_API_KEY যোগ করুন",
  },
  hi: {
    title: "लाइव मौसम",
    live: "लाइव",
    now: "अभी",
    feels: "महसूस",
    humidity: "नमी",
    wind: "हवा",
    rain14d: "बारिश (14d)",
    heatDays: "गरम दिन (30d)",
    forecast: "5 दिन का पूर्वानुमान",
    stress: "तनाव संकेत",
    source: "स्रोत",
    statusLocation: "स्थान",
    locationUnknown: "अज्ञात स्थान",
    stale: "डेटा पुराना हो सकता है",
    fallback: "कॉरिडोर बेसलाइन — backend/.env में OPENWEATHER_API_KEY जोड़ें",
  },
} as const;

type ForecastDay = {
  date?: string;
  label?: string;
  temp_min_c?: number;
  temp_max_c?: number;
  pop_max_pct?: number;
  rain_mm?: number;
  icon?: string;
  description?: string;
};

export function PredictLiveWeather({ weather, language }: Props) {
  const t = LABELS[language];
  // Render this component only for verified live OpenWeather data.
  const isLive = Boolean(weather.is_live_openweather && weather.available);
  if (!isLive) return null;
  const forecast = (weather.forecast_days as ForecastDay[] | undefined) ?? [];
  const locationLabel = weather.location_accuracy === "gps" ? "GPS" : "Corridor";
  const sourceLabel = weather.source || "OpenWeather";

  const stresses = weather.stresses ?? [];
  const nowStress = stresses.find((s) => s.startsWith("Now:"));
  const corridorStresses = stresses.filter((s) => !s.startsWith("Now:"));

  return (
    <section
      className={`predict-live-weather ${isLive ? "predict-live-weather--live" : ""}`}
    >
      <div className="predict-live-weather__head">
        <h3 className="predict-live-weather__title">{t.title}</h3>
        <span
          className={`predict-live-weather__badge ${isLive ? "predict-live-weather__badge--on" : ""}`}
        >
          {isLive ? `● ${t.live}` : sourceLabel}
        </span>
      </div>
      <div className="predict-live-weather__meta">
        <span>{weather.location_name ?? t.locationUnknown}</span>
        <span>
          {t.statusLocation}: {locationLabel}
        </span>
        {weather.updated_label && <span>{weather.updated_label}</span>}
        {weather.is_stale && <span className="predict-live-weather__stale">{t.stale}</span>}
      </div>

      <div className="predict-live-weather__now">
        {weather.weather_icon_url && (
          <img
            className="predict-live-weather__icon"
            src={weather.weather_icon_url}
            alt=""
            width={64}
            height={64}
          />
        )}
        <div className="predict-live-weather__now-copy">
          <p className="predict-live-weather__location">
            {weather.location_name ?? "Damodar corridor"}
          </p>
          <p className="predict-live-weather__desc">
            {weather.weather_description ?? weather.weather_main ?? "—"}
          </p>
          <p className="predict-live-weather__temp">
            <span className="predict-live-weather__temp-val">
              {weather.current_temp_c != null ? `${weather.current_temp_c}°C` : "—"}
            </span>
            {weather.feels_like_c != null && (
              <span className="predict-live-weather__feels">
                {t.feels} {weather.feels_like_c}°C
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="predict-live-weather__grid">
        <div className="predict-live-weather__stat">
          <span className="predict-live-weather__stat-lbl">{t.humidity}</span>
          <strong>{weather.humidity_pct != null ? `${weather.humidity_pct}%` : "—"}</strong>
        </div>
        <div className="predict-live-weather__stat">
          <span className="predict-live-weather__stat-lbl">{t.wind}</span>
          <strong>{weather.wind_kph != null ? `${weather.wind_kph} km/h` : "—"}</strong>
        </div>
        <div className="predict-live-weather__stat">
          <span className="predict-live-weather__stat-lbl">{t.rain14d}</span>
          <strong>
            {weather.precip_mm_14d != null ? `${weather.precip_mm_14d} mm` : "—"}
          </strong>
        </div>
        <div className="predict-live-weather__stat">
          <span className="predict-live-weather__stat-lbl">{t.heatDays}</span>
          <strong>{weather.heat_stress_days_30d ?? "—"}</strong>
        </div>
      </div>

      {forecast.length > 0 && (
        <div className="predict-live-weather__forecast">
          <p className="predict-live-weather__forecast-title">{t.forecast}</p>
          <div className="predict-live-weather__forecast-row">
            {forecast.map((day) => (
              <article key={day.date ?? day.label} className="predict-live-weather__day">
                {day.icon && (
                  <img
                    src={`https://openweathermap.org/img/wn/${day.icon}@2x.png`}
                    alt=""
                    width={36}
                    height={36}
                  />
                )}
                <span className="predict-live-weather__day-label">{day.label}</span>
                <span className="predict-live-weather__day-temp">
                  {day.temp_min_c}–{day.temp_max_c}°
                </span>
                <span className="predict-live-weather__day-rain">
                  {day.rain_mm ?? 0}mm · {day.pop_max_pct ?? 0}%
                </span>
              </article>
            ))}
          </div>
        </div>
      )}

      {(nowStress || corridorStresses.length > 0) && (
        <div className="predict-live-weather__stresses">
          <p className="predict-live-weather__stresses-title">{t.stress}</p>
          {nowStress && (
            <p className="predict-live-weather__stress-now">{nowStress.replace(/^Now:\s*/, "")}</p>
          )}
          {corridorStresses.length > 0 && (
            <ul className="predict-live-weather__stress-list">
              {corridorStresses.slice(0, 2).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* No fallback messaging shown — component only appears for real live data. */}
    </section>
  );
}
