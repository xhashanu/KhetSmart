"""Voice-first conversational AI for farmers — language-aware, Gemini-powered.

Detects the farmer's spoken language automatically and responds in that same
language.  The UI language setting is completely separate and never overrides
the conversation language.
"""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

GEMINI_CONVERSE_MODELS = (
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
)

# ---- language detection (Indian languages + English) ----

_BN_RANGE = re.compile(r"[\u0980-\u09FF]")
_HI_RANGE = re.compile(r"[\u0900-\u097F]")
_TA_RANGE = re.compile(r"[\u0B80-\u0BFF]")
_TE_RANGE = re.compile(r"[\u0C00-\u0C7F]")
_KN_RANGE = re.compile(r"[\u0C80-\u0CFF]")
_GU_RANGE = re.compile(r"[\u0A80-\u0AFF]")
_PA_RANGE = re.compile(r"[\u0A00-\u0A7F]")
_OR_RANGE = re.compile(r"[\u0B00-\u0B7F]")
_ML_RANGE = re.compile(r"[\u0D00-\u0D7F]")
_ROMAN_HINDI_MARKERS = re.compile(
    r"\b(mera|mere|meri|hai|hain|kya|kaise|kahan|kitna|kitne|kitni|"
    r"aloo|aaloo|aalu|haan|nahi|naa|chahiye|chahie|"
    r"bechna|bechun|rakhna|rakhun|abhi|yahan|wahan|karo|karein|"
    r"karega|karenge|accha|achha|theek|sahi|kuch|bahut|bohot|"
    r"paas|dhoondho|dhoondhu|bolo|bolein|sunao|batao|dijiye)\b",
    re.IGNORECASE,
)
_ROMAN_BN_MARKERS = re.compile(
    r"\b(amar|amaar|ache|aache|eta|kothay|keno|ki|koto|bolo|"
    r"bolun|korbo|korben|rakhbo|rakhben|bechbo|bechben|"
    r"ekhon|okhane|ekhane|bhalo|kharap|hobe|hoyeche|"
    r"kuintal|aloo|alu)\b",
    re.IGNORECASE,
)
_ENGLISH_MARKERS = re.compile(
    r"\b(i|have|has|my|the|a|an|is|are|potato|potatoes|want|need|show|best|"
    r"book|yes|no|please|how|much|what|where|storage|cold)\b",
    re.IGNORECASE,
)
_YES_WORDS = {
    "en": {"yes", "yeah", "yep", "ok", "okay", "sure", "correct", "right", "continue"},
    "hi": {"haan", "haa", "ha", "ji", "ji haan", "bilkul", "sahi", "theek", "theek hai", "achha",
           "हाँ", "हां", "जी", "ठीक", "ठीक है", "सही"},
    "bn": {"hyan", "hya", "ha", "ji", "thik", "thik ache", "hobe", "korbo", "han",
           "হ্যাঁ", "হ্যা", "হ্যান", "ঠিক", "ঠিক আছে", "জি", "হবে", "হaan", "haan"},
    "mr": {"ho", "ho ka", "barobar", "ठीक", "हो", "होय"},
    "ta": {"aam", "aamam", "sari", "seri", "ஆம்", "சரி"},
    "te": {"avunu", "sare", "అవును", "సరే"},
}
_NO_WORDS = {
    "en": {"no", "nope", "nah", "cancel", "wrong", "change", "stop"},
    "hi": {"nahi", "naa", "na", "nhi", "galat", "badlo", "mat", "ruko", "नहीं", "ना", "mat"},
    "bn": {"na", "naa", "bhul", "badlao", "thamao", "না", "নah", "ভুল"},
    "mr": {"naahi", "nako", "नाही"},
    "ta": {"illai", "வேண்டாம்"},
    "te": {"ledu", "వద్దు"},
}


def detect_language(text: str) -> str:
    """Detect spoken language. Returns ISO 639-1 code (bn, hi, en, ta, te, mr, ...)."""
    if _BN_RANGE.search(text):
        return "bn"
    if _TA_RANGE.search(text):
        return "ta"
    if _TE_RANGE.search(text):
        return "te"
    if _KN_RANGE.search(text):
        return "kn"
    if _GU_RANGE.search(text):
        return "gu"
    if _PA_RANGE.search(text):
        return "pa"
    if _OR_RANGE.search(text):
        return "or"
    if _ML_RANGE.search(text):
        return "ml"
    if _HI_RANGE.search(text):
        return "hi"

    en_hits = len(_ENGLISH_MARKERS.findall(text))
    bn_hits = len(_ROMAN_BN_MARKERS.findall(text))
    hi_hits = len(_ROMAN_HINDI_MARKERS.findall(text))

    if en_hits >= 2 and en_hits >= hi_hits and en_hits >= bn_hits:
        return "en"
    if hi_hits > bn_hits and hi_hits >= 1:
        return "hi"
    if bn_hits > hi_hits and bn_hits >= 1:
        return "bn"
    if hi_hits >= 1:
        return "hi"
    if bn_hits >= 1:
        return "bn"
    if en_hits >= 1:
        return "en"

    return "en"


# Google Translate TTS language codes
TTS_LANG_MAP = {
    "bn": "bn", "hi": "hi", "en": "en", "mr": "mr", "ta": "ta", "te": "te",
    "kn": "kn", "gu": "gu", "pa": "pa", "or": "or", "ml": "ml", "as": "as",
}


def tts_language_code(lang: str) -> str:
    return TTS_LANG_MAP.get(lang, lang if len(lang) == 2 else "en")


def detect_yes_no(text: str, lang: str | None = None) -> str | None:
    """Return 'yes', 'no', or None from farmer text (any script)."""
    stripped = text.strip()
    lower = stripped.lower()
    check_langs = [lang] if lang else []
    check_langs.extend(["en", "hi", "bn", "mr", "ta", "te", "kn", "gu"])

    for la in check_langs:
        if not la:
            continue
        for word in _YES_WORDS.get(la, set()):
            if stripped == word or lower == word.lower():
                return "yes"
        for word in _NO_WORDS.get(la, set()):
            if stripped == word or lower == word.lower():
                return "no"

    for words in _YES_WORDS.values():
        for word in words:
            if stripped == word or lower == word.lower():
                return "yes"
    for words in _NO_WORDS.values():
        for word in words:
            if stripped == word or lower == word.lower():
                return "no"
    return None


# ---- Gemini conversation ----

def _gemini_key() -> str:
    load_dotenv(_ENV_FILE, override=True)
    return os.getenv("GEMINI_API_KEY", "").strip()


def converse(
    farmer_text: str | None = None,
    audio_bytes: bytes | None = None,
    audio_mime: str | None = None,
    conversation_history: list[dict] | None = None,
    context: dict | None = None,
) -> dict:
    """Main conversational AI entry point.

    Returns:
        {
            "ok": bool,
            "detected_language": "bn" | "hi" | "en",
            "transcribed_text": str | None,

            "response_text": str,        # natural language reply
            "response_ssml": str | None,  # optional SSML for TTS
            "response_audio_base64": str | None, # optional TTS audio
            "intent": str,               # HARVEST_INPUT | STORAGE_QUERY | SELL_QUERY | ...
            "entities": dict,            # { crop, quantity, district, ... }
            "needs_confirmation": bool,
            "confirmation_text": str | None,
            "suggested_actions": list[str],
            "is_live_gemini": bool,
        }
    """
    key = _gemini_key()
    
    # If text is provided, try to detect language, otherwise we will let Gemini detect it from audio
    detected_lang = detect_language(farmer_text) if farmer_text else "en"

    # Check for yes/no confirmation response if text is provided
    yn = None
    if farmer_text:
        yn = detect_yes_no(farmer_text, detected_lang)
    if yn is not None:
        return {
            "ok": True,
            "detected_language": detected_lang,
            "transcribed_text": farmer_text,
            "response_text": "",
            "response_ssml": None,
            "response_audio_base64": None,
            "intent": "CONFIRMATION",
            "entities": {"confirmation": yn},
            "needs_confirmation": False,
            "confirmation_text": None,
            "suggested_actions": [],
            "is_live_gemini": False,
        }

    # Build Gemini prompt
    lang_name = {"bn": "Bengali (বাংলা)", "hi": "Hindi (हिन्दी)", "en": "English"}.get(
        detected_lang, "English"
    )

    context_block = ""
    if context:
        context_block = f"\n[CONTEXT]\n{json.dumps(context, ensure_ascii=False)}\n"

    history_block = ""
    if conversation_history:
        lines = []
        for msg in conversation_history[-6:]:
            role = msg.get("role", "farmer")
            text = msg.get("text", "")
            lines.append(f"{role}: {text}")
        history_block = "\n[CONVERSATION HISTORY]\n" + "\n".join(lines) + "\n"

    system_prompt = f"""You are KhetSmart, a friendly agricultural assistant for West Bengal potato farmers.

CRITICAL RULES:
1. Identify the language the farmer is speaking from the audio or text. It will be Bengali, Hindi, or English (including Hinglish/Banglish).
2. You MUST respond ONLY in the exact same language the farmer used.
3. If the farmer speaks Hindi in Roman script, respond in Hindi using Roman script.
4. If the farmer uses Bengali script, respond in Bengali script.
5. If English, respond in English.
6. Keep responses SHORT — 1-2 sentences maximum. Farmers need clarity, not essays.
7. Sound like a helpful village agricultural advisor, NOT a technical chatbot.
8. DO NOT use complex terminology. Use farmer-friendly language.
9. DO NOT say "Graph Neural Network" or "NDVI composite index" — say things simply.
10. Extract what the farmer needs: crop type, quantity, storage needs, selling intent, etc.

YOUR RESPONSE MUST BE VALID JSON with exactly these fields:
{{
  "transcribed_text": "the exact words the farmer said, in the script they used or should be used",
  "detected_language": "bn" or "hi" or "en",
  "response_text": "your natural reply in the detected language",
  "intent": "one of: HARVEST_INPUT | STORAGE_QUERY | SELL_QUERY | PRICE_QUERY | LOAN_QUERY | INSURANCE_QUERY | GREETING | UNCLEAR | OTHER",
  "entities": {{
    "crop": "extracted crop name or null",
    "quantity_quintals": extracted number or null,
    "district": "extracted district or null",
    "timing": "extracted timing/urgency or null"
  }},
  "needs_confirmation": true if you extracted harvest details and should confirm before proceeding,
  "confirmation_text": "confirmation question in the detected language if needs_confirmation is true, else null",
  "suggested_actions": ["list of next actions like 'find_storage', 'check_price', 'apply_loan'"]
}}
{context_block}{history_block}"""

    user_prompt = ""
    if farmer_text:
        user_prompt += f'Farmer says: "{farmer_text}"\n'
        
    user_prompt += "Respond with ONLY the JSON object. No markdown, no explanation."

    if key and key.startswith("AIzaSy"):
        import base64
        parts = [{"text": system_prompt}, {"text": user_prompt}]
        
        if audio_bytes:
            mime = audio_mime or "audio/webm"
            mime = mime.split(";")[0].strip() or "audio/webm"
            parts.insert(1, {
                "inline_data": {
                    "mime_type": mime,
                    "data": base64.b64encode(audio_bytes).decode("ascii"),
                }
            })
            
        result = _call_gemini(key, parts)

        if result:
            result["is_live_gemini"] = True
            if not result.get("detected_language"):
                result["detected_language"] = detected_lang
                
            # Generate TTS audio for the reply text
            reply_text = result.get("confirmation_text") or result.get("response_text")
            if reply_text:
                result["response_audio_base64"] = _generate_tts(reply_text, result.get("detected_language", "en"))
                
            return result

    # Fallback: rule-based response
    return _fallback_response(farmer_text or "", detected_lang)


def _call_gemini(key: str, parts: list[dict]) -> dict | None:
    """Call Gemini and parse the JSON response."""
    for model in GEMINI_CONVERSE_MODELS:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={key}"
        )
        body = {
            "contents": [{"parts": parts}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 512},
        }
        try:
            with httpx.Client(timeout=55.0) as client:
                resp = client.post(url, json=body)
            if resp.status_code == 429:
                logger.warning("Gemini converse quota %s", model)
                continue
            if resp.status_code != 200:
                logger.warning("Gemini converse %s HTTP %s", model, resp.status_code)
                continue

            data = resp.json()
            raw = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            ).strip()

            # Extract JSON from response (may be wrapped in ```json ... ```)
            json_match = re.search(r"\{[\s\S]*\}", raw)
            if not json_match:
                logger.warning("Gemini converse no JSON in response")
                continue

            parsed = json.loads(json_match.group())
            return {
                "ok": True,
                "transcribed_text": parsed.get("transcribed_text", ""),
                "detected_language": parsed.get("detected_language", "en"),
                "response_text": parsed.get("response_text", ""),
                "response_ssml": None,
                "intent": parsed.get("intent", "OTHER"),
                "entities": parsed.get("entities", {}),
                "needs_confirmation": parsed.get("needs_confirmation", False),
                "confirmation_text": parsed.get("confirmation_text"),
                "suggested_actions": parsed.get("suggested_actions", []),
            }
        except json.JSONDecodeError:
            logger.warning("Gemini converse JSON parse failed for %s", model)
            continue
        except Exception as exc:
            logger.warning("Gemini converse %s failed: %s", model, exc)
            continue

    return None


def _fallback_response(text: str, lang: str) -> dict:
    """Rule-based fallback when Gemini is unavailable."""
    from services.nlp_parser import parse_farmer_message

    parsed = parse_farmer_message(text)
    entities = {
        "crop": parsed.crop if parsed.crop != "Potato" or parsed.quantity_found else None,
        "quantity_quintals": parsed.quantity_quintals if parsed.quantity_found else None,
        "district": parsed.district,
        "timing": None,
    }

    has_harvest = parsed.quantity_found
    intent = "HARVEST_INPUT" if has_harvest else "UNCLEAR"

    # Generate response in detected language
    if has_harvest:
        q = int(parsed.quantity_quintals)
        crop_label = parsed.crop
        if lang == "hi":
            response = f"Kya aapke paas {q} quintal {crop_label} hai?"
            confirm = response
        elif lang == "bn":
            response = f"আপনার কি {q} কুইন্টাল {crop_label} আছে?"
            confirm = response
        else:
            response = f"Do you have {q} quintals of {crop_label}?"
            confirm = response
    else:
        if lang == "hi":
            response = "Aapke paas kitna aloo hai? Mujhe bataiye, main aapke liye best plan dhoondhunga."
        elif lang == "bn":
            response = "আপনার কত আলু আছে? বলুন, আমি আপনার জন্য সেরা পরিকল্পনা খুঁজব।"
        else:
            response = "How much potato do you have? Tell me and I'll find the best plan for you."
        confirm = None
        
    reply_text = confirm or response
    audio_base64 = _generate_tts(reply_text, lang) if reply_text else None

    return {
        "ok": True,
        "detected_language": lang,
        "transcribed_text": text,
        "response_text": response,
        "response_ssml": None,
        "response_audio_base64": audio_base64,
        "intent": intent,
        "entities": entities,
        "needs_confirmation": has_harvest,
        "confirmation_text": confirm,
        "suggested_actions": ["find_storage"] if has_harvest else [],
        "is_live_gemini": False,
    }


def _generate_tts(text: str, lang: str) -> str | None:
    """Generates TTS audio in the farmer's spoken language."""
    try:
        tl = tts_language_code(lang)
        encoded_text = urllib.parse.quote(text)
        url = f"https://translate.google.com/translate_tts?ie=UTF-8&q={encoded_text}&tl={tl}&client=tw-ob"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        import base64

        with urllib.request.urlopen(req, timeout=8) as response:
            audio = response.read()
            return base64.b64encode(audio).decode("ascii")
    except Exception as exc:
        logger.warning("TTS generation failed (%s): %s", lang, exc)
        return None
