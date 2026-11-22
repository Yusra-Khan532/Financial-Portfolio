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

/** The company bar: one row with the search (Gold) and the Starting free cash flow dropdown, one line of help, and the loaded company's sources. */
function CompanyBar({ enabled, onLoad, loaded, initial }: { enabled: boolean; onLoad: (c: Company, basis: Basis) => void; loaded: Company | null; initial: string | null }) {
  const [q, setQ] = useState("");
  const [sym, setSym] = useState<string | null>(initial);   // opened from a stock page ("Value (DCF)"): that company loads at once
  const [basis, setBasis] = useState<Basis>("latest");
  const sf = useIndexFilter(true), index = sf.idx;
  const hits = useMemo(() => sf.search(q, 8), [sf.search, q]);   // name, symbol, BSE/NSE code or ISIN

  const company = useQuery<Company, ApiError>({ queryKey: ["dcf-company", sym], queryFn: () => apiGet(`/api/dcf/company/${encodeURIComponent(sym as string)}`), enabled: enabled && !!sym, retry: false, staleTime: 300_000 });
  useEffect(() => { if (company.data && company.data.symbol === sym) onLoad(company.data, basis); }, [company.data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const c = loaded;
  const pick = (s: string) => { setSym(s); setQ(""); };
  return (
    <section className="card dcx-co" aria-label="Start from a listed company">
      <div className="dcx-cor">
        <span className="dcx-cot">Start from a listed company <span className="tier gold">Gold</span></span>
        <label className="dcx-search"><Icon name="search" /><span className="sr-only">Search a company</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name or NSE symbol" autoComplete="off" spellCheck={false} maxLength={60}
            onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { e.preventDefault(); pick(hits[0][0]); } }} /></label>
        <label className="dcx-dd"><span>Starting free cash flow</span>
          <select value={basis} onChange={(e) => { const b = e.target.value as Basis; setBasis(b); if (company.data) onLoad(company.data, b); }}>
            <option value="latest">Latest year</option><option value="avg3">Average of 3 years</option><option value="avg5">Average of 5 years</option>
          </select></label>
      </div>
      <p className="dcx-h">Fills free cash flow, net debt, shares, price and market cap from the company's latest reported figures. Every field stays editable.</p>
      {q.trim() !== "" && hits.length > 0 && (
        <ul className="dcf-hits" aria-label="Matching companies">{hits.map((h) => <li key={h[0]}><button type="button" onClick={() => pick(h[0])}><b>{h[1]}</b><span className="mono faint">{h[0]}</span></button></li>)}</ul>)}
      {index.data && q.trim() !== "" && hits.length === 0 && <p className="faint">No listed company matches “{q.trim()}”.</p>}
      {company.isFetching && <p className="muted" aria-live="polite">Loading {sym}…</p>}
      {company.isError && <p className="formerr" role="alert">{(company.error?.body?.detail as string) || "Could not load this company's figures."}</p>}
      {c && !company.isFetching && (
        <div className="dcf-src">
          <p><b>{c.name ?? c.symbol}</b> <span className="mono faint">{codeText(c.symbol)}</span>{c.sector ? ` · ${c.sector}` : ""} · {c.statement} statements</p>
          <ul>
            <li>Free cash flow ({c.fcf.latest?.period ?? "—"}): {crs(c.fcf.latest?.fcf)}; 3-year average {crs(c.fcf.avg3)}; 5-year average {crs(c.fcf.avg5)}{c.fcf.cagr5 != null ? `; 5-year growth ${pc(c.fcf.cagr5)} a year` : c.fcf.cagr3 != null ? `; 3-year growth ${pc(c.fcf.cagr3)} a year` : ""}.</li>
            <li>Net debt ({c.netDebt.period ?? "—"}): borrowings {crs(c.netDebt.borrowings)} − cash {crs(c.netDebt.cash)} = {crs(c.netDebt.value)}. Investments of {crs(c.netDebt.investments)} are not counted as cash; add the liquid part if you judge it surplus.</li>
            <li>Price {rs(c.price)}{c.priceAsOf ? ` (${dateIN(c.priceAsOf.slice(0, 10))})` : ""}; market capitalisation {crs(c.marketCap, 0)}; shares {c.shares.diluted != null ? `${nf(c.shares.diluted, 2)} crore diluted (${c.shares.period})` : `${nf(c.shares.implied ?? NaN, 2)} crore (market cap ÷ price)`}.</li>
          </ul>
          {c.fcf.history.length > 0 && <p className="faint dcf-hist">FCF history: {c.fcf.history.map((h) => `${h.period} ${crs(h.fcf, 0)}`).join(" · ")}</p>}
          {c.notes.map((n) => <p key={n} className="dcf-note" role="note"><Icon name="info" />{n}</p>)}
        </div>)}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------------- inputs
/** Round up to 1, 2 or 5 times a power of ten. */
const niceUp = (n: number) => { if (!(n > 0)) return 1; const m = 10 ** Math.floor(Math.log10(n)); return ([1, 2, 5, 10].map((k) => k * m).find((v) => v >= n) ?? n); };
const decimalsOf = (step: number) => Math.min(4, (String(step).split(".")[1] ?? "").length);

type Preset = { value: number; name: string };
/** One assumption: label + i (and preset chips on the same line), then a number box with its unit and a slim slider beside it. The box keeps the text as
 *  typed (a half-typed or empty number still gets the usual message); the slider covers a sensible range that widens when a typed or loaded value lies
 *  outside it. Preset chips light up only when the value equals them (pack #4). */
export function SliderField({ id, label, help, value, onChange, unit, rupee, error, hint, min, max, step, presets, children }: {
  id: string; label: string; help?: Glossary; value: string; onChange: (v: string) => void; unit?: string; rupee?: boolean; error?: string; hint?: React.ReactNode;
  min: number; max: number; step?: number; presets?: Preset[]; children?: React.ReactNode;
}) {
  const n = parseNum(value);
  const lo = Number.isFinite(n) && n < min ? -niceUp(-n) : min, hi = Number.isFinite(n) && n > max ? niceUp(n * 1.1) : max;
  const st = step ?? Math.max(1, niceUp((hi - lo) / 200));
  const dp = decimalsOf(st), pos = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
  const fill = hi > lo ? ((pos - lo) / (hi - lo)) * 100 : 0;
  const note = error ? `dcf-${id}-err` : hint ? `dcf-${id}-hint` : undefined;
  return (
    <div className={"dcx-f" + (error ? " err" : "")} data-k={id}>
      <div className="dcx-fl">
        <label htmlFor={"dcf-" + id}>{label}</label>{help && <Info g={help} />}
        {presets && <div className="dcx-pre" role="group" aria-label={`${label} presets`}>{presets.map((p) =>
          <button type="button" key={p.value} aria-pressed={n === p.value} title={p.name} aria-label={`${p.name}, ${p.value}%`} onClick={() => onChange(String(p.value))}>{p.value}%</button>)}</div>}
      </div>
      <div className="dcx-fr">
        <div className={"dcx-num" + (rupee ? " pre" : "")}>
          {rupee && <span className="dcx-u l" aria-hidden="true">₹</span>}
          <input id={"dcf-" + id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={note}
            autoComplete="off" spellCheck={false} maxLength={24} />
          {unit && <span className="dcx-u" aria-hidden="true">{unit}</span>}
        </div>
        <input type="range" className="dcx-rng" aria-label={`${label}, slider`} min={lo} max={hi} step={st} value={pos} style={{ "--fill": `${fill}%` } as React.CSSProperties}
          aria-valuetext={`${(pos < 0 ? "−" : "") + nf(Math.abs(pos), dp)}${unit ? " " + unit : ""}`} onChange={(e) => onChange(String(Math.round(Number(e.target.value) * 10 ** dp) / 10 ** dp))} />
      </div>
      {error ? <p className="dcx-h" id={note}>{error}</p> : hint ? <p className="dcx-h" id={note}>{hint}</p> : null}
      {children}
    </div>
  );
}

/** A figure without a slider (price and balance sheet): label + i, then the number box with its unit. */
export function NumField({ id, label, help, value, onChange, unit, rupee, error, hint, placeholder }: {
  id: string; label: string; help?: Glossary; value: string; onChange: (v: string) => void; unit?: string; rupee?: boolean; error?: string; hint?: string; placeholder?: string;
}) {
  const note = error ? `dcf-${id}-err` : hint ? `dcf-${id}-hint` : undefined;
  return (
    <div className={"dcx-f fs" + (error ? " err" : "")} data-k={id}>
      <div className="dcx-fl"><label htmlFor={"dcf-" + id}>{label}</label>{help && <Info g={help} />}</div>
      <div className={"dcx-num" + (rupee ? " pre" : "")}>
        {rupee && <span className="dcx-u l" aria-hidden="true">₹</span>}
        <input id={"dcf-" + id} inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={note}
          autoComplete="off" spellCheck={false} maxLength={24} />
        {unit && <span className="dcx-u" aria-hidden="true">{unit}</span>}
      </div>
      {error ? <p className="dcx-h" id={note}>{error}</p> : hint ? <p className="dcx-h" id={note}>{hint}</p> : null}
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

function Assumptions({ form, set, err, onReset }: { form: Form; set: <K extends keyof Form>(k: K) => (v: Form[K]) => void; err: (k: string) => string | undefined; onReset: () => void }) {
  const [capm, setCapm] = useState(false);
  const pr = parseNum(form.price), mc = parseNum(form.marketCap);
  const derived = pr > 0 && Number.isFinite(mc) ? nf(mc / pr, 2) : "";
  const r = parseNum(form.r);
  return (
    <form className="card dcx-in" autoComplete="off" onSubmit={(e) => e.preventDefault()} aria-labelledby="dcx-in-h">
      <div className="dcx-ih"><h2 id="dcx-in-h">Assumptions</h2><span className="dcx-ihs">₹ crore unless stated</span><button type="button" className="dcx-lk" onClick={onReset}>Reset</button></div>
      <fieldset className="dcx-g"><legend>Cash flow and growth</legend>
        <SliderField id="fcf0" label="Starting free cash flow" help={HELP.fcf0} value={form.fcf0} onChange={set("fcf0")} rupee unit="Cr" error={err("fcf0")} min={0} max={1000} />
        <SliderField id="g1" label="Growth, years 1–5" help={HELP.g1} value={form.g1} onChange={set("g1")} unit="%" error={err("g1")} min={-10} max={50} step={0.5} presets={GROWTH_CHIPS} />
        <SliderField id="g2" label="Growth, years 6–10" help={HELP.g2} value={form.g2} onChange={set("g2")} unit="%" error={err("g2")} min={-10} max={50} step={0.5} presets={GROWTH_CHIPS} />
        {form.tvMethod === "gordon" && <SliderField id="gT" label="Terminal growth" help={HELP.gT} value={form.gT} onChange={set("gT")} unit="%" error={err("gT")} min={0} max={12} step={0.25}
          hint={`Must stay below the discount rate (${Number.isFinite(r) ? pc(r) : "—"}).`} />}
      </fieldset>
      <fieldset className="dcx-g"><legend>Discount rate and margin of safety</legend>
        <SliderField id="r" label="Discount rate" help={HELP.r} value={form.r} onChange={set("r")} unit="%" error={err("r")} min={1} max={30} step={0.25}>
          <button type="button" className="dcx-lk dcx-capm-l" aria-expanded={capm} aria-controls="dcx-capm" onClick={() => setCapm(!capm)}>{capm ? "Hide the CAPM and WACC working" : "Work it out with CAPM and WACC"}</button>
        </SliderField>
        {capm && <RateBuilder onUse={(v) => set("r")(String(v))} />}
        <SliderField id="mos" label="Margin of safety" help={HELP.mos} value={form.mos} onChange={set("mos")} unit="%" error={err("mos")} min={0} max={80} step={5} presets={MOS_CHIPS} />
      </fieldset>
      <fieldset className="dcx-g"><legend>Price and balance sheet</legend>
        <div className="dcx-g2">
          <NumField id="marketCap" label="Market cap" help={HELP.marketCap} value={form.marketCap} onChange={set("marketCap")} rupee unit="Cr" error={err("marketCap")} />
          <NumField id="price" label="Share price" help={HELP.price} value={form.price} onChange={set("price")} rupee error={err("price")} />
          <NumField id="netDebt" label="Net debt" help={HELP.netDebt} value={form.netDebt} onChange={set("netDebt")} rupee unit="Cr" error={err("netDebt")} hint="Negative for net cash" />
          <NumField id="shares" label="Shares" help={HELP.shares} value={form.shares} onChange={set("shares")} unit="crore" error={err("shares")} placeholder={derived}
            hint={form.shares.trim() ? "As entered, instead of market cap ÷ price" : "Empty: market cap ÷ price"} />
        </div>
      </fieldset>
      <fieldset className="dcx-g last"><legend>Method</legend>
        <div className="dcx-fl"><span className="dcx-lbl" id="dcx-tv-l">Terminal value</span><Info g={HELP.tvMethod} /></div>
        <div className="dcx-seg" role="radiogroup" aria-labelledby="dcx-tv-l">
          {([["gordon", "Growth formula"], ["exit", "Exit multiple"]] as const).map(([k, t]) =>
            <button type="button" role="radio" key={k} aria-checked={form.tvMethod === k} tabIndex={form.tvMethod === k ? 0 : -1} onClick={() => set("tvMethod")(k)}
              onKeyDown={(e) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); const nx = form.tvMethod === "gordon" ? "exit" : "gordon"; set("tvMethod")(nx);
                (e.currentTarget.parentElement?.querySelector(`[data-tv="${nx}"]`) as HTMLElement | null)?.focus(); } }} data-tv={k}>{t}</button>)}
        </div>
        {form.tvMethod === "exit" && <SliderField id="exitMultiple" label="Exit multiple of year-10 FCF" help={HELP.exitMultiple} value={form.exitMultiple} onChange={set("exitMultiple")} unit="×" error={err("exitMultiple")} min={1} max={60} step={0.5} />}
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
export function priceNote(price: number, iv: number): { above: boolean; head: string; by: string } {
  const above = price > iv;
  return { above, head: above ? "Price above value" : "Price below value", by: `by ${nf(Math.abs((price / iv - 1) * 100), 1)}% on these assumptions` };
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
      <tr><th scope="row">Present value of FCF, years 1–10</th><td>{crs(res.sumPv)}</td></tr>
      <tr><th scope="row">+ Present value of terminal value</th><td>{crs(res.pvTv)}</td></tr>
      <tr className="tot"><th scope="row">= Enterprise value</th><td>{crs(res.ev)}</td></tr>
      <tr><th scope="row">{i.netDebt >= 0 ? "− Net debt" : "+ Net cash"}</th><td>{crs(-i.netDebt)}</td></tr>
      <tr className="tot"><th scope="row">= Equity value</th><td>{crs(res.equity)}</td></tr>
      <tr><th scope="row">÷ Shares</th><td>{nf(res.shares, 2)} crore</td></tr>
      <tr className="tot big"><th scope="row">= Intrinsic value per share</th><td>{res.equity > 0 ? rs(res.iv) : "N/M"}</td></tr>
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

  const onCompany = (c: Company, basis: Basis) => {
    const fcf = basis === "avg3" ? c.fcf.avg3 : basis === "avg5" ? c.fcf.avg5 : c.fcf.latest?.fcf;
    setLoaded(c);
    setForm((f) => ({ ...f, symbol: c.symbol, fcf0: fcf != null ? String(Math.round(fcf * 100) / 100) : "", price: c.price != null ? String(c.price) : f.price,
      marketCap: c.marketCap != null ? String(Math.round(c.marketCap * 100) / 100) : f.marketCap, netDebt: c.netDebt.value != null ? String(Math.round(c.netDebt.value * 100) / 100) : "",
      shares: c.shares.diluted != null ? String(c.shares.diluted) : "" }));
    if (fcf == null) toast("This company has no free cash flow figure for that choice; enter one by hand.");
  };
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
  const reset = () => { setForm(DEFAULT); setLoaded(null); };

  return (
    <>
      <PageHeader wrap plan="gold" title="DCF valuation calculator" art="calculator" links={["/eps-calculator", "/sip-calculator", "/outlook"]}
        learn={{ onClick: () => { intro.set(true); requestAnimationFrame(() => document.querySelector(".dcf-intro")?.scrollIntoView({ behavior: "smooth", block: "start" })); } }}
        description="A company's intrinsic value from its projected cash flows, with every step shown and checked." />
      <div className="wrap dcf dcx">
        <DcfIntro open={intro.open} onOpenChange={intro.set} />
        <Gate tier="gold" title="DCF calculator" points={["Intrinsic value per share, margin of safety and the safety price", "Load any listed company's cash flow, debt and shares", "Sensitivity grids, reverse DCF and bear/base/bull cases", "Save scenarios, share links and export to Excel (CSV)"]}>
          <CompanyBar enabled={gold && !!user && !DEMO} onLoad={onCompany} loaded={loaded} initial={sp.get("load") === "1" && form.symbol ? form.symbol.toUpperCase() : null} />
          <div className="dcx-ws">
            <div id="dcx-in"><Assumptions form={form} set={set} err={err} onReset={reset} /></div>
            <div id="dcx-out">
              {!res ? (
                <section className="card dcx-res" aria-label="Result" ref={card}>
                  <div className="dcx-err" role="alert"><b>No value on these inputs</b>
                    <ul>{out.errors.map((e) => <li key={e.field + e.text}>{e.text}</li>)}</ul></div>
                </section>
              ) : (<>
                <section className="card dcx-res" aria-label="Result" ref={card}>
                  <div className="dcx-rh">
                    <div><span className="dcx-k">Intrinsic value per share{form.symbol ? ` · ${form.symbol}` : ""}</span><div className="dcx-v" aria-live="polite">{ok ? rs(res.iv) : "N/M"}</div></div>
                    {note ? <div className={"dcx-pill " + (note.above ? "dcx-dn" : "dcx-up")} role="status"><b>{note.head}</b><span>{note.by}</span></div>
                      : <div className="dcx-pill dcx-nm" role="status"><b>No value per share</b><span>{STATUS_TEXT["not-meaningful"].text}</span></div>}
                  </div>
                  {ok && <PriceScale safety={res.buyPrice} value={res.iv} price={inputs.price} />}
                  <dl className="dcx-kpis">
                    <div><dt>Current price</dt><dd>{rs(inputs.price)}</dd>{loaded?.priceAsOf && form.symbol === loaded.symbol && <small>{dateIN(loaded.priceAsOf.slice(0, 10))}</small>}</div>
                    <div><dt>Upside / downside</dt><dd className={ok ? (res.upside >= 0 ? "dcx-up" : "dcx-dn") : ""}>{ok ? sgn(res.upside) : "—"}</dd></div>
                    <div><dt>Safety price ({nf(inputs.mos, 0)}%)</dt><dd>{ok ? rs(res.buyPrice) : "—"}</dd></div>
                    <div><dt>Bear · base · bull</dt><dd>{scen.rows.map((x) => zero(x.iv)).join(" · ")}</dd></div>
                  </dl>
                  {out.warnings.length > 0 && <div className="dcx-warn" role="note"><b>Worth a second look</b><ul>{out.warnings.map((w) => <li key={w.text}>{w.text}</li>)}</ul></div>}
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
        <p className="faint dcf-disc">A DCF value is only as good as its assumptions: small changes in growth or discount rate move it a lot. This is a calculation tool for education, not investment advice. <Link to="/glossary#discounted-cash-flow-dcf">What is a DCF?</Link></p>
      </div>
    </>
  );
}
