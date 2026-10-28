import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "finlit-theme";
const ThemeContext = createContext(null);

export function getInitialTheme() {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  }
  if (typeof document !== "undefined") {
    const applied = document.documentElement.dataset.theme;
    if (applied === "light" || applied === "dark") return applied;
  }
  if (typeof window !== "undefined") {
    if (typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  }
  return "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = (event) => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== "light" && saved !== "dark") {
        setTheme(event.matches ? "dark" : "light");
      }
    };
    if (media.addEventListener) media.addEventListener("change", handleSystemChange);
    else media.addListener?.(handleSystemChange);
    return () => {
      if (media.removeEventListener) media.removeEventListener("change", handleSystemChange);
      else media.removeListener?.(handleSystemChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.body.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#FBFAF6" : "#050E1D");
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    isLight: theme === "light",
    toggleTheme: () => setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    }),
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
