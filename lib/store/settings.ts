"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

/**
 * LES ANCIENS NOMS DE THÈME.
 *
 * L'application s'appelait « club » et ses thèmes « purple » / « dark-red ».
 * Un navigateur qui a gardé l'un de ces deux noms ne doit pas se réveiller
 * sans thème du tout : on le traduit au vol, ici et dans le script anti-flash
 * de app/layout.tsx, qui lit exactement la même clé.
 */
export function normalizeTheme(value: unknown): Theme {
  return value === "dark" || value === "dark-red" ? "dark" : "light";
}
export type Language = "fr" | "ar";

interface SettingsState {
  theme: Theme;
  language: Language;
  hydrated: boolean;
  autoSendWhatsapp: boolean;
  autoSendEmail: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  setAutoSendWhatsapp: (val: boolean) => void;
  setAutoSendEmail: (val: boolean) => void;
  setHydrated: () => void;
}

/** Applies theme + direction to <html>. Keep in sync with the no-flash
 *  inline script in app/layout.tsx (which reads the same persisted key). */
function applyToDocument(theme: Theme, language: Language) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.setAttribute("data-theme", theme);
  el.setAttribute("lang", language);
  el.setAttribute("dir", language === "ar" ? "rtl" : "ltr");
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Le thème clair est celui servi par défaut : il doit rester aligné
      // avec le script anti-flash de app/layout.tsx.
      theme: "light",
      language: "fr",
      hydrated: false,
      autoSendWhatsapp: true,
      autoSendEmail: true,
      setTheme: (theme) => {
        applyToDocument(theme, get().language);
        set({ theme });
      },
      toggleTheme: () => {
        const theme = get().theme === "light" ? "dark" : "light";
        applyToDocument(theme, get().language);
        set({ theme });
      },
      setLanguage: (language) => {
        applyToDocument(get().theme, language);
        set({ language });
      },
      toggleLanguage: () => {
        const language = get().language === "fr" ? "ar" : "fr";
        applyToDocument(get().theme, language);
        set({ language });
      },
      setAutoSendWhatsapp: (autoSendWhatsapp) => set({ autoSendWhatsapp }),
      setAutoSendEmail: (autoSendEmail) => set({ autoSendEmail }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "ecole-settings",
      partialize: (s) => ({
        theme: s.theme,
        language: s.language,
        autoSendWhatsapp: s.autoSendWhatsapp,
        autoSendEmail: s.autoSendEmail,
      }),
      version: 1,
      // Une préférence enregistrée sous l'ancien nom est relue, pas jetée.
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<SettingsState>;
        return {
          theme: normalizeTheme(s.theme),
          language: s.language ?? "fr",
          autoSendWhatsapp: s.autoSendWhatsapp ?? true,
          autoSendEmail: s.autoSendEmail ?? true,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          const theme = normalizeTheme(state.theme);
          if (theme !== state.theme) state.setTheme(theme);
          else applyToDocument(theme, state.language);
          state.setHydrated();
        }
      },
    },
  ),
);
