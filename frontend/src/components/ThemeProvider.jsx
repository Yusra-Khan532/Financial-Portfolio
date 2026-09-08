import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "finlit-theme";
const ThemeContext = createContext(null);

function getInitialTheme() {
  if (typeof document !== "undefined") {
    const applied = document.documentElement.dataset.theme;
    if (applied === "light" || applied === "dark") return applied;
  }
  return "dark";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.body.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#FBFAF6" : "#050E1D");
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    isLight: theme === "light",
    toggleTheme: () => setTheme((current) => (current === "light" ? "dark" : "light")),
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
