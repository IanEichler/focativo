"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const THEME_STORAGE_KEY = "theme";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "light";
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return theme;
}

function applyTheme(theme: Theme) {
  const resolvedTheme = resolveTheme(theme);
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolvedTheme);
  document.documentElement.style.colorScheme = resolvedTheme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Inicialização preguiçosa (lê localStorage direto), em vez de setState num
  // efeito de montagem: evita uma renderização em cascata e satisfaz
  // react-hooks/set-state-in-effect. Não há risco de mismatch de hidratação
  // porque este componente não renderiza DOM a partir do tema — ele só expõe
  // contexto; quem lê `resolvedTheme` na UI já se protege com useIsClient().
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => resolveThemeOnClient(readStoredTheme()));

  useEffect(() => {
    // O script inline em app/layout.tsx já aplicou a classe antes da primeira
    // pintura; isto mantém o DOM sincronizado após montagens seguintes
    // (ex.: remontagem do Strict Mode em desenvolvimento) e nas trocas de tema.
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      setResolvedTheme(resolveTheme("system"));
      applyTheme("system");
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (nextTheme) => {
        setThemeState(nextTheme);
        setResolvedTheme(resolveTheme(nextTheme));
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
      },
    }),
    [resolvedTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** resolveTheme lê matchMedia, que não existe no servidor. */
function resolveThemeOnClient(theme: Theme): "light" | "dark" {
  return typeof window === "undefined" ? "light" : resolveTheme(theme);
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
