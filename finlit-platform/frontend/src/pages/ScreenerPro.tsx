// The Stock screener (task #64, handover file 04, 10 Nov; with tasks #73, #74 and #75 of 11 Nov): a short head with the Find stocks tabs, the ready-made
// screens, then "Your rules" (funnel, size, the one Sector filter, index, FinLit rating, rule cards, + Add a rule, Type rules) beside the results (count,
// Save screen, Download, the active rules, search, the nine standard columns plus a "Your rules" band, the pager). A click on a row opens the chart panel
// with the company's figures, your rules first.
import { HScroll } from "../components/HScroll";
import { titleOf, subOf, codeNote } from "../lib/companyLabel";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Plain } from "../components/Plain";
import { Icon } from "../lib/icons";
import { nf } from "../lib/format";
import { limitsFor, useAuth } from "../lib/auth";
import { ratioSentence } from "../components/screener/CustomRatio";
import { RatioDrawer, type Draft } from "../components/screener/RatioDrawer";
import { EXAMPLES as RATIO_EXAMPLES, valueText } from "../lib/customRatio";
import { apiSend } from "../lib/api";
import { decodeRatios, encodeRatios, loadRatios, saveRatios, loadSavedRatios, storeSavedRatios, ratioLabel, type CustomRatio, activeCount, cellTone, chipColumn, colourColumns, colourNote, dataLine, decodeState, emptyReason, encodeState, firstPeriod, fmtMetric, loadCols, norm, stack, standardColumns, storeCols, tableColumns, toBody, useCatalog, useReady, useScreen, type Catalog, type MetricInfo, type PState, type Range, type ReadyScreen } from "../lib/proscreen";
import { screens, useSavedScreens, type SavedScreen } from "../lib/screens";
import { useDocTitle } from "../lib/title";
import { TIER, useUI, type Plan } from "../lib/ui";
import { TableZoom } from "../components/TableZoom";
import { Safe3D } from "../three/Safe3D";
import { supports3d, whenIdle } from "../three/support";
import { rankMetrics } from "../lib/metricSearch";
import { CheckRow, SearchBox } from "../components/screener/FilterGroup";
import { Donut, SectorBars } from "../components/screener/PageParts";
import { FindStocksTabs } from "../components/screener/FindStocksTabs";
import { ChartPanel, type PanelRow } from "../components/screener/ChartPanel";
import { ReadyScreens } from "../components/screener/ReadyScreens";
import { RuleCard, startRange } from "../components/screener/RuleCard";
import { RulePicker } from "../components/screener/RulePicker";
import { RuleFigures } from "../components/screener/RuleFigures";
import { parseRules } from "../lib/typeRules";
import "../styles/fgx.css";
import "../styles/stockscreener.css";
import { CoLogo } from "../components/CoLogo";

const Cloud3D = lazy(() => import("../three/Cloud3D"));

export const PAGE = 25;
const MAX_COLS = 12;
const narrow = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(max-width: 1000px)").matches;
const useDebounced = <T,>(v: T, ms: number) => { const [d, setD] = useState(v); useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]); return d; };

/** Short column names and the unit line under them (file 04 §5). */
const SHORT: Record<string, string> = { price: "LTP", market_cap: "Market cap", pe: "P/E", pb: "P/B", roe: "ROE", roce: "ROCE", sales_cagr_3y: "Sales growth 3Y", profit_cagr_3y: "Profit growth 3Y",
  debt_to_equity: "Debt to equity", ret_1y: "1 year", overall: "FinLit IQ", dividend_yield: "Dividend yield", pct_from_high: "Below 52W high" };
const UNIT_LINE: Record<string, string> = { "%": "%", x: "×", Cr: "₹ Cr", Rs: "₹", d: "days", pts: "points", flag: "yes / no", n: "" };
const unitLine = (k: string, m: MetricInfo | undefined) => (k === "price" ? "₹ · 1 day" : m ? UNIT_LINE[m.unit] ?? "" : "");
const BAND_WORD: Record<string, string> = { strong: "Strong", healthy: "Healthy", mixed: "Mixed", watch: "Watch", average: "Average", weak: "Weak", poor: "Poor" };
/** A Prism rating word on the chip colours the FinLit IQ chip already uses (green, amber, red). */
const PRISM_CLASS: Record<string, string> = { strong: "strong", healthy: "healthy", average: "mixed", weak: "watch", poor: "watch" };
const STEP_NAME: Record<string, string> = { size: "Size", sector: "Sector", industry: "Sector", index: "Index", band: "rating", model: "the ready-made screens on the plan's score" };

function Checks({ items, picked, toggle, search }: { items: { key: string; label: string; n: number }[]; picked: string[]; toggle: (k: string) => void; search?: boolean }) {
  const [q, setQ] = useState(""), [all, setAll] = useState(false);
  const shown = items.filter((i) => !q.trim() || i.label.toLowerCase().includes(q.trim().toLowerCase()));
  const list = all || q ? shown : shown.slice(0, 12);
  return (
    <>
      {search && items.length > 8 && <SearchBox value={q} onChange={setQ} placeholder="Search" label="Search this list" />}
      <ul className="fgx-list">{list.map((i) => <li key={i.key}><CheckRow label={i.label} count={i.n} checked={picked.includes(i.key)} onChange={() => toggle(i.key)} /></li>)}
        {!list.length && <li className="fgx-none">Nothing matches.</li>}</ul>
      {!q && shown.length > 12 && <button type="button" className="fgx-link" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${shown.length}`}</button>}
    </>
  );
}

/** A list filter folded behind one line ("All sectors ▾"), so the panel stays short. */
function Fold({ id, title, summary, open, setOpen, children }: { id: string; title: string; summary: string; open: boolean; setOpen: (o: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="ssw-fold" data-facet={id}>
      <button type="button" className="ssw-sel" aria-expanded={open} aria-controls={`ssw-f-${id}`} onClick={() => setOpen(!open)}><span className="sr">{title}: </span>{summary}<i aria-hidden="true">▾</i></button>
      {open && <div id={`ssw-f-${id}`} role="group" aria-label={title}>{children}</div>}
    </div>
  );
}

export function ScreenerPro() {
  const { isAdmin, user } = useAuth();
  useDocTitle("Stock screener", "Filter every listed Indian company by size, valuation, growth, debt, ownership and price trend. Start from a ready-made screen or add your own rules; the list updates as you go.");
  const { upgrade, toast, plan: uiPlan } = useUI();
  const nav = useNavigate();
  const cat = useCatalog(), ready = useReady();
  const [params, setParams] = useSearchParams();
  const init = useRef(decodeState(params.get("s")));
  const [f, setF] = useState<PState>(init.current.state);
  const [sort, setSort] = useState({ key: init.current.sort || "market_cap", dir: (init.current.dir || "desc") as "asc" | "desc" });
  const [cols, setCols] = useState<string[] | null>(loadCols);
  const [period, setPeriod] = useState<Record<string, string>>({});
  const [q, setQ] = useState(""), [pg, setPg] = useState({ k: "", p: 0 });
  const [order, setOrder] = useState<string[]>([]);          // the rule cards, in the order they were added (task #75: any number at once)
  const [hot, setHot] = useState<string | null>(null);
  const [picker, setPicker] = useState<false | { group?: string; q?: string }>(false), [colMenu, setColMenu] = useState(false), [colFind, setColFind] = useState("");
  const [saveOpen, setSaveOpen] = useState<null | "save" | "tell">(null), [saveName, setSaveName] = useState("");
  const [from, setFrom] = useState<string | null>(null);     // the ready-made screen the rules started from
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const [rulesOpen, setRulesOpen] = useState(() => !narrow());
  const saved = useSavedScreens();
  // One score per plan (tasks #64 P-1 and #100): the server sends Gold the FinLit Prism group, columns and rating words, and every other plan the FinLit IQ's.
  const data = cat.data;
  const prismOnly = data?.bandModel === "prism";
  const plan: Plan = data?.plan ?? "basic";
  const ask = (tier: Plan, why: string) => upgrade(tier, why);
  const byKey = useMemo(() => new Map((data?.groups || []).flatMap((g) => g.metrics.map((m) => [m.key, m] as const))), [data]);
  // a Now / 3Y / 5Y / 7Y figure (P/E, P/B, Price / Sales) is one rule: every variant key leads back to the figure it belongs to
  const baseOf = useMemo(() => { const m = new Map<string, string>(); byKey.forEach((x) => x.variants && Object.values(x.variants).forEach((k) => m.set(k, x.key))); return (k: string) => m.get(k) ?? k; }, [byKey]);
  // Ready-made screens stack (task #64 P-4): F is the screen that runs, the reader's own rules with every screen that is on added (the stricter range wins)
  const F = useMemo(() => stack(f, ready.data?.screens), [f, ready.data]);
  const rules = useMemo(() => [...new Set([...order, ...Object.keys(F.ranges).map(baseOf)])].filter((k) => !data || byKey.has(k)), [order, F.ranges, baseOf, data, byKey]);
  const periodOf = (m: MetricInfo) => period[m.key] ?? firstPeriod(m, F.ranges);
  const ruleKey = (m: MetricInfo) => (m.variants ? m.variants[periodOf(m)] ?? m.key : m.key);

  // columns: the visitor's own choice or the nine standard ones, then one for every rule (its current Now / 3Y / 5Y / 7Y figure)
  const base = useMemo(() => cols ?? standardColumns(data), [cols, data]);
  const ruleCols = rules.map((k) => chipColumn(byKey.get(k), byKey.get(k) ? periodOf(byKey.get(k)!) : undefined, byKey));
  const columns = useMemo(() => tableColumns(base, F.ranges, ruleCols, (k) => !data || byKey.has(k)), [base, F.ranges, ruleCols.join(","), data, byKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // LTP carries the day's change under it: ask for it with the price, without a column of its own
  const asked = useMemo(() => (columns.includes("price") && !columns.includes("ret_1d") && byKey.get("ret_1d") && !byKey.get("ret_1d")!.locked ? [...columns, "ret_1d"] : columns), [columns, byKey]);

  const dq = useDebounced(f, 150), dqq = useDebounced(q, 250);
  const pkey = JSON.stringify([dq, sort, dqq]), page = pg.k === pkey ? pg.p : 0, setPage = (p: number) => setPg({ k: pkey, p });
  // Custom ratios (task #64, Part 3): kept in the page address (`cr`, so a shared link and a saved screen carry them) and in this browser
  const [ratios, setRatiosState] = useState<CustomRatio[]>(() => decodeRatios(params.get("cr")) ?? loadRatios());
  const [rd, setRd] = useState<null | { start?: Draft | null }>(null), [savedRatios, setSavedRatiosState] = useState(() => loadSavedRatios());
  const setSavedRatios = (v: ReturnType<typeof loadSavedRatios>) => { setSavedRatiosState(v); storeSavedRatios(v); };
  const openRatio = (start?: Draft | null) => setRd({ start: start ?? null });
  const setRatios = (v: CustomRatio[]) => { setRatiosState(v); saveRatios(v); setPage(0); if (/^r[0-9]$/.test(sort.key) && !v.some((r) => r.id === sort.key)) setSort({ key: "market_cap", dir: "desc" }); };
  useEffect(() => { const n = new URLSearchParams(params); ratios.length ? n.set("cr", encodeRatios(ratios)) : n.delete("cr"); if (n.toString() !== params.toString()) setParams(n, { replace: true }); }, [ratios]); // eslint-disable-line react-hooks/exhaustive-deps
  const addRatio = (d: Draft) => {
    const id = d.id ?? (["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"].find((x) => !ratios.some((r) => r.id === x)) as string);
    const r: CustomRatio = { ...d, id };
    setRatios(d.id ? ratios.map((x) => (x.id === d.id ? r : x)) : [...ratios, r]);
    setRd(null);
    toast(d.id ? `Changed “${r.name}”.` : `Added “${r.name}”.`);
  };
  const saveRatio = (d: Draft) => { const { id: _drop, ...rest } = d; void _drop; setSavedRatios([rest, ...savedRatios.filter((x) => x.name !== rest.name)]); toast(`Saved “${rest.name}” to My ratios.`); };
  const known = (k: string) => !data || byKey.has(k);
  const dF = useMemo(() => stack(dq, ready.data?.screens), [dq, ready.data]);
  const safe = useMemo(() => ({ ...dF, ranges: Object.fromEntries(Object.entries(dF.ranges).filter(([k]) => known(k))) }), [dF, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const safeSort = known(sort.key) || sort.key === "name" || sort.key === "symbol" || ratios.some((r) => r.id === sort.key) ? sort : { key: "market_cap", dir: "desc" as const };
  const body = useMemo(() => toBody(safe, safeSort, asked, dqq, page * PAGE, PAGE, ratios), [safe, safeSort.key, safeSort.dir, asked, dqq, page, ratios]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useScreen(body, !!data && asked.length > 0);
  const countWith = async (d: Draft): Promise<number> => {      // the drawer's live count: the companies the other rules leave that pass this ratio as well
    const others = ratios.filter((x) => x.id !== d.id), probe: CustomRatio = { ...d, id: ["r1", "r2", "r3", "r4"].find((x) => !others.some((r) => r.id === x)) as string };
    const r = await apiSend<{ total: number }>("POST", "/api/screener/query", { ...toBody(safe, { key: "market_cap", dir: "desc" }, ["market_cap"], dqq, 0, 1, [...others, probe]), funnel: false });
    return r.total;
  };
  const [chart, setChart] = useState<PanelRow | null>(null), [stepTo, setStepTo] = useState<"first" | "last" | null>(null);
  const [typed, setTyped] = useState(""), [typedErr, setTypedErr] = useState<string[]>([]);
  const rows = res.data?.rows || [];
  const shown = (res.data?.columns || []).filter((k) => columns.includes(k));
  const nActive = activeCount({ ...F, on: F.models }) + ratios.filter((r) => r.op !== "none").length;   // every rule that runs: the reader's, each screen's, the custom ratios
  const total = res.data?.total ?? 0;
  const onScreens = (f.on ?? []).map((id) => ready.data?.screens.find((x) => x.id === id)).filter((x): x is ReadyScreen => !!x);

  useEffect(() => { const s = encodeState(dq, sort.key, sort.dir); const n = new URLSearchParams(params); s ? n.set("s", s) : n.delete("s"); if (n.toString() !== params.toString()) setParams(n, { replace: true }); }, [dq, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  // changing a filter a screen set makes it the reader's own: it stays when the screen is turned off, and no screen touches it any more
  const setRange = (k: string, r: Range) => setF((s) => { const ranges = { ...s.ranges }; if (r.min == null && r.max == null) delete ranges[k]; else ranges[k] = r;
    const took = F.setBy[k] && !(s.mine ?? []).includes(k); return { ...s, ranges, ...(took ? { mine: [...(s.mine ?? []), k] } : {}) }; });
  const toggle = (key: "sectors" | "industries" | "indices" | "caps" | "bands", v: string) => setF((s) => ({ ...s, [key]: s[key].includes(v) ? s[key].filter((x) => x !== v) : [...s[key], v] }));
  const removeRule = (k: string) => { const m = byKey.get(k); (m?.variants ? Object.values(m.variants) : [k]).forEach((x) => setRange(x, {})); setOrder((o) => o.filter((x) => x !== k)); };
  const addRule = (m: MetricInfo) => {
    setOrder((o) => (o.includes(m.key) ? o : [...o, m.key]));
    const k = m.variants ? m.variants.now ?? m.key : m.key, start = startRange(byKey.get(k) ?? m);
    if (start.min != null || start.max != null) setRange(k, start);
    setHot(m.key); window.setTimeout(() => setHot((h) => (h === m.key ? null : h)), 1400);
    setPicker(false);
    toast(`Added ${m.label}${start.min != null || start.max != null ? ", starting on its better quarter. Change the range on its card." : ". Set a range on its card."}`);
  };
  const clearAll = () => { setF(norm({})); setOrder([]); setFrom(null); };   // the screens that are on go too
  // a rule added but with no range yet is still chosen: it is counted and kept until removed or cleared (task #75)
  const nWaiting = rules.filter((k) => { const m = byKey.get(k); return m && !(m.variants ? Object.values(m.variants) : [k]).some((x) => F.ranges[x]); }).length;

  const sortBy = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" || byKey.get(key)?.better === "lower" ? "asc" : "desc" }));
  const pickCols = (c: string[] | null) => { setCols(c); storeCols(c); };
  const toggleCol = (k: string) => { if (!base.includes(k) && columns.includes(k)) { toast("This column belongs to one of your rules. Remove the rule to hide it."); return; } if (base.includes(k)) pickCols(base.filter((x) => x !== k)); else if (base.length >= MAX_COLS) toast(`Up to ${MAX_COLS} columns at a time.`); else pickCols([...base, k]); };

  const rangeText = (m: MetricInfo | undefined, k: string, r: Range) => {
    if (m?.unit === "flag") return `${m.label}: ${r.min === 1 ? "Yes" : "No"}`;
    const name = SHORT[k] ?? m?.label ?? k, v = (x: number) => (m ? fmtMetric(m, x) : String(x));
    return r.min != null && r.max != null ? `${name} ${v(r.min)} to ${v(r.max)}` : r.min != null ? `${name} above ${v(r.min)}` : `${name} below ${v(r.max!)}`;
  };
  const chips: { label: string; clear: () => void; title?: string }[] = [
    ...onScreens.map((x) => ({ label: `Screen: ${x.label}`, clear: () => toggleScreen(x) })),
    ...Object.entries(F.ranges as Record<string, Range>).map(([k, r]) => ({ label: rangeText(byKey.get(k), k, r), clear: () => setRange(k, {}),
      title: F.setBy[k] ? `Set by ${F.setBy[k].join(" and ")}${F.setBy[k].length > 1 || f.ranges[k] ? " (the stricter range)" : ""}. Change it and it becomes your own.` : undefined })),
    ...ratios.map((r) => ({ label: r.op === "none" || valueText(r) === "Column" ? `${r.name} (column)` : `${r.name} ${valueText(r)}`, title: ratioSentence(r, byKey), clear: () => setRatios(ratios.filter((x) => x.id !== r.id)) })),
    ...f.sectors.map((s) => ({ label: s, clear: () => toggle("sectors", s) })), ...f.industries.map((s) => ({ label: s, clear: () => toggle("industries", s) })),
    ...f.indices.map((s) => ({ label: data?.indices.find((i) => i.code === s)?.label || s, clear: () => toggle("indices", s) })), ...F.caps.map((s) => ({ label: `${s} cap`, clear: () => toggle("caps", s) })),
    ...F.bands.map((s) => ({ label: `${prismOnly ? "Prism" : "FinLit IQ"} rating: ${BAND_WORD[s] ?? s}`, clear: () => toggle("bands", s) })),
  ];

  // a ready-made screen turns on or off; several can be on, and each adds its filters to the reader's and to the other screens' (task #64 P-4)
  const toggleScreen = (s: ReadyScreen) => {
    const was = (f.on ?? []).includes(s.id);
    setF((x) => ({ ...x, on: was ? (x.on ?? []).filter((id) => id !== s.id) : [...(x.on ?? []), s.id] }));
    if (!was && s.state?.ranges) setOrder((o) => [...o, ...Object.keys(s.state!.ranges!).map(baseOf).filter((k) => !o.includes(k))]);
    setPg({ k: "", p: 0 });
    const n = (f.on ?? []).length + (was ? -1 : 1);
    toast(was ? `${s.label} turned off: only its own filters went.` : n > 1 || nActive ? `${s.label} added its filters to yours (${n} ${n === 1 ? "screen" : "screens"} on). Turn it off to take away only its own.` : `${s.label} is on. Its filters are under Your rules; add your own on top.`);
  };
  const allOff = () => { setF((x) => ({ ...x, on: [] })); setPg({ k: "", p: 0 }); toast("All ready-made screens are off. Your own rules stay."); };
  const openSaved = (s: SavedScreen) => { const n = norm(s.state as Partial<PState>); setF(n); setOrder(Object.keys(n.ranges).map(baseOf)); if (n.sort) setSort({ key: n.sort, dir: n.dir || "desc" }); if (n.cols?.length) pickCols(n.cols); setFrom(s.name); toast(`Opened “${s.name}”.`); };
  // Save screen keeps it quiet; "Tell me when a company joins" saves it with messages on: after each close the member gets a message (the site's inbox and e-mail)
  // naming the companies that joined or left it (file 04 §9). Messages need an account, so a visitor is asked to sign in first.
  const save = () => {
    const n = saveName.trim(); if (!n || !nActive) { toast("Add a rule and a name first."); return; }
    const max = limitsFor(uiPlan).screens; if (saved.length >= max && !saved.some((s) => s.name === n)) { toast(`Your plan keeps up to ${max} screens. Delete one under My screens first.`); return; }
    const tell = saveOpen === "tell";
    screens.save(n, { ...f, sort: sort.key, dir: sort.dir, cols: cols ?? undefined } as never, max, tell); setSaveName(""); setSaveOpen(null);
    toast(tell ? `Saved “${n}”. After each close we send you a message naming the companies that join or leave it.` : `Saved “${n}”. It is under Ready-made screens, My screens.`);
  };
  const openSave = (mode: "save" | "tell") => {
    if (mode === "tell" && !user) { toast("Sign in to get a message when a company joins your screen."); nav(`/login?next=${encodeURIComponent("/screener" + (params.get("s") ? `?s=${params.get("s")}` : ""))}`); return; }
    setSaveName((x) => x || from || ""); setSaveOpen(saveOpen === mode ? null : mode);
  };

  const [webgl, setWebgl] = useState(false);
  useEffect(() => { if (supports3d()) return whenIdle(() => setWebgl(true)); }, []);
  const cloud = useMemo(() => {
    const cs = shown.filter((k) => byKey.get(k)?.unit !== "flag" && rows.filter((r) => typeof r.v[k] === "number").length >= 5).slice(0, 3);
    if (cs.length < 3) return null;
    const pts = rows.filter((r) => cs.every((k) => typeof r.v[k] === "number" && isFinite(r.v[k] as number)))
      .map((r) => ({ id: r.symbol, label: `${r.symbol}: ${cs.map((k) => `${byKey.get(k)?.label} ${fmtMetric(byKey.get(k)!, r.v[k])}`).join(" · ")}`, x: r.v[cs[0]] as number, y: r.v[cs[1]] as number, z: r.v[cs[2]] as number }));
    return pts.length >= 5 ? { pts, axes: cs.map((k) => byKey.get(k)?.label || k) as [string, string, string] } : null;
  }, [rows, shown.join(","), byKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // green and red: the best and the weakest quarter of ALL listed companies on that column (file 04 §5), from the catalog's quartiles
  const heat = useMemo(() => { const out: Record<string, [number, number]> = {}; byKey.forEach((m, k) => { if (m.stats?.p25 != null && m.stats.p75 != null) out[k] = [m.stats.p25, m.stats.p75]; }); return out; }, [byKey]);
  const tone = (k: string, v: number | null) => cellTone(byKey.get(k), heat[k], v);
  const dflt = useMemo(() => standardColumns(data), [data]);
  // the colour note shows only while a column beyond the standard set is on the table and carries a green or red cell (task #73)
  const coloured = useMemo(() => colourColumns(shown, dflt, byKey, heat, rows), [shown.join(","), dflt, byKey, heat, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const err = res.error as { status?: number; body?: { plan?: string; detail?: string } } | null;

  // the one Sector filter (task #74): the industry list, named Sector; a sector picked from an older link stays part of it
  const industryNames = useMemo(() => new Set((data?.industries || []).map((x) => x.name)), [data]);
  const legacySectors = useMemo(() => f.sectors.filter((s) => !industryNames.has(s)), [f.sectors, industryNames]);
  const sectorItems = useMemo(() => [...legacySectors.map((s) => ({ key: s, label: s, n: data?.sectors.find((x) => x.name === s)?.n ?? 0 })), ...(data?.industries || []).map((x) => ({ key: x.name, label: x.name, n: x.n }))], [legacySectors, data]);
  const toggleSector = (k: string) => toggle(f.sectors.includes(k) ? "sectors" : "industries", k);
  const nSector = f.industries.length + f.sectors.length;

  const funnel = res.data?.funnel ?? [];
  const stepOf = (k: string) => funnel.find((s) => s.key === k);
  const tight = funnel.find((s) => s.after === 0);
  const removeStep = (k: string) => { if (k === "size") setF((s) => ({ ...s, caps: [] })); else if (k === "sector" || k === "industry") setF((s) => ({ ...s, sectors: [], industries: [] })); else if (k === "index") setF((s) => ({ ...s, indices: [] })); else if (k === "band") setF((s) => ({ ...s, bands: [] })); else if (k === "model") setF((s) => ({ ...s, model: undefined })); else removeRule(baseOf(k)); };
  const stepName = (k: string) => STEP_NAME[k] ?? ratios.find((r) => r.id === k)?.name ?? byKey.get(k)?.label ?? k;

  const panelRow = (r: (typeof rows)[number]): PanelRow => ({ symbol: r.symbol, name: r.name, sector: r.sector, price: r.v.price ?? null });
  const step = useCallback((d: 1 | -1) => {
    if (!chart) return;
    const i = rows.findIndex((r) => r.symbol === chart.symbol), n = rows[i + d];
    if (i >= 0 && n) { setChart(panelRow(n)); return; }
    if (d === 1 && (page + 1) * PAGE < total && !res.data?.capped) { setStepTo("first"); setPage(page + 1); }   // the next page follows
    else if (d === -1 && page > 0) { setStepTo("last"); setPage(page - 1); }
  }, [chart, rows, page, total, res.data?.capped]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stepTo && rows.length && !res.isFetching) { setChart(panelRow(stepTo === "first" ? rows[0] : rows[rows.length - 1])); setStepTo(null); } }, [rows, stepTo, res.isFetching]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeChart = () => { const s = chart?.symbol; setChart(null); window.setTimeout(() => Array.from(document.querySelectorAll<HTMLElement>(".ssw-t tbody tr[data-sym]")).find((t) => t.dataset.sym === s)?.focus(), 0); };

  const listed = data ? nf(data.total, 0) : "…";
  // Every group of filters with its count, up front (task #64, S-1): readers see how much they can filter without a click
  const numGroups = (data?.groups ?? []).map((g) => ({ ...g, n: g.metrics.filter((m) => !m.hidden).length })).filter((g) => g.n > 0);
  const nFilters = numGroups.reduce((a, g) => a + g.n, 0);
  const asOfLine = dataLine(data?.pricesAt, data?.scoresAt);
  const sub = nActive === 0 ? `every listed company, ${sort.key === "market_cap" && sort.dir === "desc" ? "biggest first" : "sorted by " + (SHORT[sort.key] ?? byKey.get(sort.key)?.label ?? "name")} · of ${listed} listed`
    : `match all ${nActive} ${nActive === 1 ? "rule" : "rules"} · of ${listed} listed${onScreens.length ? ` · ${onScreens.length} ready-made ${onScreens.length === 1 ? "screen" : "screens"} on` : ""}${from ? ` · started from ${from}` : ""}`;
  const stdCount = shown.filter((k) => base.includes(k)).length, ruleCount = shown.length - stdCount;

  return (
    <>
      <div className="wrap ssw" style={{ paddingTop: 22 }}>
        <section className="card ssw-head">
          <div className="ssw-h1row"><h1 title="Filter every listed company by size, valuation, growth, debt, ownership and price trend. Start from a ready-made screen or add your own rules; the list updates as you go.">Stock screener</h1>
            {asOfLine && <span className="ssw-asof">{asOfLine}</span>}</div>
          <FindStocksTabs bare />
        </section>

        <ReadyScreens plan={plan} prism={prismOnly} on={f.on ?? []} total={res.data ? total : null} onToggle={toggleScreen} onAllOff={allOff} saved={saved} onOpenSaved={openSaved} onDeleteSaved={(n) => { screens.remove(n); toast(`Deleted “${n}”.`); }} ask={ask}
          onNotify={user ? (n, on) => { screens.setNotify(n, on); toast(on ? `Messages on for “${n}”: after each close we name the companies that join or leave it.` : `Messages off for “${n}”.`); } : undefined} />

        <button type="button" className="btn ssw-rtoggle" aria-expanded={rulesOpen} aria-controls="ssw-rules" onClick={() => setRulesOpen(!rulesOpen)}>
          Your rules{nActive + nWaiting ? ` (${nActive + nWaiting})` : ""} · {res.data ? `${nf(total, 0)} companies` : "…"} <i aria-hidden="true">{rulesOpen ? "▴" : "▾"}</i></button>

        <div className="ssw-work">
          <aside id="ssw-rules" className={"card ssw-rules" + (rulesOpen ? " open" : "")} aria-label="Your rules">
            <div className="ssw-rh"><h2>Your rules</h2>{(nActive > 0 || rules.length > 0) && <button type="button" className="lnk" onClick={clearAll}>Clear all</button>}</div>
            {nWaiting > 0 && <p className="ssw-wait" role="status">{nWaiting} {nWaiting === 1 ? "rule has" : "rules have"} no range yet: set one on {nWaiting === 1 ? "its card" : "their cards"} to narrow the list.</p>}
            {nActive === 0 || !funnel.length
              ? <p className="ssw-funnel-0">All {listed} companies. Each rule narrows the list; this line then shows how many are left after each one.</p>
              : <ol className="ssw-funnel" aria-label="What is left after each rule"><li><b>{listed}</b></li>{funnel.map((s) => <li key={s.key} title={`after ${stepName(s.key)}`}><span aria-hidden="true">→</span><b>{nf(s.after, 0)}</b><span className="sr"> after {stepName(s.key)}</span></li>)}</ol>}
            {cat.isError && <div className="state"><p>The filters are not available right now. Please try again in a moment.</p><button className="btn" onClick={() => cat.refetch()}>Try again</button></div>}
            {cat.isLoading && <div className="skeleton" style={{ height: 320 }} />}
            {data && <>
              <div className="ssw-sec"><h3>Size</h3>
                <div className="ssw-chips" role="group" aria-label="Company size">{data.caps.map((c) => <button key={c.name} type="button" className="ssw-chip" aria-pressed={F.caps.includes(c.name)} onClick={() => toggle("caps", c.name)}>{c.name} <span>{nf(c.n, 0)}</span></button>)}</div>
                <p className="ssw-note">Large above ₹50,000 Cr · Mid ₹10,000–50,000 Cr · Small below ₹10,000 Cr</p></div>
              <div className="ssw-sec"><h3>Sector and index</h3>
                <Fold id="industry" title="Sector" summary={nSector ? `Sector: ${nSector} picked` : "All sectors"} open={folds.industry ?? nSector > 0} setOpen={(o) => setFolds((x) => ({ ...x, industry: o }))}>
                  <Checks search items={sectorItems} picked={[...f.industries, ...f.sectors]} toggle={toggleSector} /></Fold>
                {data.indices.length > 0 && <Fold id="index" title="Index" summary={f.indices.length ? `Index: ${f.indices.map((c) => data.indices.find((i) => i.code === c)?.label ?? c).join(", ")}` : `Index: any (${data.indices.length} lists)`} open={folds.index ?? f.indices.length > 0} setOpen={(o) => setFolds((x) => ({ ...x, index: o }))}>
                  <Checks items={data.indices.map((x) => ({ key: x.code, label: x.label, n: x.n }))} picked={f.indices} toggle={(k) => toggle("indices", k)} /></Fold>}</div>
              <div className="ssw-sec"><h3>{prismOnly ? "FinLit Prism" : "FinLit IQ"} rating {!prismOnly && <span className="ssr-tier silver">SILVER</span>}</h3>
                <div className="ssw-chips" role="group" aria-label={prismOnly ? "FinLit Prism rating" : "FinLit IQ rating"}>{data.bands.map((b) => <button key={b.key} type="button" className={"ssw-chip" + (b.locked ? " is-locked" : "")} aria-pressed={F.bands.includes(b.key)}
                  onClick={() => (b.locked ? ask("silver", "Filtering by the FinLit IQ rating comes with the Silver plan.") : toggle("bands", b.key))}>{b.locked && <Icon name="lock" />}{b.label}{b.n != null && <span>{nf(b.n, 0)}</span>}</button>)}</div></div>
              <div className="ssw-sec"><h3>Rules on numbers</h3>
                <div className="ssw-size" role="group" aria-label="Every filter, by group">
                  <p className="ssw-size-n"><b>{nf(nFilters, 0)} filters</b> in {numGroups.length} groups</p>
                  <label className="ssw-size-q"><Icon name="search" /><span className="sr">Search the filters</span><input type="search" placeholder="Search filters, e.g. debt, ROE, promoter" value=""
                    onChange={(e) => setPicker({ q: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setPicker({}); } }} /></label>
                  <ul className="ssw-groups">{numGroups.map((g) => { const on = g.metrics.filter((m) => rules.includes(m.key) || F.ranges[m.key]).length;
                    return <li key={g.id}><button type="button" onClick={() => setPicker({ group: g.id })} aria-label={`${g.label}: ${g.n} filters${on ? `, ${on} on` : ""}`}>
                      <span>{g.label}{g.tier !== "basic" && <span className={"ssr-tier " + g.tier}>{g.tier.toUpperCase()}</span>}</span>{on > 0 && <em>{on} on</em>}<small>{g.n}</small></button></li>; })}
                    <li><button type="button" onClick={() => openRatio()}><span>Custom ratio</span><small>{ratios.length ? `${ratios.length} on` : "build"}</small></button></li></ul>
                </div>
                {onScreens.filter((x) => !x.state).map((x) => <div key={x.id} className="ssr-rule ssr-model" role="group" aria-label={`Screen on the ${prismOnly ? "FinLit Prism" : "FinLit IQ"}: ${x.label}`}><div className="ssr-rt"><b>{x.label}</b><span className={"ssr-tier " + x.tier}>{x.tier.toUpperCase()}</span>
                  <button type="button" className="ssr-x" aria-label={`Turn off ${x.label}`} onClick={() => toggleScreen(x)}>×</button></div>
                  <p className="ssr-say">{x.says}. Its cut-offs stay on the server.</p></div>)}
                {stepOf("model") && <p className="ssr-cnt">The screens on the {prismOnly ? "FinLit Prism" : "FinLit IQ"} keep <b>{nf(stepOf("model")!.after, 0)}</b> of {nf(stepOf("model")!.before, 0)}</p>}
                {rules.map((k) => { const m = byKey.get(k); if (!m) return null; const rk = ruleKey(m), cur = byKey.get(rk) ?? m;
                  return <RuleCard key={k} m={m} cur={cur} r={F.ranges[rk] || {}} set={(r) => setRange(rk, r)} remove={() => removeRule(k)} ask={ask} hot={hot === k}
                    period={periodOf(m)} setPeriod={(p) => setPeriod((x) => ({ ...x, [m.key]: p }))} count={stepOf(rk)} />; })}
                {ratios.map((r) => <div key={r.id} className="ssr-rule ssr-ratio" role="group" aria-label={`Custom ratio: ${r.name}`}><div className="ssr-rt"><b>{r.name}</b>
                  <button type="button" className="lnk" onClick={() => openRatio(r)}>Change</button><button type="button" className="ssr-x" aria-label={`Remove ${r.name}`} onClick={() => setRatios(ratios.filter((x) => x.id !== r.id))}>×</button></div>
                  <p className="ssr-say">{byKey.get(r.num)?.label ?? r.num} ÷ {byKey.get(r.den)?.label ?? r.den} · {valueText(r)}</p>
                  {stepOf(r.id) && <p className="ssr-cnt">keeps <b>{nf(stepOf(r.id)!.after, 0)}</b> of {nf(stepOf(r.id)!.before, 0)}</p>}</div>)}
                <button type="button" className="btn ssw-add" onClick={() => setPicker({})}>+ Add a rule</button>
                <form className="ssw-typed" onSubmit={(e) => { e.preventDefault(); const r = parseRules(typed, (k) => byKey.has(k)); setTypedErr(r.errors); const ok = Object.entries(r.ranges).filter(([k]) => !byKey.get(k)?.locked);
                  const lockedOnes = Object.keys(r.ranges).filter((k) => byKey.get(k)?.locked); if (lockedOnes.length) setTypedErr((x) => [...x, `${lockedOnes.map((k) => byKey.get(k)!.label).join(", ")}: part of a higher plan.`]);
                  if (ok.length) { setF((o) => ({ ...o, ranges: { ...o.ranges, ...Object.fromEntries(ok) } })); setOrder((o) => [...o, ...ok.map(([k]) => baseOf(k)).filter((k) => !o.includes(k))]); setPg({ k: "", p: 0 }); if (!r.errors.length && !lockedOnes.length) setTyped(""); } }}>
                  <label className="sr" htmlFor="ssw-type">Type rules</label>
                  <input id="ssw-type" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type: pe < 20 and roe > 15" aria-describedby="ssw-type-h" autoComplete="off" />
                  <p id="ssw-type-h">Names or short forms (pe, pb, roe, roce, debt, yield, mcap, price, sales3y, profit3y, 1d, 1m, 3m, 6m, 1y, high, {prismOnly ? "prism" : "iq"}) with &lt; or &gt;. Press Enter. For “or” and brackets use the <Link to="/query-builder">Query builder</Link>.</p>
                  {typedErr.map((m) => <p key={m} className="ssw-err" role="alert">{m}</p>)}
                </form>
                <div className="ssw-rl" role="group" aria-label="Custom ratio">
                  <b>Custom ratio</b>
                  <small>Divide one figure by another and filter on the result.</small>
                  {ratios.length > 0 && <ul className="ssw-rlon">{ratios.map((r) => <li key={r.id}><button type="button" onClick={() => openRatio(r)} aria-label={`Change ${r.name}`}><span><b>{r.name}</b><small>{byKey.get(r.num)?.label ?? r.num} ÷ {byKey.get(r.den)?.label ?? r.den}</small></span><em>{valueText(r)}</em></button></li>)}</ul>}
                  <button type="button" className="btn primary ssw-rb" onClick={() => openRatio()} disabled={ratios.length >= 3} title={ratios.length >= 3 ? "You have 3 ratios on, the most at one time. Remove one to add another." : undefined}><Icon name="percent" />+ Build a ratio</button>
                  {ratios.length === 0 && <div className="ssw-rlex"><small>Examples</small>{RATIO_EXAMPLES.filter((x) => byKey.has(x.num) && byKey.has(x.den)).map((x) => <button key={x.name} type="button" className="lnk" onClick={() => openRatio({ name: x.name, num: x.num, den: x.den, show: x.show, op: "gt" })}>{x.name}</button>)}</div>}
                  <div className="ssw-rlex"><small>My ratios ({savedRatios.length})</small>{savedRatios.length === 0 ? <span className="muted">None saved yet. Save one from the drawer.</span>
                    : savedRatios.map((x) => <span key={x.name} className="ssw-rlmy">{x.name} <button type="button" className="lnk" onClick={() => openRatio(x)}>Use</button><button type="button" className="ssr-x" aria-label={`Delete ${x.name} from My ratios`} onClick={() => setSavedRatios(savedRatios.filter((y) => y.name !== x.name))}>×</button></span>)}</div>
                </div>
              </div>
            </>}
          </aside>

          <section className="card ssw-res" aria-label="Results">
            <div className="ssw-rhd">
              <div className="ssw-ttl"><h2 aria-live="polite"><b>{res.isLoading || !res.data ? "…" : nf(total, 0)}</b> {total === 1 ? "company" : "companies"}</h2><p className="ssw-sub">{sub}</p></div>
              <div className="ssw-acts">
                <span className="ssw-pop"><button type="button" className="btn" aria-expanded={saveOpen === "save"} onClick={() => openSave("save")} disabled={!nActive} title={nActive ? undefined : "Add a rule first"}><Icon name="star" />Save screen</button>
                  <button type="button" className="btn" aria-expanded={saveOpen === "tell"} onClick={() => openSave("tell")} disabled={!nActive} title={nActive ? undefined : "Add a rule first"}><Icon name="bell" />Tell me when a company joins</button>
                  {saveOpen && <span className="ssw-popb" role="group" aria-label={saveOpen === "tell" ? "Tell me when a company joins" : "Save screen"}>
                    {saveOpen === "tell" && <small className="ssw-popn">After each close you get a message in the site's inbox and by e-mail naming the companies that joined or left this screen. Messages only; turn them off under My screens.</small>}
                    <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name this screen" aria-label="Screen name" maxLength={40} autoFocus onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setSaveOpen(null); }} />
                    <button type="button" className="btn primary" onClick={save}>{saveOpen === "tell" ? "Save and tell me" : "Save"}</button></span>}</span>
              </div>
            </div>
            {chips.length > 0 && <div className="ssw-actv" aria-label="Your rules">{chips.map((c) => <span key={c.label} className={"ssw-a" + (c.label.startsWith("Screen: ") ? " is-screen" : "")} title={c.title}>{c.label}<button type="button" onClick={c.clear} aria-label={`Remove ${c.label}`}>×</button></span>)}</div>}
            <div className="ssw-tbar">
              <input className="ssw-srch" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or symbol" aria-label="Search the results by name or symbol" />
              <span className="ssw-sp" />
              {res.data && total > 0 && <span className="ssw-pg">{nf(page * PAGE + 1, 0)}–{nf(Math.min(total, page * PAGE + rows.length), 0)} of {nf(total, 0)}</span>}
              <span className="scr-cm"><button type="button" className="btn" aria-expanded={colMenu} onClick={() => setColMenu(!colMenu)}><Icon name="table" />Columns · {columns.length} ▾</button>
                {colMenu && data && <div className="scr-colmenu pl-colmenu" role="menu">
                  <label className="scr-find sm" style={{ margin: "0 0 8px" }}><Icon name="search" /><input value={colFind} onChange={(e) => setColFind(e.target.value)} placeholder="Find a column" aria-label="Find a column" /></label>
                  {data.groups.map((g) => { const ms = (colFind.trim() ? rankMetrics(g.metrics, colFind) : g.metrics).filter((m) => !m.hidden || columns.includes(m.key)); return ms.length ? <div key={g.id}><div className="label">{g.label}</div>{ms.map((m) => <label key={m.key} className={m.locked ? "is-locked" : ""}><input type="checkbox" checked={columns.includes(m.key)} disabled={m.locked} onChange={() => toggleCol(m.key)} />{m.label}{m.locked && <Icon name="lock" />}</label>)}</div> : null; })}
                  <button className="alx-link" onClick={() => pickCols(null)}>Back to the standard set</button></div>}</span>
            </div>
            {res.isError && err?.status !== 403 ? <div className="state"><h2>The screener is unavailable right now</h2><p>Please try again in a moment.</p><button className="btn" onClick={() => res.refetch()}>Try again</button></div>
              : res.isError ? <div className="state"><h2>That rule is part of a higher plan</h2><p>{err?.body?.detail}</p><button className="btn primary" onClick={() => ask((err?.body?.plan as Plan) || "silver", err?.body?.detail || "")}>See the plan</button></div>
              : !res.data ? <div className="skeleton" style={{ height: 380 }} aria-busy="true" /> : (
                <>
                  {total === 0 && tight && <div className="ssw-zero" role="status"><b>No company passes every rule.</b> {stepName(tight.key)} is the tightest: it leaves none of the {nf(tight.before, 0)} companies before it.
                    <button type="button" className="btn" onClick={() => removeStep(tight.key)}>Remove {stepName(tight.key)}</button></div>}
                  <TableZoom label="Stock screener results"><HScroll className={"scr-tw ssw-tw" + (res.isFetching ? " is-busy" : "")} label="results table" tall controls={false}><table className="scr-t ssw-t">
                    <thead>
                      <tr className="ssw-band"><th className="stick">Company</th>{stdCount > 0 && <th colSpan={stdCount}>{stdCount} {stdCount === 1 ? "column" : "columns"}</th>}{ruleCount > 0 && <th colSpan={ruleCount} className="rb">Your rules</th>}{ratios.length > 0 && <th colSpan={ratios.length} className="cr-th">Custom ratios</th>}<th aria-label="Report" /></tr>
                      <tr className="ssw-hd"><th className="stick" aria-sort={sort.key === "name" ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}><button onClick={() => sortBy("name")}>Company <span className="ar">{sort.key === "name" ? (sort.dir === "asc" ? "▲" : "▼") : "▾"}</span></button><small>Industry · size</small></th>
                        {shown.map((k) => { const m = byKey.get(k), isRule = !base.includes(k); return <th key={k} className={isRule ? "rb" : ""} aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                          <button onClick={() => sortBy(k)} title={m?.say} aria-label={`Sort by ${m?.label}`}>{SHORT[k] ?? m?.label} <span className="ar">{sort.key === k ? (sort.dir === "asc" ? "▲" : "▼") : "▾"}</span></button><small>{unitLine(k, m)}</small></th>; })}
                        {ratios.map((r) => <th key={r.id} className="cr-th"><button onClick={() => sortBy(r.id)} title={`${byKey.get(r.num)?.label ?? r.num} ÷ ${byKey.get(r.den)?.label ?? r.den}`} aria-label={`Sort by ${ratioLabel(r)}`}>{ratioLabel(r)} <span className="ar">{sort.key === r.id ? (sort.dir === "asc" ? "▲" : "▼") : "▾"}</span></button></th>)}
                        <th className="ssw-rep"><span className="sr">Report</span></th></tr></thead>
                    <tbody>{rows.map((r) => (
                      <tr key={r.symbol} data-sym={r.symbol} tabIndex={0} className={chart?.symbol === r.symbol ? "cp-row" : ""} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,input,select")) setChart(panelRow(r)); }} onKeyDown={(e) => e.key === "Enter" && setChart(panelRow(r))}>
                        <td className="stick"><span className="co"><CoLogo symbol={r.symbol} name={r.name} size={28} /><span><b title={codeNote(r)}>{titleOf(r)}</b><small>{[subOf(r), r.cap].filter(Boolean).join(" · ")}</small></span></span></td>
                        {shown.map((k) => { const m = byKey.get(k), v = r.v[k], isRule = !base.includes(k);
                          if (k === "price") { const d = r.v.ret_1d; return <td key={k} className={isRule ? "rb" : ""}>{v == null ? "–" : fmtMetric(m!, v)}{d != null && <small className={"ssw-ch " + (d > 0 ? "up" : d < 0 ? "dn" : "")}>{(d > 0 ? "+" : d < 0 ? "−" : "") + nf(Math.abs(d), 1)}%</small>}</td>; }
                          if (k === "prism_final") return <td key={k} className={"ssw-iq" + (isRule ? " rb" : "")}>{v == null ? "–" : <><span className={"ssw-sc " + (PRISM_CLASS[r.pband ?? ""] ?? "")}>{Math.round(v)}</span>{r.pband && <small>{BAND_WORD[r.pband] ?? r.pband}</small>}</>}</td>;
                          if (k === "overall") return <td key={k} className={"ssw-iq" + (isRule ? " rb" : "")}>{v == null ? "–" : <><span className={"ssw-sc " + (r.band ?? "")}>{Math.round(v)}</span>{r.band && <small>{BAND_WORD[r.band] ?? r.band}</small>}</>}</td>;
                          return <td key={k} className={[tone(k, v), isRule ? "rb" : ""].filter(Boolean).join(" ")} title={v == null ? emptyReason(k, r.full) : undefined}>{v == null || !m ? "–" : fmtMetric(m, v)}</td>; })}
                        {ratios.map((r2) => { const v = r.r?.[r2.id]; return <td key={r2.id} className="cr-td" title={v == null ? "No value: a figure is missing, or the bottom figure is zero or less" : undefined}>{v == null ? "–" : `${nf(v, Math.abs(v) >= 100 ? 1 : 2)}${r2.show === "pct" ? "%" : "×"}`}</td>; })}
                        <td className="ssw-rep"><Link to={`/stocks/${encodeURIComponent(r.symbol)}`} aria-label={`Open the report of ${r.name || r.symbol}`} title="Open the company report"><Icon name="notes" /></Link></td>
                      </tr>))}
                      {!rows.length && !tight && <tr><td colSpan={shown.length + ratios.length + 2} className="empty">No companies match all of these rules. Try loosening one, or <button className="alx-link" onClick={clearAll}>clear them all</button>.</td></tr>}
                    </tbody></table></HScroll></TableZoom>
                  {res.data.capped ? (
                    <div className="pl-cap"><Icon name="lock" /><span><b>Showing the first {res.data.limit} of {nf(total, 0)} matches.</b> Silver shows every match and unlocks every filter.</span>
                      <button className="btn primary" onClick={() => ask("silver", "See every match and use every filter with Silver.")}>Unlock with Silver</button></div>
                  ) : total > PAGE && (
                    <div className="pm-pager ssw-pager"><span>Showing {nf(page * PAGE + 1, 0)}–{nf(Math.min(total, page * PAGE + PAGE), 0)} of {nf(total, 0)}</span><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Previous</button><button className="btn" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next {PAGE} ›</button></div>)}
                  {webgl && cloud && <Safe3D><Suspense fallback={null}><Cloud3D points={cloud.pts} axes={cloud.axes} onPick={(id) => nav(`/stocks/${id}`)}
                    label={`The ${cloud.pts.length} companies on this page as points in 3D, spread by ${cloud.axes.join(", ")}. The table above lists the same numbers.`} /></Suspense></Safe3D>}
                </>)}
            {coloured.length > 0 && <Plain>{colourNote(coloured, "all")}</Plain>}
            <p className="ssw-legend">{ruleCount > 0 && <><span className="ssw-lg rb" /> Your rules: the columns your rules use · </>}– means no figure yet · the {prismOnly ? "Prism" : "FinLit IQ"} chip is coloured by its rating word. FinLit scores describe a company's financial health and its price trend. They are not advice to buy, sell or hold any share.</p>
          </section>
        </div>
        {data && data.withReport < data.total && <p className="faint scr-foot">All {nf(data.total, 0)} listed companies are here with their price and market cap. Ratios, growth and statements show a dash until a company's report is loaded ({nf(data.withReport, 0)} are today); a rule leaves out the companies without that figure.</p>}
        <p id="scr-about" className="faint scr-foot">A screen narrows a long list; it does not say what to buy. Open a company's report to see why a number looks the way it does. Index lists come from NSE Indices. General information, not investment advice.</p>
        {isAdmin && data && data.total > 0 && (
          <div className="fgx-two">
            <Donut part={data.withReport} total={data.total} partLabel="Report loaded" restLabel="Price and market cap only" title={`${nf(data.total - data.withReport, 0)} of ${nf(data.total, 0)} companies have no full report loaded yet.`}
              note="Ratios, growth and statements show a dash until a company's report is loaded." />
            <SectorBars title="Listed companies by sector (Top 5)" rows={[...data.industries].sort((a, b) => b.n - a.n).slice(0, 5).map((x) => ({ label: x.name, n: x.n, pct: (x.n / data.total) * 100 }))} />
          </div>)}
      </div>
      {rd && data && <RatioDrawer groups={data.groups} byKey={byKey} start={rd.start} ratiosOn={ratios.length} firstSymbols={rows.map((r) => r.symbol)} countWith={countWith} currentTotal={res.data ? total : null}
        onAdd={addRatio} onSave={saveRatio} onClose={() => setRd(null)} onUseFilter={(m) => { setRd(null); addRule(m); }} />}
      {picker && data && <RulePicker groups={data.groups} byKey={byKey} has={(k) => rules.includes(k) || !!F.ranges[k]} add={addRule} ask={ask} onClose={() => setPicker(false)} startGroup={picker.group} startQuery={picker.q} />}
      {chart && <ChartPanel key={chart.symbol} row={chart} onClose={closeChart} onStep={step} extra={<RuleFigures symbol={chart.symbol} ranges={F.ranges} byKey={byKey} />} />}
    </>
  );
}

export type { Catalog };
export const _TIER = TIER;   // kept for older imports of the plan names from this page
