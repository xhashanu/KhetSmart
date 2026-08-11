"""End-to-end voice pipeline: STT → language → NLP → confirm → consult.

Voice is an interface over the same backend logic as the text/button UI.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from services.finance import evaluate_loan
from services.nlp_parser import needs_confirmation, parse_farmer_message
from services.price_compare import build_price_comparison
from services.router import recommend_route
from services.voice_conversation import (
    _generate_tts,
    detect_language,
    detect_yes_no,
)
from services.voice_entity_extract import extract_harvest_entities, generate_farmer_reply
from services.voice_transcribe import gemini_stt_configured, transcribe_farmer_audio
from services.yield_service import get_latest_yield, to_legacy_forecast

logger = logging.getLogger(__name__)

# Minimum audio blob size (bytes) — below this we reject as empty capture
MIN_AUDIO_BYTES = 400


def _crop_display(crop: str, lang: str) -> str:
    if lang == "bn" and "potato" in crop.lower():
        return "আলু"
    if lang == "hi" and "potato" in crop.lower():
        return "aloo"
    if lang == "ta" and "potato" in crop.lower():
        return "உருளைக்கிழங்கு"
    if lang == "mr" and "potato" in crop.lower():
        return "बटाटा"
    return crop


def _reply(lang: str, purpose: str, **kwargs) -> str:
    """Farmer-facing reply in spoken language — Gemini first, template fallback."""
    gemini_text = generate_farmer_reply(
        lang,
        purpose,
        qty=kwargs.get("qty"),
        crop=kwargs.get("crop"),
        heard=kwargs.get("heard"),
        glut=kwargs.get("glut"),
        storage=kwargs.get("storage"),
        profit=kwargs.get("profit"),
    )
    if gemini_text:
        return gemini_text
    return _msg_template(lang, purpose, **kwargs)


def _msg_template(lang: str, key: str, **kwargs) -> str:
    """Static templates for bn/hi/en when Gemini unavailable."""
    templates: dict[str, dict[str, str]] = {
        "confirm_harvest": {
            "en": "Do you mean that you have {qty} quintals of {crop}?",
            "hi": "Kya aapke paas {qty} quintal {crop} hai?",
            "bn": "আপনার কি {qty} কুইন্টাল {crop} আছে?",
        },
        "confirm_yes_plan": {
            "en": "Got it. Let me find the best plan for your harvest.",
            "hi": "Theek hai. Main aapke liye sabse accha plan dhoondh raha hoon.",
            "bn": "ঠিক আছে। আমি আপনার ফসলের জন্য সেরা পরিকল্পনা খুঁজছি।",
        },
        "confirm_no": {
            "en": "Okay, please tell me again — how much potato do you have?",
            "hi": "Theek hai, phir se bataiye — aapke paas kitna aloo hai?",
            "bn": "ঠিক আছে, আবার বলুন — আপনার কত আলু আছে?",
        },
        "stt_failed": {
            "en": "Sorry, I couldn't hear that clearly. Please say it again.",
            "hi": "Maaf kijiye, main saaf sun nahi paya. Kripya phir se bolein.",
            "bn": "দুঃখিত, আমি স্পষ্ট শুনতে পাইনি। আবার বলুন।",
        },
        "mic_unavailable": {
            "en": "Voice is not available. Please check microphone access or try typing.",
            "hi": "Voice uplabdh nahi hai. Mic access check karein ya type karein.",
            "bn": "ভয়েস উপলব্ধ নয়। মাইক্রোফোন অনুমতি দিন বা লিখুন।",
        },
        "gemini_missing": {
            "en": "Voice requires server STT configuration. Please type your harvest details.",
            "hi": "Voice ke liye server setup chahiye. Kripya type karke bataiye.",
            "bn": "ভয়েসের জন্য সার্ভার সেটআপ দরকার। লিখে জানান।",
        },
        "low_confidence": {
            "en": "I heard: \"{heard}\". Did you say {qty} quintals of {crop}?",
            "hi": "Maine suna: \"{heard}\". Kya aapne {qty} quintal {crop} kaha?",
            "bn": "আমি শুনেছি: \"{heard}\"। আপনি কি {qty} কুইন্টাল {crop} বলেছেন?",
        },
        "unclear": {
            "en": "How much potato do you have? Tell me the quantity in quintals.",
            "hi": "Aapke paas kitna aloo hai? Quintal mein batayein.",
            "bn": "আপনার কত আলু আছে? কুইন্টালে বলুন।",
        },
        "plan_ready": {
            "en": (
                "Your market pressure is {glut} percent. "
                "I recommend {storage} — estimated profit about rupees {profit}."
            ),
            "hi": (
                "Bazaar ka dabav {glut} pratishat hai. "
                "Main {storage} suggest karta hoon — anumanit labh lagbhag {profit} rupaye."
            ),
            "bn": (
                "বাজারের চাপ {glut} শতাংশ। "
                "আমি {storage} সুপারিশ করছি — আনুমানিক লাভ প্রায় {profit} টাকা।"
            ),
        },
        "action_storage": {
            "en": "I'll show you the best cold storages near you.",
            "hi": "Main aapke paas ke sabse acchhe cold storage dikhata hoon.",
            "bn": "আমি আপনার কাছের সেরা কোল্ড স্টোরেজ দেখাচ্ছি।",
        },
        "action_price": {
            "en": "Let me show you current market prices and glut risk.",
            "hi": "Main abhi ke mandi bhav aur glut risk dikhata hoon.",
            "bn": "আমি বর্তমান mandi দাম ও glut ঝুঁকি দেখাচ্ছি।",
        },
        "action_loan": {
            "en": "I'll open the finance section for your loan options.",
            "hi": "Main aapke loan vikalpon ke liye finance section kholta hoon.",
            "bn": "আমি আপনার loan অপশনের জন্য finance খুলছি।",
        },
    }
    lang_code = lang if lang in ("en", "hi", "bn", "ta", "te", "mr", "kn", "gu", "pa", "or", "ml") else "en"
    if kwargs.get("crop"):
        kwargs = {**kwargs, "crop": _crop_display(str(kwargs["crop"]), lang)}
    return templates.get(key, {}).get(lang_code, templates.get(key, {}).get("en", "")).format(
        **kwargs
    )


def _msg(lang: str, key: str, **kwargs) -> str:
    return _reply(lang, key, **kwargs)


def _run_consult(
    db: Session,
    quantity: float,
    crop: str,
    district: str | None,
    farmer_lat: float | None,
    farmer_lng: float | None,
    text: str,
) -> dict:
    """Same logic as POST /api/consult — voice must not duplicate business rules."""
    dto = get_latest_yield(db)
    forecast = to_legacy_forecast(dto)
    route = recommend_route(
        db,
        quantity,
        crop,
        district,
        forecast.glut_risk_pct,
        farmer_lat=farmer_lat,
        farmer_lng=farmer_lng,
    )
    loan = evaluate_loan(
        quantity,
        route.market_price_per_quintal,
        route.logistics_cost_inr,
        forecast.glut_risk_pct,
        route.storage_id,
    )
    price_cmp = build_price_comparison(quantity, route.market_price_per_quintal)
    return {
        "parsed": {
            "quantity_quintals": quantity,
            "crop": crop,
            "district": district,
            "confidence": 1.0,
            "quantity_found": True,
            "user_confirmed": True,
        },
        "yield_signal": {
            "glut_risk_pct": forecast.glut_risk_pct,
            "alert_level": forecast.alert_level,
            "ndvi": forecast.ndvi_index,
            "insight": forecast.insight,
            "data_source": dto.data_source,
            "recorded_at": dto.recorded_at,
        },
        "route": {
            "storage_id": route.storage_id,
            "storage_name": route.storage_name,
            "district": route.district,
            "distance_km": route.distance_km,
            "distance_source": route.distance_source,
            "logistics_cost_inr": route.logistics_cost_inr,
            "estimated_profit_inr": route.estimated_profit_inr,
            "market_price_per_quintal": route.market_price_per_quintal,
            "market_name": route.market_name,
            "origin_lat": route.origin_lat,
            "origin_lng": route.origin_lng,
            "storage_lat": route.storage_lat,
            "storage_lng": route.storage_lng,
            "market_lat": route.market_lat,
            "market_lng": route.market_lng,
            "why": route.why,
        },
        "price_comparison": {
            "distress_price_per_quintal": price_cmp.distress_price_per_quintal,
            "live_mandi_price_per_quintal": price_cmp.live_mandi_price_per_quintal,
            "cultivation_cost_per_quintal": price_cmp.cultivation_cost_per_quintal,
            "quantity_quintals": price_cmp.quantity_quintals,
            "revenue_at_live_inr": price_cmp.revenue_at_live_inr,
            "revenue_at_distress_inr": price_cmp.revenue_at_distress_inr,
            "uplift_vs_distress_inr": price_cmp.uplift_vs_distress_inr,
            "below_cultivation_cost": price_cmp.below_cultivation_cost,
            "in_distress_zone": price_cmp.in_distress_zone,
            "headline": price_cmp.headline,
            "detail": price_cmp.detail,
        },
        "loan": {
            "approved": loan.approved,
            "amount_inr": loan.amount_inr,
            "interest_rate_pa": loan.interest_rate_pa,
            "tenure_days": loan.tenure_days,
            "bank_partner": loan.bank_partner,
            "grn_id": loan.grn_id,
            "trigger_reason": loan.trigger_reason,
        },
        "_source_text": text,
    }


def _detect_action_intent(text: str, lang: str) -> str | None:
    lower = text.lower()
    storage_kw = (
        "storage", "cold storage", "store", "rakh", "rakhna", "rakho",
        "stor", "godown", "dikhao", "dikh", "network",
    )
    price_kw = ("price", "mandi", "bazaar", "bech", "sell", "glut", "pressure", "bajare")
    loan_kw = ("loan", "rin", "finance", "paisa", "money", "udhar")

    if any(k in lower for k in storage_kw):
        return "find_storage"
    if any(k in lower for k in price_kw):
        return "check_price"
    if any(k in lower for k in loan_kw):
        return "apply_loan"
    return None


def process_voice_turn(
    db: Session,
    *,
    farmer_text: str | None = None,
    audio_bytes: bytes | None = None,
    audio_mime: str | None = None,
    conversation_state: dict | None = None,
    farmer_lat: float | None = None,
    farmer_lng: float | None = None,
    context: dict | None = None,
) -> dict[str, Any]:
    """Single voice turn: STT → understand → confirm or execute consult."""
    state = conversation_state or {}
    conv_lang: str = state.get("conversation_language") or "en"
    pending: dict | None = state.get("pending_harvest")
    phase: str = state.get("phase") or "idle"

    diagnostics: dict[str, Any] = {
        "microphone": "not_used",
        "audio_captured": False,
        "audio_bytes": 0,
        "audio_mime": None,
        "stt_provider": None,
        "stt_status": "skipped",
        "transcript": None,
        "detected_language": None,
        "intent": None,
        "entities": None,
        "backend_api": None,
        "tts_status": "pending",
    }

    transcript = (farmer_text or "").strip()

    # ---- Step 1: STT from audio (always prefer dedicated Gemini STT) ----
    if audio_bytes:
        diagnostics["microphone"] = "used"
        diagnostics["audio_bytes"] = len(audio_bytes)
        diagnostics["audio_mime"] = (audio_mime or "audio/webm").split(";")[0]

        if len(audio_bytes) < MIN_AUDIO_BYTES:
            diagnostics["stt_status"] = "empty_audio"
            diagnostics["audio_captured"] = False
            reply = _msg(conv_lang, "stt_failed")
            return _wrap(
                ok=False,
                phase="idle",
                conv_lang=conv_lang,
                transcript="",
                reply=reply,
                intent="STT_FAILED",
                diagnostics=diagnostics,
                needs_confirmation=False,
            )

        diagnostics["audio_captured"] = True

        if not gemini_stt_configured():
            diagnostics["stt_status"] = "gemini_not_configured"
            reply = _msg(conv_lang, "gemini_missing")
            return _wrap(
                ok=False,
                phase="idle",
                conv_lang=conv_lang,
                transcript="",
                reply=reply,
                intent="STT_UNAVAILABLE",
                diagnostics=diagnostics,
                needs_confirmation=False,
            )

        hint = "auto"
        stt = transcribe_farmer_audio(
            audio_bytes,
            mime_type=audio_mime or "audio/webm",
            language_hint=hint,
        )
        diagnostics["stt_provider"] = "Gemini"
        if not stt.get("ok"):
            diagnostics["stt_status"] = stt.get("error", "failed")
            reply = _msg(conv_lang, "stt_failed")
            return _wrap(
                ok=False,
                phase=phase,
                conv_lang=conv_lang,
                transcript="",
                reply=reply,
                intent="STT_FAILED",
                diagnostics=diagnostics,
                needs_confirmation=False,
            )

        transcript = (stt.get("text") or "").strip()
        diagnostics["stt_status"] = "success"
        diagnostics["stt_engine"] = stt.get("engine")
        diagnostics["transcript"] = transcript

    if not transcript:
        diagnostics["stt_status"] = diagnostics.get("stt_status") or "no_input"
        reply = _msg(conv_lang, "stt_failed")
        return _wrap(
            ok=False,
            phase=phase,
            conv_lang=conv_lang,
            transcript="",
            reply=reply,
            intent="NO_INPUT",
            diagnostics=diagnostics,
            needs_confirmation=False,
        )

    # ---- Step 2: Language detection (from speech, never UI) ----
    detected_lang = detect_language(transcript)
    conv_lang = detected_lang
    diagnostics["detected_language"] = detected_lang

    # ---- Step 3: Handle pending confirmation ----
    if pending and phase == "confirming":
        yn = detect_yes_no(transcript, detected_lang)
        if yn == "yes":
            qty = float(pending["quantity_quintals"])
            crop = pending["crop"]
            district = pending.get("district")
            confirm_reply = _msg(detected_lang, "confirm_yes_plan")
            try:
                consult = _run_consult(
                    db, qty, crop, district, farmer_lat, farmer_lng, pending.get("transcript", transcript)
                )
                diagnostics["backend_api"] = "POST /api/consult (internal)"
                plan_reply = _msg(
                    detected_lang,
                    "plan_ready",
                    glut=consult["yield_signal"]["glut_risk_pct"],
                    storage=consult["route"]["storage_name"],
                    profit=f"{consult['route']['estimated_profit_inr']:,}",
                )
                full_reply = f"{confirm_reply} {plan_reply}"
                return _wrap(
                    ok=True,
                    phase="result",
                    conv_lang=detected_lang,
                    transcript=transcript,
                    reply=full_reply,
                    intent="HARVEST_PLAN",
                    entities={
                        "crop": crop,
                        "quantity_quintals": qty,
                        "district": district,
                        "unit": "quintal",
                    },
                    diagnostics=diagnostics,
                    needs_confirmation=False,
                    consult_result=consult,
                    suggested_actions=["find_storage"],
                    conversation_state={
                        "phase": "result",
                        "conversation_language": detected_lang,
                        "pending_harvest": None,
                        "last_consult": True,
                    },
                )
            except Exception as exc:
                logger.exception("Voice consult failed")
                diagnostics["backend_api"] = f"consult_error: {exc}"
                reply = _msg(detected_lang, "stt_failed")
                return _wrap(
                    ok=False,
                    phase="confirming",
                    conv_lang=detected_lang,
                    transcript=transcript,
                    reply=reply,
                    intent="CONSULT_FAILED",
                    diagnostics=diagnostics,
                    needs_confirmation=True,
                    conversation_state={
                        "phase": "confirming",
                        "conversation_language": detected_lang,
                        "pending_harvest": pending,
                    },
                )

        if yn == "no":
            reply = _msg(detected_lang, "confirm_no")
            return _wrap(
                ok=True,
                phase="idle",
                conv_lang=detected_lang,
                transcript=transcript,
                reply=reply,
                intent="CONFIRMATION_REJECTED",
                diagnostics=diagnostics,
                needs_confirmation=False,
                conversation_state={
                    "phase": "idle",
                    "conversation_language": detected_lang,
                    "pending_harvest": None,
                },
            )

    # ---- Step 4: Action intents (after plan exists) ----
    action = _detect_action_intent(transcript, detected_lang)
    if action and state.get("last_consult"):
        action_msgs = {
            "find_storage": "action_storage",
            "check_price": "action_price",
            "apply_loan": "action_loan",
        }
        reply = _msg(detected_lang, action_msgs.get(action, "unclear"))
        return _wrap(
            ok=True,
            phase="result",
            conv_lang=detected_lang,
            transcript=transcript,
            reply=reply,
            intent="ACTION",
            entities={},
            diagnostics=diagnostics,
            needs_confirmation=False,
            suggested_actions=[action],
            conversation_state={
                "phase": "result",
                "conversation_language": detected_lang,
                "pending_harvest": None,
                "last_consult": True,
            },
        )

    # ---- Step 5: NLP parse + Gemini fallback for any language ----
    parsed = parse_farmer_message(transcript)
    parse_source = "regex"

    if not parsed.quantity_found:
        gemini = extract_harvest_entities(transcript)
        if gemini and gemini.get("quantity_quintals"):
            parsed = type(parsed)(
                quantity_quintals=float(gemini["quantity_quintals"]),
                crop=gemini.get("crop") or "Potato",
                district=gemini.get("district"),
                raw_text=transcript,
                confidence=float(gemini.get("confidence") or 0.88),
                quantity_found=True,
            )
            if gemini.get("detected_language"):
                detected_lang = gemini["detected_language"]
                conv_lang = detected_lang
                diagnostics["detected_language"] = detected_lang
            parse_source = "gemini"
            diagnostics["entity_extractor"] = "gemini"

    # Merge crop from earlier unclear turn if user now only says quantity
    if not parsed.quantity_found and state.get("partial_crop"):
        gemini = extract_harvest_entities(transcript)
        if gemini and gemini.get("quantity_quintals"):
            parsed = type(parsed)(
                quantity_quintals=float(gemini["quantity_quintals"]),
                crop=state.get("partial_crop") or "Potato",
                district=gemini.get("district"),
                raw_text=transcript,
                confidence=0.85,
                quantity_found=True,
            )
            parse_source = "gemini+context"

    entities = {
        "crop": parsed.crop,
        "quantity_quintals": parsed.quantity_quintals if parsed.quantity_found else None,
        "district": parsed.district,
        "unit": "quintal" if parsed.quantity_found else None,
    }
    diagnostics["intent"] = "HARVEST_PLAN" if parsed.quantity_found else "UNCLEAR"
    diagnostics["entities"] = entities
    diagnostics["parse_source"] = parse_source

    if not parsed.quantity_found:
        partial_crop = _extract_crop_hint(transcript)
        reply = _reply(detected_lang, "unclear")
        return _wrap(
            ok=True,
            phase="idle",
            conv_lang=detected_lang,
            transcript=transcript,
            reply=reply,
            intent="UNCLEAR",
            entities=entities,
            diagnostics=diagnostics,
            needs_confirmation=False,
            conversation_state={
                "phase": "idle",
                "conversation_language": detected_lang,
                "pending_harvest": None,
                "partial_crop": partial_crop,
            },
        )

    # ---- Step 6: Always confirm harvest via voice before consult ----
    crop_label = _crop_display(parsed.crop, detected_lang)
    qty = int(parsed.quantity_quintals)
    confirm_text = _reply(
        detected_lang,
        "confirm_harvest",
        qty=qty,
        crop=crop_label,
    )

    if needs_confirmation(parsed) and parsed.confidence < 0.85:
        confirm_text = _reply(
            detected_lang,
            "low_confidence",
            heard=transcript[:80],
            qty=qty,
            crop=crop_label,
        )

    pending_harvest = {
        "quantity_quintals": parsed.quantity_quintals,
        "crop": parsed.crop,
        "district": parsed.district,
        "transcript": transcript,
    }

    return _wrap(
        ok=True,
        phase="confirming",
        conv_lang=detected_lang,
        transcript=transcript,
        reply=confirm_text,
        intent="HARVEST_PLAN",
        entities=entities,
        diagnostics=diagnostics,
        needs_confirmation=True,
        confirmation_text=confirm_text,
        conversation_state={
            "phase": "confirming",
            "conversation_language": detected_lang,
            "pending_harvest": pending_harvest,
            "last_consult": False,
        },
    )


def _extract_crop_hint(text: str) -> str | None:
    from services.nlp_parser import _extract_crop

    crop = _extract_crop(text)
    return crop if crop != "Potato" or "আলু" in text or "aloo" in text.lower() else None


def _wrap(
    *,
    ok: bool,
    phase: str,
    conv_lang: str,
    transcript: str,
    reply: str,
    intent: str,
    diagnostics: dict,
    needs_confirmation: bool,
    entities: dict | None = None,
    confirmation_text: str | None = None,
    consult_result: dict | None = None,
    suggested_actions: list | None = None,
    conversation_state: dict | None = None,
) -> dict[str, Any]:
    audio_b64 = _generate_tts(reply, conv_lang) if reply else None
    diagnostics["tts_status"] = "success" if audio_b64 else "browser_fallback"

    return {
        "ok": ok,
        "phase": phase,
        "transcribed_text": transcript,
        "detected_language": conv_lang,
        "conversation_language": conv_lang,
        "response_text": reply,
        "confirmation_text": confirmation_text,
        "response_audio_base64": audio_b64,
        "response_ssml": None,
        "intent": intent,
        "entities": entities or {},
        "needs_confirmation": needs_confirmation,
        "suggested_actions": suggested_actions or [],
        "consult_result": consult_result,
        "conversation_state": conversation_state or {},
        "diagnostics": diagnostics,
        "stt_provider": diagnostics.get("stt_provider"),
        "is_live_gemini": diagnostics.get("stt_provider") == "Gemini",
    }
