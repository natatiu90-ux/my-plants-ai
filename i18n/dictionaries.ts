import en from "./en.json";
import ru from "./ru.json";

export const dictionaries = {
  en,
  ru
} as const;

export type Locale = keyof typeof dictionaries;
export type TranslationKey = keyof typeof en;

export const locales = Object.keys(dictionaries) as Locale[];

export function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "ru";
}
