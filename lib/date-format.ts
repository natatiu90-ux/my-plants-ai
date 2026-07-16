import type { Locale } from "@/i18n/dictionaries";

const dayMs = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatRelativeDate(dateKey: string | undefined, locale: Locale, fallback: string) {
  if (!dateKey) {
    return fallback;
  }

  const date = new Date(`${dateKey}T12:00:00`);
  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(date);
  const diffDays = Math.round((target.getTime() - today.getTime()) / dayMs);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (Math.abs(diffDays) < 14) {
    return formatter.format(diffDays, "day");
  }

  return formatter.format(Math.round(diffDays / 7), "week");
}

export function formatShortDate(dateKey: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long"
  }).format(new Date(`${dateKey}T12:00:00`));
}

export function formatLongDate(dateKey: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${dateKey}T12:00:00`));
}
