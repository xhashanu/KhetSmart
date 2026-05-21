import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAdminConfig,
  fetchAdminDistricts,
  fetchAdminStorages,
  fetchHealth,
  getAdminKey,
  importRegistry,
  isAdminVerified,
  runDailyJob,
  runWeeklyJob,
  setAdminKey,
  setAdminVerified,
  updateStorageUtilization,
  verifyAdminKey,
  type AdminStorageRow,
} from "../api";

function formatAgo(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function utilTone(pct: number) {
  if (pct >= 85) return "critical";
  if (pct >= 70) return "warn";
  return "ok";
}

export function AdminPanel() {
  const [rows, setRows] = useState<AdminStorageRow[]>([]);
  const [districts, setDistricts] = useState<{ district: string; count: number }[]>([]);
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("");
  const [adminKeyInput, setAdminKeyInput] = useState(getAdminKey());
  const [health, setHealth] = useState<{ storages: number; demo_mode: boolean } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [unlocked, setUnlocked] = useState(isAdminVerified());
  const savedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    fetchAdminConfig()
      .then((c) => {
        setAuthRequired(c.auth_required);
        if (!c.auth_required) setUnlocked(true);
      })
      .catch(() => setAuthRequired(false));
  }, []);

  const load = useCallback(async () => {
    if (authRequired && !unlocked) return;
    try {
      const [h, s, d] = await Promise.all([
        fetchHealth(),
        fetchAdminStorages(search, district),
        fetchAdminDistricts().catch(() => []),
      ]);
      setHealth(h);
      setRows(s);
      const snap: Record<string, number> = {};
      s.forEach((r) => {
        snap[r.id] = r.utilization_pct;
      });
      savedRef.current = snap;
      setDistricts(d);
      setMsg(null);
    } catch (e) {
      const err = e instanceof Error ? e.message : "";
      if (err === "UNAUTHORIZED") {
        setUnlocked(false);
        setAdminVerified(false);
        setMsg("Invalid admin key — unlock again.");
      } else {
        setMsg("API offline. Start backend on port 8000.");
      }
    }
  }, [search, district, authRequired, unlocked]);

  useEffect(() => {
    load();
  }, [load]);

  const dirtyCount = useMemo(
    () => rows.filter((r) => savedRef.current[r.id] !== r.utilization_pct).length,
    [rows]
  );

  async function handleUnlock() {
    setLoading(true);
    setMsg(null);
    try {
      const key = adminKeyInput.trim();
      setAdminKey(key);
      await verifyAdminKey(key);
      setAdminVerified(true);
      setUnlocked(true);
      setMsg("Ops unlocked for this session.");
      await load();
    } catch {
      setAdminVerified(false);
      setUnlocked(false);
      setMsg("Wrong admin key. Check backend/.env.");
    } finally {
      setLoading(false);
    }
  }

  function handleLock() {
    setAdminVerified(false);
    setUnlocked(false);
    setRows([]);
    setMsg("Locked.");
  }

  async function saveUtil(id: string, value: number) {
    setLoading(true);
    setMsg(null);
    try {
      await updateStorageUtilization(id, value);
      savedRef.current[id] = value;
      setMsg(`Saved · ${value}% utilization`);
      await load();
    } catch (e) {
      const err = e instanceof Error ? e.message : "";
      setMsg(err === "UNAUTHORIZED" ? "Session expired — unlock again" : "Save failed");
      if (err === "UNAUTHORIZED") {
        setUnlocked(false);
        setAdminVerified(false);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDaily() {
    setLoading(true);
    try {
      const r = await runDailyJob();
      setMsg(`Mandi job done · ${r.markets} markets updated`);
    } catch {
      setMsg("Daily job failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleWeekly() {
    setLoading(true);
    try {
      const r = await runWeeklyJob();
      setMsg(`NDVI weekly done · glut ${r.glut_risk_pct}% · NDVI ${r.ndvi}`);
    } catch {
      setMsg("Weekly job failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegistry() {
    setLoading(true);
    try {
      const r = await importRegistry();
      setMsg(`Registry synced · ${r.total} facilities`);
      await load();
    } catch {
      setMsg("Registry import failed");
    } finally {
      setLoading(false);
    }
  }

  if (authRequired && !unlocked) {
    return (
      <div className="ops-view">
        <section className="ops-lock-card">
          <span className="ops-lock-card__icon" aria-hidden>
            🔒
          </span>
          <h2>Ops locked</h2>
          <p>Enter your admin key to update storage occupancy and run data jobs.</p>
          <label className="ops-field">
            <span>Admin key</span>
            <input
              className="ops-input"
              type="password"
              placeholder="From backend .env"
              value={adminKeyInput}
              onChange={(e) => setAdminKeyInput(e.target.value)}
            />
          </label>
          <button type="button" className="btn-primary" onClick={handleUnlock} disabled={loading}>
            {loading ? "Checking…" : "Unlock Ops"}
          </button>
          {msg && <p className="ops-toast ops-toast--err">{msg}</p>}
        </section>
      </div>
    );
  }

  return (
    <div className="ops-view animate-in">
      {msg && (
        <div className="ops-toast" role="status">
          {msg}
          <button type="button" className="ops-toast__dismiss" onClick={() => setMsg(null)}>
            ×
          </button>
        </div>
      )}

      <section className="ops-card ops-card--hero">
        <header className="ops-card__head">
          <div>
            <span className="ops-card__eyebrow">Corridor control</span>
            <h2>Field operations</h2>
          </div>
          {authRequired && (
            <button type="button" className="ops-link-btn" onClick={handleLock}>
              Lock
            </button>
          )}
        </header>
        <p className="ops-card__desc">
          Managers update cold-storage fill daily. Mandi and NDVI refresh on schedule.
        </p>
        {health && (
          <div className="ops-stats">
            <span className="ops-stat">
              <strong>{health.storages}</strong> facilities
            </span>
            {health.demo_mode && <span className="ops-stat ops-stat--demo">Demo</span>}
            {authRequired ? (
              <span className="ops-stat ops-stat--ok">Secured</span>
            ) : (
              <span className="ops-stat ops-stat--warn">Dev open</span>
            )}
          </div>
        )}
      </section>

      <section className="ops-card">
        <header className="ops-card__head">
          <div>
            <span className="ops-card__eyebrow">Automation</span>
            <h2>Data pipelines</h2>
          </div>
        </header>
        <div className="ops-pipeline-grid">
          <button
            type="button"
            className="ops-pipeline-btn"
            onClick={handleDaily}
            disabled={loading}
          >
            <span className="ops-pipeline-btn__icon">📊</span>
            <span className="ops-pipeline-btn__title">Daily mandi</span>
            <span className="ops-pipeline-btn__sub">data.gov.in prices</span>
          </button>
          <button
            type="button"
            className="ops-pipeline-btn"
            onClick={handleWeekly}
            disabled={loading}
          >
            <span className="ops-pipeline-btn__icon">🛰</span>
            <span className="ops-pipeline-btn__title">Weekly NDVI</span>
            <span className="ops-pipeline-btn__sub">Sentinel-2 glut</span>
          </button>
          <button
            type="button"
            className="ops-pipeline-btn"
            onClick={handleRegistry}
            disabled={loading}
          >
            <span className="ops-pipeline-btn__icon">🏭</span>
            <span className="ops-pipeline-btn__title">Registry</span>
            <span className="ops-pipeline-btn__sub">496 storages</span>
          </button>
        </div>
      </section>

      <section className="ops-card ops-card--storage">
        <header className="ops-card__head">
          <div>
            <span className="ops-card__eyebrow">Live registry</span>
            <h2>Storage occupancy</h2>
          </div>
          <span className="ops-count">
            {rows.length} shown
            {dirtyCount > 0 && ` · ${dirtyCount} unsaved`}
          </span>
        </header>

        <div className="ops-filters">
          <input
            className="ops-input"
            placeholder="Search facility…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="ops-input"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          >
            <option value="">All districts</option>
            {districts.map((d) => (
              <option key={d.district} value={d.district}>
                {d.district} ({d.count})
              </option>
            ))}
          </select>
        </div>

        <ul className="ops-storage-list">
          {rows.length === 0 && (
            <li className="ops-storage-empty">No facilities match filters.</li>
          )}
          {rows.map((r) => {
            const stale = r.updated_at
              ? Date.now() - new Date(r.updated_at).getTime() > 86400000 * 2
              : true;
            const dirty = savedRef.current[r.id] !== r.utilization_pct;
            const tone = utilTone(r.utilization_pct);
            return (
              <li
                key={r.id}
                className={`ops-storage-item ${stale ? "ops-storage-item--stale" : ""}`}
              >
                <div className="ops-storage-item__info">
                  <div className="ops-storage-item__title-row">
                    <strong className="ops-storage-item__name">{r.name}</strong>
                    <span className={`ops-util-badge ops-util-badge--${tone}`}>
                      {r.utilization_pct}%
                    </span>
                  </div>
                  <p className="ops-storage-item__meta">
                    <span className="ops-district">{r.district}</span>
                    <span> · {formatAgo(r.updated_at)}</span>
                    <span> · {r.available_quintals.toLocaleString("en-IN")} q free</span>
                  </p>
                  <div className="ops-util-track">
                    <div
                      className={`ops-util-fill ops-util-fill--${tone}`}
                      style={{ width: `${r.utilization_pct}%` }}
                    />
                  </div>
                </div>
                <div className="ops-storage-item__actions">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={r.utilization_pct}
                    aria-label={`Utilization for ${r.name}`}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((x) =>
                          x.id === r.id
                            ? { ...x, utilization_pct: Number(e.target.value) }
                            : x
                        )
                      )
                    }
                  />
                  <button
                    type="button"
                    className={`ops-save-btn ${dirty ? "ops-save-btn--dirty" : ""}`}
                    disabled={loading || !dirty}
                    onClick={() => saveUtil(r.id, r.utilization_pct)}
                  >
                    Save
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
