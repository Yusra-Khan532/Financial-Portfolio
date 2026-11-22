import { useAuth } from "../lib/auth";
import { useUI } from "../lib/ui";
import { SystemControl } from "./SystemControl";

/** Task #310 part E (the 22 Nov pack, 05-phone.md, fix 2): under 860px the header holds only the logo, search, Ask FinLit AI, notifications and the
 *  account, so the theme switch and the admin's system controls sit in the Menu sheet instead: the site menu (Layout's .mnav) on marketing pages and the
 *  left-menu sheet (AppShell) on tool pages. Shown under 860px only (phone310.css); wider screens keep both in the header. */
export function SheetTools({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useUI();
  const { isAdmin } = useAuth();
  const dark = theme === "dark";
  return (
    <div className={"sheet-tools " + className} role="group" aria-label="Display and system">
      <button type="button" className="sheet-tool" onClick={toggleTheme} aria-pressed={dark}>
        {dark ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></svg>}
        <span>Dark theme</span><span className="sheet-tool-v" aria-hidden="true">{dark ? "On" : "Off"}</span>
      </button>
      {isAdmin && <div className="sheet-tool sheet-sys"><span>System controls</span><SystemControl /></div>}
    </div>
  );
}
