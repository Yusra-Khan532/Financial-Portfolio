// MF portfolio add box (task #275, change 1): one suggestion per fund. AMFI lists each plan (Direct / Regular) and option (Growth, IDCW payout,
// reinvestment…) as its own scheme code and ISIN, so the box used to show eight rows of Parag Parikh Liquid Fund. Now the search rows are grouped by
// fund house + fund name, one row per fund with "8 plans and options: Regular or Direct · Growth or IDCW"; the plan and option are picked after, in a small
// dialog, with the quantity, average buy NAV and date optional (empty: the fund is followed, every fund counting the same). "Add several" opens a table:
// one row per fund, each with its plan, option and optional units, added together. Descriptive only; nothing here advises.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { apiGet } from "../../lib/api";
import { useMfWrites, type Fund } from "../../lib/mfPortfolio";
import "../../components/clearportfolio.css";

export type FundHit = Fund & { category?: string | null };
export type FundGroup = { key: string; name: string; amc: string; category: string; variants: FundHit[]; plans: string[]; options: string[] };

/** The search asks for enough rows to hold every plan and option of the first few funds (AMFI has up to 8 or 10 per fund). */
export const GROUP_PAGE = 60;
export const searchFundRows = (q: string) =>
  apiGet<{ items: FundHit[] }>(`/api/mf?q=${encodeURIComponent(q)}&option=All&size=${GROUP_PAGE}`).then((r) => r.items);

const PLAN_ORDER = ["Regular", "Direct"];
const optionRank = (o: string) => (/^growth$/i.test(o) ? 0 : /growth/i.test(o) ? 1 : /payout/i.test(o) ? 2 : /reinvest/i.test(o) ? 3 : 4);
const byOption = (a: string, b: string) => optionRank(a) - optionRank(b) || a.localeCompare(b);
const byPlan = (a: string, b: string) => { const i = PLAN_ORDER.indexOf(a), j = PLAN_ORDER.indexOf(b); return (i < 0 ? 9 : i) - (j < 0 ? 9 : j) || a.localeCompare(b); };

/** AMFI's category without its scheme class: "Debt Scheme - Liquid Fund" → "Liquid Fund". Exported for tests. */
export const catName = (c?: string | null) => (c || "").replace(/^[^-]*\bSchemes?\s*-\s*/i, "").trim();

/** One group per fund (fund house + name), in the order the search ranked them; stopped schemes are kept only if the fund has no live one. Exported for tests. */
export function groupFunds(items: FundHit[]): FundGroup[] {
  const m = new Map<string, FundGroup>();
  for (const f of items) {
    const key = `${(f.amc || "").trim().toLowerCase()}|${f.name.trim().toLowerCase()}`;
    let g = m.get(key);
    if (!g) { g = { key, name: f.name.trim(), amc: f.amc, category: catName(f.category), variants: [], plans: [], options: [] }; m.set(key, g); }
    g.variants.push(f);
  }
  return [...m.values()].map((g) => {
    const live = g.variants.filter((v) => v.active !== false), vs = live.length ? live : g.variants;
    return { ...g, variants: vs, plans: [...new Set(vs.map((v) => v.plan))].sort(byPlan), options: [...new Set(vs.map((v) => v.option))].sort(byOption) };
  });
}

/** "8 plans and options: Regular or Direct · Growth or IDCW" (the options folded to Growth / IDCW for the line). Exported for tests. */
export function variantsLine(g: FundGroup): string {
  const n = g.variants.length, kinds = [...new Set(g.options.map((o) => (/idcw|dividend|payout|reinvest/i.test(o) ? "IDCW" : /growth/i.test(o) ? "Growth" : o)))];
  if (n === 1) return `${g.plans[0]} · ${g.options[0]}`;
  return `${n} plans and options: ${g.plans.join(" or ")} · ${kinds.join(" or ")}`;
}

/** The scheme for a plan and option, if AMFI lists it. Exported for tests. */
export const variantOf = (g: FundGroup, plan: string, option: string) => g.variants.find((v) => v.plan === plan && v.option === option) ?? null;
/** The options a plan has (some funds list an option for one plan only). */
export const optionsFor = (g: FundGroup, plan: string) => g.options.filter((o) => variantOf(g, plan, o));
/** The first choice: Regular or Direct as listed first, and Growth when it is there. */
export function firstPick(g: FundGroup): { plan: string; option: string } {
  const plan = g.plans[0] ?? "", opts = optionsFor(g, plan);
  return { plan, option: opts[0] ?? "" };
}

const numOf = (s: string) => { const v = Number(s.replace(/,/g, "").trim()); return s.trim() && Number.isFinite(v) && v > 0 ? v : null; };
/** The optional buy: all three empty follows the fund; a NAV or a date needs the quantity. Exported for tests. */
export function buyOf(qty: string, nav: string, on: string): { ok: true; lot: { units?: string; avgCost?: string; boughtOn?: string } | null } | { ok: false; why: string } {
  const q = qty.trim(), n = nav.trim(), d = on.trim();
  if (!q && !n && !d) return { ok: true, lot: null };
  if (numOf(q) == null) return { ok: false, why: q ? "Quantity: enter the number of units, such as 50." : "Enter the quantity too, or leave all three boxes empty to follow the fund." };
  if (n && numOf(n) == null) return { ok: false, why: "Average buy NAV: enter a number in rupees, such as 32.15." };
  return { ok: true, lot: { units: String(numOf(q)), ...(n ? { avgCost: String(numOf(n)) } : {}), ...(d ? { boughtOn: d } : {}) } };
}
const errText = (e: unknown) => ((e as { body?: { detail?: string } })?.body?.detail) || (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

/** The search box: one row per fund. */
export function FundGroupSearch({ onPick, label = "Search a mutual fund by name or ISIN", placeholder = "Search a fund by name or ISIN…", autoFocus }: { onPick: (g: FundGroup) => void; label?: string; placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState(""), [groups, setGroups] = useState<FundGroup[]>([]), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => {
    if (q.trim().length < 3) { setGroups([]); setErr(""); return; }
    setBusy(true);
    const t = setTimeout(() => searchFundRows(q.trim()).then((r) => { setGroups(groupFunds(r).slice(0, 8)); setErr(""); }).catch(() => setErr("The fund search is not available right now.")).finally(() => setBusy(false)), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="mp-search mfa-search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={label} maxLength={80} autoComplete="off" autoFocus={autoFocus} />
      {q.trim().length >= 3 && (
        <ul role="listbox" aria-label="Funds found" aria-busy={busy}>
          {err && <li className="none">{err}</li>}
          {!err && !busy && !groups.length && <li className="none">No fund matches “{q}”.</li>}
          {groups.map((g) => <li key={g.key} role="option" aria-selected="false"><button type="button" onClick={() => { onPick(g); setQ(""); setGroups([]); }}>
            <b>{g.name}</b><small>{g.amc}{g.category ? ` · ${g.category}` : ""}</small><small className="mfa-vars">{variantsLine(g)}</small></button></li>)}
        </ul>)}
    </div>
  );
}

function Choice({ name, legend, values, value, onChange }: { name: string; legend: string; values: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="mfa-set"><legend>{legend}</legend>
      <div className="mfa-opts">{values.map((v) => <label key={v} className={"mfa-opt" + (v === value ? " on" : "")}><input type="radio" name={name} value={v} checked={v === value} onChange={() => onChange(v)} /> {v}</label>)}</div>
    </fieldset>
  );
}

/** The small step after a pick: plan, option, and the optional buy. */
export function PlanOptionDialog({ g, onClose, onDone }: { g: FundGroup; onClose: () => void; onDone: (msg: string) => void }) {
  const w = useMfWrites(), id = useId();
  const [pick, setPick] = useState(() => firstPick(g)), [qty, setQty] = useState(""), [nav, setNav] = useState(""), [on, setOn] = useState(""), [err, setErr] = useState("");
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  const opts = optionsFor(g, pick.plan), v = variantOf(g, pick.plan, pick.option);
  const setPlan = (plan: string) => { const o = optionsFor(g, plan); setPick({ plan, option: o.includes(pick.option) ? pick.option : o[0] ?? "" }); };
  const add = async () => {
    setErr("");
    if (!v) { setErr("Pick a plan and an option."); return; }
    const b = buyOf(qty, nav, on);
    if (!b.ok) { setErr(b.why); return; }
    try {
      const r = await w.add.mutateAsync(b.lot ? { code: v.code, ...b.lot } : { code: v.code, follow: true });
      onDone(r.merged ? "That fund is already in your list." : `${g.name} (${v.plan}, ${v.option}) added.`); onClose();
    } catch (x) { setErr(errText(x)); }
  };
  return (
    <div className="cpf-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cpf-dlg mfa-dlg" role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>Add {g.name}</h2>
        <p>{g.amc}{g.category ? ` · ${g.category}` : ""}. Pick the plan and option you hold; each is its own ISIN.</p>
        {g.plans.length > 1 ? <Choice name={id + "p"} legend="Plan" values={g.plans} value={pick.plan} onChange={setPlan} /> : <p className="mfa-one"><b>Plan</b> {pick.plan}</p>}
        {opts.length > 1 ? <Choice name={id + "o"} legend="Option" values={opts} value={pick.option} onChange={(option) => setPick((p) => ({ ...p, option }))} /> : <p className="mfa-one"><b>Option</b> {pick.option}</p>}
        <div className="mfa-buy">
          <label>Quantity <small>optional</small><input inputMode="decimal" placeholder="e.g. 50" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
          <label>Average buy NAV <small>optional</small><input inputMode="decimal" placeholder="₹" value={nav} onChange={(e) => setNav(e.target.value)} /></label>
          <label>Bought on <small>optional</small><input type="date" value={on} onChange={(e) => setOn(e.target.value)} /></label>
        </div>
        <p className="mfa-note">{v ? `${v.plan} · ${v.option}${v.navDate ? ` · NAV of ${new Date(v.navDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}.` : "This plan has no such option."} Leave the three boxes empty to follow the fund; add units any time after.</p>
        {err && <p className="cpf-err" role="alert">{err}</p>}
        <div className="cpf-row"><button type="button" className="cpf-keep" onClick={onClose}>Cancel</button><button type="button" className="cpf-go mfu-go" onClick={add} disabled={w.add.isPending}>{w.add.isPending ? "Adding…" : "Add fund"}</button></div>
      </div>
    </div>
  );
}

type Row = { n: number; g: FundGroup | null; plan: string; option: string; qty: string };
const blank = (n: number): Row => ({ n, g: null, plan: "", option: "", qty: "" });
export const SEVERAL_ROWS = 5, SEVERAL_MAX = 20;

/** "Add several": a table, one fund a row, each with its plan, option and optional units; added together, one after another. */
export function AddSeveralDialog({ onClose, onDone, room }: { onClose: () => void; onDone: (msg: string) => void; room?: number }) {
  const w = useMfWrites(), id = useId(), next = useRef(SEVERAL_ROWS);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: SEVERAL_ROWS }, (_, i) => blank(i))), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose, busy]);
  const set = (n: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.n === n ? { ...r, ...p } : r)));
  const filled = useMemo(() => rows.filter((r) => r.g), [rows]);
  const addAll = async () => {
    setErr("");
    if (!filled.length) { setErr("Search a fund in at least one row."); return; }
    if (room != null && filled.length > room) { setErr(`Your list has room for ${room} more ${room === 1 ? "fund" : "funds"}; remove ${filled.length - room} ${filled.length - room === 1 ? "row" : "rows"}.`); return; }
    for (const r of filled) if (r.qty.trim() && numOf(r.qty) == null) { setErr(`${r.g!.name}: enter the units as a number, or leave the box empty.`); return; }
    setBusy(true);
    let added = 0, merged = 0; const failed: string[] = [];
    for (const r of filled) {
      const v = variantOf(r.g!, r.plan, r.option);
      if (!v) { failed.push(`${r.g!.name}: pick a plan and option`); continue; }
      try { const q = numOf(r.qty); const x = await w.add.mutateAsync(q != null ? { code: v.code, units: String(q) } : { code: v.code, follow: true }); if (x.merged) merged++; else added++; }
      catch (e) { failed.push(`${r.g!.name}: ${errText(e)}`); }
    }
    setBusy(false);
    const msg = `${added} ${added === 1 ? "fund" : "funds"} added${merged ? `, ${merged} already in your list` : ""}.`;
    if (failed.length) { setErr(`${msg} Not added: ${failed.join("; ")}.`); setRows((rs) => rs.filter((r) => !r.g || failed.some((f) => f.startsWith(r.g!.name)))); return; }
    onDone(msg); onClose();
  };
  return (
    <div className="cpf-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="cpf-dlg mfa-dlg mfa-several" role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>Add several funds</h2>
        <p>One fund a row. Pick the plan and option you hold; units are optional (empty: the fund is followed, every fund counting the same).</p>
        <div className="mfa-tw"><table className="mfa-t">
          <thead><tr><th scope="col">Fund</th><th scope="col">Plan</th><th scope="col">Option</th><th scope="col" className="r">Units</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>{rows.map((r, i) => {
            const opts = r.g ? optionsFor(r.g, r.plan) : [];
            return <tr key={r.n}>
              <td data-label="Fund">{r.g ? <div className="mfa-picked"><b>{r.g.name}</b><small>{r.g.amc}</small><button type="button" className="mp-link" onClick={() => set(r.n, { g: null, plan: "", option: "" })}>Change</button></div>
                : <FundGroupSearch label={`Fund for row ${i + 1}`} placeholder="Fund name or ISIN…" onPick={(g) => set(r.n, { g, ...firstPick(g) })} />}</td>
              <td data-label="Plan"><select aria-label={`Plan for row ${i + 1}`} disabled={!r.g} value={r.plan} onChange={(e) => { const o = r.g ? optionsFor(r.g, e.target.value) : []; set(r.n, { plan: e.target.value, option: o.includes(r.option) ? r.option : o[0] ?? "" }); }}>
                {!r.g && <option value="">–</option>}{r.g?.plans.map((p) => <option key={p}>{p}</option>)}</select></td>
              <td data-label="Option"><select aria-label={`Option for row ${i + 1}`} disabled={!r.g} value={r.option} onChange={(e) => set(r.n, { option: e.target.value })}>
                {!r.g && <option value="">–</option>}{opts.map((o) => <option key={o}>{o}</option>)}</select></td>
              <td data-label="Units" className="r"><input inputMode="decimal" aria-label={`Units for row ${i + 1}`} placeholder="optional" value={r.qty} disabled={!r.g} onChange={(e) => set(r.n, { qty: e.target.value })} /></td>
              <td><button type="button" className="mp-link" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.n !== r.n) : [blank(next.current++)]))}>×</button></td>
            </tr>;
          })}</tbody></table></div>
        {rows.length < SEVERAL_MAX && <button type="button" className="mp-link mfa-more" onClick={() => setRows((rs) => [...rs, blank(next.current++)])}>+ Add a row</button>}
        {err && <p className="cpf-err" role="alert">{err}</p>}
        <div className="cpf-row"><button type="button" className="cpf-keep" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="cpf-go mfu-go" onClick={addAll} disabled={busy}>{busy ? "Adding…" : filled.length ? `Add ${filled.length} ${filled.length === 1 ? "fund" : "funds"}` : "Add funds"}</button></div>
      </div>
    </div>
  );
}

/** The shared add box (portfolio/kit AddBox) asks for suggestions while you type: one per fund (task #275, change 1), its plans and options in the line under
 *  it. A pick opens the plan and option step; `groupOf` finds the fund behind a suggestion. */
const lastGroups = new Map<string, FundGroup>();
export const groupOf = (id: string) => lastGroups.get(id) ?? null;
export function useFundGroupResults(q: string): { items: { id: string; title: string; sub: string; line?: string }[]; loading: boolean; error: boolean } {
  const [st, setSt] = useState<{ q: string; groups: FundGroup[]; error: boolean }>({ q: "", groups: [], error: false }), [loading, setLoading] = useState(false);
  useEffect(() => {
    const t0 = q.trim();
    if (t0.length < 2) { setSt({ q: "", groups: [], error: false }); setLoading(false); return; }
    setLoading(true);
    let live = true;
    const t = setTimeout(() => searchFundRows(t0).then((r) => { if (!live) return; const g = groupFunds(r).slice(0, 8); g.forEach((x) => lastGroups.set(x.key, x)); setSt({ q: t0, groups: g, error: false }); })
      .catch(() => { if (live) setSt({ q: t0, groups: [], error: true }); }).finally(() => { if (live) setLoading(false); }), 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  return { items: st.groups.map((g) => ({ id: g.key, title: g.name, sub: `${g.amc}${g.category ? ` · ${g.category}` : ""}`, line: variantsLine(g) })), loading, error: st.error };
}
