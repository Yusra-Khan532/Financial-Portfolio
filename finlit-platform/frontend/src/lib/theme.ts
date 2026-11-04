export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "finlit-theme";

export function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch { return null; }
}

/** Light is the safe fallback; first visit follows the operating system preference. */
export const DEFAULT_THEME: Theme = "light";

export function getInitialTheme(root: HTMLElement = document.documentElement): Theme {
  const stored = readStoredTheme();
  if (stored) return stored;
  if (root.dataset.theme === "dark" || root.dataset.theme === "light") return root.dataset.theme;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : DEFAULT_THEME;
}
