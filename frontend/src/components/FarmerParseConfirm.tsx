import type { ConsultOverrides, FarmerParseResult } from "../api";

type Props = {
  preview: FarmerParseResult;
  overrides: ConsultOverrides;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

export function FarmerParseConfirm({
  preview,
  overrides,
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  const confidencePct = Math.round(preview.confidence * 100);
  const lowConfidence = preview.confidence < 0.7;

  return (
    <div className="parse-confirm" role="region" aria-label="Confirm harvest details">
      {!preview.quantity_found && (
        <p className="parse-confirm__warn" role="alert">
          <strong>পরিমাণ পাওয়া যায়নি</strong> — ৫০ কুইন্টাল ধরে নেওয়া হয়েছে। নিচে ঠিক করুন।
          <br />
          <span className="parse-confirm__warn-en">
            Quantity not found — using 50 quintals. Adjust below.
          </span>
        </p>
      )}

      {lowConfidence && (
        <p className="parse-confirm__hint">
          বুঝতে পারছি না পুরোপুরি ({confidencePct}% নিশ্চিত) — নিচে ঠিক করুন।
          <br />
          <span className="parse-confirm__hint-en">
            Not fully sure we understood ({confidencePct}% confidence) — adjust below.
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
      </div>

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
