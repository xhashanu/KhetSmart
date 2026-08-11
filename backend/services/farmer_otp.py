import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from config import OTP_DEV_EXPOSE, OTP_LENGTH, OTP_TTL_MINUTES
from models import FarmerAccount, OtpChallenge
from services.farmer_auth import (
    create_session,
    farmer_to_dict,
    hash_pin,
    normalize_phone,
    utcnow,
    validate_pin,
)

logger = logging.getLogger(__name__)

PHONE_RE = re.compile(r"^\d{10}$")
RESEND_COOLDOWN_SEC = 60
MAX_SENDS_PER_HOUR = 5
MAX_VERIFY_ATTEMPTS = 5
SIGNUP_TOKEN_TTL_MINUTES = 15


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _generate_otp() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))


def _send_sms(phone: str, code: str) -> None:
    """Hook for MSG91 / Twilio. Dev: log only."""
    logger.info("OTP for +91%s: %s", phone, code)
    print(f"[KhetSmart OTP] +91{phone} -> {code}", flush=True)


def send_otp(db: Session, phone: str) -> dict:
    phone_n = normalize_phone(phone)
    now = utcnow()
    row = db.query(OtpChallenge).filter(OtpChallenge.phone == phone_n).first()

    if row:
        if row.send_count >= MAX_SENDS_PER_HOUR and row.first_sent_at:
            if _as_utc(row.first_sent_at) > now - timedelta(hours=1):
                raise HTTPException(429, detail="otp_rate_limited")
        if row.last_sent_at and _as_utc(row.last_sent_at) > now - timedelta(
            seconds=RESEND_COOLDOWN_SEC
        ):
            raise HTTPException(429, detail="otp_resend_wait")

    code = _generate_otp()
    if not row:
        row = OtpChallenge(
            phone=phone_n,
            code_hash=_hash_code(code),
            expires_at=now + timedelta(minutes=OTP_TTL_MINUTES),
            attempts=0,
            send_count=1,
            first_sent_at=now,
            last_sent_at=now,
            verified=False,
            signup_token=None,
            signup_token_expires_at=None,
        )
        db.add(row)
    else:
        row.code_hash = _hash_code(code)
        row.expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
        row.attempts = 0
        row.verified = False
        row.signup_token = None
        row.signup_token_expires_at = None
        row.send_count = (row.send_count or 0) + 1
        if not row.first_sent_at or _as_utc(row.first_sent_at) < now - timedelta(hours=1):
            row.first_sent_at = now
            row.send_count = 1
        row.last_sent_at = now

    db.commit()
    _send_sms(phone_n, code)

    out: dict = {
        "ok": True,
        "phone": phone_n,
        "expires_in_seconds": OTP_TTL_MINUTES * 60,
        "resend_after_seconds": RESEND_COOLDOWN_SEC,
    }
    if OTP_DEV_EXPOSE:
        out["dev_otp"] = code
    return out


def verify_otp(db: Session, phone: str, code: str) -> dict:
    phone_n = normalize_phone(phone)
    otp_code = (code or "").strip()
    if not re.match(rf"^\d{{{OTP_LENGTH}}}$", otp_code):
        raise HTTPException(400, detail="invalid_otp")

    row = db.query(OtpChallenge).filter(OtpChallenge.phone == phone_n).first()
    if not row:
        raise HTTPException(400, detail="otp_not_found")

    now = utcnow()
    if _as_utc(row.expires_at) < now:
        raise HTTPException(400, detail="otp_expired")

    if row.attempts >= MAX_VERIFY_ATTEMPTS:
        raise HTTPException(429, detail="otp_too_many_attempts")

    row.attempts += 1
    if not secrets.compare_digest(row.code_hash, _hash_code(otp_code)):
        db.commit()
        raise HTTPException(400, detail="invalid_otp")

    row.verified = True
    db.commit()

    farmer = db.query(FarmerAccount).filter(FarmerAccount.phone == phone_n).first()
    if farmer:
        token = create_session(db, farmer.id)
        return {
            "status": "logged_in",
            "token": token,
            "farmer": farmer_to_dict(farmer),
            "has_pin": bool(farmer.pin_hash),
        }

    signup_token = secrets.token_urlsafe(32)
    row.signup_token = signup_token
    row.signup_token_expires_at = now + timedelta(minutes=SIGNUP_TOKEN_TTL_MINUTES)
    db.commit()

    return {
        "status": "needs_profile",
        "signup_token": signup_token,
        "phone": phone_n,
    }


def complete_signup_after_otp(
    db: Session, signup_token: str, name: str, district: str | None = None
) -> dict:
    import uuid

    token = (signup_token or "").strip()
    if not token:
        raise HTTPException(400, detail="invalid_signup_token")

    row = db.query(OtpChallenge).filter(OtpChallenge.signup_token == token).first()
    if not row or not row.verified:
        raise HTTPException(400, detail="invalid_signup_token")

    now = utcnow()
    if not row.signup_token_expires_at or _as_utc(row.signup_token_expires_at) < now:
        raise HTTPException(400, detail="signup_token_expired")

    phone_n = row.phone
    if db.query(FarmerAccount).filter(FarmerAccount.phone == phone_n).first():
        raise HTTPException(409, detail="phone_already_registered")

    name_v = (name or "").strip()
    if len(name_v) < 2:
        raise HTTPException(400, detail="invalid_name")

    farmer = FarmerAccount(
        id=str(uuid.uuid4()),
        phone=phone_n,
        name=name_v[:120],
        pin_hash=None,
        district=(district or "").strip()[:80] or None,
    )
    db.add(farmer)
    db.delete(row)
    db.commit()
    db.refresh(farmer)

    session_token = create_session(db, farmer.id)
    return {
        "status": "logged_in",
        "token": session_token,
        "farmer": farmer_to_dict(farmer),
        "has_pin": False,
    }


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt
