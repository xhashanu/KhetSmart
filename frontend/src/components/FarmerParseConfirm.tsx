import { useState } from "react";
import type { ConsultOverrides, FarmerParseResult } from "../api";

export const FARMER_CROP_OPTIONS = [
  "Jyoti Potato",
  "Potato",
  "Chipsona-1",
  "Kufri Jyoti",
] as const;

const QUANTITY_PRESETS = [25, 50, 75, 100, 150, 200];

type Props = {
  preview: FarmerParseResult;
  overrides: ConsultOverrides;
  onOverridesChange: (next: ConsultOverrides) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

export function FarmerParseConfirm({
  preview,
  overrides,
  onOverridesChange,
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const confidencePct = Math.round(preview.confidence * 100);
  const lowConfidence = preview.confidence < 0.7;

  return (
    <div className="parse-confirm" role="region" aria-label="Confirm harvest details">
      {!preview.quantity_found && (
        <p className="parse-confirm__warn" role="alert">
          <strong>পরিমাণ পাওয়া যায়নি</strong> — ৫০ কুইন্টাল ধরে নেওয়া হয়েছে। ঠিক করতে
          সম্পাদনা চাপুন।
          <br />
          <span className="parse-confirm__warn-en">
            Quantity not found — using 50 quintals. Tap Edit to correct.
          </span>
        </p>
      )}

      {lowConfidence && (
        <p className="parse-confirm__hint">
          বুঝতে পারছি না পুরোপুরি ({confidencePct}% নিশ্চিত) — নিচে ঠিক করুন।
          <br />
          <span className="parse-confirm__hint-en">
            Not fully sure we understood ({confidencePct}% confidence) — confirm below.
          </span>
        </p>
      )}

      <div className="parse-confirm__strip">
        <div className="parse-confirm__summary">
          <span className="parse-confirm__label">We understood</span>
          <span className="parse-confirm__values">
            <strong>{overrides.quantity_quintals} q</strong>
            <span className="parse-confirm__dot" aria-hidden>
              ·
            </span>
            <strong>{overrides.crop}</strong>
            {overrides.district && (
              <>
                <span className="parse-confirm__dot" aria-hidden>
                  ·
                </span>
                <span>{overrides.district}</span>
              </>
            )}
          </span>
        </div>
        <button
          type="button"
          className="parse-confirm__edit-btn"
          onClick={() => setEditing((e) => !e)}
          disabled={loading}
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      {editing && (
        <div className="parse-confirm__editor">
          <label className="parse-confirm__field">
            <span>Quantity (quintals)</span>
            <input
              type="number"
              min={1}
              max={10000}
              step={1}
              value={overrides.quantity_quintals}
              onChange={(e) =>
                onOverridesChange({
                  ...overrides,
                  quantity_quintals: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
          </label>
          <div className="parse-confirm__presets">
            {QUANTITY_PRESETS.map((q) => (
              <button
                key={q}
                type="button"
                className={`chip ${overrides.quantity_quintals === q ? "chip--gold" : "chip--outline"}`}
                onClick={() =>
                  onOverridesChange({ ...overrides, quantity_quintals: q })
                }
              >
                {q} q
              </button>
            ))}
          </div>
          <p className="parse-confirm__field-label">Crop variety</p>
          <div className="parse-confirm__crops">
            {FARMER_CROP_OPTIONS.map((crop) => (
              <button
                key={crop}
                type="button"
                className={`chip ${overrides.crop === crop ? "chip--gold" : "chip--outline"}`}
                onClick={() => onOverridesChange({ ...overrides, crop })}
              >
                {crop}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="parse-confirm__actions">
        <button
          type="button"
          className="btn-primary"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? (
            <span className="btn-loading">
              <span className="spinner" />
              Optimizing…
            </span>
          ) : (
            "Confirm & get route + loan"
          )}
        </button>
        <button
          type="button"
          className="parse-confirm__cancel"
          onClick={onCancel}
          disabled={loading}
        >
          Change message
        </button>
      </div>
    </div>
  );
}
