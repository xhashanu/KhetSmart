export interface FarmerParseResult {
  quantity_quintals: number;
  crop: string;
  district: string | null;
  confidence: number;
  raw_text: string;
  quantity_found: boolean;
  needs_confirmation: boolean;
}

export interface ConsultOverrides {
  quantity_quintals: number;
  crop: string;
  district?: string | null;
}

export interface ConsultResponse {
  parsed: {
    quantity_quintals: number;
    crop: string;
    district: string | null;
    confidence: number;
    quantity_found?: boolean;
    user_confirmed?: boolean;
  };
  yield_signal: {
    glut_risk_pct: number;
    alert_level: string;
    ndvi: number;
    insight: string;
    data_source?: string;
    recorded_at?: string | null;
  };
  route: {
    storage_id?: string;
    storage_name: string;
    district: string;
    distance_km: number;
    distance_source?: string;
    logistics_cost_inr: number;
    estimated_profit_inr: number;
    market_price_per_quintal: number;
    market_name?: string;
    origin_lat?: number;
    origin_lng?: number;
    storage_lat?: number;
    storage_lng?: number;
    market_lat?: number;
    market_lng?: number;
    why?: string[];
  };
  price_comparison: {
    distress_price_per_quintal: number;
    live_mandi_price_per_quintal: number;
    cultivation_cost_per_quintal: number;
    quantity_quintals: number;
    revenue_at_live_inr: number;
    revenue_at_distress_inr: number;
    uplift_vs_distress_inr: number;
    below_cultivation_cost: boolean;
    in_distress_zone: boolean;
    headline: string;
    detail: string;
  };
  loan: {
    approved: boolean;
    amount_inr: number;
    interest_rate_pa: number;
    bank_partner: string;
    grn_id: string;
    trigger_reason: string;
  };
}

export interface YieldForecast {
  region: string;
  ndvi: number;
  predicted_yield_million_quintals: number;
  glut_risk_pct: number;
  weeks_to_harvest: number;
  satellite_source: string;
  lulc_potato_acres: number;
  alert_level: string;
  insight: string;
  data_source?: string;
  recorded_at?: string | null;
  storages_total?: number;
  storages_critical?: number;
  avg_storage_util_pct?: number;
  mandi_avg_price?: number | null;
  mandi_min_price?: number | null;
  mandi_markets?: number;
  mandi_glut_adjust?: number;
  mandi_signal?: string;
  glut_base_pct?: number;
  savi?: number;
  gndvi?: number;
  veg_index?: number;
  environment_layers?: {
    vegetation?: {
      ndvi?: number;
      savi?: number;
      gndvi?: number;
      composite_index?: number;
      detail?: string;
    };
    weather?: {
      temp_max_c_30d?: number;
      temp_min_c_30d?: number;
      precip_mm_14d?: number;
      precip_mm_7d?: number;
      solar_radiation_mj_m2_30d?: number;
      heat_stress_days_30d?: number;
      drought_risk?: boolean;
      waterlogging_risk?: boolean;
      yield_factor?: number;
      detail?: string;
      source?: string;
    };
    soil?: {
      texture_class?: string;
      sand_pct?: number;
      clay_pct?: number;
      ph?: number;
      organic_carbon_pct?: number;
      potato_suitability?: string;
      yield_factor?: number;
      detail?: string;
      source?: string;
    };
    moisture?: {
      surface_moisture_m3_m3?: number;
      rootzone_moisture_m3_m3?: number;
      rootzone_moisture_7d_avg?: number;
      status?: string;
      drought_stress?: boolean;
      waterlogging_risk?: boolean;
      yield_factor?: number;
      detail?: string;
      source?: string;
    };
    nitrogen?: {
      headline?: string;
      recommendation?: string;
      suggested_n_kg_per_ha?: string;
      level?: string;
      priority?: string;
      gndvi?: number;
      gndvi_band?: string;
    };
    mandi?: Record<string, unknown>;
    pressure?: Record<string, unknown>;
  };
  nitrogen_advisory?: {
    headline?: string;
    recommendation?: string;
    suggested_n_kg_per_ha?: string;
    level?: string;
    priority?: string;
    gndvi?: number;
  };
}

export type NdviHistoryPoint = {
  recorded_at: string | null;
  ndvi: number;
  glut_risk_pct?: number;
};

export async function fetchYieldHistory(): Promise<{ points: NdviHistoryPoint[] }> {
  const res = await fetch("/api/yield/history");
  if (!res.ok) throw new Error("Yield history failed");
  return res.json();
}

export interface HealthInfo {
  status: string;
  demo_mode: boolean;
  storages: number;
}

export interface AdminStorageRow {
  id: string;
  name: string;
  district: string;
  utilization_pct: number;
  available_quintals: number;
  updated_at: string | null;
}

export interface ColdStorage {
  id: string;
  name: string;
  district: string;
  lat?: number;
  lng?: number;
  capacity_quintals: number;
  available_quintals: number;
  utilization_pct: number;
}

export async function parseFarmerText(text: string): Promise<FarmerParseResult> {
  const res = await fetch("/api/nlp/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.trim() }),
  });
  if (!res.ok) {
    if (res.status === 400) throw new Error("text_required");
    throw new Error("Parse failed");
  }
  return res.json();
}

export async function consultFarmer(
  text: string,
  location?: { lat: number; lng: number } | null,
  overrides?: ConsultOverrides | null
): Promise<ConsultResponse> {
  const body: {
    text: string;
    farmer_lat?: number;
    farmer_lng?: number;
    quantity_quintals?: number;
    crop?: string;
    district?: string | null;
  } = { text: text.trim() };
  if (location) {
    body.farmer_lat = location.lat;
    body.farmer_lng = location.lng;
  }
  if (overrides) {
    body.quantity_quintals = overrides.quantity_quintals;
    body.crop = overrides.crop;
    if (overrides.district !== undefined) {
      body.district = overrides.district;
    }
  }
  const res = await fetch("/api/consult", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 400) throw new Error("text_required");
    throw new Error("Consult failed");
  }
  return res.json();
}

export async function fetchYield(): Promise<YieldForecast> {
  const res = await fetch("/api/yield/forecast");
  if (!res.ok) throw new Error("Yield fetch failed");
  return res.json();
}

export async function fetchStorages(forMap = false): Promise<ColdStorage[]> {
  const res = await fetch(`/api/storages?for_map=${forMap}`);
  if (!res.ok) throw new Error("Storages fetch failed");
  return res.json();
}

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error("Health fetch failed");
  return res.json();
}

const ADMIN_KEY_STORAGE = "khetsmart_admin_key";
const ADMIN_VERIFIED_STORAGE = "khetsmart_admin_verified";

export interface AdminConfig {
  auth_required: boolean;
  hint: string;
}

export async function fetchAdminConfig(): Promise<AdminConfig> {
  const res = await fetch("/api/admin/config");
  if (!res.ok) throw new Error("Admin config failed");
  return res.json();
}

export async function verifyAdminKey(key: string): Promise<{ ok: boolean }> {
  const res = await fetch("/api/admin/verify", {
    method: "POST",
    headers: { "X-Admin-Key": key },
  });
  if (!res.ok) throw new Error("Invalid admin key");
  return res.json();
}

export function isAdminVerified(): boolean {
  return sessionStorage.getItem(ADMIN_VERIFIED_STORAGE) === "1";
}

export function setAdminVerified(ok: boolean) {
  if (ok) sessionStorage.setItem(ADMIN_VERIFIED_STORAGE, "1");
  else sessionStorage.removeItem(ADMIN_VERIFIED_STORAGE);
}

export function getAdminKey(): string {
  return localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
}

export function setAdminKey(key: string) {
  localStorage.setItem(ADMIN_KEY_STORAGE, key);
}

function adminHeaders(): HeadersInit {
  const key = getAdminKey();
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (key) h["X-Admin-Key"] = key;
  return h;
}

export async function fetchAdminStorages(
  q = "",
  district = "",
  limit = 50
): Promise<AdminStorageRow[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q) params.set("q", q);
  if (district) params.set("district", district);
  const res = await fetch(`/api/admin/storages?${params}`, { headers: adminHeaders() });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("Admin storages fetch failed");
  return res.json();
}

export async function fetchAdminDistricts(): Promise<{ district: string; count: number }[]> {
  const res = await fetch("/api/admin/districts", { headers: adminHeaders() });
  if (!res.ok) throw new Error("Districts fetch failed");
  return res.json();
}

export async function updateStorageUtilization(
  storageId: string,
  utilization_pct: number
): Promise<void> {
  const res = await fetch(`/api/admin/storages/${storageId}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ utilization_pct }),
  });
  if (!res.ok) throw new Error("Update failed");
}

export async function triggerMandiIngest(): Promise<{ ingested: number }> {
  const res = await fetch("/api/admin/ingest/mandi", {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Mandi ingest failed");
  return res.json();
}

export async function triggerNdviIngest(): Promise<{ glut_risk_pct: number; ndvi: number }> {
  const res = await fetch("/api/admin/ingest/ndvi", {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("NDVI ingest failed");
  return res.json();
}

export async function runDailyJob(): Promise<Record<string, unknown>> {
  const res = await fetch("/api/admin/jobs/daily", {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Daily job failed");
  return res.json();
}

export async function runWeeklyJob(): Promise<Record<string, unknown>> {
  const res = await fetch("/api/admin/jobs/weekly", {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Weekly job failed");
  return res.json();
}

export async function importRegistry(): Promise<Record<string, unknown>> {
  const res = await fetch("/api/admin/registry/import?replace=true", {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Registry import failed");
  return res.json();
}
