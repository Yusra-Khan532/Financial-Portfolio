// My baskets, a drop-down on the Query builder page (founder, 25 Nov 2026: "merge query builder and my baskets page in one"; it was its own page,
// /baskets, which now opens this drop-down). The queries a member has saved, each with how many listed companies it matches today. Open puts one
// into the query box below; Rename, Duplicate and Delete work here as they did on the old page.
import { useState } from "react";
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { nf, dateIN } from "../lib/format";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { DEMO } from "../lib/demo";
import { basketNameProblem, queryPreview, useBasketActions, useBaskets, type Basket } from "../lib/query";
import { TIER, useUI } from "../lib/ui";
import "../styles/qbuilder.css";

const statusText = (b: Basket): string =>
  b.status === "locked" ? "Uses a ratio your plan does not include" : b.status === "invalid" ? "This query needs fixing" : b.count == null ? "Counting…" : `${nf(b.count, 0)} match${b.count === 1 ? "" : "es"}${b.stale ? " (last count)" : ""}`;

function Card({ b, names, onOpen, current }: { b: Basket; names: string[]; onOpen: (b: Basket) => void; current: boolean }) {
  const { toast } = useUI();
  const act = useBasketActions();
  const [rename, setRename] = useState<string | null>(null), [confirm, setConfirm] = useState(false), [err, setErr] = useState("");
  const fail = (e: unknown) => setErr(e instanceof ApiError && e.body.detail ? e.body.detail : "That did not work. Please try again.");
  const nameBad = rename != null ? basketNameProblem(rename, names, b.name) : null;
  return (
    <li className={"card qb-bk" + (current ? " is-current" : "")}>
      <div className="qb-bkh">
        {rename == null ? <h3>{b.name}{current && <span className="qb-bk-in">In the query box</span>}</h3> : <form onSubmit={(e) => { e.preventDefault(); if (nameBad) return; setErr(""); act.update.mutate({ id: b.id, name: rename.trim() }, { onSuccess: () => { setRename(null); toast("Renamed."); }, onError: fail }); }}>
          <label className="sr-only" htmlFor={"rn-" + b.id}>New name</label>
          <input id={"rn-" + b.id} autoFocus value={rename} maxLength={80} onChange={(e) => setRename(e.target.value)} aria-invalid={!!nameBad} onKeyDown={(e) => e.key === "Escape" && setRename(null)} />
          <button className="btn primary" type="submit" disabled={!!nameBad || act.update.isPending}>Save</button><button className="btn" type="button" onClick={() => setRename(null)}>Cancel</button></form>}
        <span className={"qb-count-pill " + b.status} aria-live="polite"><b>{b.status === "ok" && b.count != null ? nf(b.count, 0) : "—"}</b><small>{statusText(b)}</small></span>
      </div>
      {nameBad && <p className="qb-err" role="alert">{nameBad}</p>}
      <code className="qb-bkq">{queryPreview(b.query, 200)}</code>
      {b.note && <p className="qb-sub">{b.note}</p>}
      {b.converted?.text && <p className="qb-sub qb-conv" role="note">{b.converted.text}</p>}
      <p className="qb-sub">{b.recent ? "Only recent results · " : ""}Updated {dateIN(b.updatedAt)}{b.leftOut ? ` · ${nf(b.leftOut, 0)} companies left out for missing data` : ""}</p>
      {err && <p className="qb-err" role="alert">{err}</p>}
      <div className="qb-bka">
        <button className="btn primary" onClick={() => onOpen(b)} aria-label={`Open ${b.name} in the query box`}>Open</button>
        <button className="btn" onClick={() => { setRename(b.name); setErr(""); }}>Rename</button>
        <button className="btn" disabled={act.duplicate.isPending} onClick={() => { setErr(""); act.duplicate.mutate({ id: b.id }, { onSuccess: (r) => toast(`Made “${r.basket.name}”.`), onError: fail }); }}><Icon name="layers" />Duplicate</button>
        {!confirm ? <button className="btn" onClick={() => setConfirm(true)}><Icon name="trash" />Delete</button>
          : <span className="qb-confirm" role="group" aria-label={`Delete ${b.name}?`}>Delete this basket?<button className="btn" onClick={() => act.remove.mutate(b.id, { onSuccess: () => toast("Basket deleted."), onError: fail })}>Yes, delete</button><button className="btn" onClick={() => setConfirm(false)}>Keep it</button></span>}
      </div>
    </li>
  );
}

/** The words on the drop-down's bar: how many baskets are kept, or what signing in gives. */
export function basketsLine(signedIn: boolean, data: { baskets: Basket[]; max: number } | undefined): string {
  if (DEMO) return "Part of the live site";
  if (!signedIn) return "Sign in to keep your queries";
  if (!data) return "";
  return `${nf(data.baskets.length, 0)} of ${nf(data.max, 0)} saved`;
}

/** My baskets as a drop-down: closed at first; `open` is held by the page so Save, the foot line and /baskets can open it. */
export function BasketsView({ open, onToggle, onOpen, current }: { open: boolean; onToggle: () => void; onOpen: (b: Basket) => void; current: string | null }) {
  const { user } = useAuth();
  const q = useBaskets(!!user && !DEMO);
  const list = q.data?.baskets ?? [], max = q.data?.max ?? 0;
  const line = basketsLine(!!user, q.data);
  return (
    <section id="qb-baskets" className={"qb-bks" + (open ? " is-open" : "")} aria-labelledby="qb-bks-h">
      <h2 id="qb-bks-h" className="qb-bks-bar">
        <button type="button" aria-expanded={open} aria-controls="qb-bks-body" onClick={onToggle}>
          <span className="qb-bks-ico" aria-hidden="true"><Icon name="layers" /></span>
          <span className="qb-bks-t">My baskets</span>
          {line && <span className="qb-bks-n">{line}</span>}
          <span className="qb-bks-act">{open ? "Close" : "Show"}<svg className="qb-bks-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span>
        </button>
      </h2>
      {open && <div id="qb-bks-body" className="qb-bks-body">
        {DEMO ? <div className="state"><p>Baskets are part of the live site.</p></div>
          : !user ? <div className="state"><h3>Sign in to keep baskets</h3><p>A basket is a query you name and keep. Baskets are saved to your account so they are there on any device: 3 with a free account.</p><Link className="btn primary" to="/login">Sign in</Link></div>
          : q.isLoading ? <div className="skeleton" style={{ height: 180 }} aria-busy="true" />
          : q.isError ? <div className="state"><h3>We could not load your baskets</h3><button className="btn" onClick={() => q.refetch()}>Try again</button></div>
          : <>
            {list.length > 0 && <p className="qb-bkbar" aria-live="polite"><span className="qb-sub">Open puts a basket's query into the box below.</span>
              {list.length >= max ? <span>All {max} baskets used · <Link className="alx-link" to="/account/plan">More with {TIER[q.data!.plan === "basic" ? "silver" : "gold"].n}</Link></span> : null}</p>}
            {list.length === 0 ? <div className="state"><h3>No baskets yet</h3><p>Write a query below (or start from an example), then choose “Save as basket” under it.</p></div>
              : <ul className="qb-bklist">{list.map((b) => <Card key={b.id} b={b} names={list.map((x) => x.name)} onOpen={onOpen} current={b.id === current} />)}</ul>}
            <p className="faint qb-foot"><Icon name="info" /> Counts use today's data and your current plan. A basket is a list that matches your rules, not advice on what to buy or sell.</p>
          </>}
      </div>}
    </section>
  );
}
