import { useEffect, useMemo, useState } from "react";
import type { SearchIndex, SearchRow } from "../lib/api";
import type { Found } from "../lib/holdingsMatch";
import { PdfPasswordError, isSure, readPdfHoldings, type PdfFinds, type PdfFound } from "../lib/holdingsPdf";
import "../styles/pdfimport.css";
import { coTitle, subLine, titleOf } from "../lib/companyLabel";

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

/** What the review adds: a share, with the quantity a depository statement shows for it (task #191). */
export type PdfPick = { symbol: string; qty?: number };
const shares = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${n === 1 ? "share" : "shares"}`;

/** Reads a holdings PDF in the browser and shows what it found next to the PDF's own words, so nothing is added until the person confirms.
 *  The file and any password stay on the device. A depository statement (NSDL or CDSL CAS) also brings each share's quantity: a share already in the
 *  list can then take the statement's quantity (ticked only when the member has not typed a quantity of their own). */
export function PdfImport({ file, index, search, held, heldQty, room, onAdd, onClose }: { file: File; index: SearchRow[]; search?: SearchIndex; held: string[]; heldQty?: ReadonlyMap<string, number>; room: number; onAdd: (picks: PdfPick[]) => void; onClose: () => void }) {
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
    <section className="pdfi card" aria-label="Review companies found in the PDF">
      <div className="card-h"><h3>Found {finds.found.length} {finds.found.length === 1 ? "company" : "companies"} in {file.name}</h3>
        <span className="s">{cas ? `${cas.source === "depository" ? "Depository statement" : `${cas.source} statement`}${cas.asOf ? ` of ${cas.asOf}` : ""}: quantities from its ${cas.column} column` : finds.mode === "table" ? "Read from the statement's table" : "Found in the text of the statement"}</span></div>
      {finds.notes.length > 0 && <p className="pdfi-note" role="note">{finds.notes.join(" ")}</p>}
      {cas
        ? <p className="muted">Check each line against your statement, then add them. A line's ISIN decides which company it is. Each share comes in with the number of shares the statement shows{cas.asOf ? ` on ${cas.asOf}` : ""}, added up across your demat accounts; prices and values are ignored. Only the ISINs are sent, to be looked up, and the file itself never leaves your device. Lines marked "please check" are not ticked.</p>
        : <p className="muted">Check each line against your statement, then add them. A line's ISIN decides which company it is; its name is used only when the line has no ISIN. Quantities, prices and everything else in the PDF are ignored; only the ISINs are sent, to be looked up, and the file itself never leaves your device. Lines marked "please check" are not ticked.</p>}
      <div className="pdfi-list" role="list">{finds.found.map((f) => {
        const already = held.includes(f.symbol), done = isDone(f), sure = isSure(f);
        return (
          <label className={"pdfi-row" + (sure ? "" : " warn") + (done ? " done" : "")} key={f.symbol} role="listitem">
            <input type="checkbox" checked={!!pick[f.symbol] && !done} disabled={done} onChange={(e) => setPick({ ...pick, [f.symbol]: e.target.checked })} />
            <span className="in" title="The words in your PDF">{f.input}</span><span aria-hidden="true">→</span>
            <span className="co"><b title={coTitle(f)}>{titleOf(f)}</b> <small>{subLine(f, f.name)}</small>{f.qty != null && <span className="pdfi-qty">{shares(f.qty)}{f.accounts && f.accounts > 1 ? ` in ${f.accounts} demat accounts` : ""}</span>}</span>
            <span className="tag">{already ? heldTag(f) : tagOf(f)}</span>
          </label>);
      })}</div>
      {finds.missing.length > 0 && <details className="pdfi-miss"><summary>{finds.missing.length} {finds.missing.length === 1 ? "line" : "lines"} in the table not matched to a listed company</summary>
        <p>{finds.missing.slice(0, 30).join(" · ")}{finds.missing.length > 30 ? ` · and ${finds.missing.length - 30} more` : ""}</p><p className="faint">Mutual funds, bonds and unlisted holdings are not scored. For a share that should be here, add it by its NSE ticker above.</p></details>}
      {over > 0 && <p className="pf-miss" role="status">Your plan holds up to {room + held.length} shares, so only the first {room} ticked here will be added.</p>}
      <div className="row">
        <button className="btn primary" disabled={!chosen.length && !updates.length} onClick={() => { onAdd([...chosen.slice(0, room), ...updates].map((f) => (f.qty != null ? { symbol: f.symbol, qty: f.qty } : { symbol: f.symbol }))); onClose(); }}>
          {[chosen.length ? `Add ${Math.min(chosen.length, room)} selected` : "", updates.length ? `${chosen.length ? "set" : "Set"} ${updates.length} ${updates.length === 1 ? "quantity" : "quantities"}` : ""].filter(Boolean).join(", ") || "Add 0 selected"}</button>
        <button className="btn" onClick={() => setPick(Object.fromEntries(finds.found.map((f) => [f.symbol, !held.includes(f.symbol) || canSet(f)])))}>Select all</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
