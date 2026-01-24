import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Import all locale files
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";

// Supported languages for open source software
export const supportedLanguages = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "zh-CN", name: "Simplified Chinese", nativeName: "简体中文" },
  { code: "zh-TW", name: "Traditional Chinese", nativeName: "繁體中文" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]["code"];

// Resources for i18next
const resources = {
  en: { translation: en },
  "zh-CN": { translation: zhCN },
  "zh-TW": { translation: zhTW },
  ja: { translation: ja },
  ko: { translation: ko },
  de: { translation: de },
  fr: { translation: fr },
  es: { translation: es },
  pt: { translation: pt },
  ru: { translation: ru },
};

// Initialize i18next
i18n.use(initReactI18next).init({
  resources,
  lng: "en", // Default language, will be overridden by stored preference
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  react: {
    useSuspense: false, // Disable suspense for better control
  },
});

// Function to change language
export const changeLanguage = async (lang: SupportedLanguage) => {
  await i18n.changeLanguage(lang);
};

// Function to get current language
export const getCurrentLanguage = (): SupportedLanguage => {
  return i18n.language as SupportedLanguage;
};

// Function to detect browser language and map to supported language
export const detectBrowserLanguage = (): SupportedLanguage => {
  const browserLang = navigator.language || navigator.languages?.[0] || "en";
  
  // Direct match
  const directMatch = supportedLanguages.find(
    (lang) => lang.code === browserLang
  );
  if (directMatch) {
    return directMatch.code;
  }
  
  // Match by language prefix (e.g., "zh" for "zh-CN")
  const langPrefix = browserLang.split("-")[0];
  const prefixMatch = supportedLanguages.find(
    (lang) => lang.code.startsWith(langPrefix)
  );
  if (prefixMatch) {
    return prefixMatch.code;
  }
  
  // Default to English
  return "en";
};

export default i18n;
