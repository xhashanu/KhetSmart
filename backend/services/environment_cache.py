"""Persist latest multi-layer environment snapshot for fast API reads."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from config import DATA_DIR

ENV_PATH = DATA_DIR / "environment_latest.json"


def save_environment(payload: dict) -> Path:
    ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    out = {
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        **payload,
    }
    with open(ENV_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    return ENV_PATH


def load_environment() -> dict | None:
    if not ENV_PATH.exists():
        return None
    try:
        with open(ENV_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None
