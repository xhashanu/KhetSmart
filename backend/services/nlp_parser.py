import re
from dataclasses import dataclass

CROP_ALIASES = {
    "jyoti": "Jyoti Potato",
    "জ্যোতি": "Jyoti Potato",
    "ज्योति": "Jyoti Potato",
    "ज्योती": "Jyoti Potato",
    "aloo": "Potato",
    "alu": "Potato",
    "আলু": "Potato",
    "आलू": "Potato",
    "आलु": "Potato",
    "potato": "Potato",
    "potatoes": "Potato",
    "chipsona": "Chipsona-1",
    "चिपसोना": "Chipsona-1",
    "kufri": "Kufri Jyoti",
    "कुफरी": "Kufri Jyoti",
}

DISTRICT_HINTS = {
    "বর্ধমান": "Purba Bardhaman",
    "bardhaman": "Purba Bardhaman",
    "burdwan": "Purba Bardhaman",
    "बर्धमान": "Purba Bardhaman",
    "হুগলি": "Hooghly",
    "हुगली": "Hooghly",
    "bankura": "Bankura",
    "बांकुड़ा": "Bankura",
    "মালদা": "Malda",
    "मालदा": "Malda",
}

# Bengali number words (common farmer quantities)
BN_NUMBER_WORDS: dict[str, float] = {
    "এক": 1, "দুই": 2, "তিন": 3, "চার": 4, "পাঁচ": 5, "পাচ": 5,
    "ছয়": 6, "সাত": 7, "আট": 8, "নয়": 9, "দশ": 10,
    "বিশ": 20, "তিরিশ": 30, "চল্লিশ": 40, "পঞ্চাশ": 50, "পচাস": 50,
    "ষাট": 60, "সত্তর": 70, "আশি": 80, "অশি": 80, "শি": 80,
    "নব্বই": 90, "একশ": 100, "শত": 100,
}

# Hindi/Devanagari number words
HI_NUMBER_WORDS: dict[str, float] = {
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5,
    "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
    "बीस": 20, "तीस": 30, "चालीस": 40, "पचास": 50, "पचस": 50,
    "साठ": 60, "सत्तर": 70, "अस्सी": 80, "ASSI": 80, "नब्बे": 90, "सौ": 100,
}

# Roman transliteration (Bengali/Hindi farmers often speak)
ROMAN_NUMBER_WORDS: dict[str, float] = {
    "ek": 1, "do": 2, "teen": 3, "char": 4, "paanch": 5, "panch": 5,
    "chhe": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
    "bees": 20, "bis": 20, "teis": 30, "tis": 30, "chollish": 40, "chalis": 40,
    "pachas": 50, "panchash": 50, "ponchas": 50, "pachis": 50,
    "saath": 60, "sattor": 70, "sattar": 70,
    "ashi": 80, "ashii": 80, "asi": 80, "aashi": 80, "assi": 80,
    "nobbo": 90, "nabbe": 90, "eksho": 100, "so": 100,
    # Bengali roman
    "pachash": 50, "panchas": 50, "chollis": 40, "at": 8,
}

QUINTAL_PATTERN = (
    r"(?:quintal|quintals|qtl|qt\b|"
    r"কুইন্টাল|কুইন্ট্যাল|কুইন্টল|"
    r"क्विंटल|क्विन्टल|क्विन्टाल|"
    r"quintals)"
)

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


def _word_to_number(word: str) -> float | None:
    w = word.strip()
    if not w:
        return None
    # Arabic digits
    if re.match(r"^\d+(?:\.\d+)?$", w):
        return float(w)
    # Bengali digits
    if re.match(r"^[০-৯]+(?:\.[০-৯]+)?$", w):
        bn = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
        return float(w.translate(bn))
    # Hindi digits
    if re.match(r"^[०-९]+(?:\.[०-९]+)?$", w):
        hi = str.maketrans("०१२३४५६७८९", "0123456789")
        return float(w.translate(hi))
    if w in BN_NUMBER_WORDS:
        return BN_NUMBER_WORDS[w]
    if w in HI_NUMBER_WORDS:
        return HI_NUMBER_WORDS[w]
    lower = w.lower()
    if lower in ROMAN_NUMBER_WORDS:
        return ROMAN_NUMBER_WORDS[lower]
    return None


def _extract_quantity(text: str) -> float | None:
    # Digit + quintal (Latin, Bengali, Hindi digits)
    patterns = [
        rf"(\d+(?:\.\d+)?)\s*{QUINTAL_PATTERN}",
        rf"([০-৯]+(?:\.[০-৯]+)?)\s*{QUINTAL_PATTERN}",
        rf"([०-९]+(?:\.[०-९]+)?)\s*{QUINTAL_PATTERN}",
        r"(\d+(?:\.\d+)?)\s*(?:qtl|qt\b)",
        r"(\d+(?:\.\d+)?)\s*(?:টন|ton)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            raw = match.group(1)
            val = _word_to_number(raw)
            if val is None:
                val = float(raw)
            if "ton" in pattern or "টন" in pattern:
                return val * 10
            return val

    # Word number immediately before quintal: "আশি কুইন্টাল", "pachas quintal"
    word_q = re.search(
        rf"([\u0980-\u09FF\u0900-\u097FA-Za-z]+)\s*{QUINTAL_PATTERN}",
        text,
        re.IGNORECASE,
    )
    if word_q:
        val = _word_to_number(word_q.group(1))
        if val is not None:
            return val

    # Standalone well-known number words when quintal appears anywhere in text
    if re.search(QUINTAL_PATTERN, text, re.IGNORECASE):
        for word, val in {**BN_NUMBER_WORDS, **HI_NUMBER_WORDS, **ROMAN_NUMBER_WORDS}.items():
            if len(word) < 2:
                continue
            if word.lower() in text.lower() or word in text:
                return val

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
