"""Gemini-powered harvest entity extraction for any Indian language."""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path

import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

GEMINI_MODELS = (
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash",
)


def _gemini_key() -> str:
    load_dotenv(_ENV_FILE, override=True)
    return os.getenv("GEMINI_API_KEY", "").strip()


def extract_harvest_entities(text: str) -> dict | None:
    """Extract quantity, crop, language from farmer speech in any language."""
    key = _gemini_key()
    if not key or not text.strip():
        return None

    prompt = f"""Extract harvest information from this farmer's message.
The farmer may speak ANY Indian language: Bengali, Hindi, English, Marathi, Tamil,
Telugu, Kannada, Gujarati, Punjabi, Odia, Malayalam, or mixed.

Farmer said: "{text}"

Return ONLY valid JSON (no markdown):
{{
  "detected_language": "ISO 639-1 code (bn, hi, en, mr, ta, te, kn, gu, pa, or, ml, as, etc.)",
  "quantity_quintals": number or null,
  "crop": "Potato or Jyoti Potato or null",
  "district": "string or null",
  "confidence": 0.0 to 1.0
}}

Rules:
- Convert word numbers to digits: Bengali "আশি/ashii"=80, "পঞ্চাশ/pachas"=50, Hindi "pachas"=50, "assi"=80.
- "quintal/কুইন্টাল/क्विंटल" means quintals.
- Default crop to "Potato" if aloo/আলু/alu mentioned or implied.
- If quantity is clearly stated, confidence >= 0.85.
- detected_language must match the language the farmer used, not English translation."""

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 256},
    }

    for model in GEMINI_MODELS:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={key}"
        )
        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(url, json=body)
            if resp.status_code != 200:
                continue
            raw = (
                resp.json()
                .get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
            m = re.search(r"\{[\s\S]*\}", raw)
            if not m:
                continue
            data = json.loads(m.group())
            qty = data.get("quantity_quintals")
            if qty is not None:
                qty = float(qty)
                if qty <= 0 or qty > 10000:
                    qty = None
            lang = (data.get("detected_language") or "en").strip().lower()[:5]
            crop = data.get("crop") or "Potato"
            if crop and "jyoti" in str(crop).lower():
                crop = "Jyoti Potato"
            elif crop and "potato" not in str(crop).lower() and "alu" not in str(crop).lower():
                if qty is not None:
                    crop = "Potato"
            return {
                "quantity_quintals": qty,
                "crop": crop if qty else None,
                "district": data.get("district"),
                "detected_language": lang,
                "confidence": float(data.get("confidence") or 0.8),
                "source": "gemini",
            }
        except Exception as exc:
            logger.warning("Gemini entity extract %s: %s", model, exc)
            continue
    return None


def generate_farmer_reply(
    lang: str,
    purpose: str,
    *,
    qty: int | float | None = None,
    crop: str | None = None,
    heard: str | None = None,
    glut: int | None = None,
    storage: str | None = None,
    profit: str | None = None,
) -> str | None:
    """Generate a short farmer-friendly reply in the detected spoken language."""
    key = _gemini_key()
    if not key:
        return None

    context = {
        "purpose": purpose,
        "quantity_quintals": qty,
        "crop": crop,
        "heard_transcript": heard,
        "glut_pct": glut,
        "storage_name": storage,
        "profit_inr": profit,
    }
    prompt = f"""You are KhetSmart, a friendly agricultural assistant for Indian potato farmers.
Write ONE short sentence (max 2) in language code "{lang}" ONLY.
Do NOT use English unless lang is "en".
Sound like a helpful village advisor, not a robot.

Task purpose: {purpose}
Context: {json.dumps(context, ensure_ascii=False)}

Purpose meanings:
- confirm_harvest: ask if farmer has {{qty}} quintals of {{crop}}
- confirm_yes_plan: acknowledge and say you're finding the best plan
- confirm_no: ask them to repeat harvest quantity
- unclear: ask how many quintals of potato they have
- stt_failed: couldn't hear clearly, ask to repeat
- plan_ready: market pressure {{glut}}%, recommend {{storage}}, profit ~{{profit}}
- action_storage: show best cold storages
- action_price: show mandi prices
- action_loan: open finance/loan section

Return ONLY the sentence in {lang}, no quotes."""

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 200},
    }

    for model in GEMINI_MODELS:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={key}"
        )
        try:
            with httpx.Client(timeout=25.0) as client:
                resp = client.post(url, json=body)
            if resp.status_code != 200:
                continue
            text = (
                resp.json()
                .get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
                .strip()
            )
            text = re.sub(r'^["\']+|["\']+$', "", text)
            if text:
                return text
        except Exception as exc:
            logger.warning("Gemini reply %s: %s", model, exc)
    return None
