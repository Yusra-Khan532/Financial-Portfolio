import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export default function ThemeToggle({ compact = false }) {
  const { isLight, toggleTheme } = useTheme();
  const label = isLight ? "Switch to dark mode" : "Switch to light mode";
  const Icon = isLight ? Moon : Sun;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
      className="theme-toggle inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--home-gold)]"
    >
      <Icon size={16} strokeWidth={1.8} />
      {compact ? null : <span>{isLight ? "Dark" : "Light"}</span>}
    </button>
  );
}
