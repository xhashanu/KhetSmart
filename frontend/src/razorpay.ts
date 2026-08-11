export type RazorpayPaymentMethod = "upi" | "card";

export interface PaymentConfig {
  razorpay_enabled: boolean;
  key_id: string | null;
}

export interface CreateOrderResponse {
  order_id: string;
  amount: number;
  amount_inr: number;
  currency: string;
  receipt: string;
  key_id: string;
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

type RazorpayCheckoutInstance = {
  open: () => void;
  on: (event: "payment.failed", handler: (r: { error: { description?: string } }) => void) => void;
};

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayCheckoutInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("razorpay_script_failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("razorpay_script_failed"));
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export type OpenCheckoutParams = {
  keyId: string;
  orderId: string;
  amountPaise: number;
  method: RazorpayPaymentMethod;
  description: string;
  onSuccess: (response: RazorpaySuccessResponse) => void;
  onDismiss?: () => void;
  onFail?: (message: string) => void;
};

export async function openRazorpayCheckout(params: OpenCheckoutParams): Promise<void> {
  await loadRazorpayScript();
  if (!window.Razorpay) throw new Error("razorpay_unavailable");

  const methodFilter =
    params.method === "upi"
      ? { upi: true, card: false, netbanking: false, wallet: false, paylater: false }
      : { upi: false, card: true, netbanking: false, wallet: false, paylater: false };

  return new Promise((resolve) => {
    const rzp = new window.Razorpay!({
      key: params.keyId,
      amount: params.amountPaise,
      currency: "INR",
      name: "KhetSmart",
      description: params.description,
      order_id: params.orderId,
      theme: { color: "#0d2419" },
      method: methodFilter,
      handler: (response: RazorpaySuccessResponse) => {
        params.onSuccess(response);
        resolve();
      },
      modal: {
        ondismiss: () => {
          params.onDismiss?.();
          resolve();
        },
      },
    });

    rzp.on("payment.failed", (resp) => {
      params.onFail?.(resp.error?.description || "Payment failed");
    });

    rzp.open();
  });
}
