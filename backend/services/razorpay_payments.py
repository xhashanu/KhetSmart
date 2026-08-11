"""Razorpay order create + payment signature verify (Checkout flow)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv

RAZORPAY_API = "https://api.razorpay.com/v1"
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def _load_keys() -> tuple[str, str]:
    """Read keys from .env on each call (uvicorn --reload does not watch .env)."""
    load_dotenv(_ENV_FILE, override=True)
    key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    return key_id, key_secret


def razorpay_configured() -> bool:
    key_id, key_secret = _load_keys()
    return bool(key_id and key_secret)


def public_config() -> dict:
    key_id, _ = _load_keys()
    enabled = razorpay_configured()
    return {
        "razorpay_enabled": enabled,
        "key_id": key_id if enabled else None,
    }


def _auth_headers() -> dict[str, str]:
    key_id, key_secret = _load_keys()
    token = base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()
    return {
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json",
    }


def create_order(amount_inr: int, receipt_ref: str | None = None) -> dict:
    if not razorpay_configured():
        raise RuntimeError("razorpay_not_configured")
    if amount_inr < 1:
        raise ValueError("invalid_amount")
    amount_paise = int(round(amount_inr * 100))
    if amount_paise < 100:
        raise ValueError("amount_too_small")
    receipt = (receipt_ref or f"ks_{uuid.uuid4().hex[:12]}")[:40]
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            f"{RAZORPAY_API}/orders",
            headers=_auth_headers(),
            json={
                "amount": amount_paise,
                "currency": "INR",
                "receipt": receipt,
                "notes": {"source": "khetsmart_booking"},
            },
        )
    if resp.status_code >= 400:
        detail = resp.text[:500]
        raise RuntimeError(f"razorpay_order_failed:{resp.status_code}:{detail}")
    data = resp.json()
    return {
        "order_id": data["id"],
        "amount": data["amount"],
        "amount_inr": amount_inr,
        "currency": data.get("currency", "INR"),
        "receipt": data.get("receipt", receipt),
        "key_id": _load_keys()[0],
    }


def verify_payment_signature(
    order_id: str, payment_id: str, signature: str
) -> bool:
    if not razorpay_configured():
        return False
    message = f"{order_id}|{payment_id}".encode()
    _, key_secret = _load_keys()
    expected = hmac.new(
        key_secret.encode(),
        message,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
