import { HScroll } from "../components/HScroll";
import { ChartHelp } from "../components/ChartHelp";
import { useEffect, useState } from "react";
import { Icon } from "../lib/icons";
import { MiniBars, type BarSeries } from "../charts/MiniBars";
import { Plain } from "../components/Plain";
import { MINUS, cr, nf, num } from "../lib/format";
import { useSection, type Events, type Financials, type Ratios, type Table } from "../lib/api";
import { useBasis, type Basis } from "../lib/basis";
import { SectionHead, yearGaps } from "./Sections";
import { TabGroup } from "../components/TabGroup";
import { badgeOf, insightLine, lastIndex, shortPeriod, yoyChange, type Tone } from "../lib/trendInsight";
import { IndustryCard, industryKeyLine, useIndustryRead } from "./IndustryCard";

const crf = (v: number) => (v < 0 ? MINUS : "") + (Math.abs(v) >= 1000 ? cr(Math.abs(v)) : nf(v, Math.abs(v) < 10 && v !== 0 ? 1 : 0));
const pctf = (v: number) => num(v, 1) + "%";
const eps = (v: number) => (v < 0 ? MINUS : "") + "₹" + nf(v, 1);
const row = (t: Table | undefined, k: string) => (t?.rows[k] || []) as (number | null)[];
const chg = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || !b ? null : ((a - b) / Math.abs(b)) * 100);
const ratio = (a: (number | null)[], b: (number | null)[]) => a.map((x, i) => (x != null && b[i] ? (x / (b[i] as number)) * 100 : null));
const G = "var(--k3)", INK = "var(--c2)", STONE = "var(--c4)", DEEP = "var(--c1)";

function Delta({ v, label }: { v: number | null; label: string }) {
  if (v == null) return <span className="qd none">{label} —</span>;
  return <span className={"qd " + (v >= 0 ? "up" : "down")}>{v >= 0 ? "▲ +" : "▼ −"}{nf(Math.abs(v), 1)}% <small>{label}</small></span>;
}

/** Plain-words reading of the latest quarter, worked out from the reported numbers only (no estimates). */
function readQuarter(q: Table) {
  const n = q.periods.length, last = n - 1, yoy = n >= 5 ? n - 5 : -1, qoq = last - 1;
  const rev = row(q, "revenue"), op = row(q, "operating_profit"), np = row(q, "net_profit"), ep = row(q, "eps"), fin = row(q, "finance_costs");
  const opm = ratio(op, rev), npm = ratio(np, rev);
  const good: string[] = [], bad: string[] = [];
  const say = (what: string, v: number | null, ref: string, hi = 5) => { if (v == null) return; if (v >= hi) good.push(`${what} grew ${nf(v, 1)}% ${ref}.`); else if (v <= -hi) bad.push(`${what} fell ${nf(Math.abs(v), 1)}% ${ref}.`); };
  const y = (a: (number | null)[]) => (yoy >= 0 ? chg(a[last], a[yoy]) : null), qn = (a: (number | null)[]) => chg(a[last], a[qoq]);
  say("Sales", y(rev), "from a year ago"); say("Net profit", y(np), "from a year ago", 8); say("Earnings per share", y(ep), "from a year ago", 8);
  say("Sales", qn(rev), "on the previous quarter"); say("Net profit", qn(np), "on the previous quarter", 10);
  if (yoy >= 0 && opm[last] != null && opm[yoy] != null) { const d = (opm[last] as number) - (opm[yoy] as number); if (d >= 1) good.push(`Operating margin widened by ${nf(d, 1)} points to ${nf(opm[last] as number, 1)}%.`); else if (d <= -1) bad.push(`Operating margin narrowed by ${nf(Math.abs(d), 1)} points to ${nf(opm[last] as number, 1)}%.`); }
  if (yoy >= 0 && npm[last] != null && npm[yoy] != null) { const d = (npm[last] as number) - (npm[yoy] as number); if (d >= 1) good.push(`Net margin improved by ${nf(d, 1)} points.`); else if (d <= -1) bad.push(`Net margin slipped by ${nf(Math.abs(d), 1)} points.`); }
  const fy = y(fin); if (fy != null && fy >= 15) bad.push(`Interest cost rose ${nf(fy, 1)}% from a year ago.`);
  if (np[last] != null && (np[last] as number) < 0) bad.push("The company made a loss this quarter.");
  const up = [rev, np].filter((a) => a[last] != null && a[qoq] != null && (a[last] as number) > (a[qoq] as number)).length;
  return { good: good.slice(0, 4), bad: bad.slice(0, 4), up };
}

/* ============== Latest quarter results ============== */
/** 05's second row: the quarter's own movements to watch. Red flags are only those of section 03 (the profit and loss checks). */
export const KQ_RISK_TITLE = "Key risks to watch this quarter";
/** One closed row of 05's takeaways or risks (task #328, file 27 change 4): the count and the first line show; the list opens on a press. */
export function KqRow({ tone, icon, title, items, take, empty }: { tone: string; icon: string; title: string; items: string[]; take?: string | null; empty: string }) {
  return (
    <details style={{ "--ac": tone } as React.CSSProperties}>
      <summary><span className="ci"><Icon name={icon} /></span><span>{title}</span><span className="n">{items.length}</span><span className="lead">{items[0] ?? empty}</span><span className="cv" aria-hidden="true">▾</span></summary>
      {items.length ? <ul>{items.map((t) => <li key={t} className={t === take ? "aiq-take" : undefined}>{t}</li>)}</ul> : <ul><li className="muted">{empty}</li></ul>}
    </details>
  );
}

export function QuarterSection({ f }: { f?: Financials }) {
  const ind = useIndustryRead(f?.meta.symbol);   // task #222: the company against its industry this quarter (Latest results -> Industries)
  const q = f?.quarterly.pl;
  if (!f || !q || q.periods.length < 2) return null;
  const n = q.periods.length, last = n - 1, yoy = n >= 5 ? n - 5 : -1;
  const rev = row(q, "revenue"), op = row(q, "operating_profit"), np = row(q, "net_profit"), ep = row(q, "eps");
  const opm = ratio(op, rev), npm = ratio(np, rev);
  const end = q.periodEnds?.[last] ? new Date(q.periodEnds[last]).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : q.periods[last];
  const tiles = [
    { k: "Revenue", v: rev, fmt: (x: number) => (x < 0 ? MINUS : "") + "₹" + cr(Math.abs(x)) + " Cr", bar: crf, ic: "rupee", c: G },
    { k: "Operating profit", v: op, fmt: (x: number) => (x < 0 ? MINUS : "") + "₹" + cr(Math.abs(x)) + " Cr", bar: crf, ic: "growth", c: DEEP, sub: opm[last] != null ? `${nf(opm[last] as number, 1)}% margin` : "" },
    { k: "Net profit", v: np, fmt: (x: number) => (x < 0 ? MINUS : "") + "₹" + cr(Math.abs(x)) + " Cr", bar: crf, ic: "profit", c: INK, sub: npm[last] != null ? `${nf(npm[last] as number, 1)}% margin` : "" },
    { k: "Earnings per share", v: ep, fmt: (x: number) => (x < 0 ? MINUS : "") + "₹" + nf(x, 2), bar: eps, ic: "coins", c: STONE },
  ];
  const npY = chg(np[last], yoy >= 0 ? np[yoy] : null), rvY = chg(rev[last], yoy >= 0 ? rev[yoy] : null);
  const lines: [string, (number | null)[], boolean?][] = [["Revenue", rev], ["Expenses", row(q, "expenses")], ["Operating profit", op, true], ["Other income", row(q, "other_income")], ["Interest", row(q, "finance_costs")], ["Depreciation", row(q, "depreciation")], ["Profit before tax", row(q, "profit_before_tax"), true], ["Tax", row(q, "tax")], ["Net profit", np, true], ["EPS (₹)", ep]];
  const cols = [last, last - 1, yoy].filter((i) => i >= 0);
  return (
    <section className="block" style={{ "--sc": "var(--gold-deep)" } as React.CSSProperties}>
      <SectionHead id="quarter" no="Latest quarter" icon="notes" tier="basic" title={`${q.periods[last]} quarter against a year ago`} sub={`Quarter ended ${end}. Compared with the previous quarter and the same quarter a year earlier.`} color="--gold-deep" />
      {rvY != null && npY != null && <Plain tone={npY >= 0 ? "good" : "warn"}>In the latest quarter, sales {rvY >= 0 ? "grew" : "fell"} {nf(Math.abs(rvY), 1)}% and profit {npY >= 0 ? "rose" : "fell"} {nf(Math.abs(npY), 1)}% compared with the same quarter last year.{opm[last] != null && opm[yoy] != null ? ` The operating margin ${(opm[last] as number) >= (opm[yoy] as number) ? "widened" : "narrowed"} from ${nf(opm[yoy] as number, 1)}% to ${nf(opm[last] as number, 1)}%.` : ""}</Plain>}
      <div className="qk">{tiles.map((t) => (
        <div className={"qt" + (t.k === "Revenue" || t.k === "Net profit" ? " hl" : "")} key={t.k} style={{ "--qc": t.c } as React.CSSProperties}>
          <div className="qt-h"><span className="qt-i"><Icon name={t.ic} /></span><span className="label">{t.k}</span></div>
          <div className="qt-v">{t.v[last] == null ? "—" : t.fmt(t.v[last] as number)}</div>
          {t.sub && <div className="qt-s">{t.sub}</div>}
          <div className="qt-d"><Delta v={chg(t.v[last], yoy >= 0 ? t.v[yoy] : null)} label="vs year ago" /><Delta v={chg(t.v[last], t.v[last - 1])} label="vs last quarter" /></div>
          <MiniBars labels={q.periods.slice(-8)} series={[{ key: t.k, label: t.k, values: t.v.slice(-8), color: t.c }]} fmt={t.bar} height={116} highlight={7 - (t.v.slice(-8).length < 8 ? 8 - t.v.slice(-8).length : 0)} />
        </div>))}</div>
      <IndustryCard read={ind} />
      <div className="card acc qtab" style={{ "--ac": "var(--gold)" } as React.CSSProperties}>
        <div className="card-h"><h3><span className="ci"><Icon name="table" /></span>Profit and loss for the quarter<ChartHelp id="quarter-table" /></h3><span className="s">₹ Crore · latest quarter’s change shown under its figure</span></div>
        <HScroll className="" label="table"><table className="qtt"><thead><tr><th>Line</th>{cols.map((i, j) => <th key={i} className={j === 0 ? "latest" : ""}>{q.periods[i]}{j === 0 ? " (latest)" : j === 1 ? " (last quarter)" : " (year ago)"}</th>)}</tr></thead>
          <tbody>{lines.map(([k, v, b]) => { const qoq = chg(v[last], v[last - 1]), yoyC = yoy >= 0 ? chg(v[last], v[yoy]) : null;
            const tag = (c: number | null, label: string) => c == null ? null : <small className={"chg " + (c >= 0 ? "pos" : "neg")} title={label}>{c >= 0 ? "+" : MINUS}{nf(Math.abs(c), 1)}% {label}</small>;
            return <tr key={k} className={(b ? "sub" : "") + (k === "Revenue" || k === "Net profit" ? " hl" : "")}><td>{k}</td>{cols.map((i, j) => { const x = v[i]; return <td key={i} className={j === 0 ? "latest" : ""}>{x == null ? "—" : num(x, k.startsWith("EPS") ? 2 : 0)}{j === 0 && <span className="chgs">{tag(qoq, "vs last quarter")}{tag(yoyC, "vs year ago")}</span>}</td>; })}</tr>; })}</tbody></table></HScroll>
        <p className="faint" style={{ fontSize: "var(--fs-12)", margin: "10px 0 0" }}>Under each latest-quarter figure: how much it changed against the previous quarter, and against the same quarter a year earlier. Figures are as reported on the exchange filing.</p>
      </div>
      {/* task #328 (developer file 27, change 4): the takeaways and the risks are two closed rows under the quarter's table, each with its count and first line */}
      {(() => { const k = readQuarter(q), line = industryKeyLine(ind); return (k.good.length || k.bad.length || line) ? (
        <div className="kq2">
          <KqRow tone="var(--gain)" icon="check" title="Key takeaways" items={[...k.good, ...(line ? [line] : [])]} take={line} empty="Nothing stands out on the upside this quarter." />
          {/* QA of 23 Nov: these are the quarter's own movements, not the red flags of section 03's profit and loss checks, so they are named risks to watch
              (HDFC Bank showed "Red flag 0" in 03 beside "Key risks and red flags 1" here) */}
          <KqRow tone="var(--loss)" icon="alert" title={KQ_RISK_TITLE} items={k.bad} empty="No risks to watch in the reported numbers this quarter." />
        </div>) : null; })()}
    </section>
  );
}

/* ============== Trends grid ============== */
/** unit: crore amounts (default), rupees per share, or per cent. kind: how the one-line reading is worded. */
type Card = { id: string; title: string; hint?: string; annualOnly?: boolean; unit?: "cr" | "rs" | "pct"; kind?: "flow" | "ratio" | "pair" | "mix"; since?: boolean; iname?: string; build: (m: "q" | "a") => { labels: string[]; series: BarSeries[]; mode?: "single" | "group" | "stack"; fmt: (v: number) => string } | null };

/** Amount with its unit, the way the big value and the sentences print it: ₹3.33 L Cr, ₹56,616 Cr, ₹20.0, 12.3%. */
export const trendMoney = (unit: "cr" | "rs" | "pct" = "cr") => (v: number) => (unit === "rs" ? eps(v) : unit === "pct" ? (v < 0 ? MINUS : "") + nf(v, 1) + "%" : (v < 0 ? MINUS : "") + "₹" + cr(Math.abs(v)) + " Cr");
const ARROW: Record<Tone, string> = { up: "↑", down: "↓", flat: "→", none: "" };

const MODE_KEY = "finlit.trends.mode";
const readMode = (): "q" | "a" => { try { return sessionStorage.getItem(MODE_KEY) === "a" ? "a" : "q"; } catch { return "q"; } };
/** Left/Right/Home/End move focus (and, via click, the choice) between the buttons of a segmented control. */
const segKeys = (e: React.KeyboardEvent<HTMLElement>) => {
  if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const bs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
  const at = bs.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  e.preventDefault();
  const to = e.key === "Home" ? 0 : e.key === "End" ? bs.length - 1 : (at + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length;
  bs[to].focus(); bs[to].click();
};

export function TrendsSection({ f: pageF, e, r: pageR }: { f?: Financials; e?: Events; r?: Ratios }) {
  const [tab, setTab] = useState<"key" | "margin" | "div">("key");
  // Task #198 (same rules as section 06, task #190): the reader can switch THIS section between consolidated and standalone accounts; the rest of the
  // page keeps its basis. The other basis's financials and ratios are asked for only when its button is pressed, and its cards are drawn only once an
  // answer for exactly that basis is here (never the previous basis's figures under the new label). Dividend per share is per share: the same on either.
  const sym = pageF?.meta.symbol ?? "";
  const pageBasis = useBasis(sym);
  const [pick, setPick] = useState<{ sym: string; b: Basis } | null>(null);
  const chosen: Basis | null = pick && pick.sym === sym ? pick.b : null;
  const wantOther = !!pageF && chosen != null && chosen !== pageF.meta.statement;
  const finQ = useSection<Financials>(sym, "financials", wantOther, chosen ?? undefined);
  const ratQ = useSection<Ratios>(sym, "ratios", wantOther, chosen ?? undefined);
  const finReady = wantOther && finQ.data?.meta.symbol === sym && finQ.data.meta.statement === chosen ? finQ.data : undefined;
  const ratReady = wantOther && ratQ.data?.meta.symbol === sym && ratQ.data.meta.statement === chosen ? ratQ.data : undefined;
  const ratDone = !!ratReady || ratQ.isError;            // ratios that fail leave their two cards out (listed as not shown); the rest still draws
  const f = wantOther ? (finReady && ratDone ? finReady : undefined) : pageF;
  const r = wantOther ? ratReady : pageR;
  const emptyFin = (x?: Financials) => !!x && x.yearly.pl.periods.length === 0 && x.quarterly.pl.periods.length === 0;
  const [none, setNone] = useState<string[]>([]);       // a basis found to have no statements stays greyed out, with its reason, for this company
  useEffect(() => { if (finReady && emptyFin(finReady) && chosen && !none.includes(sym + ":" + chosen)) setNone((n) => [...n, sym + ":" + chosen]); }, [finReady, chosen, sym, none]);
  const isNone = (b: Basis) => none.includes(sym + ":" + b) || (b === chosen && !!finReady && emptyFin(finReady));
  const noneFor: Basis | null = chosen && isNone(chosen) ? chosen : null;
  const [mode, setModeRaw] = useState<"q" | "a">(readMode);
  const setMode = (m: "q" | "a") => { setModeRaw(m); try { sessionStorage.setItem(MODE_KEY, m); } catch { /* private window */ } };
  const [big, setBig] = useState<string | null>(null);
  useEffect(() => {
    if (!big) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setBig(null); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [big]);
  if (!pageF) return null;
  const nameOf = (b: Basis) => (b === "consolidated" ? "Consolidated" : "Standalone");
  const active: Basis = chosen ?? pageF.meta.statement;
  const basisSeg = (
    <div className="seg" role="group" aria-label="Accounts: consolidated or standalone">
      {(["consolidated", "standalone"] as Basis[]).map((b) => {
        const off = isNone(b);
        return <button key={b} type="button" aria-pressed={active === b} disabled={off && active !== b}
          title={(b === "consolidated" ? "The group: the company and its subsidiaries together" : "The parent company alone, without its subsidiaries") + (off ? ". Not available for this company." : "")}
          onClick={() => setPick(b === pageF.meta.statement ? null : { sym, b })}>{nameOf(b)}</button>;
      })}
    </div>);
  const head = (b: Basis) => `${nameOf(b)} accounts. Quarter by quarter or year by year. Hover a column for its exact value.`;
  if (!f || noneFor) {
    const why = noneFor ? `${nameOf(noneFor)} statements are not available for this company in our data sources, so this section can only show ${pageF.meta.statement} accounts.`
      : finQ.isError ? `${nameOf(chosen as Basis)} accounts could not be loaded right now (${finQ.error?.status === 503 ? "the data provider did not answer" : "please try again in a moment"}). The ${pageF.meta.statement} accounts are still here: press ${nameOf(pageF.meta.statement)}.`
        : `Loading ${chosen as Basis} accounts…`;
    return (
      <section className="block" style={{ "--sc": "var(--gold)" } as React.CSSProperties}>
        <SectionHead id="trends" no="Trends" icon="line" tier="basic" title="How sales, profit and cash have moved" sub={head(chosen as Basis)} color="--gold" />
        <div className="tr-bar"><span className="faint" style={{ fontSize: "var(--fs-13)", alignSelf: "center" }}>Accounts</span>{basisSeg}</div>
        <p className={noneFor || finQ.isError ? "muted" : "faint"} role="status" style={{ fontSize: "var(--fs-14)", margin: "6px 2px 0" }}>{why}</p>
        {!noneFor && !finQ.isError && <div className="skeleton" style={{ height: 320, marginTop: 14 }} />}
      </section>);
  }
  const A = f.yearly, Q = f.quarterly.pl;
  const tbl = (m: "q" | "a") => (m === "q" ? Q : A.pl);
  const mk = (title: string, key: string, color: string, fmt = crf, x: Partial<Card> = {}): Card => ({ id: key, title, ...x, build: (m) => { const t = tbl(m); return { labels: t.periods, series: [{ key, label: title, values: row(t, key), color }], fmt }; } });
  const annual = (id: string, title: string, hint: string, build: Card["build"], x: Partial<Card> = {}): Card => ({ id, title, hint, annualOnly: true, ...x, build });
  const cards: Record<typeof tab, Card[]> = {
    key: [
      mk("Revenue", "revenue", G, crf, { iname: "Revenue" }),
      mk("Operating profit", "operating_profit", DEEP, crf, { iname: "Operating profit" }),
      annual("fcf", "Free cash flow", "Annual", () => ({ labels: A.cf.periods, series: [{ key: "fcf", label: "Free cash flow", values: row(A.cf, "free_cash_flow"), color: INK }], fmt: crf }), { iname: "Free cash flow" }),
      mk("Net profit", "net_profit", INK, crf, { iname: "Net profit" }),
      mk("Earnings per share", "eps", STONE, eps, { unit: "rs", iname: "EPS" }),
      annual("cashdebt", "Cash and borrowings", "Annual", () => ({ labels: A.bs.periods, mode: "group" as const, fmt: crf, series: [{ key: "cash", label: "Cash", values: row(A.bs, "cash"), color: G }, { key: "debt", label: "Borrowings", values: row(A.bs, "borrowings"), color: INK }] }), { kind: "pair" }),
      annual("cfo", "Cash from operations", "Annual", () => ({ labels: A.cf.periods, series: [{ key: "cfo", label: "Cash from operations", values: row(A.cf, "operating"), color: DEEP }], fmt: crf }), { iname: "Operating cash flow", since: true }),
    ],
    margin: [
      { id: "opm", title: "Operating margin", unit: "pct", kind: "ratio", iname: "Operating margin", build: (m) => { const t = tbl(m); return { labels: t.periods, series: [{ key: "opm", label: "Operating margin", values: ratio(row(t, "operating_profit"), row(t, "revenue")), color: G }], fmt: pctf }; } },
      { id: "npm", title: "Net margin", unit: "pct", kind: "ratio", iname: "Net margin", build: (m) => { const t = tbl(m); return { labels: t.periods, series: [{ key: "npm", label: "Net margin", values: ratio(row(t, "net_profit"), row(t, "revenue")), color: INK }], fmt: pctf }; } },
      annual("capex", "Capital spending", "Annual", () => ({ labels: A.cf.periods, series: [{ key: "capex", label: "Capital spending", values: row(A.cf, "capex").map((x) => (x == null ? null : Math.abs(x))), color: DEEP }], fmt: crf }), { iname: "Capital spending" }),
      annual("roe", "Return on equity and capital", "Annual", () => r && r.history.rows.roe ? { labels: r.history.periods, mode: "group" as const, fmt: pctf, series: [{ key: "roe", label: "ROE (reported)", values: r.history.rows.roe, color: G }, { key: "roce", label: "ROCE", values: r.history.rows.roce || [], color: INK }] } : null, { kind: "pair", unit: "pct" }),
      annual("int", "Interest and depreciation", "Annual", () => ({ labels: A.pl.periods, mode: "group" as const, fmt: crf, series: [{ key: "i", label: "Interest", values: row(A.pl, "finance_costs"), color: INK }, { key: "d", label: "Depreciation", values: row(A.pl, "depreciation"), color: STONE }] }), { kind: "pair" }),
      annual("tax", "Tax paid on profit", "Annual", () => ({ labels: A.pl.periods, series: [{ key: "t", label: "Tax", values: row(A.pl, "tax"), color: STONE }], fmt: crf }), { iname: "Tax" }),
    ],
    div: [
      annual("dps", "Dividend per share", "Annual", () => e && e.dividendsByFY.periods.length ? { labels: e.dividendsByFY.periods, series: [{ key: "dps", label: "Dividend per share", values: e.dividendsByFY.dps, color: G }], fmt: eps } : null, { unit: "rs", iname: "Dividend per share" }),
      annual("paid", "Dividends paid out", "Annual", () => ({ labels: A.cf.periods, series: [{ key: "p", label: "Dividends paid", values: row(A.cf, "dividends_paid").map((x) => (x == null ? null : Math.abs(x))), color: DEEP }], fmt: crf }), { iname: "Dividends paid" }),
      annual("payout", "Share of profit paid out", "Annual", () => r && r.history.rows.dividend_payout ? { labels: r.history.periods, series: [{ key: "po", label: "Payout ratio", values: r.history.rows.dividend_payout, color: INK }], fmt: pctf } : null, { unit: "pct", kind: "ratio", iname: "Payout ratio" }),
    ],
  };
  const list = cards[tab];
  const built = list.map((c) => { const d = c.build(mode); return { c, d: d && d.series.some((x) => x.values.some((v) => v != null)) ? d : null }; });
  const shownCount = built.filter((b) => b.d).length;
  const tabName = tab === "key" ? "Key metrics" : tab === "margin" ? "Margins and investment" : "Dividends";
  const missing = built.filter((b) => !b.d).map((b) => b.c.title);
  return (
    <section className="block" style={{ "--sc": "var(--gold)" } as React.CSSProperties}>
      <SectionHead id="trends" no="Trends" icon="line" tier="basic" title="How sales, profit and cash have moved" sub={head(f.meta.statement)} color="--gold"
        aside={<>{basisSeg}<div className="seg" role="group" aria-label="Period" onKeyDown={segKeys}><button type="button" aria-pressed={mode === "q"} tabIndex={mode === "q" ? 0 : -1} onClick={() => setMode("q")}>Quarterly</button><button type="button" aria-pressed={mode === "a"} tabIndex={mode === "a" ? 0 : -1} onClick={() => setMode("a")}>Annual</button></div></>} />
      {/* task #216 (README 3.7): the trend groups are the report's tab group; Consolidated | Standalone sits in the heading row, left of Quarterly | Annual */}
      <TabGroup label="Trend groups" value={tab} onChange={(k) => setTab(k as typeof tab)} next={false} hint={`${tabName} shown here`}
        views={[{ key: "key", label: "Key metrics" }, { key: "margin", label: "Margins and investment" }, { key: "div", label: "Dividends" }]} />
      {chosen && f.meta.statement !== pageBasis && <p className="faint" style={{ fontSize: "var(--fs-13)", margin: "0 2px 12px" }}>This section now shows {f.meta.statement} accounts; the rest of this page uses {pageBasis} accounts.</p>}
      {mode === "a" && yearGaps(A.pl.periods).map((g) => <p key={g} className="faint" style={{ fontSize: "var(--fs-13)", margin: "0 2px 12px" }}>No {f.meta.statement} figures for {g} in our data sources: neighbouring columns and the trend lines below skip those years.</p>)}
      {chosen && wantOther && ratQ.isError && <p className="faint" style={{ fontSize: "var(--fs-13)", margin: "0 2px 12px" }}>The {chosen} ratios (return on equity and capital, payout) could not be loaded right now, so those charts are left out.</p>}
      <p className="sr-only" role="status" aria-live="polite">{`Showing ${mode === "q" ? "quarterly" : "annual"} figures, ${shownCount} of ${list.length} charts in ${tabName}.`}</p>
      <div className="tr-grid" id="trpanel" aria-label={tabName}>{built.map(({ c, d }) => {
        if (!d) return null;
        const open = big === c.id, unit = c.unit ?? "cr", money = trendMoney(unit), single = d.series.length === 1;
        const kind = c.kind ?? (single ? "flow" : "pair");
        const v0 = d.series[0].values, li = single ? lastIndex(v0) : -1;
        const hi = single ? (li < 0 ? d.labels.length - 1 : li) : d.labels.length - 1;
        // task #312 (developer file 20, change 4): an annual-only card's series is yearly whatever the switch says, so its YoY is one step back (FY26
        // against FY25). It was given the page's Quarterly mode and stepped back four years (FY26 against FY22: free cash flow "+558.5% YoY").
        const cm: "q" | "a" = c.annualOnly ? "a" : mode;
        const ch = single ? yoyChange(v0, cm, kind === "ratio") : null, bd = ch ? badgeOf(ch) : null;
        const line = insightLine({ kind, name: c.iname ?? c.title, labels: d.labels, mode: cm, series: d.series.map((x) => ({ label: x.label, values: x.values })), money, since: c.since });
        const latest = (x: BarSeries) => { const i = lastIndex(x.values); return i < 0 ? null : money(x.values[i] as number); };
        const summary = `${c.title} by period. ` + (single && li >= 0 ? `Latest, ${shortPeriod(d.labels[li])}: ${money(v0[li] as number)}. ` : "") + line.text;
        return (
          <div className={"card tr-c" + (open ? " big" : "")} key={c.id}>
            <div className="tr-h"><h3>{c.title} <ChartHelp id={"trend-" + c.id} /></h3>{c.annualOnly && mode === "q" && <span className="chip ghost">Annual</span>}
              <button type="button" className="tr-x" aria-label={open ? `Shrink ${c.title}` : `Expand ${c.title}`} aria-expanded={open} title={open ? "Shrink chart (Esc)" : "Expand chart"} onClick={() => setBig(open ? null : c.id)}><Icon name="arrow" /></button></div>
            {single && (li >= 0 ? <>
              <div className="tr-v">{money(v0[li] as number)}</div>
              <div className="tr-b">{bd && <span className={"tr-bd " + bd.tone} title={bd.title}>{ARROW[bd.tone] && <span aria-hidden="true">{ARROW[bd.tone]} </span>}{bd.text}</span>}<span className="tr-per">{shortPeriod(d.labels[li])}</span></div></>
              : <div className="tr-v none">—</div>)}
            <MiniBars labels={d.labels} series={d.series} mode={d.mode} fmt={d.fmt} height={open ? 280 : 170} w={open ? 900 : 300} highlight={hi} fit tag={single} summary={summary} />
            {d.series.length > 1 && <div className={"tr-key" + (d.series.length > 3 ? " two" : "")}>{d.series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}{d.mode === "group" && latest(s) ? <b>{latest(s)}</b> : null}</span>)}</div>}
            <p className={"tr-in " + line.tone}><Icon name={line.tone === "down" ? "decline" : line.tone === "up" ? "growth" : "line"} />{line.text}</p>
          </div>);
      })}</div>
      {shownCount === 0 && <p className="faint" style={{ fontSize: "var(--fs-13)", margin: "10px 2px" }}>– No {tabName.toLowerCase()} figures are available for this company in the {mode === "q" ? "quarterly" : "annual"} view.</p>}
      {shownCount > 0 && missing.length > 0 && <p className="faint" style={{ fontSize: "var(--fs-12)", margin: "10px 2px 0" }}>– Not shown, no reported figures: {missing.join(", ")}.</p>}
      <p className="faint" style={{ fontSize: "var(--fs-12)", margin: "10px 2px 0" }}>₹ Crore unless stated. Cash flow and balance sheet items are reported once a year, so they stay annual.</p>
    </section>
  );
}
