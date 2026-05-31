'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import en from './en.json';
import tr from './tr.json';

export type Locale = 'en' | 'tr';

const messages: Record<Locale, Record<string, unknown>> = { en, tr };

const STORAGE_KEY = 'crypto4pro-locale';

function getNested(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : path;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === 'en' || stored === 'tr') {
      setLocaleState(stored);
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  const t = useCallback(
    (key: string) => getNested(messages[locale] as Record<string, unknown>, key),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className={cn('flex items-center gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10', className)}>
      {(['en', 'tr'] as Locale[]).map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => setLocale(loc)}
          className={cn(
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
            locale === loc ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300',
          )}
        >
          {t(`language.${loc}`)}
        </button>
      ))}
    </div>
  );
}
