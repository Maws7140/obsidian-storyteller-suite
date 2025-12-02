import enJson from './locales/en.json';
import zhJson from './locales/zh.json';
import esJson from './locales/es.json';
import frJson from './locales/fr.json';

// Language registry - add imports here for new languages
// Note: For new languages, import the JSON file and add to the registry below
const languageRegistry: Record<string, Record<string, string>> = {
  en: enJson as Record<string, string>,
  zh: zhJson as Record<string, string>,
  es: esJson as Record<string, string>,
  fr: frJson as Record<string, string>,
};

// Supported language codes
export type Lang = 'en' | 'zh' | 'es' | 'fr' | 'de' | 'pt' | 'ja' | 'ko' | 'it' | 'ru' | 'nl' | 'pl' | 'tr' | 'ar' | 'sv' | 'no' | 'da' | 'fi' | 'cs' | 'hu' | 'el' | 'he';

// Type definitions based on English JSON keys
type TranslationKey = keyof typeof enJson;

// Language display names (in English for the language selector)
const languageNames: Record<string, string> = {
  en: 'English',
  zh: 'Chinese (中文)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  pt: 'Portuguese (Português)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  it: 'Italian (Italiano)',
  ru: 'Russian (Русский)',
  nl: 'Dutch (Nederlands)',
  pl: 'Polish (Polski)',
  tr: 'Turkish (Türkçe)',
  ar: 'Arabic (العربية)',
  sv: 'Swedish (Svenska)',
  no: 'Norwegian (Norsk)',
  da: 'Danish (Dansk)',
  fi: 'Finnish (Suomi)',
  cs: 'Czech (Čeština)',
  hu: 'Hungarian (Magyar)',
  el: 'Greek (Ελληνικά)',
  he: 'Hebrew (עברית)',
};

// Load translations from JSON files
const locales: Record<string, Record<string, string>> = languageRegistry;

let current: Lang = 'en';

export function setLocale(lang: string) {
  // Validate language is supported, fallback to English if not
  if (lang in locales || lang === 'en') {
    current = lang as Lang;
  } else {
    console.warn(`Language "${lang}" not found, falling back to English`);
    current = 'en';
  }
}

/**
 * Get list of available languages (languages that have translation files)
 */
export function getAvailableLanguages(): Lang[] {
  return Object.keys(locales).filter((lang): lang is Lang => {
    return lang in languageNames;
  }) as Lang[];
}

/**
 * Get display name for a language code
 */
export function getLanguageName(lang: string): string {
  return languageNames[lang] || lang.toUpperCase();
}

/**
 * Check if a language is available (has translation file)
 */
export function isLanguageAvailable(lang: string): boolean {
  return lang in locales;
}

/**
 * Replace template placeholders {0}, {1}, etc. with provided arguments
 */
function replaceTemplate(template: string, ...args: (string | number)[]): string {
  let result = template;
  args.forEach((arg, index) => {
    const placeholder = `{${index}}`;
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(arg));
  });
  return result;
}

/**
 * Handle pluralization for specific keys that need it
 */
function handlePluralization(key: string, template: string, ...args: (string | number)[]): string {
  // Handle pluralization for English only
  if (current === 'en') {
    if (key === 'showingXNodes' && args.length > 0 && typeof args[0] === 'number') {
      const count = args[0];
      return replaceTemplate(template, count) + (count !== 1 ? 's' : '');
    }
    if (key === 'showingXEdges' && args.length > 0 && typeof args[0] === 'number') {
      const count = args[0];
      return replaceTemplate(template, count) + (count !== 1 ? 's' : '');
    }
    if (key === 'foundXTemplates' && args.length > 0 && typeof args[0] === 'number') {
      const count = args[0];
      return replaceTemplate(template, count) + (count !== 1 ? 's' : '');
    }
  }
  return replaceTemplate(template, ...args);
}

/**
 * Translation function - maintains backward compatibility with existing code
 * @param key Translation key
 * @param args Arguments to replace in template strings ({0}, {1}, etc.)
 */
export function t<K extends TranslationKey>(key: K, ...args: (string | number)[]): string {
  const locale = locales[current];
  let template: string | undefined;
  
  if (locale) {
    template = locale[key as string];
  }
  
  if (!template) {
    // Fallback to English if translation not found
    const fallback = locales.en?.[key as string];
    if (!fallback) {
      console.warn(`Translation key "${String(key)}" not found in any locale`);
      return String(key);
    }
    return handlePluralization(key as string, fallback, ...args);
  }
  
  return handlePluralization(key as string, template, ...args);
}
