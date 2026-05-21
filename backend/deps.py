from fastapi import Header, HTTPException

from config import ADMIN_API_KEY, REQUIRE_ADMIN_AUTH


def admin_auth_required() -> bool:
    return bool(ADMIN_API_KEY) and REQUIRE_ADMIN_AUTH


def verify_admin(x_admin_key: str | None = Header(None, alias="X-Admin-Key")):
    if not admin_auth_required():
        return
    if x_admin_key != ADMIN_API_KEY:
        raise HTTPException(
            401,
            detail="Invalid or missing X-Admin-Key. Set ADMIN_API_KEY in backend/.env.",
        )
