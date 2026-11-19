// The screen view: one prebuilt screen on the Basic or Advanced stock screener. Values come from the response only: a missing one is a dash with its reason,
// never zero, and nothing is ranked or recommended here.
// Task #243 (screeners update pack v4, 18 Nov 2026), section P: one order of parts (P1): the header (P2, a shining crown on a featured group's screens), the date
// bar (P3), the toolbar and the filters that are on (P4), the notes line, the table with three heading rows (P5), the selection bar (P6, only with a selection),
// the pager (P7), Left the list (P8, a drop-down) and the disclaimer; Expand table opens the whole list over the window (P10).
import { titleOf, subOf, codeNote, exchangeTag } from "../../../lib/companyLabel";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChartPanel, type PanelRow } from "../ChartPanel";
import { ChartCards } from "../ChartCards";
import { NO_BAR, barCount, detailPath, useAsOn, usePresetHistory, usePresetLeft, type BarFilter, type LeftMode, type ScreenAbout } from "../../../lib/presets";
import { Link, useNavigate } from "react-router";
import { ApiError, apiGet } from "../../../lib/api";
import { pulseSay, pulseWord } from "../../../lib/pulseWords";
import { Icon } from "../../../lib/icons";
import { cr, dateIN, nf, MINUS } from "../../../lib/format";
import { useUI } from "../../../lib/ui";
import { useWatchlist, watch } from "../../../lib/watchlist";
import { trendWord } from "../../../lib/scoreScreen";
import { HScroll } from "../../HScroll";
import {
  DISCLAIMER, PAGE_SIZE, PLAN_OF, asPct, nextSortState, pageRange, rowsForTheme, sortPresetRows, usePresetDetail,
  type ColFormat, type PresetColumn, type PresetDetail, type PresetRow, type SortState, type Theme,
} from "../../../lib/presets";
import type { PresetRoute } from "./usePresetRoute";
import "../../../styles/presets.css";
import "../../../styles/advfx.css";   // task #258: the Advanced screen header fix (.psx3-hfix) and the header-row filters
import { CoLogo } from "../../CoLogo";
import { INFO, INFO_ASON_GAINERS, INFO_BAND_LIST, INFO_BAND_SCREEN, INFO_BAND_SECTOR, PsxInfo } from "./PsxInfo";
import { isFeatured, Shine } from "./ScreensStrip";
import { DateBar, Dropdown, ExpandLayer, FilterChips, FilterMenus, IndustryBoard, LeftDrop, Opt, SelectionBar, day } from "./ScreenParts";

/** What Top gainers says while fewer than two closes are stored (task #64, D-2: the handover's words). */
export const GAINERS_EMPTY = "No company has joined a list since FinLit began storing lists on 11 Nov 2026. Top gainers fills in from the next close.";

const STATE_WORD: Record<Theme["state"], string> = { in_play: "In play", emerging: "Emerging", fading: "Losing steam", closest: "Closest to qualifying" };   // task #258: no old Pulse word on the page
const signed = (v: number, d = 1) => (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), d);
const BADGE_TONE: Record<string, string> = { "prism-confirmed": "good", provisional: "warn", "loss-making": "warn", "closest to qualifying": "info", "trend not confirmed": "warn", "not rated by prism": "plain" };
export const Badge = ({ text }: { text: string }) => <span className={"psx-b psx-b-" + (BADGE_TONE[text.trim().toLowerCase()] ?? "plain")}>{text}</span>;

/** One table cell in its column's format. A missing value is a dash. */
export function CellValue({ v, f, k }: { v: unknown; f: ColFormat; k?: string }) {
  if (v == null || v === "") return <span className="psx-dash" aria-label="not available" title="not available">{MINUS}</span>;
  if (f === "badge") return <>{(Array.isArray(v) ? v : [v]).map((b) => <Badge key={String(b)} text={String(b)} />)}</>;
  if (f === "date" && typeof v === "string") return <>{day(v)}</>;
  if (typeof v !== "number") return <>{String(v)}</>;
  if (f === "since") return <>{signed(v)}%</>;
  if (f === "pct") return <>{signed(v)}%</>;
  /* A distance below a high is stored as a positive number; it is shown as a minus (the price is that far down). Zero stays 0.0%. */
  if (f === "pct_down") return <>{v === 0 ? "" : MINUS}{nf(Math.abs(v), 1)}%</>;
  if (f === "num1") return <>{v < 0 ? MINUS : ""}{nf(Math.abs(v), 1)}</>;
  if (f === "score") return <ScorePill v={v} signed={!!k && /_(st|lt)_score$/.test(k)} />;
  if (f === "cr") return <>{cr(v)}</>;
  return <>{String(v)}</>;
}

/** A score as a High, Middle or Low pill: 78 and above High (green), 45 up to 78 Middle (amber), under 45 Low (red), with a 3 px bar for its level (pack P5.5).
 *  A technical view runs from -100 to +100: +20 or more High, -20 or less Low. */
export function ScorePill({ v, signed: sg = false }: { v: number; signed?: boolean }) {
  const cls = sg ? (v >= 20 ? "hi" : v <= -20 ? "lo" : "mid") : v >= 78 ? "hi" : v >= 45 ? "mid" : "lo";
  const level = sg ? (v + 100) / 2 : v;
  return <span className={"sc " + cls} title={cls === "hi" ? "High" : cls === "mid" ? "Middle" : "Low"}>{v < 0 ? MINUS : sg && v > 0 ? "+" : ""}{nf(Math.abs(Math.round(v)), 0)}
    {!sg && <i className="psx3-lvl" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, level))}%` }} /></i>}</span>;
}

/** A technical pillar (pack P5.5, v3): ▲ ► ▼ with the number, then the site's word for it (Strong uptrend, Uptrend, Sideways, Downtrend, Strong downtrend). */
export function TechPill({ v }: { v: number }) {
  const cls = v >= 20 ? "hi" : v <= -20 ? "lo" : "mid", arrow = v >= 20 ? "▲" : v <= -20 ? "▼" : "►";
  return <span className={"psx3-tp " + cls}><span className="psx3-tpn"><span aria-hidden="true">{arrow}</span> {v < 0 ? MINUS : v > 0 ? "+" : ""}{nf(Math.abs(Math.round(v)), 0)}</span><small>{trendWord(v)}</small></span>;
}

const alignOf = (c: PresetColumn) => c.align ?? (c.format === "text" || c.format === "label" || c.format === "badge" ? "left" : "right");

function ThemeCards({ themes, on, onPick }: { themes: Theme[]; on: string | null; onPick: (industry: string) => void }) {
  return (
    <div className="psx-themes" role="group" aria-label="Themes. Choose one to show only its leaders.">
      {themes.map((t) => {
        const breadth = asPct(t.breadth), market = asPct(t.marketBreadth ?? null), pressed = on === t.industry;
        return (
          <button key={t.industry} type="button" className={"psx-th" + (pressed ? " is-on" : "")} aria-pressed={pressed} onClick={() => onPick(t.industry)}>
            <span className="psx-thh"><b>{t.industry}</b><span className={"psx-st psx-st-" + t.state}>{STATE_WORD[t.state] ?? t.state}</span></span>
            <span className="psx-thm">
              <span title="Share of the sector's companies within 15% of their 52-week high"><small>Near the high</small><b>{breadth == null ? MINUS : nf(breadth, 0) + "%"}</b>{market != null && <small>market {nf(market, 0)}%</small>}</span>
              <span title="3-month return of the sector against the market, in percentage points"><small>3M vs market</small><b>{t.rs3 == null ? MINUS : signed(t.rs3) + " pts"}</b></span>
              <span><small>Members</small><b>{t.members == null ? MINUS : nf(t.members, 0)}</b></span>
            </span>
            {t.reason && <span className="psx-thr">{t.reason}</span>}
          </button>);
      })}
    </div>);
}

// ---------- the table (pack P5) ----------
const HIDDEN = new Set(["symbol", "name", "stock", "badges", "rank", "position", "sector", "ret_1d"]);   // shown inside the Company and Price cells, not as columns of their own
const sizeOf = (r: PresetRow) => { const m = r.market_cap; return typeof m !== "number" ? null : m > 50000 ? "Large" : m >= 10000 ? "Mid" : "Small"; };
type Group = "price" | "score" | "returns" | "list" | "after" | "sector" | "screen";
const groupOf = (c: PresetColumn): Group => {
  const b = (c.band ?? "").toLowerCase();
  return b.startsWith("price") ? "price" : b === "finlit prism" || b === "finlit iq" || b === "technical views" || b === "technical" ? "score" : b === "returns" ? "returns"
    : b === "on this list" ? "list" : b === "after this list" ? "after" : b === "sector reading" ? "sector" : "screen";
};
type Kind = "score" | "fund" | "tech";
const kindOf = (c: PresetColumn): Kind | null => groupOf(c) !== "score" ? null : c.key === "prism_final" || c.key === "overall" ? "score" : /_(st|lt)_score$|^pillar_technical$/.test(c.key) ? "tech" : "fund";
const TECH_KEYS = /_(st|lt)_score$/;
const runs = <T,>(xs: T[], key: (x: T) => string) => xs.reduce<{ k: string; n: number }[]>((acc, x) => { const k = key(x); if (acc.length && acc[acc.length - 1].k === k) acc[acc.length - 1].n++; else acc.push({ k, n: 1 }); return acc; }, []);

/** `sector`: the Sector reading band (task #243 round 3b, Advanced only): off by default, on when a Sectors screen opens. */
export type ColsOn = { cap: boolean; fund: boolean; tech: boolean; returns: boolean; latest: boolean; sector?: boolean };
export const COLS_DEFAULT: ColsOn = { cap: true, fund: true, tech: true, returns: false, latest: false, sector: false };

/** The columns shown (pack P4.5): the screen's columns less those switched off; the Returns group and Latest price only when switched on. */
export function shownColumns(cols: PresetColumn[], on: ColsOn, past: boolean): PresetColumn[] {
  const out = cols.filter((c) => !HIDDEN.has(c.key)).filter((c) => {
    if (c.key === "market_cap") return on.cap;
    const k = kindOf(c);
    if (k === "fund") return on.fund;
    if (k === "tech") return on.tech;
    if (groupOf(c) === "returns") return on.returns;
    if (groupOf(c) === "sector") return !!on.sector;
    return true;
  });
  if (past && on.latest && !out.some((c) => c.key === "price_latest")) {
    const at = out.findIndex((c) => c.key === "since_then_pct");
    out.splice(at < 0 ? out.length : at + 1, 0, { key: "price_latest", label: "Latest price", format: "num2", align: "right", band: "After this list" });
  }
  return out;
}

/** Group heading words, each naming its date (pack P5, L1). */
function groupLabel(g: Group, basic: boolean, onDay: string, latest: string, sectorDay = ""): string {
  switch (g) {
    case "price": return `Price · ${onDay}`;
    case "score": return `${basic ? "FinLit IQ" : "FinLit Prism"} · ${onDay}`;
    case "returns": return `Returns · ${onDay}`;
    case "list": return `On this list · as on ${onDay}`;
    case "after": return `After this list · to ${latest}`;
    case "sector": return sectorDay ? `Sector reading · ${sectorDay}` : "Sector reading";
    default: return "This screen";
  }
}
const kindLabel = (k: Kind, n: number) => (k === "score" ? "Score" : k === "fund" ? `${n} fundamental ${n === 1 ? "pillar" : "pillars"}` : n === 1 ? "Technical pillar" : `${n} technical pillars`);

/** Every column with no figure on this date (pack P5.2, L4, L10): the heading says NOT SAVED, the cells are hatched, the notes line says so once. */
export const emptyColumns = (cols: PresetColumn[], rows: PresetRow[]) => (rows.length ? cols.filter((c) => !["added_on", "since_added_pct", "since_then_pct", "price_latest"].includes(c.key) && rows.every((r) => r[c.key] == null || r[c.key] === "")).map((c) => c.key) : []);

type TableProps = { d: PresetDetail; cols: PresetColumn[]; rows: PresetRow[]; sort: SortState; setSort: (k: string, first: 1 | -1) => void; basic: boolean; onDay: string; latest: string;
  picked: string[]; setPicked: (f: (p: string[]) => string[]) => void; openChart: (r: PresetRow) => void; chartOn?: string | null; first: number; newDay: string | null; empty: Set<string> };

function Table({ d, cols, rows, sort, setSort, basic, onDay, latest, picked, setPicked, openChart, chartOn, first, newDay, empty }: TableProps) {
  const syms = rows.map((r) => r.symbol), allOn = syms.length > 0 && syms.every((x) => picked.includes(x)), someOn = !allOn && syms.some((x) => picked.includes(x));
  const groups = runs(cols, (c) => groupOf(c)), kinds = runs(cols, (c) => (groupOf(c) === "score" ? kindOf(c)! : "x" + groupOf(c)));
  const head = (key: string, label: string, align: string, firstDir: 1 | -1 = -1, cls = "", extra?: ReactNode) => {
    const on = sort?.key === key;
    return (
      <th scope="col" className={"psx-a-" + align + (cls ? " " + cls : "")} aria-sort={on ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => setSort(key, firstDir)} aria-label={`Sort by ${label}`}>{label} <span aria-hidden="true" className="psx3-ar">{on ? (sort!.dir > 0 ? "▲" : "▼") : "↕"}</span></button>
        {INFO[key] && <PsxInfo text={INFO[key]} label={label} />}{extra}</th>);
  };
  const cell = (r: PresetRow, c: PresetColumn) => {
    const v = r[c.key], hatch = empty.has(c.key) ? " psx3-hatch" : "";
    if (c.key === "price") return <td key={c.key} className={"psx-a-right" + hatch}><b>{typeof r.price === "number" ? nf(r.price, 2) : MINUS}</b>{typeof r.ret_1d === "number" && <small className={"psx-chg " + (r.ret_1d >= 0 ? "up" : "dn")}>{signed(r.ret_1d)}%</small>}</td>;
    if (TECH_KEYS.test(c.key) || c.key === "pillar_technical") return <td key={c.key} className={"psx-a-left" + hatch}>{typeof v === "number" ? (TECH_KEYS.test(c.key) ? <TechPill v={v} /> : <ScorePill v={v} />) : <CellValue v={v} f={c.format} />}</td>;
    if (c.format === "pct" || c.format === "since") {
      const bench = c.key === "since_added_pct" ? r.bench_since_added_pct : c.key === "since_then_pct" ? r.bench_since_then_pct : null;
      const from = c.key === "since_added_pct" ? [r.price_added, r.added_on, r.price_on, d.list?.date ?? null] : c.key === "since_then_pct" ? [r.price_on, d.list?.date ?? null, r.price_latest, d.list?.latest ?? null] : null;
      const sum = from && typeof from[0] === "number" && typeof from[2] === "number" ? `₹${nf(from[0] as number, 2)} on ${day(from[1] as string)} → ₹${nf(from[2] as number, 2)} on ${day(from[3] as string)}` : undefined;
      return <td key={c.key} className={"psx-a-right" + hatch} title={sum}>{typeof v === "number" ? <span className={"psx3-ret " + (v > 0.05 ? "up" : v < -0.05 ? "dn" : "flat")}>{signed(v)}%</span> : <CellValue v={v} f={c.format} />}
        {typeof bench === "number" && <small className="psx-bench">NIFTY 500 {signed(bench)}%</small>}</td>;
    }
    if (c.key === "sr_industry" && typeof v === "string") return <td key={c.key} className="psx-a-left psx3-sr"><b>{v}</b>
      {typeof r.sr_rank === "number" && <small>rank {nf(r.sr_rank, 0)}{typeof r.sr_ranked === "number" ? ` of ${nf(r.sr_ranked, 0)}` : ""}{typeof r.sr_rank_4w === "number" && r.sr_rank_4w !== 0 ? ` · ${r.sr_rank_4w > 0 ? "▲" : "▼"}${nf(Math.abs(r.sr_rank_4w), 0)} in 4 wk` : ""}</small>}</td>;
    if (c.key === "sr_rotation" && typeof v === "string") return <td key={c.key} className="psx-a-left psx3-sr"><span className={"psx3-rot is-" + String(r.sr_corner ?? "")}>{v.split(" · ")[0]}</span>{v.includes(" · ") && <small>{v.split(" · ")[1]} in it</small>}</td>;
    if (c.key === "sr_pulse" && typeof v === "string") return <td key={c.key} className="psx-a-left psx3-sr"><span className={"psx3-pls is-" + String(r.sr_pulse_code ?? "")} title={pulseSay(r.sr_pulse_code as string) ?? undefined}>{pulseWord(r.sr_pulse_code as string, v)}</span>
      <small>{[typeof r.sr_above50 === "number" ? `${nf(r.sr_above50, 0)}% above 50-day` : null, typeof r.sr_rebound === "string" ? `last broad bounce ${r.sr_rebound}` : null].filter(Boolean).join(" · ")}</small></td>;
    if (c.key === "sr_peer" && typeof v === "string") return <td key={c.key} className="psx-a-left"><span className={"psx3-peer is-" + v.toLowerCase().replace(/\s+/g, "-")}>{v}</span></td>;
    if (c.key === "sr_tailwinds" && typeof v === "number") return <td key={c.key} className="psx-a-right"><span className={"psx3-twn is-" + Math.round(v)} title={`${nf(v, 0)} of the 4 facts line up`}>{nf(v, 0)}<small> of 4</small></span></td>;
    if (c.key === "added_on") return <td key={c.key} className="psx-a-left">{typeof v === "string" ? day(v) : <CellValue v={v} f="text" />}{r.added_baseline === true && <small className="psx3-sub">first saved list</small>}</td>;
    return <td key={c.key} className={"psx-a-" + alignOf(c) + hatch}><CellValue v={v} f={c.format} k={c.key} /></td>;
  };
  return (
    <table className={"scr-t psx-t psx3-t" + (basic ? "" : " psx3-hfix")}>
      <caption className="sr">{d.name}: {rows.length} {rows.length === 1 ? "company" : "companies"} shown{first ? `, from number ${first + 1}` : ""}. Select a column heading to sort the shown rows.</caption>
      <thead>
        <tr className="psx3-g">
          <th scope="colgroup" colSpan={3} className="psx3-stk psx3-gc">Company</th>
          {groups.map((g, i) => <th key={g.k + i} scope="colgroup" colSpan={g.n} className={"psx3-g-" + g.k}>{groupLabel(g.k as Group, basic, onDay, latest, day(d.dataDates?.sectors ?? null))}
            {g.k === "list" && <PsxInfo text={INFO_BAND_LIST} label="On this list" />}{g.k === "sector" && <PsxInfo text={INFO_BAND_SECTOR} label="Sector reading" />}{g.k === "screen" && <PsxInfo text={INFO_BAND_SCREEN} label="This screen" />}</th>)}
          <th scope="colgroup" aria-label="Chart and report" /></tr>
        <tr className="psx3-k">
          <th colSpan={3} className="psx3-stk" aria-hidden="true" />
          {kinds.map((k, i) => k.k.startsWith("x") ? <th key={i} colSpan={k.n} aria-hidden="true" /> : <th key={i} colSpan={k.n} scope="colgroup" className={"psx3-k-" + k.k}>{kindLabel(k.k as Kind, k.n)}</th>)}
          <th aria-hidden="true" /></tr>
        <tr className="psx3-c">
          <th scope="col" className="psx3-stk psx-sel"><input type="checkbox" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn; }}
            onChange={() => setPicked((p) => (allOn ? p.filter((x) => !syms.includes(x)) : [...new Set([...p, ...syms])]))} aria-label="Select all companies on this page" /></th>
          {head("position", "#", "right", 1, "psx3-stk psx-n")}
          {head("symbol", "Company", "left", 1, "psx3-stk psx3-co psx-stock")}
          {cols.map((c) => <Fragment key={c.key}>{head(c.key, c.label, TECH_KEYS.test(c.key) ? "left" : alignOf(c), c.format === "text" || c.format === "label" || c.format === "date" ? 1 : -1,
            "psx3-c-" + groupOf(c) + (kindOf(c) === "tech" ? " psx3-c-tech" : ""), empty.has(c.key) ? <span className="psx3-ns">Not saved</span> : null)}</Fragment>)}
          <th scope="col" className="psx-a-left">Chart</th></tr>
      </thead>
      <tbody>{rows.map((r, i) => {
        const top = r.top === true, isNew = !!newDay && r.added_on === newDay && !r.added_baseline;
        return (
          <tr key={r.symbol} className={(chartOn === r.symbol ? "cp-row" : "") + (picked.includes(r.symbol) ? " is-picked" : "") + (top ? " is-top" : "")}
            onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,input,select")) openChart(r); }}>
            <td className="psx3-stk psx-sel"><input type="checkbox" checked={picked.includes(r.symbol)} onChange={() => setPicked((p) => (p.includes(r.symbol) ? p.filter((y) => y !== r.symbol) : [...p, r.symbol]))} aria-label={`Select ${r.symbol}`} /></td>
            <td className="psx3-stk psx-n">{top ? <b className="psx-gold"><Shine size={12} /> {typeof r.rank === "number" ? r.rank : first + i + 1}</b> : (typeof r.rank === "number" ? r.rank : first + i + 1)}</td>
            <td className="psx3-stk psx3-co psx-stock"><Link to={`/stocks/${encodeURIComponent(r.symbol)}`} className="psx-co"><CoLogo symbol={r.symbol} name={r.name} size={24} />
              <span className="psx-cn"><span className="psx3-cl"><b title={codeNote(r)}>{titleOf(r)}</b>{isNew && <span className="psx3-tag new">New</span>}{(r.badges ?? []).some((b) => b.toLowerCase() === "provisional") && <span className="psx3-tag prov">Provisional</span>}
                {(r.badges ?? []).filter((b) => b.toLowerCase() !== "provisional").map((b) => <Badge key={b} text={b} />)}</span>
                <small>{[subOf(r), sizeOf(r) && `${sizeOf(r)} cap`, exchangeTag(r)].filter(Boolean).join(" · ")}</small></span></Link></td>
            {cols.map((c) => cell(r, c))}
            <td className="psx-a-left psx-act"><button type="button" className="psx-ci" aria-label={`Open the ${r.symbol} chart`} onClick={() => openChart(r)}><Icon name="line" /></button>
              <Link to={`/stocks/${encodeURIComponent(r.symbol)}`} className="psx-ci" aria-label={`Open the ${r.symbol} report`}><Icon name="notes" /></Link></td>
          </tr>);
      })}</tbody>
    </table>);
}

/** Previous / next 25 (pack P7): "Showing 26–50 of 145", with "(of 150 on the list)" when filters narrow it. */
function Pager({ d, range, busy, goTo }: { d: PresetDetail; range: { from: number; to: number; of: number }; busy: boolean; goTo: (offset: number) => void }) {
  const size = d.pageSize ?? PAGE_SIZE, off = d.offset ?? 0, avail = d.available ?? d.count;
  return (
    <nav className="psx-pager" aria-label="Pages of this screen">
      <p className="psx-pg-t" role="status" aria-live="polite">Showing <b>{nf(range.from, 0)}{"–"}{nf(range.to, 0)}</b> of <b>{nf(avail, 0)}</b>{avail !== d.count && <small> (of {nf(d.count, 0)} on the list)</small>}</p>
      <div className="psx-pg-b">
        <button type="button" className="btn" disabled={off <= 0 || busy} onClick={() => goTo(off - size)}>Previous {size}</button>
        <button type="button" className="btn" disabled={!d.hasMore || busy} onClick={() => goTo(off + size)}>Next {size}</button>
      </div>
    </nav>);
}

function Misses({ d }: { d: PresetDetail }) {
  const list = (d.closestMisses ?? []).slice(0, 5);
  return (
    <div className="psx-empty">
      <p className="psx-eh" role="status">{d.emptyText || "No company meets every rule today."}</p>
      {list.length > 0 && <>
        <h3>The {list.length === 1 ? "company" : `${list.length} companies`} closest to qualifying</h3>
        <ol className="psx-miss">{list.map((m) => (
          <li key={m.symbol}><span className="psx-mh"><Link to={`/stocks/${encodeURIComponent(m.symbol)}`}><b title={codeNote(m)}>{titleOf(m)}</b></Link>{subOf(m) && <small>{subOf(m)}</small>}{exchangeTag(m) && <small className="psx-ex">{exchangeTag(m)}</small>}</span>
            <span className="psx-mr">{m.failed.length > 1 ? "Rules missed" : "Rule missed"}: {m.failed.join("; ")}</span></li>))}
        </ol></>}
    </div>);
}

/** P2: the header. The eyebrow names the page and the group; a screen in a featured group has the shining crown before its name. */
function Frame({ route, name, cardText, children, how }: { route: PresetRoute; name: string; cardText?: string; children: ReactNode; how?: string[] }) {
  const group = route.groups.find((g) => g.presets.some((p) => p.id === route.id));
  const eyebrow = `${route.tab === "basic" ? "Basic" : "Advanced"} · ${group?.name ?? "Prebuilt screen"}`;
  const [open, setOpen] = useState(false);
  const card = group?.presets.find((p) => p.id === route.id);
  return (
    <section className="psx-screen card" aria-label={`Prebuilt screen: ${name}`}>
      <header className="psx-top psx3-top">
        <div className="psx-tt"><span className="psx-eyebrow">{eyebrow}{card?.isNew && <span className="psx3-new">NEW</span>}</span>
          <h2>{group && isFeatured(group) && <Shine size={26} />}{name}{card?.about && <PsxInfo label={name} text={<AboutNote a={card.about} />} />}</h2>
          {cardText && <p className="psx-card-text">{cardText}</p>}</div>
        <div className="psx-act">{!!how?.length && <button type="button" className="btn" aria-expanded={open} aria-controls="psx3-how" onClick={() => setOpen((v) => !v)}>How this screen works ▾</button>}
          <button type="button" className="btn" onClick={route.clear}>Clear screen ✕</button></div>
      </header>
      {open && !!how?.length && <div id="psx3-how" className="psx-how psx3-how"><ul>{how.map((h) => <li key={h}>{h}</li>)}</ul></div>}
      {children}
    </section>);
}
/** Task #243 (pack v4, i notes): what a new screen shows, then three points on how to use it. Spans only: it sits inside the heading's popover. */
export function AboutNote({ a }: { a: ScreenAbout }) {
  return (
    <span className="psx3-about">
      <b>What it shows</b><span>{a.shows}</span>
      <b>How to use it</b>
      <span role="list">{a.use.map((u) => <span role="listitem" key={u}>{u}</span>)}</span>
    </span>);
}
const Disclaimer = ({ text }: { text?: string }) => <p className="psx-disc" role="note">{text || DISCLAIMER}</p>;

/** The screen named in the address. `route` is the shared route state (list, chips, choose, clear). */
export function ScreenView({ route }: { route: PresetRoute }) {
  const { id, preset, chips, list } = route;
  const { upgrade, has, toast } = useUI();
  const nav = useNavigate();
  useWatchlist();
  const plan = PLAN_OF[route.tab], planName = plan === "gold" ? "Gold" : "Silver", basic = route.tab === "basic";
  const listReady = list.isSuccess || list.isError;
  const unknown = list.isSuccess && !preset;
  const blocked = preset?.status === "blocked", lockedList = !!preset?.locked;
  const pageKey = `${id}|${[...chips].sort().join(",")}`;
  const [pg, setPg] = useState({ key: "", offset: 0 });
  const offset = pg.key === pageKey ? pg.offset : 0;                      // a new screen or a new option starts at the first 25
  const [asOn, setAsOnDay] = useAsOn();
  const [bar, setBarState] = useState<BarFilter>(NO_BAR);
  const [picked, setPicked] = useState<string[]>([]);
  const [sort, setSortState] = useState<SortState>(null);
  const groupId = route.groups.find((g) => g.presets.some((p) => p.id === id))?.id ?? null;
  const [cols, setCols] = useState<ColsOn>({ ...COLS_DEFAULT, sector: groupId === "sectors" }), [view, setView] = useState<"table" | "charts">("table"), [cards, setCards] = useState(9);
  const [expand, setExpand] = useState(false), [leftMode, setLeftMode] = useState<LeftMode>("on");
  const [theme, setTheme] = useState<string | null>(null);
  const [chart, setChart] = useState<PanelRow | null>(null);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { setCols((c) => ({ ...c, sector: groupId === "sectors" })); setBarState((b) => (b.ind ? { ...b, ind: null } : b)); }, [id, groupId]);   // a Sectors screen opens with the Sector reading on
  const enabled = listReady && !unknown && !blocked && !lockedList;
  const q = usePresetDetail(id, chips, enabled, offset, asOn, bar);
  const hist = usePresetHistory(id, chips, enabled && preset?.kind !== "themes");
  const gainers = preset?.kind === "gainers";
  const leftQ = usePresetLeft(id, chips, enabled && preset?.kind !== "themes" && !gainers, asOn, leftMode);
  const d = q.data, err = q.error;
  const resetPage = () => setPg({ key: pageKey, offset: 0 });
  const setBar = (b: BarFilter) => { setBarState(b); resetPage(); };
  const setAsOn = (x: string | null) => { setAsOnDay(x); setPicked([]); resetPage(); };          // P3.6: the whole screen changes with the date; the selection is cleared
  const setSort = (k: string, first: 1 | -1) => setSortState((s) => nextSortState(s, k, first));
  const goTo = (o: number) => { setPg({ key: pageKey, offset: Math.max(0, o) }); window.setTimeout(() => top.current?.scrollIntoView?.({ block: "start" }), 0); };
  const themes = d?.themes ?? [];
  const activeTheme = themes.find((t) => t.industry === theme) ?? null;
  const past = !!d?.list && d.list.date !== d.list.latest;
  const allCols = useMemo(() => (d?.columns ?? []).filter((c) => !["symbol", "name", "stock", "badges", "rank", "position"].includes(c.key)), [d]);
  const banded = allCols.some((c) => c.band);       // every list of both pages has the bands; Top gainers and the theme view keep their own layout
  const shown = useMemo(() => (banded ? shownColumns(allCols, cols, past) : allCols.filter((c) => !HIDDEN.has(c.key))), [allCols, cols, past, banded]);
  const rows = useMemo(() => sortPresetRows(rowsForTheme(d?.rows ?? [], activeTheme), sort), [d, activeTheme, sort]);
  const empty = useMemo(() => new Set(emptyColumns(shown, rows)), [shown, rows]);
  const name = d?.name ?? preset?.name ?? "";                   // L13: never the raw screen id while loading
  const openRow = useCallback((r: PresetRow): PanelRow => ({ symbol: r.symbol, name: r.name, sector: r.sector as string | undefined, price: r.price as number | undefined, facts: r.facts as PanelRow["facts"], draw: r.draw as PanelRow["draw"], screen: d?.id }), [d]);
  const step = (dir: 1 | -1) => { const i = rows.findIndex((r) => r.symbol === chart?.symbol), n = rows[i + dir]; if (i >= 0 && n) setChart(openRow(n)); };
  const maxCompare = has("gold") ? 4 : 2;
  const addPicked = () => {
    if (!has("silver")) { upgrade("silver", "Watchlists come with the Silver plan."); return; }
    const fresh = picked.filter((x) => !watch.has(x)); fresh.forEach((x) => watch.add(x));
    toast(fresh.length ? `${fresh.length} ${fresh.length === 1 ? "company" : "companies"} added to your watchlist.` : "These companies are already on your watchlist.");
  };
  // P10: every row that passes the filters, every column, on one page
  const fullQ = useQuery<PresetDetail, ApiError>({ queryKey: ["preset-full", id, [...chips].sort().join(","), asOn, JSON.stringify(bar)], enabled: expand && !!id,
    queryFn: () => apiGet<PresetDetail>(detailPath(id!, chips, 0, 2000, asOn, bar)) });

  if (unknown) return (
    <section className="psx-screen card" aria-label="Prebuilt screen not found"><div className="psx-state"><h2>We could not find that screen</h2><p>There is no prebuilt screen called “{id}”. It may have been renamed or removed. Pick one from the list, or go back to the filters.</p>
      <button type="button" className="btn primary" onClick={route.clear}>Clear screen ✕</button></div></section>);
  if (preset && blocked) return (
    <Frame route={route} name={preset.name} cardText={preset.cardText}><div className="psx-state"><h2>Coming soon</h2><p>{preset.blockedReason || "Coming soon: this screen needs data we do not hold yet."}</p></div><Disclaimer /></Frame>);
  if (lockedList || (err instanceof ApiError && err.status === 403)) return (
    <Frame route={route} name={name} cardText={preset?.cardText}><div className="psx-state psx-lock"><h2><Icon name="lock" /> This screen is part of {planName}</h2><p>{preset?.cardText ?? "Prebuilt screens narrow the whole market with ready-made rules."} Upgrade to see which companies pass.</p>
      <button type="button" className="btn primary" onClick={() => upgrade(plan, `Prebuilt screens on this page are part of ${planName}.`)}>Unlock with {planName} <Icon name="arrow" /></button></div><Disclaimer /></Frame>);
  if (err instanceof ApiError && err.status === 404 && err.body.status === "no_history") return (
    <Frame route={route} name={name} cardText={preset?.cardText}>
      <div className="psx-state" role="status"><h2>{asOn ? "Nothing is stored for that day" : gainers ? "No company has joined a list yet" : "No list is stored yet"}</h2>
        <p>{gainers ? (asOn ? `No Top gainers are stored for the close of ${day(asOn)}. Pick another date, or go back to the latest close.` : GAINERS_EMPTY)
          : `This screen has no stored list for ${asOn ? day(asOn) : "that day"}. Lists have been stored since 11 Nov 2026.`}</p>
        {asOn && <button type="button" className="btn" onClick={() => setAsOn(null)}>Back to the latest list</button>}
        <button type="button" className="fgx-link" onClick={route.clear}>Back to the screens</button></div><Disclaimer /></Frame>);
  if (err instanceof ApiError && err.status === 404) return (
    <section className="psx-screen card" aria-label="Prebuilt screen not found"><div className="psx-state"><h2>We could not find that screen</h2><p>There is no prebuilt screen called “{id}”. Pick one from the list, or go back to the filters.</p>
      <button type="button" className="btn primary" onClick={route.clear}>Clear screen ✕</button></div></section>);
  if (err && !d) return (
    <Frame route={route} name={name} cardText={preset?.cardText}><div className="psx-state" role="alert"><h2>This screen is unavailable right now</h2><p>Please try again in a moment.</p>
      <button type="button" className="btn" onClick={() => q.refetch()}>Try again</button></div><Disclaimer /></Frame>);

  const paged = !!d && d.pageSize != null && (d.available ?? d.count) > d.pageSize;
  const range = d ? pageRange(d) : null;
  const how = d?.howItWorks?.length ? d.howItWorks : preset?.howItWorks ?? [];
  const onDay = day(d?.list?.date ?? d?.asOn ?? d?.asOf ?? null), latestDay = day(d?.list?.latest ?? null);
  const newDay = d?.list?.prev ? d.list.date : null;
  const sessions = hist.data?.sessions ?? [];
  const emptyNames = shown.filter((c) => empty.has(c.key)).map((c) => c.label);
  const fullCols = shownColumns(allCols, { cap: true, fund: true, tech: true, returns: true, latest: past, sector: !basic }, past);
  const dates = d?.dataDates, sectorsScreen = groupId === "sectors";
  const nOn = barCount(bar);
  const tableProps = { d: d!, sort, setSort, basic, onDay, latest: latestDay, picked, setPicked, openChart: (r: PresetRow) => setChart(openRow(r)), chartOn: chart?.symbol, newDay, empty } as const;
  return (
    <Frame route={route} name={name} cardText={d?.cardText ?? preset?.cardText} how={how}>
      {!gainers && sessions.length > 0 && <DateBar sessions={sessions} asOn={asOn} setAsOn={setAsOn} list={d?.list ?? null} />}
      {(gainers || sessions.length === 0) && (d || preset) && (      /* no saved list to pick from yet: the screen's own count and date */
        <p className="psx-meta">{d ? <><b>{d.topCount ? `${nf(d.count, 0)} pass · the top ${d.topCount} first` : d.listText || `${nf(d.count, 0)} match`}</b>
          {!d.listText && !d.topCount && !paged && d.shown !== d.count && <span>showing {nf(d.shown, 0)}</span>}{d.asOf && <span>as of {dateIN(d.asOf)}</span>}</>
          : preset?.count != null ? <><b>{preset.listText || `${nf(preset.count, 0)} match`}</b>{preset.asOf && <span>as of {dateIN(preset.asOf)}</span>}</> : null}</p>)}
      {gainers && (hist.data?.sessions?.length ?? 0) > 0 && <p className="psx-notes"><PsxInfo text={INFO_ASON_GAINERS} label="As on" /> Top gainers as they stood after the {onDay} close.</p>}
      {!!preset?.chips.length && (
        <div className="psx-chips" role="group" aria-label="Screen options">
          {preset.chips.map((c) => {
            const on = chips.includes(c.id), did = `psx-cd-${c.id}`;
            return (
              <div key={c.id} className="psx-chipw">
                <button type="button" className={"fgx-chip psx-chip" + (on ? " is-on" : "")} aria-pressed={on} aria-describedby={did} title={c.description || undefined} onClick={() => route.toggleChip(c.id)}>{on && <i aria-hidden="true">&#10003;</i>}{c.label}</button>
                {c.description && <small id={did}>{c.description}</small>}
              </div>);
          })}
        </div>)}
      {d && (banded || d.facets) && (
        <div className="psx3-tools" role="toolbar" aria-label="Filter and view this screen">
          <input className="psx3-q" type="search" value={bar.q} onChange={(e) => setBar({ ...bar, q: e.target.value })} placeholder="Search company or sector" aria-label="Search this screen" />
          <FilterMenus d={d} f={{ bar, set: setBar }} basic={basic} onAddRule={route.clear} />
          {banded && <span className="psx3-tr">
            <button type="button" className="psx3-ddb" onClick={() => setExpand(true)}><Icon name="expand" /> Expand table</button>
            <Dropdown label="Columns" on={false}>
              <Opt checked={cols.cap} onChange={() => setCols({ ...cols, cap: !cols.cap })} label="Market cap" />
              <Opt checked={cols.fund} onChange={() => setCols({ ...cols, fund: !cols.fund })} label={basic ? "The FinLit IQ parts" : "4 fundamental pillars"} />
              <Opt checked={cols.tech} onChange={() => setCols({ ...cols, tech: !cols.tech })} label={basic ? "Technical pillar" : "2 technical pillars"} />
              <Opt checked={cols.returns} onChange={() => setCols({ ...cols, returns: !cols.returns })} label="Returns and 52-week high" desc="+4 columns" />
              {!basic && <Opt checked={!!cols.sector} onChange={() => setCols({ ...cols, sector: !cols.sector })} label="Sector reading" desc="+5 columns" />}
              {past && <Opt checked={cols.latest} onChange={() => setCols({ ...cols, latest: !cols.latest })} label={`Latest price (${latestDay})`} />}
            </Dropdown>
            <span className="psx3-seg2" role="group" aria-label="Table or charts"><button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button><button type="button" aria-pressed={view === "charts"} onClick={() => setView("charts")}>Charts</button></span>
          </span>}
        </div>)}
      {(banded || d?.facets) && <FilterChips f={{ bar, set: setBar }} basic={basic} />}
      {!basic && !!d?.industryBoard?.length && <IndustryBoard board={d.industryBoard} on={bar.ind?.slug ?? null}
        onPick={(c) => setBar({ ...bar, ind: !c.slug || bar.ind?.slug === c.slug ? null : { slug: c.slug, name: c.name } })} />}
      {sectorsScreen && dates && <p className="psx3-dates" role="note">Data as of: prices and scores {day(dates.prices)}{dates.setups ? ` · Setups and Chart patterns lists ${day(dates.setups)}` : ""}
        {dates.sectors ? ` · Sector Pulse ${day(dates.sectors)}` : " · Sector Pulse not loaded"}{dates.rotation ? ` · Sector Rotation ${day(dates.rotation)}` : ""}</p>}
      {(d?.heading || !!d?.notes?.length || emptyNames.length > 0 || (past && typeof d?.benchSincePct === "number")) && (
        <div className="psx-notes" role="note">
          {d?.heading && <p>{d.heading}</p>}
          {d?.notes?.map((n) => <p key={n}>{n}</p>)}
          {emptyNames.length > 0 && <p>Not saved for {onDay}: {emptyNames.join(", ")}. The columns stay; their cells are hatched.</p>}
          {past && typeof d?.benchSincePct === "number" && <p>Since the {onDay} list, NIFTY 500 has moved {signed(d.benchSincePct)}% to {latestDay}.</p>}
        </div>)}
      {themes.length > 0 && <ThemeCards themes={themes} on={theme} onPick={(i) => setTheme((t) => (t === i ? null : i))} />}
      <div ref={top} className={"psx-res" + (q.isFetching && d ? " is-busy" : "")} aria-busy={q.isFetching}>
        {!d ? <div className="skeleton" style={{ height: 300 }} role="status" aria-label={`Loading ${name || "the screen"}`} />
          : d.count === 0 || (!d.rows.length && !nOn) ? <Misses d={d} />
          : !rows.length ? <p className="psx-filt" role="status">No company on this list passes the filters that are on. <button type="button" className="fgx-link" onClick={() => setBar(NO_BAR)}>Clear all</button></p>
          : <>
            {activeTheme && <p className="psx-filt" role="status">Showing the leaders of {activeTheme.industry}. <button type="button" className="fgx-link" onClick={() => setTheme(null)}>Show all</button></p>}
            <p className="sr" role="status" aria-live="polite">{rows.length} {rows.length === 1 ? "company" : "companies"} shown.</p>
            {view === "charts" && banded ? <><ChartCards rows={rows.slice(0, cards).map((r) => ({ ...openRow(r), facts: r.facts as PanelRow["facts"] }))} onOpen={(r) => setChart(r)} />
              {rows.length > cards && <button type="button" className="btn" onClick={() => setCards((n) => n + 9)}>Show 9 more</button>}</>
              : <HScroll className="scr-tw psx3-tw" label="results table" tall controls={false}><Table {...tableProps} cols={shown} rows={rows} first={d.offset ?? 0} /></HScroll>}
            <SelectionBar n={picked.length} maxCompare={maxCompare} onCompare={() => nav(`/compare?c=${picked.join(",")}`)} onWatch={addPicked} onClear={() => setPicked([])} />
            {paged && range && <Pager d={d} range={range} busy={q.isFetching} goTo={goTo} />}
          </>}
      </div>
      {!gainers && preset?.kind !== "themes" && leftQ.data && <LeftDrop rows={leftQ.data.left ?? []} counts={leftQ.data.counts} asOn={asOn} latest={d?.list?.latest ?? null} first={leftQ.data.first} mode={leftMode} setMode={setLeftMode} />}
      {d?.rankScoreNote && !!d.rows.length && <p className="psx-notes" role="note">{d.rankScoreNote}</p>}
      <Disclaimer text={d?.disclaimer} />
      {expand && d && (
        <ExpandLayer title={name} crown={!!route.groups.find((g) => g.presets.some((p) => p.id === route.id) && isFeatured(g))} onClose={() => setExpand(false)}
          line={`${past ? onDay : `Latest · ${onDay}`} · ${nf(fullQ.data?.available ?? d.available ?? d.count, 0)} companies · every column${nOn ? ` · ${nOn} ${nOn === 1 ? "filter" : "filters"} on` : ""}`}>
          {!fullQ.data ? <div className="skeleton" style={{ height: 300 }} role="status" aria-label="Loading the full table" />
            : <Table {...tableProps} cols={fullCols} rows={sortPresetRows(fullQ.data.rows, sort)} first={0} />}
        </ExpandLayer>)}
      {chart && <ChartPanel key={chart.symbol} row={chart} onClose={() => setChart(null)} onStep={step} />}
    </Frame>);
}
