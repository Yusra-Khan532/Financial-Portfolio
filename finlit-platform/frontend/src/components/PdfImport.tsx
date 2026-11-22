import { useEffect, useMemo, useState } from "react";
import type { SearchIndex, SearchRow } from "../lib/api";
import type { Found } from "../lib/holdingsMatch";
import { PdfPasswordError, isSure, readPdfHoldings, type PdfFinds, type PdfFound } from "../lib/holdingsPdf";
import "../styles/pdfimport.css";
import { coTitle, subLine, titleOf } from "../lib/companyLabel";
import { dayLabel } from "../lib/holdingsColumns";
import type { Amounts, ImportOpts } from "../lib/importAdd";
import type { EtfPlan } from "../lib/importFunds";
import { previewFunds, sendFunds } from "../lib/importEtf";

const WHY: Record<Found["how"], { label: string }> = {
  exact: { label: "Exact match" },
  alias: { label: "Old ticker, same company" },
  split: { label: "Demerged: you now hold all its parts" },
  close: { label: "Name starts the same: please check" },
  scan: { label: "Found in the text: please check" },
  isin: { label: "Matched by ISIN" },
  old_isin: { label: "Older ISIN, same company" },
  issuer: { label: "Same issuer's ISIN: please check" },
  issuer_name: { label: "Issuer's name: please check" },
};
/** The words shown beside a find: the reason it needs checking when there is one. */
const tagOf = (f: PdfFound) => f.unsure || WHY[f.how].label;

/** What the review adds: a share, with the quantity the statement shows for it (task #191) and, since task #323, its average buy price and Rate. */
export type PdfPick = { symbol: string; isin?: string } & Amounts;
/** What else Add did: the Rate choice, and the line about the ETFs sent to the ETF portfolio (empty when none). */
export type PdfAddInfo = ImportOpts & { rateCol?: string | null; rateOn?: string | null; price: string | null; etf: string };
const shares = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${n === 1 ? "share" : "shares"}`;
const units = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${n === 1 ? "unit" : "units"}`;
const rs = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pickOf = (f: PdfFound): PdfPick => ({ symbol: f.symbol, ...(f.isin ? { isin: f.isin } : {}), ...(f.qty != null ? { qty: f.qty } : {}), ...(f.avg != null ? { avg: f.avg, avgHow: f.avgHow } : {}),
  ...(f.lines ? { lines: f.lines } : {}), ...(f.accounts ? { accounts: f.accounts } : {}), ...(f.rate != null ? { rate: f.rate, ...(f.rateOn ? { rateOn: f.rateOn } : {}) } : {}) });

/** Reads a holdings PDF in the browser and shows what it found next to the PDF's own words, so nothing is added until the person confirms.
 *  The file and any password stay on the device. A depository statement (NSDL or CDSL CAS) also brings each share's quantity: a share already in the
 *  list can then take the statement's quantity (ticked only when the member has not typed a quantity of their own). */
export function PdfImport({ file, index, search, held, heldQty, room, etf = false, onAdd, onClose }: { file: File; index: SearchRow[]; search?: SearchIndex; held: string[]; heldQty?: ReadonlyMap<string, number>; room: number;
  /** task #323: the member's plan has the ETF portfolio, so the statement's ETF lines can go there */ etf?: boolean; onAdd: (picks: PdfPick[], info: PdfAddInfo) => void; onClose: () => void }) {
  const [state, setState] = useState<"reading" | "password" | "review" | "error">("reading");
  const [wrong, setWrong] = useState(false), [pw, setPw] = useState(""), [msg, setMsg] = useState("");
  const [finds, setFinds] = useState<PdfFinds | null>(null), [pick, setPick] = useState<Record<string, boolean>>({});

  const run = async (password?: string) => {
    setState("reading");
    try {
      const r = await readPdfHoldings(file, index, password, search);
      setFinds(r); setPick(Object.fromEntries(r.found.map((f) => [f.symbol, isSure(f) && (!held.includes(f.symbol) || (f.qty != null && !heldQty?.has(f.symbol)))]))); setState("review");
    } catch (e) {
      if (e instanceof PdfPasswordError) { setWrong(e.wrong); setState("password"); return; }
      setMsg(e instanceof Error ? e.message : "That PDF could not be read."); setState("error");
    }
  };
  useEffect(() => { void run(); }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  // task #323: the Rate option (a statement with no buy price column but a Rate column), ticked by default, and the ETF lines for the ETF portfolio
  const [rateAsBuy, setRateAsBuy] = useState(true);
  const funds = useMemo(() => finds?.funds ?? [], [finds]);
  const [plan, setPlan] = useState<EtfPlan | null>(null), [etfErr, setEtfErr] = useState(""), [etfPick, setEtfPick] = useState<Record<string, boolean>>({}), [sending, setSending] = useState(false);
  useEffect(() => {
    if (!etf || !funds.length) return;
    let live = true;
    previewFunds(funds).then((p) => {
      if (!live) return;
      setPlan(p); setEtfPick(Object.fromEntries([...p.add.map((x, i) => [x.symbol, i < p.room] as const), ...p.have.map((x) => [x.symbol, true] as const)]));
    }).catch(() => { if (live) setEtfErr("The ETF lines could not be checked just now, so they are not added. Add them on the ETF portfolio page."); });
    return () => { live = false; };
  }, [funds, etf]);

  // a share already in the list can only take the statement's quantity, and only when that differs from the one typed
  const canSet = (f: PdfFound) => f.qty != null && heldQty?.get(f.symbol) !== f.qty;
  const isDone = (f: PdfFound) => held.includes(f.symbol) && !canSet(f);
  const chosen = useMemo(() => (finds?.found || []).filter((f) => pick[f.symbol] && !held.includes(f.symbol)), [finds, pick, held]);
  const updates = useMemo(() => (finds?.found || []).filter((f) => pick[f.symbol] && held.includes(f.symbol) && canSet(f)), [finds, pick, held, heldQty]);  // eslint-disable-line react-hooks/exhaustive-deps
  const over = Math.max(0, chosen.length - room);
  const heldTag = (f: PdfFound) => {
    if (!canSet(f)) return f.qty != null ? `In your portfolio, ${shares(f.qty)}` : "Already in your portfolio";
    const now = heldQty?.get(f.symbol);
    return now != null ? `In your portfolio with ${shares(now)}: tick to set ${shares(f.qty!)}` : `In your portfolio: tick to set ${shares(f.qty!)}`;
  };
  const cas = finds?.cas;
  const rateOpt = !!cas && !cas.price && !!cas.rate;               // the option shows only when the statement has no buy price column but has a Rate
  const useRate = rateOpt && rateAsBuy;
  const etfTicked = plan ? [...plan.add, ...plan.have].filter((x) => etfPick[x.symbol]) : [];
  const head = (c: NonNullable<typeof cas>) => `${c.source === "depository" ? "Depository statement" : c.source === "broker" ? "Broker statement" : `${c.source} statement`}${c.asOf ? ` of ${c.asOf}` : ""}: quantities from its ${c.column} column${c.price ? `, buy prices from its ${c.price} column` : " · no buy prices in it"}`;
  const add = async () => {
    const picks = [...chosen.slice(0, room), ...updates].map(pickOf);
    let etfLine = "";
    if (plan && etfTicked.length) {
      setSending(true);
      try {
        etfLine = await sendFunds(plan, new Set(etfTicked.map((x) => x.symbol)), useRate, cas?.rateOn);
      } catch { etfLine = "The ETFs could not be sent to your ETF portfolio just now; add them on the ETF portfolio page."; }
      setSending(false);
    }
    onAdd(picks, { rateAsBuy: useRate, rateCol: cas?.rate ?? null, rateOn: cas?.rateOn ?? null, price: cas?.price ?? null, etf: etfLine });
    onClose();
  };

  const broker = cas?.source === "broker";
  // the Rate option says it itself, so its note is not repeated
  // without the ETF portfolio on the plan, the ETF lines are listed with the lines not added, as before (task #323)
  const missing = [...(finds?.missing ?? []), ...(!etf ? funds.map((f) => `${f.input} (${f.isin}): an ETF or fund, not a company share`) : [])];
  const notes = (finds?.notes ?? []).filter((n) => !(rateOpt && n.startsWith("This statement has no buy price column.")));
  if (state === "reading") return <div className="pdfi card" role="status"><div className="skeleton" style={{ height: 14, width: 200 }} /><p className="muted">Reading {file.name} on your device…</p></div>;
  if (state === "password") return (
    <form className="pdfi card" onSubmit={(e) => { e.preventDefault(); if (pw) void run(pw); }}>
      <h3>This PDF is password protected</h3>
      <p className="muted">Depository and some broker statements use your PAN (in capitals) or date of birth as the password. It is used here only to open the file, on your device, and is not stored or sent anywhere.</p>
      <div className="row"><input type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="PDF password" aria-label="PDF password" autoFocus /><button className="btn primary" disabled={!pw}>Open</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      {wrong && <p className="formerr" role="alert">That password is not correct. Try again.</p>}
    </form>
  );
  if (state === "error" || !finds) return <div className="pdfi card" role="alert"><h3>Could not read this PDF</h3><p>{msg}</p><button className="btn" onClick={onClose}>Close</button></div>;
  if (!finds.found.length) return (
    <div className="pdfi card" role="status"><h3>No listed companies found in {file.name}</h3>
      <p className="muted">The PDF has text, but none of it matched a listed company's name or ticker. Check that this is the holdings page, or download the Excel or CSV version of the statement from your broker.</p>
      <button className="btn" onClick={onClose}>Close</button></div>
  );
  return (
    <section className={"pdfi card" + (rateOpt && !rateAsBuy ? " no-rate" : "")} aria-label="Review companies found in the PDF">
      <div className="card-h"><h3>Found {finds.found.length} {finds.found.length === 1 ? "company" : "companies"} in {file.name}</h3>
        <span className="s">{cas ? head(cas) : finds.mode === "table" ? "Read from the statement's table" : "Found in the text of the statement"}</span></div>
      {rateOpt && <div className="pdfi-opt">
        <label className="pdfi-optl"><input type="checkbox" checked={rateAsBuy} onChange={(e) => setRateAsBuy(e.target.checked)} />Use the statement's {cas!.rate} as the buy price</label>
        <button type="button" className="sp-i" aria-label={`About the statement's ${cas!.rate}`} title={`The ${cas!.rate} is each share's price on one day, not what you paid.`}>i</button>
        <p className="pdfi-note" role="note">This statement has no buy price column. Its {cas!.rate} is each share's price{dayLabel(cas!.rateOn) ? ` on ${dayLabel(cas!.rateOn)}` : " on the statement's date"}, not what you paid. Ticked: each buy price is set to that {cas!.rate}, so Invested is the value on that day and Gain or loss counts from that day. Untick to add the shares without a buy price and type what you paid under Edit.</p></div>}
      {notes.length > 0 && <p className="pdfi-note" role="note">{notes.join(" ")}</p>}
      {cas
        ? <p className="muted">Check each line against your statement, then add them.{broker ? "" : " A line's ISIN decides which company it is."} Each share comes in with {cas.price ? "its quantity and average buy price from the statement; you can change either under Edit" : `the number of shares the statement shows${cas.asOf ? ` on ${cas.asOf}` : ""}${broker ? "" : ", added up across your demat accounts"}`}. {broker ? "The file" : "Only the ISINs are sent, to be looked up, and the file"} itself never leaves your device. Lines marked "please check" are not ticked.</p>
        : <p className="muted">Check each line against your statement, then add them. A line's ISIN decides which company it is; its name is used only when the line has no ISIN. Quantities, prices and everything else in the PDF are ignored; only the ISINs are sent, to be looked up, and the file itself never leaves your device. Lines marked "please check" are not ticked.</p>}
      <div className="pdfi-list" role="list">{finds.found.map((f) => {
        const already = held.includes(f.symbol), done = isDone(f), sure = isSure(f);
        return (
          <label className={"pdfi-row" + (sure ? "" : " warn") + (done ? " done" : "")} key={f.symbol} role="listitem">
            <input type="checkbox" checked={!!pick[f.symbol] && !done} disabled={done} onChange={(e) => setPick({ ...pick, [f.symbol]: e.target.checked })} />
            <span className="in" title="The words in your PDF">{f.input}</span><span aria-hidden="true">→</span>
            <span className="co"><b title={coTitle(f)}>{titleOf(f)}</b> <small>{subLine(f, f.name)}</small>{f.qty != null && <span className="pdfi-qty">{shares(f.qty)}{f.accounts && f.accounts > 1 ? ` in ${f.accounts} demat accounts` : ""}{(f.lines ?? 1) > 1 && <em>added up from {f.lines} lines</em>}{f.avg != null && ` · avg ${rs(f.avg)}`}{f.avg == null && rateOpt && f.rate != null && <em className="pdfi-rate">{cas!.rate} {rs(f.rate)}</em>}</span>}</span>
            <span className="tag">{already ? heldTag(f) : tagOf(f)}</span>
          </label>);
      })}</div>
      {missing.length > 0 && <details className="pdfi-miss"><summary>{missing.length} {missing.length === 1 ? "line" : "lines"} in the table not matched to a listed company</summary>
        <p>{missing.slice(0, 30).join(" · ")}{missing.length > 30 ? ` · and ${missing.length - 30} more` : ""}</p><p className="faint">Mutual funds, bonds and unlisted holdings are not scored. For a share that should be here, add it by its NSE ticker above.</p></details>}
      {etf && funds.length > 0 && <div className="pdfe">
        <p className="pdfi-h">{funds.length} {funds.length === 1 ? "ETF or fund" : "ETFs or funds"} → your ETF portfolio <button type="button" className="sp-i" aria-label="About ETFs in this statement" title="ETF lines (ISIN INF…) are not company shares. They go to your ETF portfolio with their units, through that page's own import.">i</button></p>
        <p className="muted">These lines are not company shares, so the equity page does not score them. Ticked ETFs go to your ETF portfolio with the units the statement shows; one already there takes the statement's units.</p>
        {!plan && !etfErr && <p className="muted" role="status">Checking the ETF lines…</p>}
        {etfErr && <p className="pdfi-note" role="note">{etfErr}</p>}
        {plan && <div className="pdfi-list" role="list">{[...plan.add, ...plan.have].map((x) => {
          const have = plan.have.includes(x), val = x.rate ? x.rate * x.qty : null;
          return (<label className="pdfi-row pdfe-row" key={x.symbol} role="listitem">
            <input type="checkbox" checked={!!etfPick[x.symbol]} onChange={(e) => setEtfPick({ ...etfPick, [x.symbol]: e.target.checked })} />
            <span className="in" title="The words in your PDF">{x.line.input}</span><span aria-hidden="true">→</span>
            <span className="co"><b title={x.symbol}>{x.name}</b> <small>{x.symbol}</small><span className="pdfi-qty">{units(x.qty)}{x.avg != null ? ` · avg ${rs(x.avg)}` : ""}{x.rate ? <em className={x.avg != null ? undefined : "pdfi-rate"}>{cas?.rate || "Rate"} {rs(x.rate)}{val ? ` · value ${rs(val)}` : ""}</em> : null}</span></span>
            <span className={"tag" + (have ? " pdfe-have" : "")}>{have ? "In your ETF portfolio: quantity set" : "New in your ETF portfolio"}</span></label>);
        })}</div>}
        {plan && plan.over > 0 && <p className="pf-miss" role="status">Your plan holds up to {plan.limit} ETFs, so the last {plan.over} {plan.over === 1 ? "is" : "are"} not ticked.</p>}
        {plan && plan.notAdded.length > 0 && <p className="faint">Not added: {plan.notAdded.map((n) => `${n.line.input} (${n.why})`).join(" · ")}.</p>}
      </div>}
      {over > 0 && <p className="pf-miss" role="status">Your plan holds up to {room + held.length} shares, so only the first {room} ticked here will be added.</p>}
      <div className="row">
        <button className="btn primary" disabled={sending || (!chosen.length && !updates.length && !etfTicked.length)} onClick={() => void add()}>
          {[chosen.length ? (etfTicked.length ? `Add ${Math.min(chosen.length, room)} ${Math.min(chosen.length, room) === 1 ? "share" : "shares"} and ${etfTicked.length} ${etfTicked.length === 1 ? "ETF" : "ETFs"}` : `Add ${Math.min(chosen.length, room)} selected`) : etfTicked.length ? `Add ${etfTicked.length} ${etfTicked.length === 1 ? "ETF" : "ETFs"}` : "",
            updates.length ? `${chosen.length || etfTicked.length ? "set" : "Set"} ${updates.length} ${updates.length === 1 ? "quantity" : "quantities"}` : ""].filter(Boolean).join(", ") || "Add 0 selected"}</button>
        <button className="btn" onClick={() => setPick(Object.fromEntries(finds.found.map((f) => [f.symbol, !held.includes(f.symbol) || canSet(f)])))}>Select all</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
