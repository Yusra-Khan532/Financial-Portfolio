import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CoLogo } from "../components/CoLogo";
import { Icon } from "../lib/icons";
import { Link } from "react-router";
import { HScroll } from "../components/HScroll";
import { MINUS } from "../lib/format";
import { bandInk, bandVar, scoreBand } from "../lib/scoreBands";
import {
  TABS, blankWhy, changeText, columnsFor, dash, isOverviewLike, isReady, money, monthYear, nextTab, priceText, scoreOf, scoreWhy, sortLines, BASIS_WORD, PRISM_FOUR,
  type Col, type Line, type Model, type Period, type Ready, type Tab,
} from "../lib/portfolioOverview";
import { SIZE_WORD, plural, short2 } from "./derive";
import { TABLE_FOOT } from "./words";
import type { Meta, Mode, PageObject } from "./types";
import { PEER_WORD, type Share } from "../lib/equityPack";
import { prismBandWord } from "../lib/scoreBands";
import { Tip } from "../components/sectors/pack/Common";
import { nseLevels } from "../lib/nseTaxonomy";
import { capBucket, SIZE_SHORTS } from "../lib/capBuckets";
import { coTitle, isBseCode, sortLabel, subLine, titleOf } from "../lib/companyLabel";
import { GroupBand, HOLD_COLS, HoldingHeads, HoldingRowCells, LotRows, LotToggle, TotalRow, holdingFigs, type LotsProps } from "./HoldingCells";
import { EditSellLinks } from "./EditSell";
import { FilterChips, FilterRow, applyFilters, filterDefs, trendScoreWord, trendWord, type Getters, type Picks } from "./ShareFilters";
import { aggOf } from "../lib/ledger";

const SHORT_LABEL: Record<string, string> = { fundamental: "G&P", valuation: "Val.", quality: "Qual.", risk: "Risk", growth: "Growth", profitability: "Profit.", balance: "Balance", technical: "Tech." };
/** Task #183 / #283: the words of the band filter: FinLit Prism's, on a plan with Prism; none on a plan without it (no company score is shown). */
export const BAND_FILTERS: Record<Model, string[]> = { prism: ["Strong", "Healthy", "Average", "Weak"], finlit: [] };
export type Level = "macro" | "sector" | "industry";
const LEVEL_WORD: Record<Level, string> = { macro: "Macro sector", sector: "Sector", industry: "Industry" };
const wordKey = (w: string | null | undefined) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : null);
/** The part columns: the four Prism parts, on a plan with Prism; none otherwise (task #283). */
export const partDefs = (model: Model): { id: string; label: string; short: string; get: (h: Ready) => number | null }[] =>
  model === "prism" ? PRISM_FOUR.map((p) => ({ id: p.key, label: p.label, short: SHORT_LABEL[p.key], get: (h: Ready) => h.prism?.parts?.[p.key] ?? null })) : [];

const Chip = ({ v, big, why }: { v: number | null | undefined; big?: boolean; why?: string }) => {
  if (v == null) return <span className="pfx-sc na" title={why || "Not scored"}>{MINUS}<span className="sr-only"> {why || "not scored"}</span></span>;
  const b = scoreBand(v);
  return <span className={"pfx-sc" + (big ? " big" : "")} style={{ background: `color-mix(in srgb, ${bandVar(b)} 18%, var(--s1))`, color: bandInk(b) }}>{Math.round(v)}</span>;
};
/** A part score as a word (Strong, Fair, Weak) with its colour: the four exact part scores of every share would let anyone solve the model, so only the total shows a number. */
const WORD = { hi: "Strong", mid: "Fair", lo: "Weak" } as const;
const PartChip = ({ v, why }: { v: number | null | undefined; why?: string }) => {
  if (v == null) return <span className="pfx-sc na" title={why || "Not enough data to score yet."}>{MINUS}<span className="sr-only"> {why || "not enough data to score yet"}</span></span>;
  const b = scoreBand(v) as "hi" | "mid" | "lo";
  return <span className="pfx-sc" style={{ background: `color-mix(in srgb, ${bandVar(b)} 18%, var(--s1))`, color: bandInk(b) }}>{WORD[b]}</span>;
};
/** Gold (task #183): a Prism trend view as its score (−100 to 100) with a bar and its word. */
const TrendCell = ({ t }: { t: { score: number | null; word: string | null } | null | undefined }) => {
  if (!t || t.score == null) return <span className="pfx-dash" title="Not calculated for this rating.">{MINUS}<span className="sr-only"> not calculated for this rating</span></span>;
  const v = Math.max(-100, Math.min(100, t.score));
  const word = trendScoreWord(v);   // task #274 change 13: the table's own words on the ±20 / ±50 lines (the server's word stays in the hover)
  return <span className="eq-trc" title={t.word && t.word !== word ? `${word} · Prism: ${t.word}` : word}><b>{v > 0 ? "+" : v < 0 ? MINUS : ""}{Math.abs(Math.round(v))}</b><span className="eq-trb" aria-hidden="true"><i className={v >= 0 ? "up" : "dn"} style={{ width: `${Math.abs(v) / 2}%`, [v >= 0 ? "left" : "right"]: "50%" } as React.CSSProperties} /></span><small>{word}</small></span>;
};
const Dash = ({ why }: { why: string }) => <span className="pfx-dash" title={why}>{MINUS}<span className="sr-only"> not available: {why}</span></span>;
const mean = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

type Props = {
  lines: Line[]; meta: Record<string, Meta>; page: PageObject | null; mode: Mode; colors: Record<string, string>; model: Model; tab: Tab; period: Period; limit: number;
  state: "loading" | "ready" | "error"; errorText?: string; onTab: (t: Tab) => void; onPeriod: (p: Period) => void; actions: (symbol: string) => ReactNode;
  /** Quantity the member typed for a share (null when none) and the setter; with the latest price they give the Value column. */
  qtyOf: (symbol: string) => number | null; onQty: (symbol: string, qty: number | null) => void;
  /** The final pages pack (12): each share's peer reading, FinLit size and industry, the day word for the move, and the cards above the table. */
  peerOf?: (symbol: string) => Share | undefined; day?: string; cards?: ReactNode;
  /** Task #235 (pack B7, B9, B11): each holding's buys and sales under it, the holding columns in three groups and the total row. */
  lots?: LotsProps;
  /** Task #274 (pack change 3): Edit | Sell under each share open their windows; the buy rows inside the table and the × at the end of the row go. */
  editSell?: { onEdit: (symbol: string) => void; onSell: (symbol: string) => void };
  /** task #274 (change 11): what the row inside the table adds once it takes the view bar's place: the portfolio picker, the three views and Sections ▾ */
  stuckLead?: ReactNode;
  /** task #274 (change 19): a chip beside Edit | Sell for a filing since the last visit ("● Fund raising ↗"), from Discover */
  chip?: (symbol: string) => ReactNode;
  /** task #274 (change 20): the share's main Discover theme as a pill beside its size, opening the theme with the company found */
  themePill?: (symbol: string) => ReactNode;
  /** task #274 (change 20): "Show them in the table" from Your themes: keeps the shares with that main theme; shown as the chip "Theme: AI & GenAI ×" */
  theme?: { label: string; has: (symbol: string) => boolean; onClear: () => void } | null;
};
const SIZE_ORDER: Record<string, number> = { Large: 0, Mid: 1, Small: 2, Micro: 3 };

export function SharesTable(p: Props) {
  const { lines, meta, page, colors, model, tab, period } = p;
  const ov = isOverviewLike(tab);
  const parts = useMemo(() => partDefs(model), [model]);
  const allCols = useMemo(() => columnsFor(tab, model, period).filter((c) => c.id !== "share" && !(ov && c.id === "cap")), [tab, model, period, ov]);
  // task #235 (pack B7): with the holding groups, Latest price and Today sit in WHAT IT IS WORTH NOW, not among the score columns
  const PRICE_COL = allCols.find((c) => c.id === "price")!, CHANGE_COL = allCols.find((c) => c.id === "change")!;
  const cols = useMemo(() => (ov && p.lots ? allCols.filter((c) => c.id !== "price" && c.id !== "change") : allCols), [allCols, ov, p.lots]);
  const rest = page?.avg_with_rest ?? {};
  const letter = useMemo(() => new Map((page?.groups ?? []).flatMap((g) => g.members.map((m) => [m, g.letter] as const))), [page]);
  const [sortId, setSortId] = useState<string | null>(null), [dir, setDir] = useState<1 | -1>(-1);
  // task #274 (change 9): Key figures' "Sort the table by valuation" sorts by that column, weakest first
  useEffect(() => { const f = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (typeof id === "string") { setSortId(id); setDir(1); } }; window.addEventListener("eq-sort", f); return () => window.removeEventListener("eq-sort", f); }, []);
  const [colsMode, setColsMode] = useState<"all" | "h" | "s">("all");   // task #235 (pack B7): Columns: Everything · Your holding · Scores
  const [q, setQ] = useState(""), [band, setBand] = useState<string | null>(null), [level, setLevel] = useState<Level>("sector");
  // task #274 (change 11): once the filter row reaches the view bar, the bar slides up under the site header and this row takes its place; it comes back after the table
  const toolsRef = useRef<HTMLDivElement>(null), findRef = useRef<HTMLInputElement>(null), [stuck, setStuck] = useState(false), [findOpen, setFindOpen] = useState(false);
  useEffect(() => {
    if (!p.editSell) return;
    const on = () => { const el = toolsRef.current, sec = el?.closest("section"); if (!el || !sec) return;
      const top = parseFloat(getComputedStyle(el).top) || 0, r = el.getBoundingClientRect(), b = sec.getBoundingClientRect().bottom;
      const now = r.top <= top + 1 && b > top + r.height + 120 && scrollY > 0; setStuck(now); document.documentElement.classList.toggle("eq-rowup", now); };
    on(); addEventListener("scroll", on, { passive: true }); addEventListener("resize", on);
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); document.documentElement.classList.remove("eq-rowup"); };
  }, [p.editSell]);
  // task #274 (pack change 18): the five filters; they stay set across Overview, By sector, By company size, Ratios and Financials (this component's state)
  const [picks, setPicks] = useState<Picks>({});
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  // "Add buys" (the score box, the missing note) opens the first such holding's buys (task #235, pack B5 and B13)
  useEffect(() => { const on = (e: Event) => { const s = (e as CustomEvent).detail as string; if (s) p.lots?.onOpen(s, true); }; addEventListener("bh-open", on); return () => removeEventListener("bh-open", on); }, [p.lots]);
  const secOf = (s: string) => meta[s]?.sector || `${s} (not classified)`;
  const sizeOf = (s: string) => { const l = lines.find((x) => x.symbol === s), cap = isReady(l?.ov) ? l!.ov.marketCapCr : null;   // FinLit's rupee bands on the company's own market value
    const peer = p.peerOf?.(s)?.size; if (peer) return peer;
    const band = cap != null ? capBucket(cap)?.short : undefined; if (band) return band;
    return meta[s] && meta[s].size !== "U" ? SIZE_WORD[meta[s].size].replace(" cap", "") : null; };
  const priceOf = (l: Line) => (isReady(l.ov) ? l.ov.price : null);
  const valueOf = (l: Line): number | null => { const qn = p.qtyOf(l.symbol), pr = isReady(l.ov) ? l.ov.price : null; return qn && pr ? qn * pr : null; };
  const indOf = (l: Line): string | null => (isReady(l.ov) ? l.ov.industry : null) || meta[l.symbol]?.sector || null;
  const levelOf = (l: Line) => { const ind = isReady(l.ov) ? l.ov.industry : null, x = nseLevels(ind); return x ? x[level] : `${LEVEL_WORD[level]} not given`; };

  // every heading sorts both ways: the model's columns, and Share, Size, Qty and Value (task #183)
  const extra: Record<string, (l: Line) => number | string | null> = { share: (l) => sortLabel({ symbol: l.symbol, name: l.name || (isReady(l.ov) ? l.ov.name : null) || meta[l.symbol]?.name }), size: (l) => (sizeOf(l.symbol) ? SIZE_ORDER[sizeOf(l.symbol) as string] : null), qty: (l) => p.qtyOf(l.symbol), value: valueOf,
    ...(p.lots ? { avg: (l: Line) => holdingFigs(p.lots!, l.symbol).a?.avg ?? null, invested: (l: Line) => holdingFigs(p.lots!, l.symbol).a?.invested ?? null,
      now: (l: Line) => holdingFigs(p.lots!, l.symbol).now, gain: (l: Line) => holdingFigs(p.lots!, l.symbol).gain, gainPct: (l: Line) => holdingFigs(p.lots!, l.symbol).gainPct,
      qty: (l: Line) => holdingFigs(p.lots!, l.symbol).a?.qty ?? null, price: (l: Line) => priceOf(l), change: (l: Line) => (isReady(l.ov) ? l.ov.changePct : null) } : {}), rest: (l) => rest[l.symbol] ?? null };
  const sorted = (ls: Line[]): Line[] => {
    if (!sortId) return ls;
    if (extra[sortId]) {
      const f = extra[sortId];
      return [...ls].sort((a, b) => { const x = f(a), y = f(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    }
    const c = cols.find((x) => x.id === sortId);
    return c ? sortLines(ls, c, dir) : ls;
  };
  const wordOf = (l: Line) => wordKey(scoreOf(l.ov, model).word) ?? "Not scored";
  const counts = new Map<string, number>(); lines.forEach((l) => counts.set(wordOf(l), (counts.get(wordOf(l)) ?? 0) + 1));
  const getters: Getters = {
    prism: (sym) => { const l = lines.find((x) => x.symbol === sym); return l ? wordOf(l) : "Not scored"; },
    size: (sym) => sizeOf(sym) ?? "Not known",
    trend: (sym) => { const l = lines.find((x) => x.symbol === sym); return trendWord(isReady(l?.ov) ? l!.ov.prism?.longTerm?.score ?? null : null); },
    peers: (sym) => { const pk = p.peerOf?.(sym)?.peer; return pk ? PEER_WORD[pk.label] : "Not compared"; },
    buys: (sym) => ((p.lots && aggOf(p.lots.holdings, sym, p.lots.cur)?.nBuys) ? "With buys" : "No buys yet"),
  };
  const defs = useMemo(() => filterDefs("Prism", BAND_FILTERS.prism), []);   // FinLit Prism is the only company score (task #283)
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const keep = p.editSell ? new Set(applyFilters(lines.map((l) => l.symbol), picks, getters)) : null;
    return sorted(lines.filter((l) => (keep ? keep.has(l.symbol) : band == null || wordOf(l) === band) && (!p.theme || p.theme.has(l.symbol)) && (!needle || [l.symbol, l.name || "", secOf(l.symbol)].join(" ").toLowerCase().includes(needle))));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, q, band, picks, sortId, dir, model, meta, cols, p.lots, p.theme]);

  const head = (c: { id: string; label: string; hint?: string; sortable?: boolean; num?: boolean; cls?: string }) => (
    <th key={c.id} scope="col" className={[c.num ? "r" : "", c.cls ?? ""].join(" ").trim() || undefined} aria-sort={sortId === c.id ? (dir === 1 ? "ascending" : "descending") : "none"} title={c.hint}>
      {c.sortable === false ? c.label : <button type="button" className="pfx-sort" onClick={() => { if (sortId === c.id) setDir((d) => (d === 1 ? -1 : 1)); else { setSortId(c.id); setDir(1); } }}>{c.label}<i aria-hidden="true">{sortId === c.id ? (dir === 1 ? "▲" : "▼") : ""}</i></button>}
    </th>);

  const firstPart = cols.find((c) => c.id.startsWith("p_") || c.id.startsWith("f_"))?.id, firstTech = cols.find((c) => c.id.startsWith("t_") || c.id === "f_technical")?.id;
  // task #274 (pack change 12): a divider also runs through the body at Prism (the price group's divider is the holding columns' own)
  const groupCls = (id: string) => (ov && id === firstPart ? "eq-div" : ov && id === firstTech ? "eq-div2" : ov && p.editSell && id === "score" ? "eq-divp" : "");
  const cell = (h: Ready, c: Col): ReactNode => {
    const g = groupCls(c.id);
    if (c.id === "price") return <td key={c.id} className="r">{h.price == null ? <Dash why="No price in the stored report." /> : priceText(h.price)}</td>;
    if (c.id === "change") return <td key={c.id} className="r">{h.changePct == null ? <Dash why="No change in the stored report." /> : <span className={h.changePct > 0 ? "pfx-up" : h.changePct < 0 ? "pfx-down" : ""}>{changeText(h.changePct)}</span>}</td>;
    if (c.id === "cap") return <td key={c.id} className="r">{h.marketCapCr == null ? <Dash why="No market cap in the stored report." /> : `₹${money(h.marketCapCr)} Cr`}</td>;
    if (c.id === "score") { const v = scoreOf(h, model).value; return <td key={c.id} className={("c " + groupCls(c.id)).trim()}><span className="eq-ps"><Chip v={v} big why={scoreWhy(h, model) || undefined} />{v != null && <small className={"eq-pw " + (v >= 70 ? "hi" : v >= 50 ? "mid" : "lo")}>{prismBandWord(v, h.prism?.label)}</small>}</span></td>; }
    if (c.id.startsWith("p_")) { const k = c.id.slice(2), d = parts.find((x) => x.id === k); return <td key={c.id} className={("c " + g).trim()}><PartChip v={d?.get(h)} why={`${c.label}: not scored for this company`} /></td>; }
    if (c.id.startsWith("t_")) return <td key={c.id} className={g || undefined}><TrendCell t={h.prism?.[c.id.slice(2) as "shortTerm" | "longTerm"]} /></td>;
    if (c.id === "yearEnd") { const st = h.financials[period]; return <td key={c.id}>{st.periodEnd ? monthYear(st.periodEnd) : <Dash why={blankWhy(h, "revenue", period) || "No statement is stored yet."} />}</td>; }
    if (c.id === "basis") return <td key={c.id}>{h.basis ? BASIS_WORD[h.basis] : <Dash why="The report does not say which statement it used." />}</td>;
    if (c.id in h.ratios) { const f = h.ratios[c.id as keyof Ready["ratios"]]; return <td key={c.id} className="r">{f.value == null ? <Dash why={f.why || "Not available."} /> : <span title={f.period || undefined}>{dash(f.value, 2)}</span>}</td>; }
    const st = h.financials[period][c.id as "revenue"];
    return <td key={c.id} className="r">{st?.value == null ? <Dash why={blankWhy(h, c.id, period) || "Not available."} /> : c.id === "tax_ratio" ? dash(st.value, 1) : money(st.value, c.id === "eps" ? 2 : 0)}</td>;
  };

  const row = (l: Line, indent = false): ReactNode => (<FragmentRows key={l.symbol}>{shareRow(l, indent)}
    {ov && p.lots && !p.editSell && p.lots.open.has(l.symbol) && <LotRows p={p.lots} symbol={l.symbol} lead={2} rest={nCols - 2 - HOLD_COLS} />}</FragmentRows>);
  const shareRow = (l: Line, indent = false): ReactNode => {
    const h = l.ov, m = meta[l.symbol], pk = p.peerOf?.(l.symbol);
    const name = l.name || (isReady(h) ? h.name : "") || m?.name || "";
    const weak = ov && scoreOf(h, model).band === "lo";
    return (
      <tr key={l.symbol} data-sym={l.symbol} className={[indent ? "ind" : "", weak ? "eq-weakrow" : ""].join(" ").trim() || undefined}>
        {p.editSell ? <td className="pfx-name pfs-name"><div className="pfs-cell"><CoLogo symbol={l.symbol} name={name} size={26} />
          {/* task #274 (pack change 8): symbol bold (BSE-only: the name), the full name on one line (BSE-only: its code), then Edit | Sell; every row one height */}
          <div className="pfs-t"><Link to={`/stocks/${l.symbol}`} className="pfs-sym" title={[coTitle({ symbol: l.symbol, name }), letter.has(l.symbol) ? `group ${letter.get(l.symbol)}` : ""].filter(Boolean).join(" · ")}>{titleOf({ symbol: l.symbol, name })}</Link>
            <span className="pfs-full" title={isBseCode(l.symbol) ? undefined : name}>{isBseCode(l.symbol) ? `BSE ${l.symbol}` : name || l.symbol}</span>
            {ov && p.lots && <span className="pfs-acts"><EditSellLinks p={p.lots} symbol={l.symbol} onEdit={() => p.editSell!.onEdit(l.symbol)} onSell={() => p.editSell!.onSell(l.symbol)} />{p.chip?.(l.symbol)}</span>}</div></div></td>
          : <td className="pfx-name"><span className="x-nl"><Link to={`/stocks/${l.symbol}`} className="pfx-co"><CoLogo symbol={l.symbol} size={22} inline /><b title={coTitle({ symbol: l.symbol, name })}>{titleOf({ symbol: l.symbol, name })}</b></Link>{letter.has(l.symbol) && <span className="pfx-letter sm" title={`Group ${letter.get(l.symbol)}`}>{letter.get(l.symbol)}</span>}{ov && p.lots && <LotToggle p={p.lots} symbol={l.symbol} />}</span><small>{subLine({ symbol: l.symbol, name }, pk ? (pk.industry ?? name) : isBseCode(l.symbol) ? ((isReady(h) ? h.industry : null) ?? name) : name)}</small></td>}
        {ov && (p.editSell ? <td className="pfs-ind"><span className="pfs-indn" title={indOf(l) ?? undefined}>{indOf(l) ?? (isReady(h) ? <Dash why="No industry in the stored report." /> : <span className="faint">Loading…</span>)}</span>
          <span className="pfs-tags">{sizeOf(l.symbol) ? <span className={"pfs-size pfs-sz-" + (sizeOf(l.symbol) as string).toLowerCase()}>{sizeOf(l.symbol)}</span> : <small className="pfs-nk">Size not known</small>}{p.themePill?.(l.symbol)}</span></td>
          : <td>{sizeOf(l.symbol) ?? MINUS}</td>)}
        {ov && (p.lots ? <HoldingRowCells p={p.lots} symbol={l.symbol} priceCell={isReady(h) ? cell(h, PRICE_COL) : <td className="x-c2 x-gs cg-h" />} changeCell={isReady(h) ? cell(h, CHANGE_COL) : <td className="x-c2 cg-h" />} />
          : <><td className="r x-qty"><input type="number" inputMode="decimal" min="0" step="any" placeholder="Qty" aria-label={`Quantity of ${l.symbol} you own`} defaultValue={p.qtyOf(l.symbol) ?? ""}
          onChange={(e) => { const n = Number(e.target.value); p.onQty(l.symbol, e.target.value.trim() !== "" && Number.isFinite(n) && n > 0 && n <= 1_000_000_000 ? n : null); }} /></td>
          <td className="r x-val">{valueOf(l) == null ? MINUS : "₹" + Math.round(valueOf(l)!).toLocaleString("en-IN")}</td></>)}
        {isReady(h) ? cols.map((c) => cell(h, c)) : <td colSpan={cols.length} className="pfx-wait cg-s">{h ? (h.status === "preparing" && p.state !== "ready" ? "Preparing… " + h.reason : "Not scored yet: " + (h.status === "preparing" ? "its report is not built yet." : h.reason)) : p.state === "error" ? "Not loaded." : p.state === "ready" ? "Not scored yet: report not built." : "Loading…"}</td>}
        {ov && p.peerOf && <td className="eq-vp eq-div2">{pk?.peer ? <>{p.editSell ? <span className={"dsh-pl " + pk.peer.label} title={pk.peer.raw && pk.peer.raw !== pk.peer.label ? `* May become ${PEER_WORD[pk.peer.raw]} next week` : undefined}>{PEER_WORD[pk.peer.label]}{pk.peer.raw && pk.peer.raw !== pk.peer.label ? "*" : ""}</span>
            : <span className={"dsh-pl " + pk.peer.label}>{PEER_WORD[pk.peer.label]}</span>}<small>{pk.peer.rank} of {pk.peer.of} peers</small>{!p.editSell && pk.peer.raw && pk.peer.raw !== pk.peer.label && <small className="eq-next">may become {PEER_WORD[pk.peer.raw]} next week</small>}</>
          : pk ? <><span className="dsh-pl in_line">Not compared</span><small>{pk.notCompared ? pk.notCompared.charAt(0).toUpperCase() + pk.notCompared.slice(1) : ""}</small></> : MINUS}</td>}
        {ov && <td className="r">{rest[l.symbol] != null ? short2(rest[l.symbol]) : <Dash why={page?.short_history.includes(l.symbol) ? "Under a year of weekly prices, so it is left out of the co-movement figures." : "Not available until the figures are ready."} />}</td>}
        {!p.editSell && <td className="r pfx-act">{p.actions(l.symbol)}</td>}
      </tr>);
  };

  // By sector (Macro sector · Sector · Industry, NSE's names) and By company size: group rows that fold (task #183)
  const idx = useMemo(() => new Map((page?.order ?? []).map((s, k) => [s, k])), [page]);
  const together = (ms: Line[]) => { const ks = ms.map((l) => idx.get(l.symbol)).filter((k): k is number => k != null); if (!page || ks.length < 2) return null;
    let t = 0, n = 0; for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++) { t += page.corr[ks[a]][ks[b]]; n++; } return n ? t / n : null; };
  const groups = useMemo(() => {
    if (tab !== "sector" && tab !== "size") return [];
    const key = (l: Line) => (tab === "size" ? (sizeOf(l.symbol) ?? "Size not known") : levelOf(l));
    const m = new Map<string, Line[]>(); shown.forEach((l) => { const k = key(l); m.set(k, [...(m.get(k) ?? []), l]); });
    const order = tab === "size" ? (k: string) => SIZE_ORDER[k] ?? 9 : () => 0;
    return [...m].map(([g, ms]) => ({ g, ms })).sort((a, b) => order(a.g) - order(b.g) || b.ms.length - a.ms.length || a.g.localeCompare(b.g));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, shown, level, meta]);
  const filtering = q.trim() !== "" || band != null || Object.values(picks).some((v) => v?.length);
  const isOpen = (g: string) => filtering || openSet.has(g);
  const toggle = (g: string) => setOpenSet((c) => { const n = new Set(c); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const lead = ov ? (p.lots ? 2 + HOLD_COLS : 4) : 1;
  const nCols = lead + cols.length + (ov ? 1 + (p.peerOf ? 1 : 0) : 0) + (p.editSell ? 0 : 1);

  const avgOf = (ls: Line[], c: Col) => (c.id === "score" ? mean(ls.map((l) => scoreOf(l.ov, model).value)) : c.id.startsWith("p_") ? mean(ls.map((l) => (isReady(l.ov) ? parts.find((d) => d.id === c.id.slice(2))?.get(l.ov) : null))) : undefined);
  const restAvg = (ls: Line[]) => mean(ls.map((l) => rest[l.symbol]));
  const foot = (ls: Line[], label: string) => (
    <tr className="pfx-avg"><th scope="row" colSpan={ov ? (p.lots ? (colsMode === "s" ? 2 : 2 + HOLD_COLS) : 3) : 1}>{label}</th>
      {ov && !p.lots && (() => { const t = ls.reduce((a, l) => a + (valueOf(l) ?? 0), 0); return <td className="r x-val x-total">{t > 0 ? "₹" + Math.round(t).toLocaleString("en-IN") : MINUS}</td>; })()}
      {cols.map((c) => { const v = avgOf(ls, c); return <td key={c.id} className={(c.id === "score" || c.id.startsWith("p_") ? "c " : "") + groupCls(c.id)}>{v == null ? "" : <Chip v={v} big={c.id === "score"} />}</td>; })}
      {ov && p.peerOf && <td />}{ov && <td className="r">{restAvg(ls) == null ? "" : short2(restAvg(ls)!)}</td>}{!p.editSell && <td />}</tr>);
  const nParts = cols.filter((c) => c.id.startsWith("p_") || (c.id.startsWith("f_") && c.id !== "f_technical")).length, nTech = cols.filter((c) => c.id.startsWith("t_") || c.id === "f_technical").length;
  const band1 = ov && (<tr className="eq-band" aria-hidden="true">{p.lots ? <><th colSpan={2} /><GroupBand /></> : <th colSpan={lead + cols.filter((c) => c.id === "price" || c.id === "change").length} />}
    {model === "prism" && <><th className="c cg-s">FinLit Prism</th><th colSpan={nParts} className="eq-div cg-s">Fundamental pillars</th><th colSpan={nTech} className="eq-div2 cg-s">{nTech > 1 ? "Technical pillars" : "Technical pillar"}</th></>}
    <th colSpan={(p.peerOf ? 1 : 0) + 2} className="eq-div2 cg-s">Against peers</th></tr>);
  const th = (<tr>{head({ id: "share", label: "Share" })}
    {ov && head({ id: "size", label: p.editSell ? "Industry · size" : "Size", cls: p.editSell ? "pfs-indh" : undefined })}
    {ov && !p.lots && head({ id: "qty", label: "Qty", num: true })}
    {ov && p.lots && <HoldingHeads sortHead={(id, label, cls) => head({ id, label, num: true, cls })} />}
    {ov && !p.lots && head({ id: "value", label: "Value", num: true })}
    {cols.map((c) => head({ id: c.id, cls: groupCls(c.id), label: ov && (c.id.startsWith("p_") || c.id.startsWith("f_")) ? (model === "finlit" ? c.label : parts.find((d) => d.id === c.id.slice(2))?.short ?? c.label) : c.id === "score" ? "Prism" : c.id === "t_shortTerm" ? "Short term" : c.id === "t_longTerm" ? "Long term" : c.id === "change" && p.day ? p.day : c.label.replace(/ \(.*\)$/, ""), hint: c.hint ? `${c.label}. ${c.hint}` : c.label, num: c.num && !c.id.startsWith("t_") }))}
    {ov && p.peerOf && <th scope="col" className="eq-div2">Vs its peers<Tip text="The share price over the last 12 months against similar companies and the sector index, with its place among them." how="Leader: among the strongest and ahead of the index. In line: in between. Laggard: among the weakest and behind it. It describes the past, not the future." /></th>}
    {ov && head({ id: "rest", label: "Moves with rest", hint: "A share's average correlation with the other shares in the list", num: true })}{!p.editSell && <th scope="col"><span className="sr-only">Actions</span></th>}</tr>);
  const sizeCards = tab === "size" && (<div className="eq-sizecards">{SIZE_SHORTS.map((k) => { const ms = lines.filter((l) => sizeOf(l.symbol) === k), a = mean(ms.map((l) => scoreOf(l.ov, model).value)); return (
    <div key={k} className="eq-sizecard"><p className="eq-k">{k} cap</p><p className="eq-v">{plural(ms.length, "share")}</p><p className="eq-x">{lines.length ? `${Math.round((ms.length / lines.length) * 100)}% of the list` : ""}{a != null ? ` · average Prism ${Math.round(a)}` : ""}</p></div>); })}</div>);

  return (
    <section className="pfx-card pfx-wide" id="pf-shares" aria-labelledby="pfx-sh">
      <div className="pfx-h pfx-h-shares"><div><h2 id="pfx-sh">Your shares</h2>{p.peerOf && <p className="sp-sub">{p.editSell ? `${plural(lines.length, "share")} · up to ${p.limit} · click a column heading to sort` : <>{plural(lines.length, "share")} · limit {p.limit}. Click a heading to sort.</>}</p>}</div>
        <div className="pfx-tabs" role="tablist" aria-label="Portfolio views">{TABS.map((t, i) => (
          <button key={t.id} type="button" role="tab" id={`pf-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="pf-panel" tabIndex={tab === t.id ? 0 : -1} className={"pfx-pillbtn" + (tab === t.id ? " on" : "")} onClick={() => p.onTab(t.id)}
            onKeyDown={(e) => { const to = nextTab(TABS[i].id, e.key); if (to) { e.preventDefault(); p.onTab(to); document.getElementById(`pf-tab-${to}`)?.focus(); } }}>{t.label}</button>))}</div></div>
      {p.cards}
      {sizeCards}
      <div ref={toolsRef} className={"pfx-tools" + (p.editSell ? " pfh" + (stuck ? " stuck sw-host x-sw-on" : "") : "")}>
        {p.editSell && stuck && p.stuckLead}
        {p.editSell && stuck && <label className="pfh-tab"><span className="sr-only">Table</span><select value={tab} onChange={(e) => p.onTab(e.target.value as Tab)}>{TABS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}
        {p.editSell && stuck && !q && !findOpen ? <button type="button" className="pfh-mag" aria-label="Find a share in your list" onClick={() => { setFindOpen(true); setTimeout(() => findRef.current?.focus(), 0); }}><Icon name="search" /></button>
        : p.editSell ? <label className="pfh-find"><Icon name="search" />
          <input ref={findRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setFindOpen(false)} placeholder="Find a share in your list" aria-label="Find a share in your list" /></label>
          : <input className="pfx-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a share in your list" aria-label="Find a share in your list" />}
        {p.editSell && !stuck && <span className="pfh-div" aria-hidden="true" />}
        {p.editSell ? <FilterRow defs={defs} symbols={lines.map((l) => l.symbol)} picks={picks} get={getters} onChange={setPicks} />
          : model === "prism" && <div className="pfx-chipsrow" role="group" aria-label="Filter by Prism band">
          <button type="button" className={"pfx-pillbtn" + (band == null ? " on" : "")} aria-pressed={band == null} onClick={() => setBand(null)}>All {lines.length}</button>
          {[...BAND_FILTERS[model], "Not scored"].filter((w) => counts.get(w)).map((w) => <button key={w} type="button" className={"pfx-pillbtn" + (band === w ? " on" : "")} aria-pressed={band === w} onClick={() => setBand(band === w ? null : w)}>{w} {counts.get(w)}</button>)}</div>}
        {tab === "sector" && <div className="pfx-chipsrow" role="group" aria-label="Group by">{(["macro", "sector", "industry"] as const).map((k) => <button key={k} type="button" className={"pfx-pillbtn" + (level === k ? " on" : "")} aria-pressed={level === k} onClick={() => setLevel(k)}>{LEVEL_WORD[k]} · {new Set(lines.map((l) => { const x = nseLevels(isReady(l.ov) ? l.ov.industry : null); return x ? x[k] : null; }).filter(Boolean)).size}</button>)}</div>}
        {tab === "financials" && <div className="pfx-chipsrow" role="group" aria-label="Period shown">{([["year", "Latest year"], ["quarter", "Latest quarter"]] as const).map(([k, l]) => <button key={k} type="button" className={"pfx-pillbtn" + (period === k ? " on" : "")} aria-pressed={period === k} onClick={() => p.onPeriod(k)}>{l}</button>)}</div>}
        {(tab === "sector" || tab === "size") && <div className="pfx-chipsrow"><button type="button" className="pfx-link" onClick={() => setOpenSet(new Set(groups.map((g) => g.g)))}>Open all</button><button type="button" className="pfx-link" onClick={() => setOpenSet(new Set())}>Close all</button></div>}
        {ov && p.lots && p.editSell && <label className={"pfh-cols" + (colsMode !== "all" ? " on" : "")}><span className="sr-only">Columns</span>
          <select value={colsMode} onChange={(e) => setColsMode(e.target.value as typeof colsMode)}><option value="all">All columns</option><option value="h">Your holding</option><option value="s">Scores</option></select></label>}
        {ov && p.lots && !p.editSell && <div className="x-cols" role="group" aria-label="Columns"><span>Columns:</span>{([["all", "Everything"], ["h", "Your holding"], ["s", "Scores"]] as const).map(([k, l]) =>
          <button key={k} type="button" aria-pressed={colsMode === k} onClick={() => setColsMode(k)}>{l}</button>)}</div>}
        <span className="pfx-note pfx-count">{plural(shown.length, "share")}{shown.length !== lines.length ? ` of ${lines.length}` : ""}{p.editSell ? "" : ` · limit ${p.limit}`}</span>
      </div>
      {p.editSell && <FilterChips defs={defs} picks={picks} q={q} shown={shown.length} total={lines.length} onChange={setPicks} onClearQ={() => setQ("")} extra={p.theme ? { label: `Theme: ${p.theme.label}`, onClear: p.theme.onClear } : null} />}
      {p.state === "error" && <p className="pfx-warn" role="alert">{p.errorText || "The scores could not be loaded. Try again in a moment."}</p>}
      <div id="pf-panel" role="tabpanel" aria-labelledby={`pf-tab-${tab}`}>
        <HScroll label="table" pinBelow={p.editSell ? "#pf-shares .pfx-tools.pfh" : undefined} pinCells={!!p.editSell} barBottom={!!p.editSell}><table className={"pfx-table t-" + tab + (ov && p.lots ? " x-grp" + (colsMode === "h" ? " only-h" : colsMode === "s" ? " only-s" : "") : "")}>
          <caption className="sr-only">{TABS.find((t) => t.id === tab)?.label} of your shares</caption>
          <thead>{band1}{th}</thead>
          <tbody>
            {tab !== "sector" && tab !== "size" && shown.map((l) => row(l))}
            {groups.map(({ g, ms }) => { const open = isOpen(g), t = together(ms), a = mean(ms.map((l) => scoreOf(l.ov, model).value)); return (
              <FragmentRows key={g}>
                <tr className="pfx-secrow"><td colSpan={nCols}><button type="button" aria-expanded={open} onClick={() => toggle(g)}>
                  <span className="car" aria-hidden="true">{open ? "▾" : "▸"}</span>{tab === "sector" && <i className="pfx-dot" style={{ background: colors[g] }} aria-hidden="true" />}<b>{g}</b> <span className="n">{plural(ms.length, "share")}</span>
                  <span className="m">{Math.round((ms.length / Math.max(1, lines.length)) * 100)}% of the list{t != null ? ` · moves together ${short2(t)}` : ""}</span>
                  <span className="a">{a != null && <Chip v={a} big />}</span></button></td></tr>
                {open && ms.map((l) => row(l, true))}
              </FragmentRows>); })}
            {!shown.length && <tr><td colSpan={nCols} className="pfx-empty">{lines.length ? <>No share matches {p.editSell ? "these filters" : "this filter"}.{p.editSell && <> <button type="button" className="pff-clear" onClick={() => { setPicks({}); setQ(""); }}>Clear filters</button></>}</> : "No shares yet."}</td></tr>}
          </tbody>
          {ov && shown.length > 0 && <tfoot>{p.lots && <TotalRow p={p.lots} symbols={shown.map((l) => l.symbol)} lead={2} rest={nCols - 2 - HOLD_COLS} />}{foot(shown, "List average")}</tfoot>}
        </table></HScroll>
      </div>
      <p className="pfx-fine">{ov ? TABLE_FOOT : tab === "ratios" ? "These are the figures on each company's own page (the data provider's, with the period on hover). A dash says why on hover. Information only, not investment advice." : `The latest ${period === "year" ? "full year" : "quarter"} in each company's stored statements, in ₹ crore except EPS. Information only, not investment advice.`}</p>
      {p.state === "loading" && <p className="pfx-fine" role="status">Loading the scores…</p>}
    </section>
  );
}
const FragmentRows = ({ children }: { children: ReactNode }) => <>{children}</>;
