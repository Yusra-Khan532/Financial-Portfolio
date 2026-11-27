// DCF calculator (Gold): intrinsic value from a two-stage, ten-year free cash flow model, in the order of the FinLit formula sheet, with the
// checks and analysis an analyst expects around it. All arithmetic lives in lib/dcf.ts (pure and tested); this page collects inputs, can
// load a listed company's figures from its stored report (Gold, enforced by the server), and shows every step of the working.
//
// Task #302 (DCF redesign pack of 21 Nov 2026): one workspace. The assumptions sit in one card on the left (four groups, each field a number box with
// its unit and a slim slider, presets as chips that light up only when the value equals them), the result card and the working (five tabs) on the
// right; below 860 px everything stacks. "How this calculator works" starts closed, the section bar is gone, and a summary strip shows the value while
// the result card is off screen. The model is unchanged. Inputs are plain controlled fields of components defined once, so typing or dragging never
// redraws a field or moves the cursor; the result side follows every key.
import { PageHeader } from "../components/PageHeader";
import { useIndexFilter } from "../components/SearchFilters";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { apiGet, apiSend, type ApiError, type Glossary } from "../lib/api";
import { useAuth } from "../lib/auth";
import { DEMO } from "../lib/demo";
import { Icon } from "../lib/icons";
import { useUI } from "../lib/ui";
import { useDocTitle } from "../lib/title";
import { csvText, dateIN, nf } from "../lib/format";
import { Gate } from "../components/Gate";
import { Info } from "../components/Info";
import { DcfIntro, useIntroOpen } from "../components/DcfIntro";
import {
  GROWTH_PRESETS, INDIA_DEFAULTS, MOS_PRESETS, STATUS_TEXT, around, costOfCapital, defaultScenarios, impliedGrowth, impliedReturn, run, scenarios, sensitivity,
  type CostOfCapital, type DcfInputs, type DcfResult, type GrowthPreset, type Scenario,
} from "../lib/dcf";
import { With3D } from "../charts/With3D";
import "../styles/dcf.css";
import "../styles/dcf-redesign.css";
import { ChartZoom } from "../components/ChartZoom";
import { codeText } from "../lib/companyLabel";
import { CoLogo } from "../components/CoLogo";


// ------------------------------------------------------------------------------------------------------------- form state
type Form = {
  fcf0: string; r: string; g1: string; g2: string; gT: string; marketCap: string; price: string;
  netDebt: string; mos: string; midYear: boolean; tvMethod: "gordon" | "exit"; exitMultiple: string; shares: string; symbol: string;
};
const DEFAULT: Form = { fcf0: "100", r: "12", g1: "10", g2: "10", gT: "5", marketCap: "2000", price: "100",
  netDebt: "1000", mos: "20", midYear: false, tvMethod: "gordon", exitMultiple: "15", shares: "", symbol: "" };
const PARAM: Record<string, keyof Form> = { fcf: "fcf0", r: "r", g1: "g1", g2: "g2", gt: "gT", mc: "marketCap", p: "price", nd: "netDebt", mos: "mos", xm: "exitMultiple", sh: "shares", sym: "symbol" };

/** "1,23,456.5" or "₹ 2,000" -> number; empty or junk -> NaN (validation then names the field). */
export const parseNum = (s: string) => { const t = s.replace(/[,\s₹%]/g, ""); return t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) ? NaN : Number(t); };
/** The growth preset a value equals (saved with a scenario), else "custom". */
export const presetOf = (v: number): GrowthPreset => (Object.entries(GROWTH_PRESETS).find(([, p]) => p.value === v)?.[0] as GrowthPreset) ?? "custom";

function fromParams(sp: URLSearchParams): Form {
  const f = { ...DEFAULT };
  for (const [k, field] of Object.entries(PARAM)) { const v = sp.get(k); if (v != null) (f as Record<string, unknown>)[field] = v.slice(0, 40); }
  if (sp.get("mid") === "1") f.midYear = true;
  if (sp.get("tv") === "exit") f.tvMethod = "exit";
  return f;
}
function toParams(f: Form): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, field] of Object.entries(PARAM)) { const v = String(f[field]); if (v !== "" && v !== String(DEFAULT[field])) sp.set(k, v); }
  if (f.midYear) sp.set("mid", "1");
  if (f.tvMethod === "exit") sp.set("tv", "exit");
  return sp;
}
function toInputs(f: Form): DcfInputs {
  const sh = f.shares.trim() === "" ? null : parseNum(f.shares);
  return { fcf0: parseNum(f.fcf0), r: parseNum(f.r), g1: parseNum(f.g1), g2: parseNum(f.g2), gT: parseNum(f.gT), marketCap: parseNum(f.marketCap), price: parseNum(f.price),
    netDebt: parseNum(f.netDebt), mos: parseNum(f.mos), midYear: f.midYear, tvMethod: f.tvMethod, exitMultiple: f.tvMethod === "exit" ? parseNum(f.exitMultiple) : null, shares: sh };
}

// ------------------------------------------------------------------------------------------------------------- formatting
const rs = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : (v < 0 ? "−₹" : "₹") + nf(Math.abs(v), d));
const crs = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : (v < 0 ? "−₹" : "₹") + nf(Math.abs(v), d) + " Cr");
const pc = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : (v < 0 ? "−" : "") + nf(Math.abs(v), d) + "%");
const sgn = (v: number, d = 2) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf(Math.abs(v), d) + "%";

// ------------------------------------------------------------------------------------------------------------- help text
const H = (key: string, label: string, what: string, formula?: string, read?: string): Glossary => ({ key, label, what, formula, read } as Glossary);
const HELP: Record<string, Glossary> = {
  fcf0: H("fcf0", "Starting free cash flow", "The free cash flow the projection starts from (FCF₀): cash from operations minus capital expenditure, in ₹ crore. Filled from the company when you pick one.", "FCF = Cash from operations − Capex",
    "Use a normal year. If cash flow jumps around, an average of the last 3 to 5 years is steadier."),
  r: H("r", "Discount rate", "The yearly return an investor needs for the risk of this business; every future cash flow is divided by (1 + r) for each year it is away. With net debt taken off later, the matching rate is the WACC.",
    "Cost of equity = Risk-free rate + β × Equity risk premium", "For listed Indian companies it is usually 11% to 14%. The CAPM and WACC link below works it out."),
  g1: H("g1", "Growth, years 1–5", "How fast free cash flow grows each year for the next five years (g₁).", "FCF_t = FCF₀ × (1 + g₁)^t, t = 1…5"),
  g2: H("g2", "Growth, years 6–10", "How fast free cash flow grows each year in years 6 to 10 (g₂); usually lower as the business matures.", "FCF_t = FCF_{t−1} × (1 + g₂), t = 6…10"),
  gT: H("gT", "Terminal growth", "The growth of free cash flow every year after year 10, forever (g_T). Keep it near long-run nominal GDP growth, and below the discount rate.", "TV₁₀ = FCF₁₀ × (1 + g_T) ÷ (r − g_T)",
    "Most analysts use 4% to 6% for India: no business can outgrow the economy forever."),
  marketCap: H("marketCap", "Market cap", "The company's total market value: share price × shares outstanding, in ₹ crore.", "Shares = Market capitalisation ÷ Share price"),
  price: H("price", "Share price", "Today's price of one share in ₹; the intrinsic value is compared with it."),
  netDebt: H("netDebt", "Net debt", "Borrowings minus cash and cash equivalents, in ₹ crore. Enter a negative number for net cash. It is taken off enterprise value to reach the value of the shares.",
    "Equity value = Enterprise value − Net debt", "Also take off minority interest and add non-operating assets (for example surplus investments) if they are material."),
  mos: H("mos", "Margin of safety", "How far below the estimated value a price must be before it leaves room for error.", "Safety price = Intrinsic value × (1 − MOS ÷ 100)",
    "Common choices: 20% for steady businesses, 30–40% for less certain ones, 50% or more for very uncertain ones."),
  shares: H("shares", "Shares", "Number of shares in crore. Left empty, it is market capitalisation ÷ price. A diluted count (including options and convertibles) is more precise."),
  exitMultiple: H("exitMultiple", "Exit multiple", "Terminal value as a multiple of year-10 free cash flow (EV ÷ FCF), instead of the growth formula.", "TV₁₀ = Multiple × FCF₁₀"),
  tvMethod: H("tvMethod", "Terminal value", "The value of every year after year 10. Growth formula: year-10 cash flow × (1 + terminal growth) ÷ (discount rate − terminal growth). Exit multiple: year-10 cash flow × a multiple."),
  basis: H("basis", "Starting free cash flow", "Which of the company's reported free cash flows fills the starting figure: the latest year, or the average of the last 3 or 5 years. An average is steadier when cash flow jumps around.", "FCF = Cash from operations − Capex"),
  midYear: H("midYear", "Mid-year convention", "Cash comes in through the year, not all on its last day, so each year's FCF is discounted from the middle of the year rather than its end.", "PV = FCF_t ÷ (1 + r)^(t − 0.5)"),
};

// ------------------------------------------------------------------------------------------------------------- company data (Gold)
type Company = {
  symbol: string; name: string | null; sector: string | null; statement: string; isBank: boolean; price: number | null; priceAsOf: string | null; marketCap: number | null;
  shares: { diluted: number | null; period: string | null; implied: number | null };
  fcf: { history: { period: string; fcf: number; operating: number | null; capex: number | null }[]; latest: { period: string; fcf: number } | null; avg3: number | null; avg5: number | null; cagr3: number | null; cagr5: number | null };
  netDebt: { value: number | null; borrowings: number | null; cash: number | null; investments: number | null; period: string | null }; notes: string[];
};
type Basis = "latest" | "avg3" | "avg5";
const BASIS_LABEL: Record<Basis, string> = { latest: "Latest year", avg3: "Average of 3 years", avg5: "Average of 5 years" };
const fcfOf = (c: Company, b: Basis) => (b === "avg3" ? c.fcf.avg3 : b === "avg5" ? c.fcf.avg5 : c.fcf.latest?.fcf ?? null);
/** What the starting FCF is, as its badge and dropdown say it: "FY26", "3-yr avg", "5-yr avg". */
const basisTag = (c: Company, b: Basis) => (b === "avg3" ? "3-yr avg" : b === "avg5" ? "5-yr avg" : c.fcf.latest?.period ?? "Latest");
/** The price's day as a badge: "25 Nov". */
const dayTag = (iso: string | null) => (iso ? new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null);
/** The form with a company's figures in it (the assumptions untouched). A figure the company does not have is left empty, so no figure from another company stays. */
function withCompany(f: Form, c: Company, b: Basis): Form {
  const fcf = fcfOf(c, b), r2 = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "");
  return { ...f, symbol: c.symbol, fcf0: r2(fcf), price: c.price != null ? String(c.price) : "", marketCap: r2(c.marketCap), netDebt: r2(c.netDebt.value), shares: c.shares.diluted != null ? String(c.shares.diluted) : "" };
}
/** Task #396: the five company figures the calculator fills, and how many of them the company has. */
const filled = (c: Company, b: Basis) => [fcfOf(c, b), c.netDebt.value, c.price, c.marketCap, c.shares.diluted ?? c.shares.implied].filter((v) => v != null && Number.isFinite(v)).length;

/** The company bar (task #396). Left: the search, which shows the chosen company once one is loaded (with "Selected" and ×, and a press on it to change
 *  company), then a compact summary that opens to the full financial details. Right: the Starting free cash flow choice, each option with its figure.
 *  Keyboard: ↑ ↓ move through the matches, Enter picks, Esc goes back to the chosen company. */
function CompanyBar({ enabled, onLoad, onClear, loaded, initial }: { enabled: boolean; onLoad: (c: Company, basis: Basis) => void; onClear: () => void; loaded: Company | null; initial: string | null }) {
  const [q, setQ] = useState("");
  const [sym, setSym] = useState<string | null>(initial);   // opened from a stock page ("Value (DCF)"): that company loads at once
  const [basis, setBasis] = useState<Basis>("latest");
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(0);
  const [more, setMore] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const sf = useIndexFilter(true), index = sf.idx;
  const hits = useMemo(() => sf.search(q, 8), [sf.search, q]);   // name, symbol, BSE/NSE code or ISIN
  useEffect(() => { setActive(0); }, [q]);

  const company = useQuery<Company, ApiError>({ queryKey: ["dcf-company", sym], queryFn: () => apiGet(`/api/dcf/company/${encodeURIComponent(sym as string)}`), enabled: enabled && !!sym, retry: false, staleTime: 300_000 });
  useEffect(() => { if (company.data && company.data.symbol === sym) { onLoad(company.data, basis); setMore(false); } }, [company.data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const c = loaded;
  const chosen = !!c && !editing && !company.isFetching;
  const pick = (s: string) => { setSym(s); setQ(""); setEditing(false); };
  const change = () => { setEditing(true); requestAnimationFrame(() => box.current?.focus()); };
  const clear = () => { setSym(null); setQ(""); onClear(); setEditing(true); requestAnimationFrame(() => box.current?.focus()); };
  const key = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); setActive((a) => (a + 1) % hits.length); }
    else if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); setActive((a) => (a + hits.length - 1) % hits.length); }
    else if (e.key === "Enter" && hits[active]) { e.preventDefault(); pick(hits[active][0]); }
    else if (e.key === "Escape" && c) { e.preventDefault(); setQ(""); setEditing(false); }
  };
  const list = q.trim() !== "" && hits.length > 0;
  const fcfFig = c ? fcfOf(c, basis) : null;
  const n = c ? filled(c, basis) : 0;
  return (
    <section className="card dcx-co" aria-label="Start from a listed company">
      <div className="dcx-cor">
        <div className="dcx-cl">
          <span className="dcx-cot">Start from a listed company <span className="tier gold">Gold</span></span>
          {chosen ? (
            <div className="dcx-pick">
              <button type="button" className="dcx-pickb" onClick={change} aria-label={`${c.name ?? c.symbol} (${codeText(c.symbol)}) selected. Press to change the company`}>
                <CoLogo symbol={c.symbol} name={c.name} size={22} inline />
                <b>{c.name ?? c.symbol}</b><span className="mono dcx-pks">{codeText(c.symbol)}</span>
                <span className="dcx-sel"><Icon name="check" /><span className="dcx-selt">Selected</span></span>
              </button>
              <button type="button" className="dcx-x" onClick={clear} aria-label={`Clear ${c.name ?? c.symbol}`} title="Clear: back to the example figures">×</button>
            </div>
          ) : (
            <label className="dcx-search"><Icon name="search" /><span className="sr-only">Search a company</span>
              <input ref={box} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name or NSE symbol" autoComplete="off" spellCheck={false} maxLength={60}
                role="combobox" aria-expanded={list} aria-controls="dcx-hits" aria-autocomplete="list" aria-activedescendant={list ? `dcx-hit-${active}` : undefined}
                onKeyDown={key} onBlur={() => { if (c && !q.trim()) window.setTimeout(() => setEditing(false), 150); }} />
              {c && <button type="button" className="dcx-lk dcx-keep" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(""); setEditing(false); }}>Keep {c.symbol}</button>}
            </label>
          )}
          {list && (
            <ul className="dcf-hits dcx-hits" id="dcx-hits" role="listbox" aria-label="Matching companies">{hits.map((h, k) =>
              <li key={h[0]} role="option" id={`dcx-hit-${k}`} aria-selected={k === active}>
                <button type="button" tabIndex={-1} onMouseEnter={() => setActive(k)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h[0])}><b>{h[1]}</b><span className="mono faint">{h[0]}</span></button></li>)}</ul>)}
          {index.data && q.trim() !== "" && hits.length === 0 && <p className="faint">No listed company matches “{q.trim()}”.</p>}
          {company.isFetching && <p className="muted" aria-live="polite">Loading {sym}…</p>}
          {company.isError && <p className="formerr" role="alert">{(company.error?.body?.detail as string) || "Could not load this company's figures."}</p>}
          {!c && !company.isFetching && <p className="dcx-h">Fills free cash flow, net debt, shares, price and market cap from the company's latest reported figures. Every field stays editable.</p>}
          {c && !company.isFetching && (
            <div className="dcx-sum">
              <div className="dcx-sumh">
                <div className="dcx-sumt">
                  <b>{c.name ?? c.symbol}</b>
                  <span>{codeText(c.symbol)}{c.sector ? ` · ${c.sector}` : ""} · {c.statement === "consolidated" ? "Consolidated" : c.statement === "standalone" ? "Standalone" : c.statement} statements</span>
                  <span className="dcx-sump">Latest reported figures: {c.fcf.latest?.period ?? c.netDebt.period ?? "—"}{c.priceAsOf ? ` · Price as of ${dateIN(c.priceAsOf.slice(0, 10))}` : ""}</span>
                </div>
                <span className={"dcx-got" + (n < 5 ? " part" : "")} title="Free cash flow, net debt, price, market cap and shares">{n === 5 ? <Icon name="check" /> : null}{n} of 5 figures loaded</span>
              </div>
              <button type="button" className="dcx-more" aria-expanded={more} aria-controls="dcx-codet" onClick={() => setMore(!more)}>
                {more ? "Hide company financial details" : "View company financial details"}<span className={"dcx-chev" + (more ? " up" : "")} aria-hidden="true" /></button>
              {more && (
                <div className="dcf-src dcx-codet" id="dcx-codet">
                  <ul>
                    <li>Free cash flow ({c.fcf.latest?.period ?? "—"}): {crs(c.fcf.latest?.fcf)}; 3-year average {crs(c.fcf.avg3)}; 5-year average {crs(c.fcf.avg5)}{c.fcf.cagr5 != null ? `; 5-year growth ${pc(c.fcf.cagr5)} a year` : c.fcf.cagr3 != null ? `; 3-year growth ${pc(c.fcf.cagr3)} a year` : ""}.</li>
                    <li>Net debt ({c.netDebt.period ?? "—"}): borrowings {crs(c.netDebt.borrowings)} − cash {crs(c.netDebt.cash)} = {crs(c.netDebt.value)}. Investments of {crs(c.netDebt.investments)} are not counted as cash; add the liquid part if you judge it surplus.</li>
                    <li>Price {rs(c.price)}{c.priceAsOf ? ` (${dateIN(c.priceAsOf.slice(0, 10))})` : ""}; market capitalisation {crs(c.marketCap, 0)}; shares {c.shares.diluted != null ? `${nf(c.shares.diluted, 2)} crore diluted (${c.shares.period})` : `${nf(c.shares.implied ?? NaN, 2)} crore (market cap ÷ price)`}.</li>
                  </ul>
                  {c.fcf.history.length > 0 && <p className="faint dcf-hist">FCF history: {c.fcf.history.map((h) => `${h.period} ${crs(h.fcf, 0)}`).join(" · ")}</p>}
                  <p className="faint dcf-hist">Source: the company's {c.statement} statements as filed with the exchanges; price from the latest close.</p>
                  {c.notes.map((t) => <p key={t} className="dcf-note" role="note"><Icon name="info" />{t}</p>)}
                </div>)}
            </div>)}
        </div>
        <div className="dcx-dd dcx-cr2"><span className="dcx-ddl"><span id="dcx-basis-l">Starting free cash flow</span><Info g={HELP.basis} /></span>
          <select aria-labelledby="dcx-basis-l" aria-describedby="dcx-basis-h" value={basis} onChange={(e) => { const b = e.target.value as Basis; setBasis(b); if (company.data) onLoad(company.data, b); }}>
            {(["latest", "avg3", "avg5"] as const).map((b) => { const v = c ? fcfOf(c, b) : null;
              return <option key={b} value={b}>{BASIS_LABEL[b]}{c && b === "latest" && c.fcf.latest ? ` (${c.fcf.latest.period})` : ""}{c ? ` · ${v != null ? crs(v, 0) : "not available"}` : ""}</option>; })}
          </select>
          <small className="dcx-h" id="dcx-basis-h">{c ? (fcfFig != null ? "Fills the starting free cash flow field. You can still type over it." : "This choice has no figure for this company; type one in the field.") : "Used once a company is loaded."}</small></div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------------- inputs
type Preset = { value: number; name: string };
/** Where a figure came from (task #396): the company's period or price day while it is untouched, "Edited" once the person types over it. */
export type Src = { text: string; title: string; edited?: boolean } | null;
/** A plain number as the box shows it when not being edited: Indian grouping, the decimals as typed ("1859235.48" -> "18,59,235.48"). Anything else (half
 *  typed, empty, already grouped, exponent) is shown exactly as it is; the form keeps the plain text, so nothing is rounded or rewritten. */
export const grouped = (v: string): string => {
  const m = /^(-?)(\d+)(\.\d*)?$/.exec(v.trim());
  if (!m || m[2].length <= 3 || m[2].length > 15) return v;
  return m[1] + Number(m[2]).toLocaleString("en-IN", { maximumFractionDigits: 0, useGrouping: true }) + (m[3] ?? "");
};
const SrcTag = ({ s }: { s: Src }) => (s ? <span className={"dcx-src" + (s.edited ? " ed" : "")} title={s.title}>{s.text}</span> : null);

/** One assumption (task #396: a number box, no slider). Label + i (+ where the figure came from) and the preset chips on the left, the number box with its
 *  unit on the right; `wide` puts the box under the label at full width. The box keeps the text exactly as typed: no maximum, decimals and minus signs
 *  allowed; a half-typed or empty number gets the usual message under the field, and the value is never changed for the person. Preset chips are
 *  optional shortcuts and light up only while the value equals them (pack #4). */
export function AssumField({ id, label, help, value, onChange, unit, rupee, error, hint, presets, src, wide, placeholder, children }: {
  id: string; label: string; help?: Glossary; value: string; onChange: (v: string) => void; unit?: string; rupee?: boolean; error?: string; hint?: React.ReactNode;
  presets?: Preset[]; src?: Src; wide?: boolean; placeholder?: string; children?: React.ReactNode;
}) {
  const n = parseNum(value);
  const note = error ? `dcf-${id}-err` : hint ? `dcf-${id}-hint` : undefined;
  const [focus, setFocus] = useState(false);
  const shown = focus ? value : grouped(value);
  return (
    <div className={"dcx-f" + (wide ? " fs" : "") + (error ? " err" : "")} data-k={id}>
      <div className="dcx-fm">
        <div className="dcx-fl">
          <label htmlFor={"dcf-" + id}>{label}</label>{help && <Info g={help} />}<SrcTag s={src ?? null} />
        </div>
        {presets && <div className="dcx-pre" role="group" aria-label={`${label} presets`}>{presets.map((p) =>
          <button type="button" key={p.value} aria-pressed={n === p.value} title={p.name} aria-label={`${p.name}, ${p.value}%`} onClick={() => onChange(String(p.value))}>{p.value}%</button>)}</div>}
      </div>
      <div className={"dcx-num" + (rupee ? " pre" : "")}>
        {rupee && <span className="dcx-u l" aria-hidden="true">₹</span>}
        <input id={"dcf-" + id} type="text" inputMode="decimal" value={shown} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={note}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          autoComplete="off" spellCheck={false} maxLength={24} />
        {unit && <span className="dcx-u" aria-hidden="true">{unit}</span>}
      </div>
      {error ? <p className="dcx-h" id={note}>{error}</p> : hint ? <p className="dcx-h" id={note}>{hint}</p> : null}
      {children}
    </div>
  );
}

const GROWTH_CHIPS: Preset[] = Object.values(GROWTH_PRESETS).map((p) => ({ value: p.value, name: p.label }));
const MOS_CHIPS: Preset[] = MOS_PRESETS.map((m) => ({ value: m.value, name: m.label }));

/** CAPM and WACC, in place under the discount rate: six inputs, the cost of equity, the after-tax cost of debt and the WACC, and "Use …". */
function RateBuilder({ onUse }: { onUse: (r: number) => void }) {
  const [t, setT] = useState<Record<keyof CostOfCapital, string>>(() => Object.fromEntries(Object.entries(INDIA_DEFAULTS).map(([k, v]) => [k, String(v)])) as Record<keyof CostOfCapital, string>);
  const c = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, parseNum(v)])) as CostOfCapital;
  const res = costOfCapital(c);
  const ok = Object.values(c).every(Number.isFinite) && c.debtWeight >= 0 && c.debtWeight < 100;
  const inp = (k: keyof CostOfCapital, label: string, unit: string) => (
    <label className="dcx-cf" key={k}><span>{label}</span><span className="dcx-num"><input inputMode="decimal" value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} autoComplete="off" />
      {unit && <span className="dcx-u" aria-hidden="true">{unit}</span>}</span></label>);
  const wacc = Math.round(res.wacc * 100) / 100;
  return (
    <div className="dcx-capm" id="dcx-capm">
      <div className="dcx-cg">{inp("rf", "Risk-free rate", "%")}{inp("beta", "Beta (β)", "")}{inp("erp", "Equity risk premium", "%")}{inp("kd", "Cost of debt, pre-tax", "%")}{inp("tax", "Tax rate", "%")}{inp("debtWeight", "Debt share of capital", "%")}</div>
      {ok ? <div className="dcx-cr" aria-live="polite"><span>Cost of equity <b>{pc(res.ke)}</b></span><span>After-tax cost of debt <b>{pc(res.kdAfterTax)}</b></span><span>WACC <b>{pc(res.wacc)}</b></span>
        <button type="button" className="dcx-btn dcx-bsm" onClick={() => onUse(wacc)}>Use {pc(wacc)}</button></div>
        : <p className="dcx-h dcx-bad">Enter every figure as a number (debt share from 0 up to 100%).</p>}
      <p className="dcx-h">Risk-free: the 10-year government bond yield (about 6.7–6.9% in 2026). Tax 25.17% under section 115BAA. Debt share 0 gives the cost of equity alone, a more conservative rate.</p>
    </div>
  );
}

function Assumptions({ form, set, err, src, dirty, resetTo, onReset }: {
  form: Form; set: <K extends keyof Form>(k: K) => (v: Form[K]) => void; err: (k: string) => string | undefined; src: (k: keyof Form) => Src; dirty: boolean; resetTo: string; onReset: () => void;
}) {
  const [capm, setCapm] = useState(false);
  const [ask, setAsk] = useState(false);
  const pr = parseNum(form.price), mc = parseNum(form.marketCap);
  const derived = pr > 0 && Number.isFinite(mc) ? nf(mc / pr, 2) : "";
  const r = parseNum(form.r);
  const reset = () => { if (dirty) setAsk(true); else onReset(); };
  return (
    <form className="card dcx-in" autoComplete="off" onSubmit={(e) => e.preventDefault()} aria-labelledby="dcx-in-h">
      <div className="dcx-ih"><h2 id="dcx-in-h">Assumptions</h2><span className="dcx-ihs">₹ crore unless stated</span>
        <button type="button" className="dcx-btn ghost dcx-bsm dcx-reset" onClick={reset}><Icon name="refresh" />Reset</button></div>
      {ask && (
        <div className="dcx-ask" role="alertdialog" aria-labelledby="dcx-ask-t">
          <p id="dcx-ask-t">Reset every assumption to {resetTo}? The figures you typed will be replaced.</p>
          <div><button type="button" className="dcx-btn dcx-bsm" onClick={() => { setAsk(false); onReset(); }}>Reset</button>
            <button type="button" className="dcx-btn ghost dcx-bsm" onClick={() => setAsk(false)} autoFocus>Keep my figures</button></div>
        </div>)}
      <fieldset className="dcx-g"><legend>Cash flow and growth</legend>
        <AssumField id="fcf0" label="Starting free cash flow" help={HELP.fcf0} value={form.fcf0} onChange={set("fcf0")} rupee unit="Cr" error={err("fcf0")} src={src("fcf0")} wide />
        <AssumField id="g1" label="Growth, years 1–5" help={HELP.g1} value={form.g1} onChange={set("g1")} unit="%" error={err("g1")} presets={GROWTH_CHIPS} />
        <AssumField id="g2" label="Growth, years 6–10" help={HELP.g2} value={form.g2} onChange={set("g2")} unit="%" error={err("g2")} presets={GROWTH_CHIPS} />
        {form.tvMethod === "gordon" && <AssumField id="gT" label="Terminal growth" help={HELP.gT} value={form.gT} onChange={set("gT")} unit="%" error={err("gT")}
          hint={`Must stay below the discount rate (${Number.isFinite(r) ? pc(r) : "—"}).`} />}
      </fieldset>
      <fieldset className="dcx-g"><legend>Discount rate and margin of safety</legend>
        <AssumField id="r" label="Discount rate" help={HELP.r} value={form.r} onChange={set("r")} unit="%" error={err("r")}>
          <button type="button" className="dcx-lk dcx-capm-l" aria-expanded={capm} aria-controls="dcx-capm" onClick={() => setCapm(!capm)}>{capm ? "Hide the CAPM and WACC working" : "Work it out with CAPM and WACC"}</button>
        </AssumField>
        {capm && <RateBuilder onUse={(v) => set("r")(String(v))} />}
        <AssumField id="mos" label="Margin of safety" help={HELP.mos} value={form.mos} onChange={set("mos")} unit="%" error={err("mos")} presets={MOS_CHIPS} />
      </fieldset>
      <fieldset className="dcx-g"><legend>Price and balance sheet</legend>
        <div className="dcx-g2">
          <AssumField id="marketCap" label="Market cap" help={HELP.marketCap} value={form.marketCap} onChange={set("marketCap")} rupee unit="Cr" error={err("marketCap")} src={src("marketCap")} wide />
          <AssumField id="price" label="Share price" help={HELP.price} value={form.price} onChange={set("price")} rupee error={err("price")} src={src("price")} wide />
          <AssumField id="netDebt" label="Net debt" help={HELP.netDebt} value={form.netDebt} onChange={set("netDebt")} rupee unit="Cr" error={err("netDebt")} src={src("netDebt")} wide hint="Negative for net cash" />
          <AssumField id="shares" label="Shares" help={HELP.shares} value={form.shares} onChange={set("shares")} unit="crore" error={err("shares")} placeholder={derived} src={src("shares")} wide
            hint={form.shares.trim() ? "As entered, instead of market cap ÷ price" : "Empty: market cap ÷ price"} />
        </div>
      </fieldset>
      <fieldset className="dcx-g last"><legend>Terminal value method</legend>
        <div className="dcx-fl"><span className="dcx-lbl" id="dcx-tv-l">Terminal value</span><Info g={HELP.tvMethod} /></div>
        <div className="dcx-seg" role="radiogroup" aria-labelledby="dcx-tv-l">
          {([["gordon", "Growth formula"], ["exit", "Exit multiple"]] as const).map(([k, t]) =>
            <button type="button" role="radio" key={k} aria-checked={form.tvMethod === k} tabIndex={form.tvMethod === k ? 0 : -1} onClick={() => set("tvMethod")(k)}
              onKeyDown={(e) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); const nx = form.tvMethod === "gordon" ? "exit" : "gordon"; set("tvMethod")(nx);
                (e.currentTarget.parentElement?.querySelector(`[data-tv="${nx}"]`) as HTMLElement | null)?.focus(); } }} data-tv={k}>{t}</button>)}
        </div>
        {form.tvMethod === "exit" && <AssumField id="exitMultiple" label="Exit multiple of year-10 FCF" help={HELP.exitMultiple} value={form.exitMultiple} onChange={set("exitMultiple")} unit="×" error={err("exitMultiple")} />}
        <label className="dcx-sw"><input type="checkbox" role="switch" checked={form.midYear} onChange={(e) => set("midYear")(e.target.checked)} /><span className="dcx-swk" aria-hidden="true" /><span>Mid-year convention</span><Info g={HELP.midYear} /></label>
      </fieldset>
    </form>
  );
}

// ------------------------------------------------------------------------------------------------------------- result card
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** One bar from 0: green up to the safety price, amber up to the value, red beyond, with ticks for the safety price, the value and today's price.
 *  Two ticks closer than 88 px read away from each other (the left one leftwards, the right one rightwards). */
export function PriceScale({ safety, value, price }: { safety: number; value: number; price: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const hi = Math.max(safety, value, price) * 1.18;
  const X = (v: number) => Math.max(0, Math.min(100, (v / hi) * 100));
  const marks = [{ k: "mos", lab: "Safety price", v: safety }, { k: "val", lab: "Value", v: value }, { k: "pxm", lab: "Price", v: price }].map((m) => ({ ...m, x: X(m.v), al: "" }));
  const order = [...marks].sort((a, b) => a.x - b.x);
  for (let i = 0; i < order.length - 1; i++) if (w > 0 && ((order[i + 1].x - order[i].x) / 100) * w < 88) { order[i].al = order[i].al || " al-r"; order[i + 1].al = " al-l"; }
  return (
    <div className="dcx-scale" ref={ref} role="img" aria-label={`Safety price ${rs(safety)}, estimated value ${rs(value)}, current price ${rs(price)}`}>
      <div className="dcx-bar"><span className="z g" style={{ width: `${X(safety)}%` }} /><span className="z a" style={{ left: `${X(safety)}%`, width: `${Math.max(0, X(value) - X(safety))}%` }} /><span className="z r" style={{ left: `${X(value)}%`, right: 0 }} /></div>
      {marks.map((m) => <span key={m.k} className={`dcx-mk ${m.k}${m.al}`} style={{ left: `${m.x.toFixed(2)}%` }} aria-hidden="true"><i /><b>{m.lab}</b><em>{rs(m.v)}</em></span>)}
    </div>
  );
}

/** How far the price is from the value, in words that describe and never judge (pack #6: no verdict word). */
export function priceNote(price: number, iv: number): { above: boolean; head: string; by: string; line: string } {
  const above = price > iv;
  return { above, head: above ? "Price above value" : "Price below value", by: `by ${nf(Math.abs((price / iv - 1) * 100), 1)}% on these assumptions`,
    line: above ? "Today's price is higher than the value these assumptions give." : "Today's price is lower than the value these assumptions give." };
}

// ------------------------------------------------------------------------------------------------------------- the working, in tabs
function Built({ i, res }: { i: DcfInputs; res: DcfResult }) {
  const near = res.ev > 0 ? (res.sumPv / res.ev) * 100 : NaN;
  const gordon = i.tvMethod !== "exit";
  const steps: [string, string, string][] = [
    ["Present value of FCF, years 1–10", `Σ FCF_t ÷ (1 + ${pc(i.r)})^${i.midYear ? "(t − 0.5)" : "t"}`, crs(res.sumPv)],
    ["Terminal value at year 10", gordon ? `${crs(res.fcf11)} ÷ (${pc(i.r)} − ${pc(i.gT)})` : `${crs(res.years[9].fcf)} × ${nf(i.exitMultiple ?? NaN, 1)}`, crs(res.tv)],
    ["Present value of terminal value", `${crs(res.tv)} ÷ (1 + ${pc(i.r)})^${i.midYear && gordon ? "9.5" : "10"}`, crs(res.pvTv)],
    ["Enterprise value", `${crs(res.sumPv)} + ${crs(res.pvTv)}`, crs(res.ev)],
    ["Equity value", `${crs(res.ev)} − ${crs(i.netDebt)} net debt`, crs(res.equity)],
    ["Shares outstanding", i.shares ? "as entered" : `${crs(i.marketCap)} ÷ ${rs(i.price)}`, `${nf(res.shares, 4)} crore`],
    ["Intrinsic value per share", `${crs(res.equity)} ÷ ${nf(res.shares, 4)} crore`, rs(res.iv)],
    ["Upside / downside", `(${rs(res.iv)} ÷ ${rs(i.price)} − 1) × 100`, sgn(res.upside)],
    ["Safety price", `${rs(res.iv)} × (1 − ${pc(i.mos)})`, rs(res.buyPrice)],
  ];
  return (<>
    <div className="dcx-comp">
      <div className="dcx-ch"><span>Enterprise value <b>{crs(res.ev)}</b></span><span className="dcx-leg"><i className="dcx-k1" />Years 1–10 · {pc(near, 1)}</span><span className="dcx-leg"><i className="dcx-k2" />Beyond year 10 · {pc(100 - near, 1)}</span></div>
      <div className="dcx-stack" role="img" aria-label={`${nf(100 - near, 1)}% of the enterprise value comes from beyond year 10`}><span className="dcx-k1" style={{ width: `${near}%` }} /><span className="dcx-k2" style={{ width: `${100 - near}%` }} /></div>
    </div>
    <table className="dcx-bridge"><caption className="sr-only">From the present values to the value per share</caption><tbody>
      <tr><td className="op" aria-hidden="true" /><th scope="row">Present value of FCF, years 1–10</th><td>{crs(res.sumPv)}</td></tr>
      <tr><td className="op" aria-hidden="true">+</td><th scope="row">Present value of terminal value</th><td>{crs(res.pvTv)}</td></tr>
      <tr className="sub"><td className="op" aria-hidden="true" /><th scope="row">Terminal value at year 10 ({gordon ? "growth formula" : "exit multiple"}) × discount factor {res.tv !== 0 ? (res.pvTv / res.tv).toFixed(4) : "—"}</th><td>{crs(res.tv)}</td></tr>
      <tr className="tot"><td className="op" aria-hidden="true">=</td><th scope="row">Enterprise value</th><td>{crs(res.ev)}</td></tr>
      <tr><td className="op" aria-hidden="true">{i.netDebt >= 0 ? "−" : "+"}</td><th scope="row">{i.netDebt >= 0 ? "Net debt" : "Net cash"}</th><td>{crs(Math.abs(i.netDebt))}</td></tr>
      <tr className="tot"><td className="op" aria-hidden="true">=</td><th scope="row">Equity value</th><td>{crs(res.equity)}</td></tr>
      <tr><td className="op" aria-hidden="true">÷</td><th scope="row">Shares</th><td>{nf(res.shares, 2)} crore</td></tr>
      <tr className="tot big"><td className="op" aria-hidden="true">=</td><th scope="row">Intrinsic value per share</th><td>{res.equity > 0 ? rs(res.iv) : "N/M"}</td></tr>
    </tbody></table>
    <dl className="dcx-kv">
      <div><dt>Implied exit multiple</dt><dd>{nf(res.exitMultiple, 1)}× FCF</dd></div>
      {!gordon && <div><dt>Implied perpetual growth</dt><dd>{pc(res.impliedGT)}</dd></div>}
      <div><dt>FCF yield at today's EV</dt><dd>{pc(res.impliedFcfYield)}</dd></div>
      <div><dt>Value from beyond year 10</dt><dd>{pc(res.tvShare, 1)}</dd></div>
    </dl>
    <details className="dcx-steps"><summary>Show the formulas, step by step</summary>
      <ol>{steps.map(([w, f, v]) => <li key={w}><span className="w">{w}</span><span className="f">{f}</span><b>{v}</b></li>)}</ol></details>
  </>);
}

function Years({ i, res }: { i: DcfInputs; res: DcfResult }) {
  const max = Math.max(...res.years.map((y) => Math.abs(y.fcf)), 1), H = 120, W = 10;
  const h = (v: number) => (Math.max(0, v) / max) * H;
  return (<>
    <div className="dcx-ch"><span className="dcx-leg"><i className="dcx-k3" />Free cash flow</span><span className="dcx-leg"><i className="dcx-k1" />Its present value</span><span className="faint">₹ crore, years 1–10 (the terminal value is in the table)</span></div>
    <ChartZoom label="Free cash flow and its present value, years 1 to 10">
      <figure className="dcx-yfig">
        <svg className="dcx-yc" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={H} role="img" aria-label="Free cash flow and its present value, years 1 to 10">
          {res.years.map((y, k) => (<g key={y.t}>
            <rect className="yb1" x={k * W + 1.5} y={H - h(y.fcf)} width={W - 3} height={h(y.fcf)}><title>{`Year ${y.t}: FCF ${crs(y.fcf)}`}</title></rect>
            <rect className="yb2" x={k * W + 1.5} y={H - h(y.pv)} width={W - 3} height={h(y.pv)}><title>{`Year ${y.t}: present value ${crs(y.pv)}`}</title></rect></g>))}
        </svg>
        <div className="dcx-yx" aria-hidden="true">{res.years.map((y) => <span key={y.t}>Y{y.t}</span>)}</div>
      </figure>
    </ChartZoom>
    <div className="dcx-tw"><table className="dcx-t"><caption className="sr-only">Projected free cash flow and its present value, year by year</caption>
      <thead><tr><th scope="col">Year</th><th scope="col">Growth</th><th scope="col">FCF (₹ Cr)</th><th scope="col">Discount factor</th><th scope="col">Present value (₹ Cr)</th></tr></thead>
      <tbody>
        {res.years.map((y) => <tr key={y.t}><th scope="row">{y.t}</th><td>{pc(y.growth)}</td><td>{nf(y.fcf, 2)}</td><td>{y.factor.toFixed(4)}</td><td>{nf(y.pv, 2)}</td></tr>)}
        <tr className="tv"><th scope="row">Terminal</th><td>{i.tvMethod === "exit" ? `${nf(i.exitMultiple ?? NaN, 1)}×` : pc(i.gT)}</td><td>{nf(res.tv, 2)}</td><td>{(res.pvTv / res.tv).toFixed(4)}</td><td>{nf(res.pvTv, 2)}</td></tr>
      </tbody>
      <tfoot><tr><th scope="row" colSpan={4}>Enterprise value, ₹ crore</th><td>{nf(res.ev, 2)}</td></tr></tfoot>
    </table></div>
  </>);
}

type SensRows = "gT" | "g1";
function Sensitivity({ i }: { i: DcfInputs }) {
  const [pick, setPick] = useState<SensRows>("gT");
  const rowKey: SensRows = i.tvMethod === "exit" ? "g1" : pick;
  const rows = rowKey === "gT" ? around(i.gT, 0.5) : around(i.g1, 2.5), cols = around(i.r, 1);
  const rowLabel = rowKey === "gT" ? "Terminal growth" : "Growth, years 1–5";
  const grid = useMemo(() => sensitivity(i, rowKey, rows, "r", cols), [i, rowKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const bi = rows.indexOf(i[rowKey]), bj = cols.indexOf(i.r);
  const zone = (v: number | null) => (v == null || v <= 0 ? "na" : i.price <= v * (1 - i.mos / 100) ? "zg" : i.price <= v ? "za" : "zr");
  return (<>
    <div className="dcx-sh">
      <label className="dcx-dd"><span>Rows</span>
        <select value={rowKey} onChange={(e) => setPick(e.target.value as SensRows)}>
          {i.tvMethod !== "exit" && <option value="gT">Terminal growth</option>}<option value="g1">Growth, years 1–5</option></select></label>
      <span className="dcx-sx">Columns: discount rate</span>
    </div>
    <ChartZoom label={`${rowLabel} × discount rate: intrinsic value per share`}>
      <With3D label={`${rowLabel} × discount rate, a 3D surface of value per share; the same numbers are in the table below`}
        hint={`Height is the value per share for each pair (discount rate across, ${rowLabel.toLowerCase()} deep). ${i.price > 0 ? `The glass sheet is today's price, ${rs(i.price)}: where the surface rises above it the value is above the price on those assumptions, where it sinks below it the value is below the price. ` : ""}The ball is your inputs. Move the pointer over the surface to read a cell, and press and drag to turn it.`}
        spec={{ kind: "surface", grid, rowTicks: rows.map((r) => nf(r, 2) + "%"), colTicks: cols.map((c) => nf(c, 2) + "%"), rowTitle: rowLabel, colTitle: "Discount rate", valueTitle: "Value per share (₹)", fmt: (v) => rs(v), level: i.price > 0 ? i.price : undefined, levelName: "Today's price", base: bi >= 0 && bj >= 0 ? [bi, bj] : undefined }}
        flat={null} />
    </ChartZoom>
    <div className="dcx-tw"><table className="dcx-hm"><caption className="sr-only">Intrinsic value per share for each {rowLabel.toLowerCase()} (rows) and discount rate (columns)</caption>
      <thead><tr><th scope="col">{rowLabel} ↓</th>{cols.map((c) => <th key={c} scope="col" className={c === i.r ? "cur" : undefined}>{pc(c)}</th>)}</tr></thead>
      <tbody>{rows.map((rv, a) => <tr key={rv}><th scope="row" className={rv === i[rowKey] ? "cur" : undefined}>{pc(rv)}</th>
        {grid[a].map((v, b) => <td key={b} className={zone(v) + (a === bi && b === bj ? " base" : "")}>{v == null ? "—" : v <= 0 ? "N/M" : rs(v)}</td>)}</tr>)}</tbody>
    </table></div>
    <p className="dcx-lg"><span><i className="zg" />Price at or below the safety price</span><span><i className="za" />Price between safety price and value</span><span><i className="zr" />Price above value</span><span className="b">Outlined: your inputs</span>
      {rowKey === "gT" && <span>— where terminal growth is not below the discount rate</span>}</p>
  </>);
}

type CaseText = Record<"bear" | "bull", { probability: string; g1: string; g2: string; r: string }> & { baseP: string };
const caseText = (c: Scenario[]): CaseText => {
  const t = (s: Scenario) => ({ probability: String(s.probability), g1: String(s.g1), g2: String(s.g2), r: String(s.r) });
  return { bear: t(c[0]), bull: t(c[2]), baseP: String(c[1].probability) };
};
const toCases = (i: DcfInputs, t: CaseText): Scenario[] => [
  { key: "bear", label: "Bear", probability: parseNum(t.bear.probability), g1: parseNum(t.bear.g1), g2: parseNum(t.bear.g2), r: parseNum(t.bear.r) },
  { key: "base", label: "Base", probability: parseNum(t.baseP), g1: i.g1, g2: i.g2, r: i.r },
  { key: "bull", label: "Bull", probability: parseNum(t.bull.probability), g1: parseNum(t.bull.g1), g2: parseNum(t.bull.g2), r: parseNum(t.bull.r) },
];

function Cases({ i, text, setText }: { i: DcfInputs; text: CaseText; setText: (t: CaseText) => void }) {
  const out = scenarios(i, toCases(i, text));
  const cell = (k: "bear" | "bull", f: "probability" | "g1" | "g2" | "r", label: string) =>
    <input aria-label={`${k === "bear" ? "Bear" : "Bull"} ${label}`} inputMode="decimal" value={text[k][f]} autoComplete="off" onChange={(e) => setText({ ...text, [k]: { ...text[k], [f]: e.target.value } })} />;
  const sign = (v: number | null) => (v == null ? "" : v >= 0 ? "dcx-up" : "dcx-dn");
  return (<>
    <div className="dcx-tw"><table className="dcx-t dcx-sc"><caption className="sr-only">Bear, base and bull cases and their weighted value</caption>
      <thead><tr><th scope="col">Case</th><th scope="col">Weight %</th><th scope="col">Growth 1–5 %</th><th scope="col">Growth 6–10 %</th><th scope="col">Discount %</th><th scope="col">Value</th><th scope="col">vs price</th></tr></thead>
      <tbody>{out.rows.map((row) => { const k = row.s.key; return (
        <tr key={k} className={k}><th scope="row">{row.s.label}</th>
          {k === "base" ? <><td><input aria-label="Base weight" inputMode="decimal" value={text.baseP} autoComplete="off" onChange={(e) => setText({ ...text, baseP: e.target.value })} /></td>
            <td><span className="lk">{nf(i.g1, 1)}</span></td><td><span className="lk">{nf(i.g2, 1)}</span></td><td><span className="lk">{nf(i.r, 2)}</span></td></>
            : <><td>{cell(k, "probability", "weight")}</td><td>{cell(k, "g1", "growth 1–5")}</td><td>{cell(k, "g2", "growth 6–10")}</td><td>{cell(k, "r", "discount rate")}</td></>}
          <td><b>{row.iv == null ? "—" : rs(row.iv)}</b></td><td className={sign(row.upside)}>{row.upside == null ? "—" : sgn(row.upside, 1)}</td></tr>); })}</tbody>
      <tfoot><tr><th scope="row" colSpan={5}>Weighted value{Math.abs(out.probabilityTotal - 100) > 1e-9 && Number.isFinite(out.probabilityTotal) ? <small className="dcx-bad"> (weights add to {nf(out.probabilityTotal, 1)}%, not 100%)</small> : null}</th>
        <td><b>{out.weighted == null ? "—" : rs(out.weighted)}</b></td><td className={out.weighted == null ? "" : sign(out.weighted - i.price)}>{out.weighted == null ? "—" : sgn((out.weighted / i.price - 1) * 100, 1)}</td></tr></tfoot>
    </table></div>
    <p className="dcx-h">The base case follows your assumptions on the left; edit the bear and bull cases here.</p>
  </>);
}

function Reverse({ i, ig, ir, cagr5 }: { i: DcfInputs; ig: number | null; ir: number | null; cagr5: number | null }) {
  return (
    <div className="dcx-rv">
      <div className="dcx-rk"><span>Growth in years 1–5 that today's price needs</span><b>{ig == null ? "—" : pc(ig)}</b><small>Yours: {pc(i.g1)}</small>
        <p>{ig == null ? "Outside −50% to 150% a year on these inputs. " : ""}If this is far above what the company has delivered, the price assumes a lot.{cagr5 != null ? ` Its free cash flow grew ${pc(cagr5)} a year over the last 5 years.` : ""}</p></div>
      <div className="dcx-rk"><span>Yearly return the price offers on these cash flows</span><b>{ir == null ? "—" : pc(ir)}</b><small>Yours: {pc(i.r)}</small>
        <p>Below your discount rate means the price is above your value.</p></div>
    </div>
  );
}

const TABS = [["built", "How it is built"], ["years", "Year by year"], ["sens", "Sensitivity"], ["scen", "Bear, base, bull"], ["rev", "Reverse DCF"]] as const;
type Tab = (typeof TABS)[number][0];

function Working({ tab, setTab, children }: { tab: Tab; setTab: (t: Tab) => void; children: React.ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const key = (e: React.KeyboardEvent) => {
    const k = TABS.findIndex(([t]) => t === tab);
    const nx = e.key === "ArrowRight" ? (k + 1) % TABS.length : e.key === "ArrowLeft" ? (k + TABS.length - 1) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (nx < 0) return;
    e.preventDefault(); setTab(TABS[nx][0]);
    (list.current?.querySelector(`#dcx-tab-${TABS[nx][0]}`) as HTMLElement | null)?.focus();
  };
  return (
    <section className="card dcx-detail" aria-label="The working">
      <div className="dcx-tabs" role="tablist" aria-label="The working" ref={list} onKeyDown={key}>
        {TABS.map(([k, t]) => <button type="button" role="tab" key={k} id={`dcx-tab-${k}`} aria-selected={tab === k} aria-controls="dcx-panel" tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>{t}</button>)}
      </div>
      <div className="dcx-panel" id="dcx-panel" data-ct-panel="" role="tabpanel" aria-labelledby={`dcx-tab-${tab}`} tabIndex={0}>{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------------- export and saving
function exportCsv(i: DcfInputs, res: DcfResult, symbol: string) {
  const lines: (string | number)[][] = [["FinLit DCF calculator", symbol || "custom inputs", new Date().toISOString().slice(0, 10)], [],
    ["Input", "Value"], ["Initial FCF (Rs Cr)", i.fcf0], ["Discount rate %", i.r], ["Growth years 1-5 %", i.g1], ["Growth years 6-10 %", i.g2],
    [i.tvMethod === "exit" ? "Exit multiple (x FCF10)" : "Terminal growth %", i.tvMethod === "exit" ? i.exitMultiple ?? "" : i.gT], ["Market capitalisation (Rs Cr)", i.marketCap],
    ["Current share price (Rs)", i.price], ["Net debt (Rs Cr)", i.netDebt], ["Margin of safety %", i.mos], ["Mid-year convention", i.midYear ? "yes" : "no"], ["Shares (crore)", res.shares], [],
    ["Year", "Growth %", "FCF (Rs Cr)", "Discount factor", "PV (Rs Cr)"], ...res.years.map((y) => [y.t, y.growth, y.fcf, y.factor, y.pv]), ["Terminal value", "", res.tv, res.pvTv / res.tv, res.pvTv], [],
    ["Result", "Value"], ["Enterprise value (Rs Cr)", res.ev], ["Equity value (Rs Cr)", res.equity], ["Intrinsic value per share (Rs)", res.iv], ["Upside %", res.upside],
    ["Safety price (Rs)", res.buyPrice], ["Price against value", STATUS_TEXT[res.status].label], ["Terminal value share of EV %", res.tvShare]];
  const csv = lines.map((r) => r.map((c) => { const s = csvText(String(c)); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `finlit-dcf-${symbol || "custom"}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

type Saved = { name: string; symbol: string | null; note: string | null; updatedAt: string; inputs: DcfInputs & { g1Preset?: GrowthPreset; g2Preset?: GrowthPreset } };
function SavedScenarios({ enabled, form, onOpen }: { enabled: boolean; form: Form; onOpen: (f: Form) => void }) {
  const qc = useQueryClient();
  const { toast } = useUI();
  const list = useQuery<{ scenarios: Saved[]; max: number }, ApiError>({ queryKey: ["dcf-scenarios"], queryFn: () => apiGet("/api/dcf/scenarios"), enabled: enabled && !DEMO, retry: false });
  const [name, setName] = useState("");
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const save = async () => {
    const n = name.trim() || (form.symbol ? `${form.symbol} ${new Date().toISOString().slice(0, 10)}` : "");
    if (!n) { toast("Give the scenario a name."); return; }
    const i = toInputs(form);
    try {
      await apiSend("PUT", `/api/dcf/scenarios/${encodeURIComponent(n)}`, { inputs: { ...i, shares: i.shares ?? null, exitMultiple: i.exitMultiple ?? null, g1Preset: presetOf(i.g1), g2Preset: presetOf(i.g2) }, symbol: form.symbol || null });
      setName(""); toast(`Saved “${n}”.`); qc.invalidateQueries({ queryKey: ["dcf-scenarios"] });
    } catch (e) { toast((e as ApiError)?.body?.detail as string || "Could not save: check that every input is a number."); }
  };
  const remove = async (n: string) => { await apiSend("DELETE", `/api/dcf/scenarios/${encodeURIComponent(n)}`); qc.invalidateQueries({ queryKey: ["dcf-scenarios"] }); };
  const open = (s: Saved) => { const x = s.inputs; onOpen({ ...DEFAULT, fcf0: String(x.fcf0), r: String(x.r), g1: String(x.g1), g2: String(x.g2), gT: String(x.gT), marketCap: String(x.marketCap), price: String(x.price),
    netDebt: String(x.netDebt), mos: String(x.mos), midYear: !!x.midYear, tvMethod: x.tvMethod === "exit" ? "exit" : "gordon", exitMultiple: x.exitMultiple != null ? String(x.exitMultiple) : DEFAULT.exitMultiple,
    shares: x.shares != null ? String(x.shares) : "", symbol: s.symbol ?? "" }); };
  return (
    <div className="dcx-save">
      <div className="dcx-save-r"><input ref={box} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (enabled && !DEMO) save(); } }}
        placeholder="Name this scenario" maxLength={80} aria-label="Scenario name" disabled={DEMO} />
        <button className="dcx-btn dcx-bsm" type="button" onClick={save} disabled={!enabled || DEMO}>Save</button></div>
      {DEMO ? <p className="dcx-h">Saving scenarios needs a FinLit account; the share link keeps your inputs.</p>
        : !enabled ? <p className="dcx-h">Saving scenarios needs a Gold account; the share link keeps your inputs.</p> : null}
      {list.isError && <p className="formerr">{(list.error?.body?.detail as string) || "Saved scenarios could not be loaded."}</p>}
      {list.data && (list.data.scenarios.length ? (
        <ul className="dcx-saved" aria-label="Your saved scenarios">{list.data.scenarios.map((s) => <li key={s.name}><button type="button" className="dcx-lk" onClick={() => open(s)}>{s.name}</button>
          <span className="faint">{s.symbol ? `${s.symbol} · ` : ""}{dateIN(s.updatedAt.slice(0, 10))}</span>
          <button type="button" className="dcx-lk dcx-del" onClick={() => remove(s.name)} aria-label={`Delete ${s.name}`}>Delete</button></li>)}</ul>)
        : <p className="dcx-h">No saved scenarios yet (up to {list.data.max}).</p>)}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------- methodology (task #396)
/** The method in brief, below the calculator: the same formulas the engine uses (lib/dcf.ts), in words. */
function Methodology() {
  return (
    <section className="card dcx-meth" aria-labelledby="dcx-meth-h">
      <h2 id="dcx-meth-h">Methodology and important notes</h2>
      <div className="dcx-mg">
        <div>
          <p><b>Projection.</b> Starting free cash flow grows at the years 1–5 rate, then at the years 6–10 rate. Year <i>t</i> cash flow is discounted by (1 + discount rate)<sup>t</sup>. With the mid-year convention on, cash is assumed to arrive mid-year, so year <i>t</i> is discounted by (1 + rate)<sup>t − 0.5</sup>.</p>
          <p><b>Terminal value.</b> The growth formula (Gordon growth) values every year after year 10 as FCF<sub>10</sub> × (1 + terminal growth) ÷ (discount rate − terminal growth); it needs the discount rate to be above terminal growth. The exit multiple method values the business at year 10 as FCF<sub>10</sub> × the multiple. Either is discounted back from year 10.</p>
        </div>
        <div>
          <p><b>From enterprise to share value.</b> Equity value = enterprise value − net debt (borrowings − cash). Investments are not counted as cash; add the liquid part to cash yourself if you judge it surplus. Value per share = equity value ÷ shares outstanding. If shares are left blank, they are worked out as market cap ÷ share price.</p>
          <p><b>Safety price</b> = value per share × (1 − margin of safety). <b>FCF yield</b> compares next year's free cash flow with today's enterprise value (market cap + net debt).</p>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------------- page
export function DcfPage() {
  useDocTitle("Fair value calculator", "Discounted cash flow (DCF) calculator: intrinsic value per share, margin of safety, sensitivity and reverse DCF, with the working shown step by step.");
  const { has, toast } = useUI();
  const { user } = useAuth();
  const gold = has("gold");
  const [sp, setSp] = useSearchParams();
  const [form, setForm] = useState<Form>(() => fromParams(sp));
  const [loaded, setLoaded] = useState<Company | null>(null);
  const [tab, setTab] = useState<Tab>("built");
  const [saveOpen, setSaveOpen] = useState(false);
  const intro = useIntroOpen(user?.id ?? null);
  useEffect(() => { const h = window.setTimeout(() => setSp(toParams(form), { replace: true }), 300); return () => window.clearTimeout(h); }, [form]);   // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback(<K extends keyof Form>(k: K) => (v: Form[K]) => setForm((f) => ({ ...f, [k]: v })), []);
  const inputs = useMemo(() => toInputs(form), [form]);
  const out = useMemo(() => run(inputs), [inputs]);
  const err = (k: string) => out.errors.find((e) => e.field === k)?.text;
  const res = out.result;
  // the result side follows every key; the heavier working (sensitivity grid, 3D surface) may trail a frame behind while typing fast
  const di = useDeferredValue(inputs), dres = useMemo(() => run(di).result, [di]);
  const ig = useMemo(() => (dres ? impliedGrowth(di) : null), [dres, di]);
  const ir = useMemo(() => (dres ? impliedReturn(di) : null), [dres, di]);

  // bear and bull follow the assumptions until they are edited here, as before: a new growth or discount rate starts them again from it
  const [cases, setCases] = useState<CaseText>(() => caseText(defaultScenarios(inputs)));
  useEffect(() => { if (Number.isFinite(inputs.g1) && Number.isFinite(inputs.g2) && Number.isFinite(inputs.r)) setCases((c) => ({ ...caseText(defaultScenarios(inputs)), baseP: c.baseP })); }, [inputs.g1, inputs.g2, inputs.r]);   // eslint-disable-line react-hooks/exhaustive-deps
  const scen = useMemo(() => scenarios(inputs, toCases(inputs, cases)), [inputs, cases]);

  // task #396: a company fills its five figures and nothing else; a figure it does not have is left empty (never kept from the company before), and each
  // filled figure carries its source badge while it is untouched
  const [basisNow, setBasisNow] = useState<Basis>("latest");
  const onCompany = (c: Company, basis: Basis) => {
    setLoaded(c); setBasisNow(basis);
    setForm((f) => withCompany(f, c, basis));
    const miss = [fcfOf(c, basis) == null && "free cash flow", c.price == null && "share price", c.marketCap == null && "market cap", c.netDebt.value == null && "net debt"].filter(Boolean);
    if (miss.length) toast(`This company has no ${miss.join(", ")} figure${miss.length > 1 ? "s" : ""} for that choice; enter ${miss.length > 1 ? "them" : "it"} by hand.`);
  };
  const companyVals = useMemo(() => (loaded ? withCompany(DEFAULT, loaded, basisNow) : null), [loaded, basisNow]);
  const src = (k: keyof Form): Src => {
    if (!loaded || !companyVals || form.symbol !== loaded.symbol || companyVals[k] === "") return null;
    const tag = k === "fcf0" ? basisTag(loaded, basisNow) : k === "price" || k === "marketCap" ? dayTag(loaded.priceAsOf) : k === "netDebt" ? loaded.netDebt.period : k === "shares" ? loaded.shares.period : null;
    if (!tag) return null;
    return String(form[k]) === String(companyVals[k]) ? { text: tag, title: `From ${loaded.name ?? loaded.symbol}'s reported figures (${tag})` }
      : { text: "Edited", title: `You changed ${loaded.name ?? loaded.symbol}'s figure (${tag}: ${companyVals[k]})`, edited: true };
  };
  // × on the chosen company: its figures go back to the starting example, the person's own assumptions stay (as on the P/E, EPS & PEG calculator, #156)
  const onClear = () => { setLoaded(null); setForm((f) => ({ ...f, symbol: "", fcf0: DEFAULT.fcf0, price: DEFAULT.price, marketCap: DEFAULT.marketCap, netDebt: DEFAULT.netDebt, shares: DEFAULT.shares })); };
  const copyLink = async () => { try { await navigator.clipboard.writeText(location.href); toast("Link copied: it opens the calculator with these inputs."); } catch { toast("Copy the address from the browser bar."); } };

  // the summary strip shows while the result card is off screen
  const card = useRef<HTMLElement>(null);
  const [mini, setMini] = useState(false);
  useEffect(() => {
    let raf = 0;
    const check = () => { raf = 0; const el = card.current; if (!el) { setMini(false); return; } const b = el.getBoundingClientRect(); setMini(b.bottom < 90 || b.top > window.innerHeight - 40); };
    const on = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [res != null]);
  const toCard = () => { const el = card.current; if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" }); };

  const ok = res && res.equity > 0;
  const note = ok ? priceNote(inputs.price, res.iv) : null;
  const zero = (v: number | null) => (v == null ? "—" : "₹" + nf(v, 0));
  const resetForm = loaded && form.symbol === loaded.symbol ? withCompany(DEFAULT, loaded, basisNow) : DEFAULT;
  const dirty = (Object.keys(DEFAULT) as (keyof Form)[]).some((k) => String(form[k]) !== String(resetForm[k]));
  const reset = () => setForm(resetForm);

  return (
    <>
      <PageHeader wrap plan="gold" title="DCF valuation calculator" art="calculator" links={["/eps-calculator", "/sip-calculator", "/outlook"]}
        learn={{ onClick: () => { intro.set(true); requestAnimationFrame(() => document.querySelector(".dcf-intro")?.scrollIntoView({ behavior: "smooth", block: "start" })); } }}
        description="A company's intrinsic value from its projected cash flows, with every step shown and checked." />
      <div className="wrap dcf dcx">
        <DcfIntro open={intro.open} onOpenChange={intro.set} />
        <Gate tier="gold" title="DCF calculator" points={["Intrinsic value per share, margin of safety and the safety price", "Load any listed company's cash flow, debt and shares", "Sensitivity grids, reverse DCF and bear/base/bull cases", "Save scenarios, share links and export to Excel (CSV)"]}>
          <CompanyBar enabled={gold && !!user && !DEMO} onLoad={onCompany} onClear={onClear} loaded={loaded} initial={sp.get("load") === "1" && form.symbol ? form.symbol.toUpperCase() : null} />
          <div className="dcx-ws">
            <div id="dcx-in"><Assumptions form={form} set={set} err={err} src={src} dirty={dirty} resetTo={loaded && form.symbol === loaded.symbol ? `${loaded.name ?? loaded.symbol}'s figures and the starting assumptions` : "the starting example"} onReset={reset} /></div>
            <div id="dcx-out">
              {!res ? (
                <section className="card dcx-res" aria-label="Result" ref={card}>
                  <div className="dcx-err" role="alert"><b>No value on these inputs</b>
                    <ul>{out.errors.map((e) => <li key={e.field + e.text}>{e.text}</li>)}</ul></div>
                </section>
              ) : (<>
                <section className="card dcx-res" aria-label="Result" ref={card}>
                  <div className="dcx-rh">
                    <div className="dcx-ivb"><span className="dcx-k">Intrinsic value per share{form.symbol ? ` · ${form.symbol}` : ""}</span><div className="dcx-v" aria-live="polite">{ok ? rs(res.iv) : "N/M"}</div>
                      <span className="dcx-ivs">Estimated from your assumptions · not a forecast of the share price</span></div>
                    {note ? <div className={"dcx-pill " + (note.above ? "dcx-dn" : "dcx-up")} role="status"><b>{note.head} {note.by.replace(" on these assumptions", "")}</b><span>{note.line}</span></div>
                      : <div className="dcx-pill dcx-nm" role="status"><b>No value per share</b><span>{STATUS_TEXT["not-meaningful"].text}</span></div>}
                  </div>
                  {ok && <PriceScale safety={res.buyPrice} value={res.iv} price={inputs.price} />}
                  <dl className="dcx-kpis">
                    <div><dt>Current price</dt><dd>{rs(inputs.price)}</dd>{loaded?.priceAsOf && form.symbol === loaded.symbol && <small>{dateIN(loaded.priceAsOf.slice(0, 10))}</small>}</div>
                    <div><dt>Upside / downside</dt><dd className={ok ? (res.upside >= 0 ? "dcx-up" : "dcx-dn") : ""}>{ok ? sgn(res.upside) : "—"}</dd><small>Value against price</small></div>
                    <div><dt>Safety price ({nf(inputs.mos, 0)}%)</dt><dd>{ok ? rs(res.buyPrice) : "—"}</dd><small>Value × {nf(1 - inputs.mos / 100, 2)}</small></div>
                    <div><dt>Bear · base · bull</dt><dd className="dcx-bbb">{scen.rows.map((x, k) => <span key={x.s.key} className={k === 0 ? "dcx-dn" : k === 2 ? "dcx-up" : undefined}>{k ? " · " : ""}{zero(x.iv)}</span>)}</dd>
                      <small>{scen.weighted != null ? `Weighted ${rs(scen.weighted)}` : "Weights do not add to 100%"}</small></div>
                  </dl>
                  {out.warnings.length > 0 && <div className="dcx-warn" role="note"><b>Worth a second look: allowed, but unusual</b><ul>{out.warnings.map((w) => <li key={w.text}>{w.text}</li>)}</ul></div>}
                  <div className="dcx-acts">
                    <button type="button" className="dcx-btn ghost" onClick={copyLink}>Copy share link</button>
                    <button type="button" className="dcx-btn ghost" onClick={() => exportCsv(inputs, res, form.symbol)}>Download CSV</button>
                    <button type="button" className="dcx-btn ghost" onClick={() => window.print()}>Print / PDF</button>
                    <button type="button" className="dcx-btn dcx-savebtn" aria-expanded={saveOpen} onClick={() => setSaveOpen(!saveOpen)}>Save scenario</button>
                  </div>
                  {saveOpen && <SavedScenarios enabled={gold && !!user} form={form} onOpen={(f) => { setForm(f); setLoaded(null); }} />}
                </section>
                {dres && <Working tab={tab} setTab={setTab}>
                  {tab === "built" ? <Built i={di} res={dres} /> : tab === "years" ? <Years i={di} res={dres} /> : tab === "sens" ? <Sensitivity i={di} />
                    : tab === "scen" ? <Cases i={inputs} text={cases} setText={setCases} /> : <Reverse i={di} ig={ig} ir={ir} cagr5={loaded && form.symbol === loaded.symbol ? loaded.fcf.cagr5 : null} />}
                </Working>}
              </>)}
            </div>
          </div>
          <div className={"dcx-mini" + (mini ? " show" : "")} aria-hidden={!mini}>
            {ok ? <><span>Value <b>{rs(res.iv)}</b></span><span>Price <b>{rs(inputs.price)}</b></span><span className={res.upside >= 0 ? "dcx-up" : "dcx-dn"}><b>{sgn(res.upside, 1)}</b></span></>
              : <span>No value on these inputs</span>}
            <button type="button" tabIndex={mini ? 0 : -1} onClick={toCard}>See the working</button>
          </div>
        </Gate>
        <Methodology />
        <p className="faint dcf-disc">A DCF value is only as good as its assumptions: small changes in growth or discount rate move it a lot. This is a calculation tool for education, not investment advice. The intrinsic value is an estimate from the inputs above, not a forecast of the future share price. <Link to="/glossary#discounted-cash-flow-dcf">What is a DCF?</Link></p>
      </div>
    </>
  );
}
