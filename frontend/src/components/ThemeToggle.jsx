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
      className="theme-toggle inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[.04] px-3 text-sm text-[#CBD5E1] transition-colors hover:border-[#F5A623]/50 hover:text-white"
    >
      <Icon size={16} strokeWidth={1.8} />
      {compact ? null : <span>{isLight ? "Dark" : "Light"}</span>}
    </button>
  );
}
