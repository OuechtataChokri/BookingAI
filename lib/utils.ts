import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatMoney(cents: number, currency: string, locale = "fr-TN"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "TND" ? 3 : 2,
      maximumFractionDigits: currency === "TND" ? 3 : 2,
    }).format(cents / 100).replace(/\u202f|\u00a0/g, " ");
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDateTime(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...opts,
  }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function formatDate(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "2-digit", month: "short", ...opts }).format(new Date(iso));
}

export function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** "21620123456" -> "+216 20 123 456"-ish readable form. */
export function formatPhone(phone: string): string {
  return phone.startsWith("+") ? phone : `+${phone}`;
}

/** Strips everything but digits ("+216 20-123-456" -> "21620123456"). */
export function normalizePhone(input: string): string {
  return input.replace(/[^\d]/g, "").replace(/^00/, "");
}

export const TIMEZONES = [
  "Africa/Tunis",
  "Africa/Algiers",
  "Africa/Casablanca",
  "Africa/Cairo",
  "Europe/Paris",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Riyadh",
  "America/New_York",
  "UTC",
];

export const CURRENCIES = ["TND", "EUR", "USD", "GBP", "MAD", "DZD", "AED", "SAR"];

export const BUSINESS_TYPES: Array<{ value: string; label: string }> = [
  { value: "barbershop", label: "Barbershop" },
  { value: "beauty_salon", label: "Beauty salon" },
  { value: "spa", label: "Spa & wellness" },
  { value: "clinic", label: "Clinic" },
  { value: "other", label: "Other" },
];

export const LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "fr", label: "Français" },
  { value: "ar-TN", label: "تونسي (Tunisian Arabic)" },
  { value: "ar", label: "العربية (Standard Arabic)" },
  { value: "en", label: "English" },
];
