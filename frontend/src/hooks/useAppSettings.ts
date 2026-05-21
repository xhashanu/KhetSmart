import { useCallback, useEffect, useState } from "react";

export type AppLanguage = "en" | "bn";
export type AppFontSize = "sm" | "md" | "lg";

const LANG_KEY = "khetsmart_lang";
const FONT_KEY = "khetsmart_font";

const FONT_SCALES: Record<AppFontSize, string> = {
  sm: "0.9",
  md: "1",
  lg: "1.14",
};

function readLang(): AppLanguage {
  const v = localStorage.getItem(LANG_KEY);
  return v === "bn" ? "bn" : "en";
}

function readFont(): AppFontSize {
  const v = localStorage.getItem(FONT_KEY);
  if (v === "sm" || v === "lg") return v;
  return "md";
}

function applySettings(lang: AppLanguage, fontSize: AppFontSize) {
  document.documentElement.lang = lang === "bn" ? "bn" : "en";
  document.documentElement.style.setProperty(
    "--app-font-scale",
    FONT_SCALES[fontSize]
  );
  document.documentElement.dataset.khetsmartLang = lang;
  document.documentElement.dataset.khetsmartFont = fontSize;
}

export function useAppSettings() {
  const [language, setLanguageState] = useState<AppLanguage>(readLang);
  const [fontSize, setFontSizeState] = useState<AppFontSize>(readFont);

  useEffect(() => {
    applySettings(language, fontSize);
  }, [language, fontSize]);

  const setLanguage = useCallback((lang: AppLanguage) => {
    setLanguageState(lang);
    localStorage.setItem(LANG_KEY, lang);
  }, []);

  const setFontSize = useCallback((size: AppFontSize) => {
    setFontSizeState(size);
    localStorage.setItem(FONT_KEY, size);
  }, []);

  return { language, fontSize, setLanguage, setFontSize };
}
