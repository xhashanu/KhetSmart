"""Farmer voice → text via Gemini (Bengali / Hindi / English)."""

from __future__ import annotations

import base64
import logging
import os
import re
from pathlib import Path

import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

# Prefer lite models (higher free-tier headroom); 1.5-flash is deprecated on v1beta.
GEMINI_STT_MODELS = (
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
)


def _gemini_key() -> str:
    load_dotenv(_ENV_FILE, override=True)
    return os.getenv("GEMINI_API_KEY", "").strip()


def gemini_stt_configured() -> bool:
    return bool(_gemini_key())


def _clean_transcript(raw: str) -> str:
    text = (raw or "").strip()
    text = re.sub(r'^["\']+|["\']+$', "", text)
    return text.strip()


def transcribe_farmer_audio(
    audio_bytes: bytes,
    mime_type: str = "audio/webm",
    language_hint: str = "bn",
) -> dict:
    key = _gemini_key()
    if not key:
        return {"ok": False, "error": "gemini_not_configured"}

    if not audio_bytes or len(audio_bytes) < 200:
        return {"ok": False, "error": "audio_too_short"}

    hint = language_hint if language_hint else "auto"
    prompt = (
        "You are a speech-to-text transcriber for Indian farmers.\n"
        "Transcribe EXACTLY what was spoken — word for word.\n"
        "The farmer may speak ANY language: Bengali, Hindi, English, Marathi, Tamil, "
        "Telugu, Kannada, Gujarati, Punjabi, Odia, Malayalam, or mixed.\n"
        f"Language hint (optional): {hint}.\n"
        "RULES:\n"
        "- Write the transcript in the SAME script/language the farmer spoke.\n"
        "- Bengali → Bengali script (example: আমার কাছে আশি কুইন্টাল আলু আছে).\n"
        "- Hindi → Devanagari or Roman Hindi as spoken.\n"
        "- English → English text.\n"
        "- Tamil, Marathi, Telugu, etc. → use that language's script.\n"
        "- Keep number words as spoken (আশি, pachas, eighty, etc.).\n"
        "- Do NOT translate to another language.\n"
        "- Do NOT invent words.\n"
        "Return ONLY the transcript as plain text, no quotes."
    )

    mime = mime_type.split(";")[0].strip() or "audio/webm"
    body = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime,
                            "data": base64.b64encode(audio_bytes).decode("ascii"),
                        }
                    },
                ]
            }
        ],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 256},
    }

    last_error = "transcription_failed"
    for model in GEMINI_STT_MODELS:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={key}"
        )
        try:
            with httpx.Client(timeout=55.0) as client:
                resp = client.post(url, json=body)
            if resp.status_code == 429:
                last_error = "quota_exceeded"
                logger.warning("Gemini STT quota %s", model)
                continue
            if resp.status_code == 404:
                last_error = "model_not_found"
                continue
            if resp.status_code != 200:
                logger.warning("Gemini STT %s HTTP %s: %s", model, resp.status_code, resp.text[:280])
                last_error = "api_error"
                continue
            data = resp.json()
            text = _clean_transcript(
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
            if text:
                return {"ok": True, "text": text, "engine": model}
        except Exception as exc:
            logger.warning("Gemini STT %s failed: %s", model, exc)
            last_error = "network_error"

    return {"ok": False, "error": last_error}
