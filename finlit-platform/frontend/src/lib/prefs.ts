// Appearance and dashboard layout. Kept in this browser for everyone and mirrored to the account when signed in,
// so the same choices follow a member to a new device (and later to the mobile app).
import { useSyncExternalStore } from "react";
import { isPalette, type PaletteId } from "./palettes";
import { PLAN_FOR_DASHBOARD, PLAN_FOR_PRISM } from "./planGates";

export type Density = "comfortable" | "compact";
export type WidgetSize = "quarter" | "third" | "half" | "full";
export type WidgetPref = { id: string; on: boolean; size: WidgetSize };
export type Prefs = { palette: PaletteId; density: Density; alerts: boolean; screenAlerts: boolean; profitGap: boolean; rotationCorner: boolean; rotationRank: boolean; digest: boolean; dashboard: WidgetPref[]; /** industries watched from an industry page ("Add to watch"): their Sector Rotation alerts come too */ sectorWatch: string[]; /** which version of the dashboard layout `dashboard` follows (task #195: 2) */ dashV: number;
  /** task #248: which portfolios the dashboard's Step 1 reads, per kind ("all", or portfolio ids) */ dashPortfolios: DashPortfolios;
  /** task #251: themes followed on Discover (slugs); stored with the account, no alert reads them yet */ followThemes: string[];
  /** task #333: Sector Pulse "Alert me", one entry per alert: "<state|box|top5>:<sectors|industries>:<slug>" (finlit/sector_alerts.py) */ sectorAlerts: string[];
  /** task #277: views of a page opened once ("mi:equity"); a view not in it shows "Not opened yet" */ viewsSeen: string[];
  /** task #315: Word of the Day bookmarks (glossary term ids, newest first, at most 200); shown on the dashboard under "Your bookmark" */ wordBookmarks: string[];
  /** task #315: the India date (YYYY-MM-DD) the member last opened the Word of the Day; the header's gold dot shows until today's is opened */ wordSeen: string;

  /** task #316: the dashboard's own choices, saved with the account like the Showing bar */ dashUi: DashUi;
  /** task #349 PR 2: FinLit AI keeps this member's questions for 180 days (Silver and Gold); false keeps nothing new. Older saved prefs: true */ aiMemory: boolean;
  /** task #388 (developer file 36, change 9): blocks of a page the member hid ("eq:grid", the Equity portfolio's Share by share grid); remembered on every device */ hiddenBlocks: string[];
  /** F&O Academy (Learn, 27 Nov 2026): lessons marked done (lesson ids), quiz scores "<lesson>:<best score>:<questions>", and the lesson opened last
   *  ("Continue where you left off"). Kept in this browser and with the account like the Word of the Day bookmarks (lib/academy.ts) */ academyDone: string[]; academyQuiz: string[]; academyLast: string };
/** Task #316 (dashboard file 22): the section shown, the portfolio of "Your portfolios at a glance", the Global markets region, the sort of "Your investments today",
 *  whose results and filings ("From"), and the cards hidden from each card's ⋯ menu. The server checks the same values (auth/routes.py DashUi). */
export const DASH_SECS = ["all", "money", "watch", "market", "news", "tools"] as const;
export const DASH_GLANCE = ["eq", "mf", "etf"] as const;
export const DASH_REGIONS = ["us", "europe", "asia", "commod", "fx"] as const;
export const DASH_INV_SORTS = ["move", "gain", "fall", "reading", "az"] as const;
export type DashUi = { sec: (typeof DASH_SECS)[number]; glance: (typeof DASH_GLANCE)[number]; region: (typeof DASH_REGIONS)[number]; invSort: (typeof DASH_INV_SORTS)[number]; who: "market" | "mine"; hidden: string[] };
export const DASH_UI_DEFAULT: DashUi = { sec: "all", glance: "eq", region: "us", invSort: "move", who: "market", hidden: [] };
const oneOf = <T extends string>(xs: readonly T[], v: unknown, d: T): T => (typeof v === "string" && (xs as readonly string[]).includes(v) ? (v as T) : d);
export function normaliseDashUi(raw: Partial<DashUi> | null | undefined): DashUi {
  const r = raw && typeof raw === "object" ? raw : {};
  return { sec: oneOf(DASH_SECS, r.sec, "all"), glance: oneOf(DASH_GLANCE, r.glance, "eq"), region: oneOf(DASH_REGIONS, r.region, "us"), invSort: oneOf(DASH_INV_SORTS, r.invSort, "move"),
    who: r.who === "mine" ? "mine" : "market", hidden: [...new Set((Array.isArray(r.hidden) ? r.hidden : []).filter((x): x is string => typeof x === "string" && /^[a-z0-9_]{1,24}$/.test(x)))].slice(0, 30) };
}
export type PfChoice = "all" | string[];
export type DashPortfolios = { equity: PfChoice; mf: PfChoice; etf: PfChoice };
/** A glossary term id (backend PrefsIn.wordBookmarks uses the same pattern). */
export const WORD_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const PF_ID = /^[A-Za-z0-9_-]{1,40}$/;
const pfChoice = (v: unknown): PfChoice => { const ids = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && PF_ID.test(x)))].slice(0, 10) : []; return ids.length ? ids : "all"; };

/** Task #195 (dashboard pack, 15 Nov 2026): the dashboard reads as five numbered steps, in this order, on every screen size (they replace the phone's My stocks / Market / News tabs).
 *  A block always sits in its own step; the member's order applies inside a step, and a step whose blocks are all switched off is not shown. */
export type DashStep = 1 | 2 | 3 | 4 | 5;
export const DASH_STEPS: { n: DashStep; id: string; title: string; line: string }[] = [
  { n: 1, id: "money", title: "Your money", line: "What you hold, how it did on the last trading day, and what it says." },
  { n: 2, id: "watch", title: "Your watchlist", line: "The stocks you follow." },
  { n: 3, id: "market", title: "The market", line: "Prices first, then what they add up to, then who is buying." },
  { n: 4, id: "news", title: "Results and news", line: "What companies reported and filed." },
  { n: 5, id: "tools", title: "Tools", line: "Set alerts and run your own numbers." },
];

/** Everything the dashboard can show, in the default order (the pack's flow table). `min` is the plan a widget needs (its data is gated on the server too); `off` blocks are in
 *  Customise but not in the default layout (the Gold & silver card needs a licensed price source). `step` is the numbered step it belongs to; `nav` its name in "All sections".
 *  Ids are lower-case letters and digits: the server stores them as written. */
export const WIDGETS: { id: string; label: string; nav?: string; blurb: string; min: "basic" | "silver" | "gold"; size: WidgetSize; step: DashStep; off?: boolean }[] = [
  { id: "mystocks", label: "Your investments today", blurb: "Your shares, watchlist and mutual funds: price or NAV, the day's move, 1 year, the FinLit reading and alerts. The biggest moves come first.", min: "basic", size: "full", step: 1 },
  { id: "say", label: "What your stocks say", blurb: "One card per signal from your shares' latest results and prices, with the names in a dropdown.", min: "basic", size: "full", step: 1 },
  { id: "portfolio", label: "Your shares at a glance", blurb: "Average FinLit Prism score, score bands, the average of each Prism part and the sector and size spread of the shares you hold.", min: "basic", size: "half", step: 1 },
  { id: "mfglance", label: "Your mutual funds at a glance", blurb: "The average Mutual Fund Score, overlap, the biggest stock underneath and how much your funds swing, from the MF portfolio.", min: "basic", size: "half", step: 1 },
  { id: "etfglance", label: "Your ETFs at a glance", nav: "Your ETFs", blurb: "What your ETFs track, their yearly cost and price against NAV, from the ETF portfolio.", min: "basic", size: "full", step: 1 },
  { id: "movers", label: "Watchlist movers", blurb: "Biggest moves among the stocks you follow.", min: PLAN_FOR_DASHBOARD, size: "half", step: 2 },
  { id: "second", label: "Worth a second look", blurb: "Watchlist companies with a Strong or Healthy FinLit Prism score whose Prism Valuation part is 65 or more.", min: PLAN_FOR_PRISM, size: "half", step: 2 },
  { id: "buckets", label: "Watchlist by band", blurb: "How your watchlist splits across the FinLit Prism bands: Strong, Healthy, Average and Weak.", min: PLAN_FOR_PRISM, size: "full", step: 2 },
  { id: "market", label: "Market today", blurb: "Index levels, the Nifty 50 / Sensex chart, and the prices and rates that move company profits.", min: "basic", size: "full", step: 3 },
  { id: "globalmarkets", label: "Global markets", blurb: "US, Europe and Asia indices, gold, crude, the rupee and the US 10-year yield on a world view, with 1-day, 1-week and 1-month moves (task #294).", min: "basic", size: "full", step: 3 },
  { id: "marketread", label: "What the market adds up to", nav: "What it adds up to", blurb: "Six readings of the day (breadth, big moves, which sizes lead, short and bigger trends, industries) and what they add up to.", min: "basic", size: "full", step: 3 },
  { id: "snapshot", label: "Market snapshot", blurb: "How many stocks rose and fell, and the biggest movers of Nifty 50, Nifty 500 or all stocks.", min: "basic", size: "half", step: 3 },
  { id: "sectors", label: "Sectors today", blurb: "Every sector's move today, ranked.", min: "basic", size: "half", step: 3 },
  { id: "flows", label: "FII / DII flows", blurb: "Net buying and selling by foreign and domestic institutions.", min: "basic", size: "full", step: 3 },
  { id: "heatmap", label: "Index heatmap", blurb: "Stocks of an index as a map or a list, coloured by today's move.", min: "basic", size: "full", step: 3 },
  { id: "resultstoday", label: "Results today", blurb: "Companies that have filed, or are due to report, results.", min: "basic", size: "half", step: 4 },
  { id: "filings", label: "Filings and news", blurb: "The latest exchange filings, tagged and shortened to one line.", min: "basic", size: "half", step: 4 },
  { id: "results", label: "Latest quarter results", blurb: "Newest quarter for your stocks: year-on-year and quarter-on-quarter, with a chart.", min: "basic", size: "full", step: 4 },
  { id: "ipos", label: "IPOs open now", nav: "IPOs", blurb: "Issues open now or opening soon, with price band and close date.", min: "basic", size: "full", step: 4 },
  { id: "alerts", label: "Alerts and saved screens", blurb: "Your active and triggered alerts, and your saved screens.", min: "basic", size: "quarter", step: 5 },
  { id: "stress", label: "Stress Lab", blurb: "How crude, rupee, inflation and rate shocks would move a company's earnings.", min: "basic", size: "quarter", step: 5 },
  { id: "dcf", label: "DCF calculator", blurb: "Work out the value per share and the margin-of-safety price; your saved scenarios.", min: "gold", size: "quarter", step: 5 },
  { id: "learn", label: "Term of the day", blurb: "One plain-words finance term, every day, and your bookmarked words.", min: "basic", size: "quarter", step: 5 },
  { id: "commodities", label: "Gold & silver today", blurb: "MCX gold, silver and crude oil with the day change. Off until a licensed price source is connected.", min: "basic", size: "half", step: 3, off: true },
];
/** The layout version this build draws (task #195). A layout saved under an older version is moved to it once (`migrateLayout`). */
export const DASH_V = 2;
const defaultLayout = (): WidgetPref[] => WIDGETS.map((w) => ({ id: w.id, on: !w.off, size: w.size }));
const DEFAULTS: Prefs = { palette: "gold", density: "comfortable", alerts: true, screenAlerts: true, profitGap: true, rotationCorner: true, rotationRank: false, digest: false, dashboard: defaultLayout(), sectorWatch: [], sectorAlerts: [], dashV: DASH_V, dashPortfolios: { equity: "all", mf: "all", etf: "all" }, followThemes: [], viewsSeen: [], wordBookmarks: [], wordSeen: "", dashUi: DASH_UI_DEFAULT, aiMemory: true, hiddenBlocks: [], academyDone: [], academyQuiz: [], academyLast: "" };

const KEY = "finlit-prefs-v1";
const SIZES: readonly WidgetSize[] = ["quarter", "third", "half", "full"];
/** The blocks that were on in the default layout before task #195: if a member's saved layout has one of them off, the member switched it off, and it stays off. */
const ON_BEFORE_195 = new Set(["mystocks", "portfolio", "mfglance", "etfglance", "market", "snapshot", "sectors", "marketread", "flows", "heatmap", "resultstoday", "filings", "ipos", "alerts", "learn"]);
/** Task #195, once per member: the pack's order and widths, every block of the flow on, except a block the member had switched off themselves. */
export function migrateLayout(saved: WidgetPref[] | undefined | null): WidgetPref[] {
  const off = new Set((saved ?? []).filter((w) => w && !w.on && ON_BEFORE_195.has(w.id)).map((w) => w.id));
  return defaultLayout().map((w) => (off.has(w.id) ? { ...w, on: false } : w));
}
/** A saved layout, cleaned: only known blocks, each once, every block present. A layout saved before the refreshed dashboard (it has no "Your stocks today") is replaced by the new default. */
export function normaliseLayout(saved: WidgetPref[] | undefined | null): WidgetPref[] {
  const known = new Map(WIDGETS.map((w) => [w.id, w]));
  if (!(saved ?? []).some((w) => w?.id === "mystocks")) return defaultLayout();
  const seen = new Set<string>();
  const dash: WidgetPref[] = [];
  for (const w of saved ?? []) if (w && known.has(w.id) && !seen.has(w.id)) { seen.add(w.id); dash.push({ id: w.id, on: !!w.on, size: SIZES.includes(w.size) ? w.size : "half" }); }
  // A block added since this layout was saved appears for existing members too, right after the block it follows in the default order (or at the end).
  WIDGETS.forEach((w, i) => {
    if (seen.has(w.id)) return;
    const after = i > 0 ? dash.findIndex((d) => d.id === WIDGETS[i - 1].id) : -1;
    dash.splice(after >= 0 ? after + 1 : dash.length, 0, { id: w.id, on: !w.off, size: w.size });
    seen.add(w.id);
  });
  return dash;
}
/** The blocks to draw, grouped by step in step order (the member's order inside a step); steps with nothing to draw are left out. */
export function stepGroups<T extends { id: string }>(blocks: T[]): { step: (typeof DASH_STEPS)[number]; blocks: T[] }[] {
  const stepOf = new Map(WIDGETS.map((w) => [w.id, w.step]));
  return DASH_STEPS.map((step) => ({ step, blocks: blocks.filter((b) => stepOf.get(b.id) === step.n) })).filter((g) => g.blocks.length > 0);
}
/** A hidden block of a page, "<page>:<block>" (backend PrefsIn.hiddenBlocks uses the same pattern). */
export const BLOCK_ID = /^[a-z0-9]{1,12}:[a-z0-9-]{1,24}$/;
/** Whether the member hid a block, and the switch that hides or shows it (saved with the account like the other prefs). */
export const blockHidden = (id: string, p: Prefs = state) => p.hiddenBlocks.includes(id);
export const setBlockHidden = (id: string, hidden: boolean) => { const xs = state.hiddenBlocks.filter((x) => x !== id); prefs.set({ hiddenBlocks: hidden ? [...xs, id] : xs }); };
/** An F&O Academy lesson id, and a quiz score "<lesson>:<best>:<of>" (backend PrefsIn.academyDone / academyQuiz use the same patterns). */
export const LESSON_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
export const QUIZ_SCORE = /^[a-z0-9][a-z0-9-]{0,47}:[0-9]:[1-9]$/;
export const SECTOR_ALERT = /^(state|box|top5):(sectors|industries):[a-z0-9][a-z0-9-]{0,79}$/;
function normalise(raw: Partial<Prefs> | null | undefined): Prefs {
  return { palette: isPalette(raw?.palette) ? raw!.palette! : "gold", density: raw?.density === "compact" ? "compact" : "comfortable", alerts: raw?.alerts !== false, screenAlerts: raw?.screenAlerts !== false, profitGap: raw?.profitGap !== false, rotationCorner: raw?.rotationCorner !== false, rotationRank: raw?.rotationRank === true, digest: raw?.digest === true, dashboard: (raw?.dashV ?? 0) >= DASH_V ? normaliseLayout(raw?.dashboard) : migrateLayout(raw?.dashboard), dashV: DASH_V, sectorWatch: [...new Set((Array.isArray(raw?.sectorWatch) ? raw!.sectorWatch : []).filter((x): x is string => typeof x === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(x)))].slice(0, 60),
    dashPortfolios: { equity: pfChoice(raw?.dashPortfolios?.equity), mf: pfChoice(raw?.dashPortfolios?.mf), etf: pfChoice(raw?.dashPortfolios?.etf) } , followThemes: [...new Set((Array.isArray(raw?.followThemes) ? raw!.followThemes : []).filter((x): x is string => typeof x === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(x)))].slice(0, 40),
    sectorAlerts: [...new Set((Array.isArray(raw?.sectorAlerts) ? raw!.sectorAlerts : []).filter((x): x is string => typeof x === "string" && SECTOR_ALERT.test(x)))].slice(0, 180),
    viewsSeen: [...new Set((Array.isArray(raw?.viewsSeen) ? raw!.viewsSeen : []).filter((x): x is string => typeof x === "string" && /^[a-z0-9]{1,12}:[a-z0-9-]{1,24}$/.test(x)))].slice(0, 60),
    // task #315: older saved prefs have neither field; they load as no bookmarks and "not opened yet"
    wordBookmarks: [...new Set((Array.isArray(raw?.wordBookmarks) ? raw!.wordBookmarks : []).filter((x): x is string => typeof x === "string" && WORD_ID.test(x)))].slice(0, 200),
    wordSeen: typeof raw?.wordSeen === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.wordSeen) ? raw.wordSeen : "",

    dashUi: normaliseDashUi(raw?.dashUi),
    aiMemory: raw?.aiMemory !== false,
    hiddenBlocks: [...new Set((Array.isArray(raw?.hiddenBlocks) ? raw!.hiddenBlocks : []).filter((x): x is string => typeof x === "string" && BLOCK_ID.test(x)))].slice(0, 40),
    // F&O Academy: older saved prefs have none of the three; they load as nothing done yet
    academyDone: [...new Set((Array.isArray(raw?.academyDone) ? raw!.academyDone : []).filter((x): x is string => typeof x === "string" && LESSON_ID.test(x)))].slice(0, 120),
    academyQuiz: [...new Map((Array.isArray(raw?.academyQuiz) ? raw!.academyQuiz : []).filter((x): x is string => typeof x === "string" && QUIZ_SCORE.test(x) && +x.split(":")[1] <= +x.split(":")[2]).map((x) => [x.split(":")[0], x] as const)).values()].slice(0, 120),
    academyLast: typeof raw?.academyLast === "string" && LESSON_ID.test(raw.academyLast) ? raw.academyLast : "" };
}
/** Saved prefs (this browser's or the account's), cleaned; a field an older save does not have takes its default. */
export const normalisePrefs = (raw: Partial<Prefs> | null | undefined): Prefs => normalise(raw);
function read(): Prefs { try { return normalise(JSON.parse(localStorage.getItem(KEY) || "null")); } catch { return normalise(null); } }

let state = typeof localStorage === "undefined" ? DEFAULTS : read();
const subs = new Set<() => void>();
type Listener = (p: Prefs) => void;
let onChange: Listener | null = null;

export const prefs = {
  get: () => state,
  subscribe: (f: () => void) => { subs.add(f); return () => subs.delete(f); },
  /** The account layer registers here to save changes. */
  onSave: (f: Listener | null) => { onChange = f; },
  set(patch: Partial<Prefs>, fromServer = false) {
    state = normalise({ ...state, ...patch });
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
    subs.forEach((f) => f());
    if (!fromServer) onChange?.(state);
  },
  reset: () => prefs.set({ ...DEFAULTS, dashboard: defaultLayout() }),
};
export const usePrefs = () => useSyncExternalStore(prefs.subscribe, prefs.get, prefs.get);
