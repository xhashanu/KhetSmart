import re
from dataclasses import dataclass

CROP_ALIASES = {
    "jyoti": "Jyoti Potato",
    "জ্যোতি": "Jyoti Potato",
    "aloo": "Potato",
    "আলু": "Potato",
    "potato": "Potato",
    "chipsona": "Chipsona-1",
    "kufri": "Kufri Jyoti",
}

DISTRICT_HINTS = {
    "বর্ধমান": "Purba Bardhaman",
    "bardhaman": "Purba Bardhaman",
    "burdwan": "Purba Bardhaman",
    "হুগলি": "Hooghly",
    "bankura": "Bankura",
    "মালদা": "Malda",
}


CONFIDENCE_CONFIRM_THRESHOLD = 0.7
DEFAULT_QUANTITY_Q = 50.0

CROP_OPTIONS = (
    "Jyoti Potato",
    "Potato",
    "Chipsona-1",
    "Kufri Jyoti",
)


@dataclass
class ParsedFarmerInput:
    quantity_quintals: float
    crop: str
    district: str | None
    raw_text: str
    confidence: float
    quantity_found: bool


def needs_confirmation(parsed: ParsedFarmerInput) -> bool:
    return (
        parsed.confidence < CONFIDENCE_CONFIRM_THRESHOLD
        or not parsed.quantity_found
    )


def _extract_quantity(text: str) -> float | None:
    patterns = [
        r"(\d+(?:\.\d+)?)\s*(?:quintal|quintals|কুইন্টাল|কুইন্টাল)",
        r"(\d+(?:\.\d+)?)\s*(?:qtl|qt)",
        r"(\d+(?:\.\d+)?)\s*(?:টন|ton)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            value = float(match.group(1))
            if "ton" in pattern or "টন" in pattern:
                return value * 10
            return value
    bangla_digits = re.search(r"([০-৯]+(?:\.[০-৯]+)?)\s*কুইন্টাল", text)
    if bangla_digits:
        bn = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
        return float(bangla_digits.group(1).translate(bn))
    return None


def _extract_crop(text: str) -> str:
    lower = text.lower()
    for key, label in CROP_ALIASES.items():
        if key in lower or key in text:
            return label
    return "Potato"


def _extract_district(text: str) -> str | None:
    lower = text.lower()
    for key, district in DISTRICT_HINTS.items():
        if key in lower or key in text:
            return district
    return None


def parse_farmer_message(text: str) -> ParsedFarmerInput:
    quantity = _extract_quantity(text)
    crop = _extract_crop(text)
    district = _extract_district(text)

    confidence = 0.55
    if quantity is not None:
        confidence += 0.25
    if crop != "Potato" or any(k in text.lower() for k in CROP_ALIASES):
        confidence += 0.12
    if district:
        confidence += 0.08

    return ParsedFarmerInput(
        quantity_quintals=quantity if quantity is not None else DEFAULT_QUANTITY_Q,
        crop=crop,
        district=district,
        raw_text=text,
        confidence=min(confidence, 0.98),
        quantity_found=quantity is not None,
    )
