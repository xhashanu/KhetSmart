import hashlib
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import FarmerAccount, FarmerSession

PHONE_RE = re.compile(r"^\d{10}$")
PIN_RE = re.compile(r"^\d{4,6}$")
SESSION_DAYS = 30
PBKDF2_ITERATIONS = 120_000


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) > 10:
        digits = digits[-10:]
    if not PHONE_RE.match(digits):
        raise HTTPException(400, detail="invalid_phone")
    return digits


def validate_pin(pin: str) -> str:
    p = (pin or "").strip()
    if not PIN_RE.match(p):
        raise HTTPException(400, detail="invalid_pin")
    return p


def hash_pin(pin: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", pin.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS
    ).hex()
    return f"{salt}${digest}"


def verify_pin(pin: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac(
        "sha256", pin.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS
    ).hex()
    return secrets.compare_digest(check, digest)


def farmer_to_dict(f: FarmerAccount) -> dict:
    return {
        "id": f.id,
        "phone": f.phone,
        "name": f.name,
        "district": f.district,
        "has_pin": bool(f.pin_hash),
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


def create_session(db: Session, farmer_id: str) -> str:
    token = secrets.token_urlsafe(32)
    session = FarmerSession(
        token=token,
        farmer_id=farmer_id,
        expires_at=utcnow() + timedelta(days=SESSION_DAYS),
    )
    db.add(session)
    db.commit()
    return token


def signup_farmer(
    db: Session,
    phone: str,
    name: str,
    pin: str | None = None,
    district: str | None = None,
) -> tuple[FarmerAccount, str]:
    phone_n = normalize_phone(phone)
    pin_hash_val = hash_pin(validate_pin(pin)) if pin else None
    name_v = (name or "").strip()
    if len(name_v) < 2:
        raise HTTPException(400, detail="invalid_name")

    if db.query(FarmerAccount).filter(FarmerAccount.phone == phone_n).first():
        raise HTTPException(409, detail="phone_already_registered")

    farmer = FarmerAccount(
        id=str(uuid.uuid4()),
        phone=phone_n,
        name=name_v[:120],
        pin_hash=pin_hash_val,
        district=(district or "").strip()[:80] or None,
    )
    db.add(farmer)
    db.commit()
    db.refresh(farmer)
    token = create_session(db, farmer.id)
    return farmer, token


def login_farmer(db: Session, phone: str, pin: str) -> tuple[FarmerAccount, str]:
    phone_n = normalize_phone(phone)
    pin_v = validate_pin(pin)
    farmer = db.query(FarmerAccount).filter(FarmerAccount.phone == phone_n).first()
    if not farmer or not farmer.pin_hash:
        raise HTTPException(401, detail="pin_not_set")
    if not verify_pin(pin_v, farmer.pin_hash):
        raise HTTPException(401, detail="invalid_credentials")
    token = create_session(db, farmer.id)
    return farmer, token


def set_farmer_pin(db: Session, farmer: FarmerAccount, pin: str) -> FarmerAccount:
    farmer.pin_hash = hash_pin(validate_pin(pin))
    db.commit()
    db.refresh(farmer)
    return farmer


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def get_farmer_by_token(db: Session, token: str | None) -> FarmerAccount | None:
    if not token or not token.strip():
        return None
    now = utcnow()
    session = (
        db.query(FarmerSession)
        .filter(FarmerSession.token == token.strip())
        .first()
    )
    if not session:
        return None
    if _as_utc(session.expires_at) < now:
        db.delete(session)
        db.commit()
        return None
    return db.query(FarmerAccount).filter(FarmerAccount.id == session.farmer_id).first()


def logout_farmer(db: Session, token: str | None) -> None:
    if not token:
        return
    db.query(FarmerSession).filter(FarmerSession.token == token.strip()).delete()
    db.commit()
