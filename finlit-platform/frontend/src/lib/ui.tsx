// App-wide UI state: theme, plan, toasts. The plan comes from the signed-in account (server-side); demo mode previews it locally.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth, type Plan, type PlanKey } from "./auth";
import { DEMO } from "./demo";
import { planName } from "./planNames";
import { applyPalette } from "./palettes";
import { usePrefs } from "./prefs";
import { getInitialTheme, THEME_STORAGE_KEY, type Theme } from "./theme";

export type { Plan };
/** Task #410: what a gate can ask for. An access tier (basic, silver, gold), or what a tier cannot say: a Platinum-only tool ("platinum"), the shares
 *  you own ("equity": Equity Portfolio, combined, Gold, Platinum), the funds and ETFs ("mfetf": Mutual Fund + ETF, combined, Gold, Platinum), or both
 *  together ("combined": the combined plan, Gold, Platinum; All my investments). */
export type Gate = Plan | "platinum" | "equity" | "mfetf" | "combined";
export const RANK: Record<Gate, number> = { basic: 0, silver: 1, gold: 2, platinum: 3, equity: 1, mfetf: 1, combined: 1 };
export const TIER: Record<Gate, { n: string; ic: string; tc: string }> = {
  basic: { n: planName("basic"), ic: "sprout", tc: "--t-basic" },   // task #388: the names come from the plan list (lib/planNames)
  silver: { n: planName("silver"), ic: "medal", tc: "--t-silver" },
  gold: { n: planName("gold"), ic: "crown", tc: "--t-gold" },
  platinum: { n: planName("platinum"), ic: "crown", tc: "--t-gold" },
  equity: { n: planName("equity"), ic: "wallet", tc: "--t-silver" },
  mfetf: { n: planName("mfetf"), ic: "pie", tc: "--t-silver" },
  combined: { n: planName("combined"), ic: "layers", tc: "--t-silver" },
};
const AREA: Record<string, readonly string[]> = { equity: ["equity", "combined", "gold", "platinum"], mfetf: ["mfetf", "combined", "gold", "platinum"], combined: ["combined", "gold", "platinum"] };
/** A tier read as the plan that kept every gate it opened before task #410 (the demo preview, or an account answer without a plan key): basic is Free,
 *  silver the combined plan (both areas), gold Platinum (everything, as Gold was). */
export const keyForTier = (t: Plan): PlanKey => (t === "gold" ? "platinum" : t === "silver" ? "combined" : "free");
/** Whether a plan (its key and tier) passes a gate; an administrator in the "everything" view passes them all. */
export function passes(gate: Gate, tier: Plan, key: PlanKey, all = false): boolean {
  if (all) return true;
  if (gate === "platinum") return key === "platinum";
  if (gate === "equity" || gate === "mfetf" || gate === "combined") return AREA[gate].includes(key);
  return RANK[tier] >= RANK[gate];
}

type UI = {
  theme: "dark" | "light"; toggleTheme: () => void;
  plan: Plan; has: (tier: Gate) => boolean;
  /** Demo mode only (the header preview switch); a no-op for real accounts. */
  setPlan: (p: Plan) => void;
  /** The user wants a feature their plan lacks: preview it (demo), ask them to sign in, or open the plan request. */
  upgrade: (tier: Gate, why?: string) => void;
  toast: (msg: string) => void;
};
const Ctx = createContext<UI | null>(null);

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export function UIProvider({ children }: { children: ReactNode }) {
  const root = document.documentElement;
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme(root));
  const auth = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // Demo only: preview each tier locally. Otherwise the plan is whatever the server says the account has.
  const [preview, setPreview] = useState<Plan>(((read("finlit-plan") as Plan) || (root.dataset.plan as Plan) || "gold"));
  const plan: Plan = DEMO ? preview : auth.plan;
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>(0);

  const prefs = usePrefs();
  useEffect(() => { root.dataset.theme = theme; applyPalette(prefs.palette, theme, root); }, [theme, prefs.palette, root]);
  useEffect(() => { if (prefs.density === "compact") root.dataset.density = "compact"; else delete root.dataset.density; write("finlit-density", prefs.density); }, [prefs.density, root]);
  useEffect(() => { root.dataset.plan = plan; if (DEMO) write("finlit-plan", plan); }, [plan, root]);

  const toast = useCallback((m: string) => {
    setMsg(m); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setMsg(null), 3400);
  }, []);
  const upgrade = useCallback((tier: Gate, why?: string) => {
    if (DEMO) { setPreview(tier === "platinum" ? "gold" : tier === "equity" || tier === "mfetf" || tier === "combined" ? "silver" : tier); toast(`Previewing the ${TIER[tier].n} plan.`); return; }
    const next = encodeURIComponent(loc.pathname + loc.search);
    if (!auth.user) { toast(why ? `${why} Sign in or create a free account first.` : "Create a free account to continue."); nav(`/login?next=${next}&plan=${tier}`); return; }
    nav(`/account/plan?want=${tier}&from=${next}`);
  }, [auth.user, loc.pathname, loc.search, nav, toast]);
  const value = useMemo<UI>(() => ({
    theme, toggleTheme: () => setTheme((t) => { const next = t === "dark" ? "light" : "dark"; write(THEME_STORAGE_KEY, next); return next; }),
    plan, has: (tier) => passes(tier, plan, DEMO || !auth.planKey ? keyForTier(plan) : auth.planKey, !DEMO && auth.seesAll),
    setPlan: DEMO ? setPreview : () => undefined, upgrade, toast,
  }), [theme, plan, toast, upgrade, auth.planKey, auth.seesAll]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast" role="status" hidden={!msg}>{msg}</div>
    </Ctx.Provider>
  );
}

export function useUI() {
  const ui = useContext(Ctx);
  if (!ui) throw new Error("useUI outside UIProvider");
  return ui;
}

/** The same, or null outside the provider (a part a test can render on its own, task #271). */
export const useUIMaybe = () => useContext(Ctx);

/** Re-render charts when the theme changes (they read CSS variables at draw time). */
export const useThemeKey = () => useUI().theme;
