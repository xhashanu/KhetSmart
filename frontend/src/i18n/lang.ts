import type { InsurancePlan } from "../api";
import type { AppLanguage } from "../hooks/useAppSettings";

export const SPEECH_LANG: Record<AppLanguage, string> = {
  en: "en-IN",
  bn: "bn-IN",
  hi: "hi-IN",
};

/** Try order when browser lacks a locale — covers BN / HI / EN for West Bengal farmers. */
export const SPEECH_TRY_ORDER: Record<AppLanguage, string[]> = {
  bn: ["bn-IN", "bn-BD", "hi-IN", "en-IN"],
  hi: ["hi-IN", "bn-IN", "en-IN", "bn-BD"],
  en: ["en-IN", "hi-IN", "bn-IN", "bn-BD"],
};

const SPEECH_LABEL: Record<string, Record<AppLanguage, string>> = {
  "bn-IN": { en: "Bengali", bn: "বাংলা", hi: "बंगाली" },
  "bn-BD": { en: "Bengali", bn: "বাংলা", hi: "बंगाली" },
  "hi-IN": { en: "Hindi", bn: "হিন্দি", hi: "हिन्दी" },
  "en-IN": { en: "English", bn: "ইংরেজি", hi: "अंग्रेज़ी" },
};

export function speechLangLabel(code: string, uiLang: AppLanguage): string {
  return SPEECH_LABEL[code]?.[uiLang] ?? code;
}

export function htmlLangAttr(lang: AppLanguage): string {
  if (lang === "bn") return "bn";
  if (lang === "hi") return "hi";
  return "en";
}

/** Bengali + Hindi use the simplified farmer UI; English keeps fuller labels where needed. */
export function isSimpleLang(lang: AppLanguage): boolean {
  return lang !== "en";
}

export function languageMenuLabel(
  lang: AppLanguage,
  labels: { english: string; bengali: string; hindi: string }
): string {
  if (lang === "bn") return labels.bengali;
  if (lang === "hi") return labels.hindi;
  return labels.english;
}

export function insurancePlanDisplay(plan: InsurancePlan, lang: AppLanguage) {
  if (lang === "bn") {
    return { name: plan.name_bn, highlights: plan.highlights_bn };
  }
  if (lang === "hi") {
    return {
      name: plan.name_hi ?? plan.name_en,
      highlights: plan.highlights_hi ?? plan.highlights_en,
    };
  }
  return { name: plan.name_en, highlights: plan.highlights_en };
}
