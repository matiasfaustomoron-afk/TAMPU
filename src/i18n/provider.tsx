"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { Locale } from "@/i18n/config";
import { DEFAULT_LOCALE } from "@/i18n/config";
import es from "@/i18n/dictionaries/es";
import en from "@/i18n/dictionaries/en";

const dicts: Record<Locale, Dictionary> = { es, en };

interface I18nCtx {
  locale: Locale;
  t: Dictionary;
  setLocale: (l: Locale) => void;
  formatDate: (date: string | Date, style?: "short" | "long" | "iso") => string;
  formatCurrency: (amount: number, currency?: string) => string;
  formatNumber: (n: number) => string;
}

const Ctx = createContext<I18nCtx>(null!);

const STORAGE_KEY = "travel-os-locale";

function getSavedLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "es" || saved === "en") return saved;
  // Auto-detect from browser
  const lang = navigator.language.slice(0, 2);
  if (lang === "es") return "es";
  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getSavedLocale);
  const t = dicts[locale];

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
  }, []);

  const formatDate = useCallback((date: string | Date, style: "short" | "long" | "iso" = "short") => {
    const d = new Date(date);
    if (style === "iso") return d.toISOString().split("T")[0];
    const opts: Intl.DateTimeFormatOptions = style === "long"
      ? { weekday: "short", month: "short", day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric" };
    return d.toLocaleDateString(t.format.dateLocale, opts);
  }, [t.format.dateLocale]);

  const formatCurrency = useCallback((amount: number, currency = "USD") => {
    return new Intl.NumberFormat(t.format.currencyLocale, {
      style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(amount);
  }, [t.format.currencyLocale]);

  const formatNumber = useCallback((n: number) => {
    return new Intl.NumberFormat(t.format.numberLocale).format(n);
  }, [t.format.numberLocale]);

  return (
    <Ctx.Provider value={{ locale, t, setLocale, formatDate, formatCurrency, formatNumber }}>
      {children}
    </Ctx.Provider>
  );
}

export function useI18n() { return useContext(Ctx); }
export function useT() { return useContext(Ctx).t; }
