// Task #276 (shared portfolio parts, §2 "Compact top"): the money box (value now; invested, today, gain or loss) that says what it covers, with a bar and
// Add quantities, which turns into a green line once every holding has its buys; and Your portfolios beside it: All accounts and the three largest, "N more ▾",
// tap to switch, + Add portfolio (Rename and Remove for the one picked). Sums: lib/ledger. Describes; never advice.
import { useState } from "react";
import { Tip } from "../../components/sectors/pack/Common";
import type { Money } from "../../lib/ledger";
import { inr, lk, pct, sinr, tone } from "../money";
import type { PfFigs, PfInfo } from "../Portfolios";
import { MAX_PF } from "../Portfolios";
import { pfAvatar } from "../ViewKit";
import { AccountPicker, type Pick } from "./ViewBar";
import "./kit.css";

const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The coverage line: "Money figures cover 0 of 4 ETFs. None of … has a quantity yet; …". Exported for tests. */
export function coverText(t: Money, all: string[], noun: [string, string], qtyWord = "quantity") {
  const aQty = qtyWord === "quantity" ? "a quantity" : qtyWord;   // task #275: funds read "units"
  const nq = t.missing.filter((m) => m.what === "qty").map((m) => m.symbol), np = t.missing.filter((m) => m.what === "price").map((m) => m.symbol);
  if (t.n && t.full === t.n) return { full: true, head: `Money figures cover all ${t.n} ${t.n === 1 ? noun[0] : noun[1]}.`, rest: "Every one has its buys and buy prices." };
  const parts: string[] = [];
  if (nq.length) parts.push(nq.length === t.n && nq.length > 1 ? `None of ${and([...nq].sort())} has ${aQty} yet` : `${and(nq)} ${nq.length === 1 ? "has" : "have"} no ${qtyWord} yet`);
  if (np.length) parts.push(`${and(np)} ${np.length === 1 ? "has" : "have"} no buy price yet`);
  const n = t.n || all.length;
  return { full: false, head: `Money figures cover ${t.full} of ${n} ${n === 1 ? noun[0] : noun[1]}.`, rest: `${parts.join("; ")}${parts.length ? `; ${nq.length + np.length === 1 ? "it counts" : "they count"} in every reading but not in the money.` : ""}` };
}

export function TopMoney({ t, all, noun, pick, onAddQty, onAddPf, onRename, onRemove, qtyWord = "quantity", addLabel = "Add quantities", todayKnown = true }: {
  t: Money; all: string[]; noun: [string, string]; pick: Pick; onAddQty: () => void; onAddPf: () => void; /** task #275: "units" and "Add units" for funds */ qtyWord?: string; addLabel?: string;
  /** task #275: false where no change since the previous close is loaded (fund NAVs): Today shows a dash and says why, never a made-up ₹0 */ todayKnown?: boolean;
  onRename: (id: string, name: string) => string | null; onRemove: (id: string) => void;
}) {
  const [more, setMore] = useState(false), [mode, setMode] = useState<"" | "ren" | "rm">(""), [name, setName] = useState(""), [err, setErr] = useState("");
  const c = coverText(t, all, noun, qtyWord), share = t.n ? t.full / t.n : 0;
  const figs: (id: string) => PfFigs = pick.figs;
  const rows = [{ id: "all", name: "All accounts" } as PfInfo, ...[...pick.list].sort((a, b) => figs(b.id).now - figs(a.id).now || figs(b.id).n - figs(a.id).n)];
  const first = rows.slice(0, 4), rest = rows.slice(4), shown = more ? rows : first;
  const sel = pick.list.find((p) => p.id === pick.cur);
  return (
    <div className="ptk-top2">
      <div className="ptk-sum ptk-money">
        <div className="ptk-sum-h"><span className="ptk-k">{noun[1]}</span><AccountPicker p={pick} /></div>
        <p className="ptk-big">{t.withQty ? inr(t.now) : "—"}<small>value now</small></p>
        <div className="ptk-sub3">
          <div><span className="ptk-k">Invested</span><b>{t.full ? inr(t.invested) : "—"}</b><small>what you paid</small></div>
          {todayKnown ? <div><span className="ptk-k">Today</span><b className={t.withQty ? tone(t.today) : ""}>{t.withQty ? sinr(t.today) : "—"}</b><small>{t.withQty && t.prev ? <><span className={tone(t.today)}>{pct((t.today / t.prev) * 100, 2)}</span> since the previous close</> : "since the previous close"}</small></div>
            : <div><span className="ptk-k">Today</span><b>—</b><small>the day's NAV change is not loaded</small></div>}
          <div><span className="ptk-k">Gain or loss</span><b className={t.full ? tone(t.gain) : ""}>{t.full ? sinr(t.gain) : "—"}</b><small>{t.full && t.invested ? <><span className={tone(t.gain)}>{pct((t.gain / t.invested) * 100)}</span> on what you invested</> : "on what you invested"}</small></div>
        </div>
        {(t.nSales > 0 || t.bad > 0) && <p className="ptk-booked">Booked gain: {t.nSales && t.bookedOk ? <b className={tone(t.booked)}>{sinr(t.booked)}</b> : "add the missing prices to work it out"} from {t.nSales} {t.nSales === 1 ? "sale" : "sales"}, first in, first out{t.bad > 0 ? ` · ${t.bad} ${t.bad === 1 ? "sale is" : "sales are"} larger than what was held` : ""}.</p>}
        {c.full ? <p className="ptk-covok" role="status"><i aria-hidden="true">✓</i><b>{c.head}</b> {c.rest}</p>
          : <div className="ptk-cov">
            <div className="ptk-cover" role="img" aria-label={`${t.full} of ${t.n || all.length} ${noun[1]} have ${qtyWord === "quantity" ? "a quantity" : qtyWord} and a buy price`}><i style={{ width: `${share * 100}%` }} /></div>
            <p><b>{c.head}</b> {c.rest} <button type="button" className="ptk-link" onClick={onAddQty}>{addLabel}</button></p></div>}
      </div>
      <div className="ptk-sum ptk-pfs">
        <div className="ptk-sum-h"><span className="ptk-k">Your portfolios · {pick.list.length}</span>
          <Tip text={`One portfolio for each demat account or app. All accounts adds them up and reads them as one list.`} how={`Tap one to read only its ${noun[1]}; every figure on the page follows.`} label="About “Your portfolios”" />
          <button type="button" className="ptk-link ptk-addp" onClick={onAddPf} disabled={pick.list.length >= MAX_PF} title={pick.list.length >= MAX_PF ? `Up to ${MAX_PF} portfolios` : undefined}>+ Add portfolio</button></div>
        <div className="ptk-plist" role="radiogroup" aria-label="Portfolio">{shown.map((p) => { const f = figs(p.id), a = pfAvatar(pick.list, p.id);
          return <button key={p.id} type="button" role="radio" aria-checked={p.id === pick.cur} onClick={() => pick.onPick(p.id)}>
            <span className="acc-av" style={{ ["--av" as string]: a.av }} aria-hidden="true">{a.ini}</span>
            <span className="ptk-pn"><b>{p.name}</b><small>{f.n} {f.n === 1 ? noun[0] : noun[1]}</small></span>
            <span className="ptk-pv">{f.withQty ? <><b>{lk(f.now)}</b>{f.gainPct != null && <small className={tone(f.gainPct)}>{pct(f.gainPct)}</small>}</> : <small>no buys yet</small>}</span></button>; })}</div>
        {rest.length > 0 && <button type="button" className="ptk-link ptk-pmore" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Show fewer ▴" : `${rest.length} more ▾`}</button>}
        {sel && !mode && <p className="ptk-pact"><button type="button" className="ptk-link" onClick={() => { setMode("ren"); setName(sel.name); setErr(""); }}>Rename {sel.name}</button>
          {pick.list.length > 1 && <button type="button" className="ptk-link ptk-danger" onClick={() => setMode("rm")}>Remove portfolio</button>}</p>}
        {sel && mode === "ren" && <form className="acc-confirm ren" onSubmit={(e) => { e.preventDefault(); const why = onRename(sel.id, name); if (why) setErr(why); else setMode(""); }}>
          <label htmlFor="ptk-ren">New name</label><input id="ptk-ren" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
          <button type="submit" className="go">Save</button><button type="button" onClick={() => setMode("")}>Cancel</button>{err && <p className="acc-err" role="alert">{err}</p>}</form>}
        {sel && mode === "rm" && <div className="acc-confirm" role="alertdialog" aria-label={`Remove ${sel.name}`}>
          <span>Remove {sel.name} and its {figs(sel.id).n} {figs(sel.id).n === 1 ? noun[0] : noun[1]} from FinLit? Nothing changes at your broker. This cannot be undone.</span>
          <button type="button" className="go del" onClick={() => { onRemove(sel.id); setMode(""); }} autoFocus>Remove</button><button type="button" onClick={() => setMode("")}>Cancel</button></div>}
      </div>
    </div>
  );
}
export type { Pick };
