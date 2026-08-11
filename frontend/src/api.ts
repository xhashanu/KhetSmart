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
    tenure_days?: number;
    bank_partner: string;
    grn_id: string;
    trigger_reason: string;
  };
}

export interface InsurancePlan {
  id: string;
  name_en: string;
  name_bn: string;
  name_hi?: string;
  type: string;
  premium_inr: number;
  coverage_inr: number;
  provider: string;
  phone: string;
  highlights_bn: string[];
  highlights_en: string[];
  highlights_hi?: string[];
  quantity_quintals: number;
  recommended: boolean;
}

export interface InsuranceOffersResponse {
  plans: InsurancePlan[];
  quantity_quintals: number;
  crop: string;
  recommended_plan_id: string | null;
}

export interface MandiAuction {
  id: string;
  mandi_name: string;
  district: string;
  crop: string;
  quantity_quintals: number;
  grade: string;
  start_price_per_quintal: number;
  current_bid_per_quintal: number;
  bidders: number;
  ends_in_hours: number;
  status: "live" | "upcoming" | string;
}

export interface AuctionsResponse {
  auctions: MandiAuction[];
  live_count: number;
  crop: string;
  best_match_id: string | null;
  farmer_quantity_quintals: number | null;
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
      ok?: boolean;
      is_live_openweather?: boolean;
      fetched_at?: string;
      location_name?: string;
      current_temp_c?: number;
      feels_like_c?: number;
      temp_range?: string;
      humidity_pct?: number;
      wind_kph?: number;
      wind_speed_ms?: number;
      weather_main?: string;
      weather_description?: string;
      weather_icon?: string;
      weather_icon_url?: string;
      temp_max_c_30d?: number;
      temp_min_c_30d?: number;
      temp_mean_c_30d?: number;
      precip_mm_14d?: number;
      precip_mm_7d?: number;
      precipitation_mm?: number | string;
      precip_mm_next_24h?: number;
      pop_max_48h_pct?: number;
      location_accuracy?: string;
      updated_label?: string;
      is_stale?: boolean;
      wet_dry_anomaly?: string;
      solar_radiation_mj_m2_30d?: number;
      heat_stress_days_30d?: number;
      frost_risk_days_30d?: number;
      drought_risk?: boolean;
      waterlogging_risk?: boolean;
      yield_factor?: number;
      stresses?: string[];
      forecast_days?: Array<{
        date?: string;
        label?: string;
        temp_min_c?: number;
        temp_max_c?: number;
        pop_max_pct?: number;
        rain_mm?: number;
        icon?: string;
        description?: string;
      }>;
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

export interface LogisticsVehicle {
  type: string;
  capacity_quintals: number;
  available: number;
  plate: string;
}

export interface LogisticsVendor {
  id: string;
  name: string;
  district: string;
  phone: string;
  rating: number;
  services: string[];
  vehicles: LogisticsVehicle[];
  pickup_distance_km: number;
  route_distance_km: number;
  estimated_quote_inr: number;
  vehicles_available: number;
  max_capacity_quintals: number;
  can_carry_load: boolean;
  destination_name?: string | null;
}

export interface LogisticsVendorsResponse {
  vendors: LogisticsVendor[];
  recommended_vendor_id: string | null;
  quantity_quintals: number;
  destination_name: string | null;
  route_distance_km: number;
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

export interface VoiceConversationState {
  phase?: string;
  conversation_language?: string;
  pending_harvest?: {
    quantity_quintals: number;
    crop: string;
    district?: string | null;
    transcript?: string;
  } | null;
  partial_crop?: string | null;
  last_consult?: boolean;
}

export interface VoiceDiagnosticsPayload {
  microphone?: string;
  audio_captured?: boolean;
  audio_bytes?: number;
  audio_mime?: string | null;
  stt_provider?: string | null;
  stt_status?: string;
  stt_engine?: string;
  transcript?: string | null;
  detected_language?: string | null;
  intent?: string | null;
  entities?: Record<string, unknown> | null;
  backend_api?: string | null;
  tts_status?: string;
}

export interface VoiceConverseResponse {
  ok: boolean;
  phase?: string;
  transcribed_text?: string;
  detected_language: string;
  conversation_language?: string;
  response_text: string;
  response_ssml: string | null;
  response_audio_base64?: string | null;
  intent: string;
  entities: {
    crop?: string | null;
    quantity_quintals?: number | null;
    district?: string | null;
    timing?: string | null;
    confirmation?: string | null;
    unit?: string | null;
  };
  needs_confirmation: boolean;
  confirmation_text: string | null;
  suggested_actions: string[];
  consult_result?: ConsultResponse | null;
  conversation_state?: VoiceConversationState;
  diagnostics?: VoiceDiagnosticsPayload;
  stt_provider?: string | null;
  is_live_gemini: boolean;
}

export async function converseFarmer(opts: {
  text?: string | null;
  context?: Record<string, unknown> | null;
  conversationState?: VoiceConversationState | null;
  audioBase64?: string | null;
  audioMime?: string | null;
  farmerLat?: number | null;
  farmerLng?: number | null;
}): Promise<VoiceConverseResponse> {
  const body: Record<string, unknown> = {
    text: opts.text ? opts.text.trim() : null,
    context: opts.context ?? null,
    conversation_state: opts.conversationState ?? null,
  };

  const loc = opts.context?.location as { lat?: number; lng?: number } | undefined;
  const lat = opts.farmerLat ?? loc?.lat;
  const lng = opts.farmerLng ?? loc?.lng;
  if (lat != null) body.farmer_lat = lat;
  if (lng != null) body.farmer_lng = lng;

  if (opts.audioBase64) {
    body.audio_base64 = opts.audioBase64;
    body.audio_mime = opts.audioMime || "audio/webm";
  }

  const res = await fetch("/api/voice/converse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || "Voice conversation failed");
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

export async function fetchYield(location?: { lat: number; lng: number } | null): Promise<YieldForecast> {
  const qs = new URLSearchParams();
  if (location?.lat != null && location?.lng != null) {
    qs.set("lat", String(location.lat));
    qs.set("lng", String(location.lng));
  }
  const url = qs.toString() ? `/api/yield/forecast?${qs.toString()}` : "/api/yield/forecast";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Yield fetch failed");
  return res.json();
}

export interface AiPredictionResponse {
  ok: boolean;
  is_live_gemini: boolean;
  report: string;
  api_key_configured: boolean;
  weather_live?: boolean;
  weather_source?: string;
}

export async function fetchAiPrediction(
  lang = "bn",
  location?: { lat: number; lng: number } | null
): Promise<AiPredictionResponse> {
  const qs = new URLSearchParams();
  qs.set("lang", lang);
  if (location?.lat != null && location?.lng != null) {
    qs.set("lat", String(location.lat));
    qs.set("lng", String(location.lng));
  }
  const res = await fetch(`/api/yield/ai-prediction?${qs.toString()}`);
  if (!res.ok) throw new Error("AI Prediction fetch failed");
  return res.json();
}

export async function fetchStorages(forMap = false): Promise<ColdStorage[]> {
  const res = await fetch(`/api/storages?for_map=${forMap}`);
  if (!res.ok) throw new Error("Storages fetch failed");
  return res.json();
}

export async function fetchLogisticsVendors(params: {
  quantity_quintals: number;
  farmer_lat?: number;
  farmer_lng?: number;
  destination_lat?: number;
  destination_lng?: number;
  destination_name?: string;
}): Promise<LogisticsVendorsResponse> {
  const q = new URLSearchParams();
  q.set("quantity_quintals", String(params.quantity_quintals));
  if (params.farmer_lat != null) q.set("farmer_lat", String(params.farmer_lat));
  if (params.farmer_lng != null) q.set("farmer_lng", String(params.farmer_lng));
  if (params.destination_lat != null) {
    q.set("destination_lat", String(params.destination_lat));
  }
  if (params.destination_lng != null) {
    q.set("destination_lng", String(params.destination_lng));
  }
  if (params.destination_name) q.set("destination_name", params.destination_name);
  const res = await fetch(`/api/logistics/vendors?${q}`);
  if (!res.ok) throw new Error("Logistics vendors fetch failed");
  return res.json();
}

export async function fetchInsuranceOffers(params: {
  quantity_quintals: number;
  glut_risk_pct: number;
  crop?: string;
}): Promise<InsuranceOffersResponse> {
  const q = new URLSearchParams();
  q.set("quantity_quintals", String(params.quantity_quintals));
  q.set("glut_risk_pct", String(params.glut_risk_pct));
  if (params.crop) q.set("crop", params.crop);
  const res = await fetch(`/api/finance/insurance?${q}`);
  if (!res.ok) throw new Error("Insurance fetch failed");
  return res.json();
}

export async function fetchAuctions(params?: {
  crop?: string;
  district?: string;
  quantity_quintals?: number;
}): Promise<AuctionsResponse> {
  const q = new URLSearchParams();
  if (params?.crop) q.set("crop", params.crop);
  if (params?.district) q.set("district", params.district);
  if (params?.quantity_quintals != null) {
    q.set("quantity_quintals", String(params.quantity_quintals));
  }
  const res = await fetch(`/api/finance/auctions?${q}`);
  if (!res.ok) throw new Error("Auctions fetch failed");
  return res.json();
}

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error("Health fetch failed");
  return res.json();
}

export interface FarmerProfile {
  id: string;
  phone: string;
  name: string;
  district: string | null;
  has_pin?: boolean;
  created_at: string | null;
}

export interface OtpSendResponse {
  ok: boolean;
  phone: string;
  expires_in_seconds: number;
  resend_after_seconds: number;
  dev_otp?: string;
}

export interface OtpVerifyResponse {
  status: "logged_in" | "needs_profile";
  token?: string;
  farmer?: FarmerProfile;
  has_pin?: boolean;
  signup_token?: string;
  phone?: string;
}

export interface FarmerAuthResponse {
  token: string;
  farmer: FarmerProfile;
}

function authHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function parseAuthError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: string };
    return data.detail ?? "request_failed";
  } catch {
    return "request_failed";
  }
}

export async function sendFarmerOtp(phone: string): Promise<OtpSendResponse> {
  const res = await fetch("/api/auth/otp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) throw new Error(await parseAuthError(res));
  return res.json();
}

export async function verifyFarmerOtp(
  phone: string,
  otp: string
): Promise<OtpVerifyResponse> {
  const res = await fetch("/api/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, otp }),
  });
  if (!res.ok) throw new Error(await parseAuthError(res));
  return res.json();
}

export async function completeFarmerOtpSignup(body: {
  signup_token: string;
  name: string;
  district?: string | null;
}): Promise<FarmerAuthResponse> {
  const res = await fetch("/api/auth/otp/complete-signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseAuthError(res));
  const data = await res.json();
  return { token: data.token, farmer: data.farmer };
}

export async function setFarmerPin(
  token: string,
  pin: string,
  pin_confirm: string
): Promise<{ farmer: FarmerProfile }> {
  const res = await fetch("/api/auth/pin/set", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ pin, pin_confirm }),
  });
  if (!res.ok) throw new Error(await parseAuthError(res));
  return res.json();
}

export async function farmerSignup(body: {
  phone: string;
  name: string;
  pin: string;
  district?: string | null;
}): Promise<FarmerAuthResponse> {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 409) throw new Error("phone_already_registered");
    if (res.status === 400) throw new Error("invalid_signup");
    throw new Error("Signup failed");
  }
  return res.json();
}

export async function farmerLogin(body: {
  phone: string;
  pin: string;
}): Promise<FarmerAuthResponse> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await parseAuthError(res);
    if (detail === "pin_not_set") throw new Error("pin_not_set");
    if (res.status === 401) throw new Error("invalid_credentials");
    throw new Error("Login failed");
  }
  return res.json();
}

export async function fetchFarmerMe(token: string): Promise<{ farmer: FarmerProfile }> {
  const res = await fetch("/api/auth/me", {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("not_authenticated");
  return res.json();
}

export async function farmerLogout(token: string): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: authHeaders(token),
  });
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

export interface PaymentConfigResponse {
  razorpay_enabled: boolean;
  key_id: string | null;
}

export async function fetchVoiceConfig(): Promise<{
  gemini_stt: boolean;
  stt_mode?: string;
  web_speech_disabled?: boolean;
}> {
  const res = await fetch("/api/voice/config");
  if (!res.ok) return { gemini_stt: false };
  return res.json();
}

export async function transcribeVoiceAudio(
  blob: Blob,
  languageHint: "en" | "bn" | "hi"
): Promise<{ text: string; engine?: string }> {
  const form = new FormData();
  form.append("audio", blob, "farmer-voice.webm");
  form.append("language_hint", languageHint);
  const res = await fetch("/api/voice/transcribe", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || "transcribe_failed");
  }
  return res.json();
}

export async function fetchPaymentConfig(): Promise<PaymentConfigResponse> {
  const res = await fetch("/api/payments/config");
  if (!res.ok) return { razorpay_enabled: false, key_id: null };
  return res.json();
}

export interface PaymentOrderResponse {
  order_id: string;
  amount: number;
  amount_inr: number;
  currency: string;
  receipt: string;
  key_id: string;
}

export async function createPaymentOrder(
  amount_inr: number,
  receipt_ref?: string
): Promise<PaymentOrderResponse> {
  const res = await fetch("/api/payments/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount_inr, receipt_ref }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail || "payment_order_failed"
    );
  }
  return res.json();
}

export async function verifyRazorpayPayment(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<{ verified: boolean; payment_id: string; order_id: string }> {
  const res = await fetch("/api/payments/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail || "payment_verify_failed"
    );
  }
  return res.json();
}
