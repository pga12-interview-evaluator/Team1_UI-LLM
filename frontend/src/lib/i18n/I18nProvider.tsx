"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { dictionaries, resolveLocale, type Dictionary, type Locale } from "./dictionaries";

interface I18nContextValue {
  locale: Locale;
  t: Dictionary;
}

const I18nContext = createContext<I18nContextValue>({ locale: "en", t: dictionaries.en });

export function I18nProvider({
  languageTag,
  children,
}: {
  languageTag?: string;
  children: ReactNode;
}) {
  const value = useMemo(() => {
    const locale = resolveLocale(languageTag);
    return { locale, t: dictionaries[locale] };
  }, [languageTag]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): Dictionary {
  return useContext(I18nContext).t;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
