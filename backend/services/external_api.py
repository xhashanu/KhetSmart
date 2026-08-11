from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_FAILURE_THRESHOLD = int(os.getenv("EXTERNAL_API_FAILURE_THRESHOLD", "3"))
_CIRCUIT_OPEN_SECONDS = int(os.getenv("EXTERNAL_API_CIRCUIT_OPEN_SECONDS", "300"))
_CIRCUIT_STATE: dict[str, tuple[int, float]] = {}


def _circuit_state(name: str) -> tuple[int, float]:
    return _CIRCUIT_STATE.get(name, (0, 0.0))


def is_circuit_open(name: str) -> bool:
    failures, open_until = _circuit_state(name)
    if failures >= _FAILURE_THRESHOLD and time.time() < open_until:
        return True
    if failures >= _FAILURE_THRESHOLD and time.time() >= open_until:
        _CIRCUIT_STATE[name] = (0, 0.0)
    return False


def record_failure(name: str, reason: str) -> None:
    failures, open_until = _circuit_state(name)
    failures += 1
    if failures >= _FAILURE_THRESHOLD:
        open_until = time.time() + _CIRCUIT_OPEN_SECONDS
        logger.warning(
            "%s circuit opened after %d failures: %s",
            name,
            failures,
            reason,
        )
    else:
        logger.warning(
            "%s failure %d/%d: %s",
            name,
            failures,
            _FAILURE_THRESHOLD,
            reason,
        )
    _CIRCUIT_STATE[name] = (failures, open_until)


def record_success(name: str) -> None:
    if name in _CIRCUIT_STATE:
        _CIRCUIT_STATE[name] = (0, 0.0)


def fetch_json(
    name: str,
    method: str,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    json: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 30.0,
    max_attempts: int = 3,
    backoff_base: float = 1.5,
    retry_statuses: tuple[int, ...] = (429, 500, 502, 503, 504),
) -> tuple[int, dict | None, str]:
    if is_circuit_open(name):
        msg = f"circuit open: {name} unavailable until recovery"
        logger.warning(msg)
        return 0, None, msg

    last_err = ""

    for attempt in range(1, max_attempts + 1):
        try:
            with httpx.Client(timeout=timeout) as client:
                if method.upper() == "GET":
                    response = client.get(url, params=params, headers=headers)
                elif method.upper() == "POST":
                    if data is not None:
                        response = client.post(url, data=data, params=params, headers=headers)
                    else:
                        response = client.post(url, json=json, params=params, headers=headers)
                else:
                    raise ValueError(f"Unsupported method: {method}")

            status = response.status_code
            if status == 200:
                try:
                    payload = response.json()
                except ValueError as err:
                    last_err = f"invalid json: {err}"
                    logger.warning("%s %s attempt %d invalid JSON: %s", name, url, attempt, err)
                    if attempt < max_attempts:
                        time.sleep(backoff_base**attempt)
                        continue
                    record_failure(name, last_err)
                    return 0, None, last_err
                record_success(name)
                return 200, payload, ""

            body = (response.text or "").strip()
            last_err = body[:300] or f"HTTP {status}"
            logger.warning(
                "%s %s returned status %s (attempt %d): %s",
                name,
                url,
                status,
                attempt,
                last_err,
            )
            if status in retry_statuses and attempt < max_attempts:
                time.sleep(backoff_base**attempt)
                continue
            record_failure(name, last_err)
            return status, None, last_err
        except httpx.TimeoutException as exc:
            last_err = "timeout"
            logger.warning("%s %s timeout on attempt %d", name, url, attempt)
        except httpx.ConnectError as exc:
            last_err = f"connection failed: {exc}"
            logger.warning("%s %s connect error on attempt %d: %s", name, url, attempt, exc)
        except Exception as exc:
            last_err = str(exc)
            logger.warning("%s %s error on attempt %d: %s", name, url, attempt, exc)

        if attempt < max_attempts:
            time.sleep(backoff_base**attempt)

    record_failure(name, last_err)
    return 0, None, last_err
