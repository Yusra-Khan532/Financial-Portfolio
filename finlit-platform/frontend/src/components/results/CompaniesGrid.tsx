// The Companies view's table (task #330, developer file 28, "The companies table", approved 23 Nov 2026). Four column sets (Key figures by default, Margins,
// Price position, All columns) under grouped headers in the site's band colours, a growth cell that carries the QoQ figure under the YoY one, a margin cell with its
// change on a year ago, the verdict with its three checks and the sales-and-profit flag, and a ▾ at the end of each row that opens its detailed view under it.
// Every figure is the server's row (GET /api/results/quarter); the server sorts the whole list. Describes results; never advice.
import { Fragment, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { SortTh } from "../SortTh";
import type { SortState } from "../../lib/tableSort";
import { CoLogo } from "../CoLogo";
import { Icon } from "../../lib/icons";
import { MINUS, nf } from "../../lib/format";
import { dayLabel } from "../../lib/feed";
import { PRICE_WORD, awaitingNote, bandOf, bandShort, gapAlertLink, priceWhy, signedPct, type PriceKey, type QRow } from "../../lib/qresults";
import { VerdictCell } from "./pack/ResultsPack";
import type { VRow } from "../../lib/resultsPack";

export type ColSet = "key" | "margins" | "price" | "all";
export const COL_SETS: [ColSet, string][] = [["key", "Key figures"], ["margins", "Margins"], ["price", "Price position"], ["all", "All columns"]];
type Band = "rev" | "op" | "np" | "px";
type ColKey = "co" | "date" | "mc" | "rev" | "revg" | "op" | "opg" | "opm" | "np" | "npg" | "npm" | "eps" | "px" | "b52" | "ath" | "v";
/** h: the heading (under its band, the short heading); sort: the server's sort key (none: not sortable); band: the group it sits under. */
const COLS: Record<ColKey, { h: string; sort?: string; band?: Band; right?: boolean }> = {
  co: { h: "Company", sort: "company" }, date: { h: "Declared", sort: "date" }, mc: { h: "Market value, ₹ Cr", sort: "marketCap", right: true },
  rev: { h: "₹ Cr", sort: "revenue", band: "rev", right: true }, revg: { h: "Growth, YoY", sort: "revenueYoY", band: "rev", right: true },
  op: { h: "₹ Cr", sort: "operatingProfit", band: "op", right: true }, opg: { h: "Growth, YoY", sort: "opYoY", band: "op", right: true }, opm: { h: "Margin", sort: "opm", band: "op", right: true },
  np: { h: "₹ Cr", sort: "netProfit", band: "np", right: true }, npg: { h: "Growth, YoY", sort: "profitYoY", band: "np", right: true }, npm: { h: "Margin", sort: "npm", band: "np", right: true },
  eps: { h: "EPS, ₹", sort: "eps", right: true },
  px: { h: "Price, ₹", band: "px", right: true }, b52: { h: "Below 52-week high", sort: "below52", band: "px", right: true }, ath: { h: "Below all-time high", sort: "belowAth", band: "px", right: true },
  v: { h: "Against its industry", sort: "verdict" },
};
export const SET_COLS: Record<ColSet, ColKey[]> = {
  key: ["co", "rev", "revg", "np", "npg", "npm", "v"],
  margins: ["co", "rev", "op", "opg", "opm", "np", "npm", "eps", "v"],
  price: ["co", "mc", "revg", "npg", "px", "b52", "ath", "v"],
  all: ["co", "date", "mc", "rev", "revg", "op", "opg", "opm", "np", "npg", "npm", "eps", "px", "b52", "ath", "v"],
};
const BAND: Record<Band, [string, string]> = { rev: ["Revenue", "blue"], op: ["Operating profit", "green"], np: ["Net profit", "gold"], px: ["Price position", "dark"] };
/** In the Price position set the growth columns sit alone, so their band names the measure. */
const LONE: Partial<Record<ColKey, string>> = { revg: "Revenue growth, YoY", npg: "Profit growth, YoY" };

const money = (v: number | null | undefined) => (v == null ? null : (v < 0 ? MINUS : "") + nf(Math.abs(v), Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2));
const tone = (v: number | null | undefined) => (v == null ? "" : v > 0 ? "sp-good" : v < 0 ? "sp-red" : "");
const Na = () => <span className="cx-na" aria-label="not available">–</span>;
const Num = ({ v }: { v: number | null | undefined }) => { const t = money(v); return t == null ? <Na /> : <>{t}</>; };
function Grow({ y, q }: { y: number | null | undefined; q: number | null | undefined }) {
  if (y == null && q == null) return <Na />;
  return <span className="cx-g"><b className={tone(y)}>{y == null ? "–" : signedPct(y)}</b><small>QoQ <i className={tone(q)}>{q == null ? "–" : signedPct(q)}</i></small></span>;
}
function Marg({ m, c }: { m: number | null | undefined; c?: number | null }) {
  if (m == null) return <Na />;
  return <span className="cx-g"><b>{(m < 0 ? MINUS : "") + nf(Math.abs(m), 1)}%</b>{c != null && <small><i className={tone(c)}>{c > 0 ? "▲ " : c < 0 ? "▼ " : ""}{nf(Math.abs(c), 1)} pts</i> YoY</small>}</span>;
}
/** Why a row has no figures: the short words in the cell, the full sentence on hover and in the row's detailed view. */
export function waitWords(r: QRow): { short: string; long: string } {
  if (r.status === "due") return { short: `Due ${dayLabel(r.date)}`, long: `Results due on ${dayLabel(r.date)}${r.confirmed ? "" : " (board-meeting date)"}.` };
  if (r.status === "missing") return { short: "Figures not stored", long: `Declared on ${dayLabel(r.date)}. This quarter's figures are no longer stored.` };
  if (r.awaitingWhy === "provider" || r.awaitingStage === "late") return { short: "Figures not published yet", long: awaitingNote(r) };
  return { short: "Report being updated", long: `Declared on ${dayLabel(r.date)}. Report is being updated. Figures appear here as soon as the company's report is refreshed.` };
}
function Company({ r, showDate }: { r: QRow; showDate: boolean }) {
  const bse = /^\d+$/.test(r.symbol), a = bse ? r.name : r.symbol, b = bse ? `BSE ${r.symbol}` : r.name;
  return (
    <Link to={`/stocks/${encodeURIComponent(r.symbol)}#quarter`} className="cx-co">
      <CoLogo symbol={r.symbol} name={r.name} size={26} />
      <span><b>{a}{r.cap && <span className="cx-sz">{r.cap}</span>}</b>
        <small>{b}{r.industry || r.sector ? ` · ${r.industry || r.sector}` : ""}{showDate ? ` · ${dayLabel(r.date)}` : ""}</small></span>
    </Link>
  );
}
function Verdict({ r }: { r: QRow }) {
  if (!r.hasNumbers) { const w = waitWords(r); return <span className="cx-wait" title={w.long}>{w.short}</span>; }
  return <span className="cx-vd"><VerdictCell r={r as VRow} />{r.flagged && <span className="cx-flag" role="img" aria-label={`Profit and sales moved apart: ${nf(Math.abs(r.gap ?? 0), 0)} points`} title={`Profit and sales moved apart: revenue ${signedPct(r.revenueYoY, 0)}, profit ${signedPct(r.profitYoY, 0)}, ${nf(Math.abs(r.gap ?? 0), 0)} points apart`}>⚑</span>}</span>;
}
function cell(k: ColKey, r: QRow): ReactNode {
  switch (k) {
    case "date": return dayLabel(r.date);
    case "mc": return <Num v={r.marketCap} />;
    case "rev": return <Num v={r.revenue} />;
    case "revg": return <Grow y={r.revenueYoY} q={r.revenueQoQ} />;
    case "op": return <Num v={r.operatingProfit} />;
    case "opg": return <Grow y={r.opYoY} q={r.opQoQ} />;
    case "opm": return <Marg m={r.opm} />;
    case "np": return <Num v={r.netProfit} />;
    case "npg": return <Grow y={r.profitYoY} q={r.profitQoQ} />;
    case "npm": return <Marg m={r.npm} c={r.npmChange} />;
    case "eps": return <Num v={r.eps} />;
    case "px": return <Num v={r.price} />;
    default: return null;
  }
}

const rsv = (v: number | null | undefined) => (v == null ? "" : "₹" + nf(v, 2));
const dayOf = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
/** One "Below ... high" cell (the results table's own, kept): the distance, its band, a thin 0-100% bar, the high under it, and the reason in a tooltip. A dash
 *  says why the figure is not held; a stale high reads "At 52-week high*". */
function PriceTd({ r, k, hit, cls }: { r: QRow; k: PriceKey; hit: boolean; cls: string }) {
  const v = k === "w52" ? r.below52 : r.belowAth, stale = k === "w52" ? r.stale52 : r.staleAth, high = k === "w52" ? r.high52 : r.ath;
  const c = cls + " qr-pp" + (hit ? " qr-hit" : "");
  if (v == null) { const why = priceWhy(r, k); return <td className={c}><abbr className="qr-na" title={why} tabIndex={0} aria-label={`Not available. ${why}`}>—<small>{r.price == null ? "No price held" : k === "ath" ? "Loading history" : "Not held"}</small></abbr></td>; }
  const tip = [`Price ${rsv(r.price)}; ${PRICE_WORD[k]} ${rsv(high)}${k === "ath" && r.athDate ? ` (highest close, week of ${dayOf(r.athDate)})` : ""}.`,
    k === "w52" && r.low52 != null ? `52-week low ${rsv(r.low52)}${r.above52Low != null ? `; the price is ${nf(r.above52Low, 1)}% above it` : ""}.` : "",
    stale ? `The price is above the stored ${PRICE_WORD[k]} (it is updated once a day), so the distance is shown as 0%.` : ""].filter(Boolean).join(" ");
  const label = v === 0 ? `At ${PRICE_WORD[k]}${stale ? "*" : ""}` : `${nf(v, 1)}%`;
  return (
    <td className={c}>
      <span className="qr-ppv" title={tip} tabIndex={0} aria-label={`${v === 0 ? "At the " + PRICE_WORD[k] : nf(v, 1) + "% below the " + PRICE_WORD[k]}. ${tip}`}>
        <b>{label}</b><small className="qr-band">{v === 0 ? "At the high" : bandShort(bandOf(v))}</small>
        <i className="qr-bar" aria-hidden="true"><em style={{ left: `${Math.min(100, v)}%` }} /></i>
        <small className="qr-hi">High {rsv(high)}</small>
      </span>
      {hit && <span className="sr-only"> (meets your price-position filter)</span>}
    </td>);
}

/** The row's detailed view (the four groups of today's Detailed view), with the flag's sentence, Set the alert and Open the report. */
function RowDetail({ r, n }: { r: QRow; n: number }) {
  const kv = (l: string, v: ReactNode) => <div className="qr-kv" key={l}><dt>{l}</dt><dd>{v}</dd></div>;
  const chg = (v: number | null | undefined) => (v == null ? <Na /> : <span className={"qr-chg " + (v > 0 ? "pos" : v < 0 ? "neg" : "")}>{signedPct(v)}</span>);
  const pc = (v: number | null | undefined) => (v == null ? <Na /> : `${(v < 0 ? MINUS : "") + nf(Math.abs(v), 1)}%`);
  return (
    <tr className="cx-xr"><td colSpan={n}>
      <div className="cx-xd">
        {!r.hasNumbers && <p className="cx-xw">{waitWords(r).long}</p>}
        {r.flagged && <p className="qr-flag"><span className="chip down"><Icon name="alert" /> Profit and sales moved apart</span>
          <span>Revenue {signedPct(r.revenueYoY, 0)}, profit {signedPct(r.profitYoY, 0)}: {nf(Math.abs(r.gap ?? 0), 0)} points apart.</span><Link to={gapAlertLink(r.symbol)}>Set the alert</Link></p>}
        {r.hasNumbers && <div className="qr-groups">
          <section className="qr-group" aria-label="Revenue"><h4>Revenue</h4><dl>{kv("₹ crore", <Num v={r.revenue} />)}{kv("Change on a year ago", chg(r.revenueYoY))}{kv("Change on the last quarter", chg(r.revenueQoQ))}</dl></section>
          <section className="qr-group" aria-label="Operating profit"><h4>Operating profit</h4><dl>{kv("₹ crore", <Num v={r.operatingProfit} />)}{kv("Change on a year ago", chg(r.opYoY))}{kv("Change on the last quarter", chg(r.opQoQ))}{kv("Operating margin", pc(r.opm))}</dl></section>
          <section className="qr-group" aria-label="Net profit"><h4>Net profit</h4><dl>{kv("₹ crore", <Num v={r.netProfit} />)}{kv("Change on a year ago", chg(r.profitYoY))}{kv("Change on the last quarter", chg(r.profitQoQ))}{kv("Net margin", pc(r.npm))}{kv("Earnings per share, ₹", <Num v={r.eps} />)}</dl></section>
          <section className="qr-group" aria-label="Price position"><h4>Price position</h4><dl>{kv("Price, ₹", <Num v={r.price} />)}{kv("52-week high, ₹", <Num v={r.high52} />)}{kv("Below 52-week high", pc(r.below52))}{kv("Below all-time high", pc(r.belowAth))}{kv("Market value, ₹ crore", <Num v={r.marketCap} />)}</dl></section>
        </div>}
        <p className="cx-xl"><Link to={`/stocks/${encodeURIComponent(r.symbol)}#quarter`}>Open the report →</Link><span>{r.basis ? `${r.basis === "standalone" ? "Standalone" : "Consolidated"} figures · ` : ""}declared {dayLabel(r.date)}</span></p>
      </div>
    </td></tr>
  );
}

export function CompaniesGrid({ rows, set, sort, onSort, grouped, today, days, locked, onUnlock, hits, phits }: {
  rows: QRow[]; set: ColSet; sort: SortState; onSort: (k: string) => void; grouped: boolean; today: string; days: Map<string, number>; locked: boolean; onUnlock: () => void;
  /** The growth cells a filter is on for (the cell is marked). */ hits?: (r: QRow, k: "revg" | "opg" | "npg") => boolean;
  /** The price-position cells a filter is on for. */ phits?: (r: QRow, k: PriceKey) => boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const cols = SET_COLS[set], n = cols.length + 1;
  const showDate = !grouped && !cols.includes("date");
  // the band row: a run of columns in the same band shares one heading; a column with no band spans both header rows
  const runs: { band?: Band; keys: ColKey[] }[] = [];
  for (const k of cols) { const b = COLS[k].band, last = runs[runs.length - 1]; if (b && last?.band === b) last.keys.push(k); else runs.push({ band: b, keys: [k] }); }
  const lone = (k: ColKey) => set === "price" && !!LONE[k];
  const th = (k: ColKey, rowSpan?: number) => {
    const c = COLS[k], cls = [c.right ? "r" : "", c.band && !lone(k) ? `cx-c cx-b-${BAND[c.band][1]}` : "", c.band && c.band !== COLS[cols[cols.indexOf(k) - 1]]?.band ? "cx-gs" : ""].filter(Boolean).join(" ");
    const label = lone(k) ? LONE[k]! : rowSpan && c.band ? `${BAND[c.band][0]} ${c.h}` : c.h;
    return c.sort ? <SortTh key={k} k={c.sort} label={label} className={cls || undefined} rowSpan={rowSpan} sort={sort} onSort={onSort} />
      : <th key={k} scope="col" className={cls || undefined} rowSpan={rowSpan}>{label}</th>;
  };
  const flip = (s: string) => setOpen((o) => { const x = new Set(o); if (x.has(s)) x.delete(s); else x.add(s); return x; });
  let last = "", coming = false;
  return (
    <table className="cx-t sp-tb kit-grid">
      <thead>
        <tr className="cx-bands">
          {runs.map((g) => g.band && !(g.keys.length === 1 && lone(g.keys[0]))
            ? <th key={g.keys[0]} colSpan={g.keys.length} scope="colgroup" className={`kit-band cx-c cx-gs cx-b-${BAND[g.band][1]}`}>{BAND[g.band][0]}</th>
            : g.keys.map((k) => th(k, 2)))}
          <th rowSpan={2} scope="col"><span className="sr-only">Detailed view</span></th>
        </tr>
        <tr>{runs.filter((g) => g.band && !(g.keys.length === 1 && lone(g.keys[0]))).flatMap((g) => g.keys.map((k) => th(k)))}</tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const out: ReactNode[] = [];
          if (grouped && !coming && r.date > today) { coming = true; out.push(<tr key="coming" className="cx-day"><td colSpan={n}><b>Still to declare</b><small>Board-meeting dates, soonest first</small></td></tr>); }
          if (grouped && r.date !== last) { last = r.date; const c = days.get(r.date) || 0; out.push(<tr key={"d" + r.date} className="cx-day"><td colSpan={n}><b>{dayLabel(r.date)}</b><small>{c} {c === 1 ? "company" : "companies"}</small></td></tr>); }
          const isOpen = open.has(r.symbol), figs = cols.filter((k) => !["co", "v", "date", "b52", "ath"].includes(k));
          out.push(
            <tr key={r.symbol} className={"cx-r qr-r" + (r.flagged ? " flag" : "") + (isOpen ? " open" : "")}>
              {cols.map((k) => {
                if (k === "co") return <td key={k}><Company r={r} showDate={showDate} /></td>;
                if (k === "v") return <td key={k}><Verdict r={r} /></td>;
                if (k === "date") return <td key={k}>{cell(k, r)}</td>;
                if (locked && r.hasNumbers && k === figs[0]) return <td key={k} colSpan={figs.length} className="cx-lock"><button type="button" className="qr-unlock" onClick={onUnlock}><Icon name="lock" /> Figures are part of every paid plan</button></td>;
                const c = COLS[k], base = [c.right ? "r" : "", c.band && !lone(k) ? `cx-c cx-b-${BAND[c.band][1]}` : "", c.band && c.band !== COLS[cols[cols.indexOf(k) - 1]]?.band ? "cx-gs" : ""].filter(Boolean).join(" ");
                if (locked && (k === "b52" || k === "ath")) return <td key={k} className={base + " qr-pp"}><abbr className="qr-na" title="Price position is part of every paid plan." tabIndex={0}>—</abbr></td>;
                if (locked && r.hasNumbers) return null;
                if (k === "b52" || k === "ath") { const pk: PriceKey = k === "b52" ? "w52" : "ath"; return <PriceTd key={k} r={r} k={pk} hit={!!phits?.(r, pk)} cls={base} />; }
                const hit = hits && (k === "revg" || k === "opg" || k === "npg") && hits(r, k);
                return <td key={k} className={[base, hit ? "qr-hit" : ""].filter(Boolean).join(" ") || undefined}>{cell(k, r)}{hit && <span className="sr-only"> (meets your growth filter)</span>}</td>;
              })}
              <td className="cx-xc"><button type="button" className="cx-x" aria-expanded={isOpen} aria-label={`${isOpen ? "Close" : "Open"} the detailed view of ${r.name || r.symbol}`} onClick={() => flip(r.symbol)}>▾</button></td>
            </tr>);
          if (isOpen) out.push(<RowDetail key={r.symbol + "-x"} r={r} n={n} />);
          return <Fragment key={r.symbol + "-f"}>{out}</Fragment>;
        })}
      </tbody>
    </table>
  );
}
