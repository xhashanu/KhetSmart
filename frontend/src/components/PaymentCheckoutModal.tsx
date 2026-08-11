import { useEffect, useState } from "react";
import type { AppLanguage } from "../hooks/useAppSettings";

export type PaymentMethod = "cod" | "upi" | "card";

type Props = {
  open: boolean;
  onClose: () => void;
  totalAmount: number;
  formatInr: (n: number) => string;
  language: AppLanguage;
  onConfirm: (method: PaymentMethod) => void;
  busy?: boolean;
  razorpayEnabled?: boolean;
};

const LABELS = {
  en: {
    back: "← Back",
    title: "Choose payment",
    subtitle: "Pay now or cash on delivery at cold storage",
    total: "Total",
    codTitle: "Cash on delivery",
    codSub: "Pay when truck reaches storage",
    upiTitle: "UPI",
    upiSub: "PhonePe, GPay, Paytm",
    cardTitle: "Card",
    cardSub: "Debit or credit card",
    razorpayHint: "Add Razorpay keys in backend/.env to enable UPI & card",
    confirmCod: "Confirm booking (COD)",
    confirmPay: "Confirm & pay",
    processing: "Processing…",
  },
  bn: {
    back: "← ফিরে যান",
    title: "পেমেন্ট বেছে নিন",
    subtitle: "এখনই বা কোল্ড স্টোরেজে ডেলিভারিতে টাকা দিন",
    total: "মোট",
    codTitle: "ক্যাশ অন ডেলিভারি",
    codSub: "ট্রাক স্টোরেজে পৌঁছালে পরিশোধ",
    upiTitle: "UPI",
    upiSub: "PhonePe, GPay, Paytm",
    cardTitle: "কার্ড",
    cardSub: "ডেবিট বা ক্রেডিট কার্ড",
    razorpayHint: "UPI ও কার্ডের জন্য backend/.env এ Razorpay keys যোগ করুন",
    confirmCod: "বুকিং নিশ্চিত (COD)",
    confirmPay: "নিশ্চিত ও পে",
    processing: "প্রক্রিয়া…",
  },
  hi: {
    back: "← वापस",
    title: "भुगतान चुनें",
    subtitle: "अभी या कोल्ड स्टोरेज पर डिलीवरी पर नकद",
    total: "कुल",
    codTitle: "कैश ऑन डिलीवरी",
    codSub: "ट्रक स्टोरेज पहुँचने पर भुगतान",
    upiTitle: "UPI",
    upiSub: "PhonePe, GPay, Paytm",
    cardTitle: "कार्ड",
    cardSub: "डेबिट या क्रेडिट कार्ड",
    razorpayHint: "UPI और कार्ड के लिए backend/.env में Razorpay keys जोड़ें",
    confirmCod: "बुकिंग पुष्टि (COD)",
    confirmPay: "पुष्टि और भुगतान",
    processing: "प्रक्रिया…",
  },
} as const;

type Option = {
  id: PaymentMethod;
  icon: string;
  title: string;
  sub: string;
};

export function PaymentCheckoutModal({
  open,
  onClose,
  totalAmount,
  formatInr,
  language,
  onConfirm,
  busy = false,
  razorpayEnabled = false,
}: Props) {
  const t = LABELS[language];
  const [selected, setSelected] = useState<PaymentMethod>("cod");

  useEffect(() => {
    if (open) setSelected("cod");
  }, [open]);

  if (!open) return null;

  const options: Option[] = [
    { id: "cod", icon: "💵", title: t.codTitle, sub: t.codSub },
    { id: "upi", icon: "📱", title: t.upiTitle, sub: t.upiSub },
    { id: "card", icon: "💳", title: t.cardTitle, sub: t.cardSub },
  ];

  const onlineDisabled = !razorpayEnabled;

  return (
    <div className="payment-modal__backdrop" role="presentation" onClick={onClose}>
      <div
        className="payment-modal"
        role="dialog"
        aria-labelledby="payment-modal-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="payment-modal__handle" aria-hidden />
        <button type="button" className="payment-modal__back" onClick={onClose}>
          {t.back}
        </button>

        <h2 id="payment-modal-title" className="payment-modal__title">
          {t.title}
        </h2>
        <p className="payment-modal__subtitle">{t.subtitle}</p>
        <p className="payment-modal__total">
          {t.total}: <strong>{formatInr(totalAmount)}</strong>
        </p>

        <div className="payment-modal__options">
          {options.map((opt) => {
            const disabled = onlineDisabled && opt.id !== "cod";
            const on = selected === opt.id && !disabled;
            return (
              <label
                key={opt.id}
                className={`payment-modal__option ${on ? "payment-modal__option--on" : ""} ${disabled ? "payment-modal__option--disabled" : ""}`}
              >
                <input
                  type="radio"
                  name="payment_method"
                  value={opt.id}
                  checked={on}
                  disabled={disabled || busy}
                  onChange={() => !disabled && setSelected(opt.id)}
                />
                <span className="payment-modal__option-icon" aria-hidden>
                  {opt.icon}
                </span>
                <span className="payment-modal__option-text">
                  <strong>{opt.title}</strong>
                  <small>{opt.sub}</small>
                </span>
              </label>
            );
          })}
        </div>

        {onlineDisabled && (
          <p className="payment-modal__hint">{t.razorpayHint}</p>
        )}

        <button
          type="button"
          className="payment-modal__confirm"
          disabled={busy || (onlineDisabled && selected !== "cod")}
          onClick={() => onConfirm(selected)}
        >
          {busy
            ? t.processing
            : selected === "cod"
              ? t.confirmCod
              : t.confirmPay}
        </button>
      </div>
    </div>
  );
}
