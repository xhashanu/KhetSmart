"""Lightweight SQLite schema patches (no Alembic)."""

from sqlalchemy import inspect, text

from database import engine


def apply_schema_patches() -> None:
    insp = inspect(engine)
    if insp.has_table("farmer_accounts"):
        _patch_farmer_accounts_pin_nullable()
    # create_all handles new tables; patches only alter existing SQLite schemas.


def _patch_farmer_accounts_pin_nullable() -> None:
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(farmer_accounts)")).fetchall()
    pin_col = next((r for r in rows if r[1] == "pin_hash"), None)
    if pin_col is None or pin_col[3] == 0:
        return

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE farmer_accounts_new (
                    id VARCHAR(36) PRIMARY KEY,
                    phone VARCHAR(15) NOT NULL UNIQUE,
                    name VARCHAR(120) NOT NULL,
                    pin_hash VARCHAR(128),
                    district VARCHAR(80),
                    created_at DATETIME
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO farmer_accounts_new (id, phone, name, pin_hash, district, created_at)
                SELECT id, phone, name, pin_hash, district, created_at
                FROM farmer_accounts
                """
            )
        )
        conn.execute(text("DROP TABLE farmer_accounts"))
        conn.execute(text("ALTER TABLE farmer_accounts_new RENAME TO farmer_accounts"))
        conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_farmer_accounts_phone ON farmer_accounts (phone)")
        )
