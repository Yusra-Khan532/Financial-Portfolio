// All my investments: the quantities dialog (task #137, README "Quantities dialog"). One section per kind on the member's lists; each row has the name, the
// price or NAV, a number box (Units for funds, Quantity otherwise) and its value as you type; a running total in the footer. "Save quantities" writes into the
// three portfolio lists (the Equity portfolio list, the MF portfolio's purchase, the ETF portfolio), then the page reads them again. A kind cannot be saved
// half-done: the message names the kinds with some boxes empty; a kind left wholly empty keeps counting the same. Escape or ✕ closes it; focus starts in the
// first box. A fund bought in several purchases is changed on the MF portfolio, where each purchase is kept. Descriptive only.
import { useDialogFocus } from "../lib/useDialogFocus";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { nf } from "../lib/format";
import { aggOf } from "../lib/ledger";
import { portfolio, usePortfolio } from "../lib/portfolio";
import { useMfPortfolio, useMfWrites } from "../lib/mfPortfolio";
import { useEtfWrites } from "../lib/etfPortfolio";
import { ALL_KEY, KIND_LOWER, KIND_NAME, joinWords, rupees, type AllInvestments, type Kind } from "../lib/myInvest";

type Row = { key: string; kind: Kind; name: string; sub: string; price: number | null; init: string; locked?: string };
const numOf = (s: string) => { const v = Number(s.replace(/,/g, "").trim()); return s.trim() && Number.isFinite(v) && v > 0 ? v : null; };

/** Which kinds are half-done: some boxes filled, some empty. Exported for tests. */
export function halfDone(rows: { kind: Kind; v: string; locked?: string }[]): Kind[] {
  const by: Partial<Record<Kind, { f: number; e: number }>> = {};
  for (const r of rows) { if (r.locked) continue; const b = (by[r.kind] ??= { f: 0, e: 0 }); if (numOf(r.v) != null) b.f++; else b.e++; }
  return (Object.keys(by) as Kind[]).filter((k) => by[k]!.f > 0 && by[k]!.e > 0);
}

export function QtyDialog({ d, onClose }: { d: AllInvestments; onClose: () => void }) {
  const { holdings } = usePortfolio();
  const mf = useMfPortfolio(d.counts.funds > 0);
  const mfw = useMfWrites(), etw = useEtfWrites(), qc = useQueryClient();
  const price = useMemo(() => Object.fromEntries(d.shares.map((s) => [s.symbol, s.price])), [d.shares]);
  const rows: Row[] = useMemo(() => [
    // task #217: one line per share; a share with several buys shows their total and is changed in its buy history on the Equity portfolio
    ...[...new Set(holdings.map((h) => h.symbol.toUpperCase()))].map((sym) => { const hs = holdings.filter((h) => h.symbol.toUpperCase() === sym), h = hs[0], a = aggOf(holdings, sym, "all");
      const many = !!a && (a.nBuys > 1 || a.nSales > 0 || a.pfs.length > 1), n = (a?.nBuys ?? 0) + (a?.nSales ?? 0);
      return { key: "s:" + h.id, kind: "shares" as const, name: sym, sub: price[sym] != null ? `Last price ₹${nf(price[sym]!, 2)}` : "No price on file", price: price[sym] ?? null,
        init: many ? String(a!.qty ?? 0) : h.qty > 0 ? String(h.qty) : "", locked: many ? `${n} buys and sales: change them in the buy history on the Equity portfolio` : undefined }; }),
    ...(mf.data?.holdings ?? []).map((h) => ({ key: "f:" + h.id, kind: "funds" as const, name: h.name ?? String(h.code), sub: h.nav != null ? `NAV ₹${nf(h.nav, 2)}${h.folio ? " · folio " + h.folio : ""}` : "No NAV on file", price: h.nav,
      init: h.units != null && h.units > 0 ? String(h.units) : "", locked: (h.lines ?? h.lots).length > 1 ? `${(h.lines ?? h.lots).length} buys and sales: change them on the MF portfolio` : undefined })),
    ...d.etfs.map((e) => ({ key: "e:" + e.symbol, kind: "etfs" as const, name: e.symbol, sub: e.price != null ? `Last price ₹${nf(e.price, 2)}` : "No price on file", price: e.price, init: e.qty ? String(e.qty) : "" })),
  ], [holdings, mf.data, d.etfs, price]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const v = (r: Row) => vals[r.key] ?? r.init;
  const [msg, setMsg] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const kinds = (["shares", "funds", "etfs"] as Kind[]).filter((k) => rows.some((r) => r.kind === k));
  const total = rows.reduce((a, r) => { const q = numOf(v(r)); return a + (q != null && r.price != null ? q * r.price : 0); }, 0);

  // task #292: once per opening; the funds list arriving after the dialog opened no longer sends the cursor back to the first box
  useDialogFocus(box, onClose, { first: "input", trap: false });

  const save = async () => {
    const half = halfDone(rows.map((r) => ({ kind: r.kind, v: v(r), locked: r.locked })));
    if (half.length) { setMsg(`Fill every box for your ${joinWords(half.map((k) => KIND_LOWER[k]))}, or leave that kind empty: a kind counts by money only when every holding in it has a quantity.`); return; }
    setBusy(true); setMsg(null);
    try {
      for (const r of rows) {
        if (r.locked || v(r) === r.init) continue;
        const q = numOf(v(r));
        if (r.kind === "shares") portfolio.update(r.key.slice(2), { qty: q ?? 0 });
        else if (r.kind === "funds" && q != null) {
          const h = mf.data!.holdings.find((x) => x.id === r.key.slice(2))!, lot = h.lots[0];
          await mfw.update.mutateAsync({ id: h.id, lots: [{ units: String(q), invested: lot?.invested != null ? String(lot.invested) : undefined, boughtOn: lot?.boughtOn ?? undefined, ...(h.lines?.[0] ? { pf: h.lines[0].pf } : {}) }] });
        }
      }
      const et = rows.filter((r) => r.kind === "etfs" && v(r) !== r.init).map((r) => ({ symbol: r.name, qty: numOf(v(r)) != null ? String(numOf(v(r))) : null }));
      if (et.length) await etw.quantities.mutateAsync(et);
      await qc.invalidateQueries({ queryKey: [ALL_KEY] });
      onClose();
    } catch (e) {
      setMsg((e as Error)?.message || "The quantities could not be saved. Please try again.");
    } finally { setBusy(false); }
  };
  const empty = kinds.filter((k) => rows.filter((r) => r.kind === k && !r.locked).every((r) => numOf(v(r)) == null));
  return (
    <div className="mi-qd-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mi-qd" role="dialog" aria-modal="true" aria-labelledby="mi-qd-t" ref={box}>
        <header><h2 id="mi-qd-t">Quantities</h2><p className="mi-small">They are saved into your three portfolio lists; this page then reads them again. Nothing is sent to a broker.</p>
          <button type="button" className="mi-x" aria-label="Close" onClick={onClose}>✕</button></header>
        <div className="mi-qd-body">
          {kinds.map((k) => <section key={k}><h3>{KIND_NAME[k]}</h3>
            {k === "funds" && mf.isLoading && <p className="mi-small">Reading your funds…</p>}
            <ul>{rows.filter((r) => r.kind === k).map((r) => { const q = numOf(v(r)); return (
              <li key={r.key}><span className="mi-qd-n"><b>{r.name}</b><small>{r.locked ?? r.sub}</small></span>
                <label><span className="sr-only">{k === "funds" ? "Units" : "Quantity"} of {r.name}</span>
                  <input type="text" inputMode="decimal" placeholder={k === "funds" ? "Units" : "Quantity"} disabled={!!r.locked} value={v(r)} onChange={(e) => setVals({ ...vals, [r.key]: e.target.value })} /></label>
                <span className="mi-qd-v">{q != null && r.price != null ? rupees(q * r.price) : "—"}</span></li>); })}</ul></section>)}
          {!kinds.length && <p className="mi-small">Your lists are empty: add holdings on the <Link to="/holdings">Equity</Link>, <Link to="/mf-portfolio">MF</Link> or <Link to="/etf-portfolio">ETF portfolio</Link>.</p>}
        </div>
        {msg && <p className="mi-qd-msg" role="alert">{msg}</p>}
        <footer><span>Total <b>{total ? rupees(total) : "—"}</b>{empty.length > 0 && <small> · {joinWords(empty.map((k) => KIND_LOWER[k]))} still without quantities: {empty.length === 1 ? "it keeps" : "they keep"} counting the same</small>}</span>
          <span className="mi-qd-acts"><Link className="btn" to="/mf-portfolio?tab=import">Import a broker file or CAS</Link><button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save quantities"}</button></span></footer>
      </div>
    </div>
  );
}
