import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  consultFarmer,
  fetchHealth,
  fetchLogisticsVendors,
  fetchStorages,
  type ConsultOverrides,
  type ConsultResponse,
  type ColdStorage,
  type LogisticsVendor,
  type LogisticsVendorsResponse,
} from "./api";
import { FinancePanel } from "./components/FinancePanel";
import { OpsOverlay } from "./components/OpsOverlay";
import { SettingsMenu } from "./components/SettingsMenu";
import { FarmerConsultResults } from "./components/FarmerConsultResults";
import { OrdersPanel } from "./components/OrdersPanel";
import { PredictPanel } from "./components/PredictPanel";
import { SelectedStorageCard } from "./components/SelectedStorageCard";
import { StorageMap, type RoutePath } from "./components/StorageMap";
import { FarmerHeaderLocation } from "./components/FarmerHeaderLocation";
import { LogisticsVendorsPanel } from "./components/LogisticsVendorsPanel";
import { VoiceAssistantPanel } from "./components/VoiceAssistantPanel";
import {
  DEFAULT_HARVEST_SELECTION,
  harvestConsultText,
} from "./utils/harvest";
import { AuthModal } from "./components/AuthModal";
import { LocationPermissionModal } from "./components/LocationPermissionModal";
import { IconMic, IconRupee, IconSatellite, IconWarehouse } from "./components/icons";
import { useAppSettings } from "./hooks/useAppSettings";
import { useFarmerAuth } from "./hooks/useFarmerAuth";
import { useFarmerLocation } from "./hooks/useFarmerLocation";
import { useOnboarding } from "./hooks/useOnboarding";
import { tNav } from "./i18n/farmerSimple";

type Tab = "farmer" | "predict" | "network" | "finance" | "orders";

const TAB_ICONS: Record<Tab, ReactNode> = {
  farmer: <IconMic className="tab-icon" />,
  predict: <IconSatellite className="tab-icon" />,
  network: <IconWarehouse className="tab-icon" />,
  finance: <IconRupee className="tab-icon" />,
  orders: (
    <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  ),
};

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function App() {
  const [tab, setTab] = useState<Tab>("farmer");
  const [financeSubTab, setFinanceSubTab] = useState<"loan" | "insurance" | "auction">("loan");
  const [harvestSelection, setHarvestSelection] = useState<ConsultOverrides>(
    DEFAULT_HARVEST_SELECTION
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConsultResponse | null>(null);
  const [storages, setStorages] = useState<ColdStorage[]>([]);
  const [selectedStorageId, setSelectedStorageId] = useState<string | null>(null);
  const [totalStorages, setTotalStorages] = useState(496);
  const farmerLocation = useFarmerLocation();
  const farmerAuth = useFarmerAuth();
  const { language, fontSize, setLanguage, setFontSize } = useAppSettings();
  const locationStepSignal =
    !farmerLocation.showModal &&
    (farmerLocation.hasLocation ||
      farmerLocation.status === "denied" ||
      farmerLocation.status === "unavailable");
  const onboarding = useOnboarding(
    locationStepSignal,
    farmerAuth.isReady && !farmerAuth.hydrating
  );
  const [authBusy, setAuthBusy] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [mapFocusKey] = useState(0);
  const [showLogisticsVendors, setShowLogisticsVendors] = useState(false);
  const [logisticsVendors, setLogisticsVendors] = useState<LogisticsVendor[]>([]);
  const [logisticsMeta, setLogisticsMeta] = useState<LogisticsVendorsResponse | null>(
    null
  );
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<LogisticsVendor | null>(null);
  const [planRefreshing, setPlanRefreshing] = useState(false);
  const lastFetchedSelectionRef = useRef<{ quantity: number; crop: string } | null>(null);

  const loadPredict = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        fetchStorages(tab === "network"),
        fetchHealth(),
      ]);
      setStorages(s);
      setTotalStorages(h.storages);
      setError(null);
    } catch {
      setError("Backend not running. Start API on port 8000.");
    }
  }, [tab]);

  useEffect(() => {
    loadPredict();
  }, [loadPredict]);

  const locationPayload = farmerLocation.coords
    ? { lat: farmerLocation.coords.lat, lng: farmerLocation.coords.lng }
    : null;

  useEffect(() => {
    if (!result) return;

    const last = lastFetchedSelectionRef.current;
    if (
      last &&
      last.quantity === harvestSelection.quantity_quintals &&
      last.crop === harvestSelection.crop
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setPlanRefreshing(true);
        try {
          const q = harvestSelection.quantity_quintals;
          const c = harvestSelection.crop;
          const data = await consultFarmer(
            harvestConsultText(harvestSelection),
            locationPayload,
            harvestSelection
          );
          setResult(data);
          lastFetchedSelectionRef.current = { quantity: q, crop: c };
          setSelectedVendor(null);
        } catch {
          /* keep previous plan */
        } finally {
          setPlanRefreshing(false);
        }
      })();
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    harvestSelection.quantity_quintals,
    harvestSelection.crop,
    result,
    locationPayload,
  ]);

  useEffect(() => {
    if (result?.route.storage_id) {
      setSelectedStorageId(result.route.storage_id);
    } else if (result?.route.storage_name) {
      const match = storages.find((s) => s.name === result.route.storage_name);
      if (match) setSelectedStorageId(match.id);
    }
  }, [result, storages]);

  const routePath: RoutePath | null =
    result?.route?.origin_lat != null &&
    result.route.storage_lat != null &&
    result.route.market_lat != null
      ? {
          origin: [result.route.origin_lat, result.route.origin_lng!],
          storage: [result.route.storage_lat, result.route.storage_lng!],
          market: [result.route.market_lat, result.route.market_lng!],
          storageName: result.route.storage_name,
          marketName: result.route.market_name ?? "Mandi",
          storageId: result.route.storage_id,
        }
      : null;

  const selectedStorage =
    storages.find((s) => s.id === selectedStorageId) ??
    storages.find((s) => s.name === result?.route.storage_name) ??
    null;

  async function handleShowAllVendors() {
    if (!result?.route) return;
    setShowLogisticsVendors(true);
    setVendorsLoading(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const data = await fetchLogisticsVendors({
        quantity_quintals: result.parsed.quantity_quintals,
        farmer_lat: farmerLocation.coords?.lat,
        farmer_lng: farmerLocation.coords?.lng,
        destination_lat: result.route.storage_lat,
        destination_lng: result.route.storage_lng,
        destination_name: result.route.storage_name,
      });
      setLogisticsVendors(data.vendors);
      setLogisticsMeta(data);
    } catch {
      setShowLogisticsVendors(false);
      setError("Could not load transport vendors. Start API on port 8000.");
    } finally {
      setVendorsLoading(false);
    }
  }

  const nav = tNav(language);

  const showLocationModal =
    onboarding.phase === "location" && farmerLocation.showModal;
  const showAuthModal =
    !farmerAuth.isAuthenticated &&
    ((onboarding.phase === "auth" && !farmerAuth.hydrating) || authPromptOpen);
  const appUnlocked = onboarding.phase === "app";

  return (
    <div
      className={`app-shell app-shell--simple${showLogisticsVendors && tab === "farmer" ? " app-shell--logistics-vendors" : ""}${!appUnlocked ? " app-shell--onboarding" : ""}`}
    >
      <LocationPermissionModal
        open={showLocationModal}
        language={language}
        status={
          farmerLocation.status === "requesting"
            ? "requesting"
            : farmerLocation.status === "denied" || farmerLocation.status === "unavailable"
              ? farmerLocation.status
              : "prompt"
        }
        error={farmerLocation.error}
        onAllow={farmerLocation.requestLocation}
        onDismiss={() => {
          farmerLocation.setShowModal(false);
          onboarding.completeLocationStep();
        }}
      />

      <AuthModal
        open={showAuthModal}
        language={language}
        busy={authBusy}
        showGuestOption={false}
        sendOtp={async (phone) => {
          setAuthBusy(true);
          try {
            return await farmerAuth.sendOtp(phone);
          } finally {
            setAuthBusy(false);
          }
        }}
        verifyOtp={async (phone, otp) => {
          setAuthBusy(true);
          try {
            return await farmerAuth.verifyOtp(phone, otp);
          } finally {
            setAuthBusy(false);
          }
        }}
        completeSignup={async (signupToken, name) => {
          setAuthBusy(true);
          try {
            await farmerAuth.completeOtpSignup(signupToken, name);
          } finally {
            setAuthBusy(false);
          }
        }}
        onPinLogin={async (phone, pin) => {
          setAuthBusy(true);
          try {
            await farmerAuth.login(phone, pin);
          } finally {
            setAuthBusy(false);
          }
        }}
        onSuccess={() => {
          setAuthPromptOpen(false);
          setSettingsOpen(false);
        }}
        onGuest={() => {
          farmerAuth.continueAsGuest();
          setAuthPromptOpen(false);
        }}
        onClose={() => {
          if (!farmerAuth.isAuthenticated) {
            farmerAuth.continueAsGuest();
          }
          setAuthPromptOpen(false);
        }}
      />

      <header className="header">
        <div className="header__glow" aria-hidden />
        <div className="header-top">
          <div className="header-top__left">
            <p className="header__eyebrow">Agri-FinTech · West Bengal</p>
            <h1 className="brand">KhetSmart</h1>
          </div>
          <button
            type="button"
            className="header__logo header__logo--btn"
            aria-label="Settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <span aria-hidden>🥔</span>
          </button>
        </div>
        {tab === "farmer" && (
          <div className="header-loc-wrap">
            <FarmerHeaderLocation
              status={farmerLocation.status}
              coords={farmerLocation.coords}
              error={farmerLocation.error}
              onEnable={farmerLocation.openPermissionModal}
              language={language}
            />
          </div>
        )}
        <SettingsMenu
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          language={language}
          fontSize={fontSize}
          onLanguageChange={setLanguage}
          onFontSizeChange={setFontSize}
          onOpenOps={() => setOpsOpen(true)}
          isAuthenticated={farmerAuth.isAuthenticated}
          farmer={farmerAuth.farmer}
          onOpenLoginSignup={() => {
            setSettingsOpen(false);
            setAuthPromptOpen(true);
          }}
          onOpenOrders={() => setTab("orders")}
          onLogout={async () => {
            await farmerAuth.logout();
            setSettingsOpen(false);
            setAuthPromptOpen(false);
            farmerLocation.setShowModal(true);
          }}
          onSetPin={
            farmerAuth.token
              ? async (pin, pinConfirm) => {
                  await farmerAuth.setPin(pin, pinConfirm);
                }
              : undefined
          }
        />
      </header>

      <main className="main">
        {error && <p className="error-banner">{error}</p>}

        {tab === "farmer" && (
          <div className="farmer-view">
            {!showLogisticsVendors && (
              <VoiceAssistantPanel
                language={language}
                compact={!!result}
                onConsultReady={(consult, harvest) => {
                  setHarvestSelection(harvest);
                  setResult(consult);
                  setError(null);
                  lastFetchedSelectionRef.current = {
                    quantity: harvest.quantity_quintals,
                    crop: harvest.crop,
                  };
                }}
                onExecuteAction={(action) => {
                  if (action === "find_storage") {
                    setTab("network");
                  } else if (action === "check_price") {
                    setTab("predict");
                  } else if (action === "apply_loan") {
                    setTab("finance");
                  }
                }}
                context={{
                  location: farmerLocation.coords,
                  district: farmerLocation.coords ? "detected" : null,
                }}
              />
            )}

            {showLogisticsVendors && (
              <LogisticsVendorsPanel
                vendors={logisticsVendors}
                recommendedId={logisticsMeta?.recommended_vendor_id}
                selectedVendorId={selectedVendor?.id}
                onSelectVendor={(v) => {
                  setSelectedVendor(v);
                  setShowLogisticsVendors(false);
                }}
                destinationName={logisticsMeta?.destination_name ?? result?.route.storage_name}
                quantityQ={logisticsMeta?.quantity_quintals ?? result?.parsed.quantity_quintals ?? 50}
                loading={vendorsLoading}
                onBack={() => setShowLogisticsVendors(false)}
                formatInr={formatInr}
                language={language}
              />
            )}

            {result && !showLogisticsVendors && (
              <FarmerConsultResults
                result={result}
                selection={harvestSelection}
                planRefreshing={planRefreshing}
                formatInr={formatInr}
                selectedVendor={selectedVendor}
                onViewFinance={() => setTab("finance")}
                onShowAllVendors={handleShowAllVendors}
                language={language}
              />
            )}
          </div>
        )}

        {tab === "predict" && (
          <PredictPanel
            totalStorages={totalStorages}
            onGoNetwork={() => setTab("network")}
            language={language}
            farmerLocation={farmerLocation.coords ?? null}
          />
        )}

        {tab === "finance" && (
          <FinancePanel
            result={result}
            formatInr={formatInr}
            onGoFarmer={() => setTab("farmer")}
            language={language}
            activeSubTab={financeSubTab}
            onTabChange={setFinanceSubTab}
          />
        )}

        {tab === "orders" && (
          <OrdersPanel
            language={language}
            formatInr={formatInr}
            onGoFarmer={() => setTab("farmer")}
            onGoAuction={() => {
              setFinanceSubTab("auction");
              setTab("finance");
            }}
          />
        )}

        {tab === "network" && (
          <div className="network-view animate-in">
            <section className="visual-card">
              <h3>{totalStorages} cold storages · live network</h3>
              <StorageMap
                storages={storages}
                totalCount={totalStorages}
                highlight={result?.route.storage_name}
                routePath={routePath}
                selectedId={selectedStorageId}
                focusRouteKey={mapFocusKey}
                onSelect={(s) => setSelectedStorageId(s.id)}
              />
            </section>

            {selectedStorage ? (
              <SelectedStorageCard
                storage={selectedStorage}
                isRouteTarget={result?.route.storage_name === selectedStorage.name}
              />
            ) : (
              <p className="network-hint">Tap a pin on the map to see facility details.</p>
            )}
          </div>
        )}

      </main>

      <OpsOverlay
        open={opsOpen}
        onClose={() => setOpsOpen(false)}
        language={language}
      />

      <nav className="tabs tabs--4" aria-label="Main navigation">
        {(
          [
            { id: "farmer" as const, label: nav.farmer },
            { id: "predict" as const, label: nav.predict },
            { id: "network" as const, label: nav.network },
            { id: "finance" as const, label: nav.finance },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => {
              if (t.id !== "farmer") setShowLogisticsVendors(false);
              setTab(t.id);
            }}
          >
            {TAB_ICONS[t.id]}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
