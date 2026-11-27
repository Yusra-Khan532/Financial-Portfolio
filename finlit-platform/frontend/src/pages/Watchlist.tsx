// Watchlists, as the founder's 27 Nov pack draws it (task #408, "keep it a watchlist"): it answers what moved, what is near my target and what is new.
// Five cards 18px apart: the header (lists, + New list, Add a stock, Rename and Delete beside them), Today on {list} (a closed drop-down with the Needs a
// look cards), the list (four column sets, Group by, sorting, Compare, the bell and Details on each row), What changed at these companies (kept), and
// Alerts for this list (a closed drop-down with target, peer label and filing alerts); then In simple words and the page's questions.
// Removed by the pack: the five tiles, the concentration warning, key figures, price and business disagree, themes, the trend grid, the peer comparison,
// the two alert cards, Download, the plan badge and "Saved in this browser". Words and rules: lib/watchlistPack.ts; figures: lib/watchlistData.ts;
// the table: watchlist/Table.tsx; styles: styles/watchlist-pack.css and styles/watchlist-408.css (wl-). Describes, never advises.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { WhatChanged, useWhatChanged } from "../components/changes/WhatChanged";
import { Gate } from "../components/Gate";
import { PageFaqs } from "../components/PageFaqs";
import { Scroll } from "../components/sectors/pack/Common";
import { LIMITS, limitsFor, useAuth } from "../lib/auth";
import { memberPlanName, plansFromText } from "../lib/planNames";
import { useQuotesFor } from "../lib/api";
import { useAlerts } from "../lib/alerts";
import { DEMO } from "../lib/demo";
import { quoteMap } from "../lib/globalSearch";
import { PLAN_FOR_WATCHLIST } from "../lib/planGates";
import { useUniverse, type Row } from "../lib/screener";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { watch as wl, useWatchlist, type List } from "../lib/watchlist";
import { useWatchData } from "../lib/watchlistData";
import { KIND } from "../lib/whatChanged";
import {
  ASC_FIRST, DEFAULT_ALERTS, EMPTY_LIST, FILING_PILLS, GROUP_BTNS, LIST_SUB, PAGE_DESC, PEER_BTNS, PLAIN, PRISM_FOOT, VIEWS, alertsLine, dayCounts, fullText, lookCards,
  pricesAt, quietLine, sortStocks, type GroupBy, type ListAlerts, type View,
} from "../lib/watchlistPack";
import { isBseCode, subLine, titleOf } from "../lib/companyLabel";
import { WatchTable } from "../watchlist/Table";
import "../styles/sectors-pack.css";
import "../styles/watchlist-pack.css";
import "../styles/watchlist-408.css";

const chev = <svg aria-hidden="true" className="wl-chev" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>;

/** "Add a stock to this list": type a name or symbol, pick it from the list (the live search combobox, unchanged). */
function Add({ rows, taken, onAdd, full }: { rows: Row[]; taken: string[]; onAdd: (r: Row) => void; full: string | null }) {
  const [q, setQ] = useState(""), [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const s = q.trim().toLowerCase();
  const list = s ? rows.filter((r) => !taken.includes(r.symbol) && (r.symbol.toLowerCase().includes(s) || (r.name || "").toLowerCase().includes(s))).slice(0, 7) : [];
  return (
    <div className="wp-add" ref={box}>
      <input type="text" value={q} disabled={!!full} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Enter" && list[0]) { onAdd(list[0]); setQ(""); setOpen(false); } if (e.key === "Escape") setOpen(false); }}
        placeholder={full ?? "Add a stock to this list"} aria-label="Add a stock" aria-expanded={open && list.length > 0} aria-controls="wp-add-list" role="combobox" aria-autocomplete="list" />
      {open && list.length > 0 && <ul id="wp-add-list" role="listbox" aria-label="Matching stocks">{list.map((r) => <li key={r.symbol}><button type="button" role="option" aria-selected="false" onClick={() => { onAdd(r); setQ(""); setOpen(false); }}>{titleOf(r)}<small>{isBseCode(r.symbol) && r.name ? subLine(r, r.sector) : <>{r.name} · {r.sector}</>}</small></button></li>)}</ul>}
    </div>
  );
}

/** Alerts for this list (05-alerts.md): three groups, one Save. The filing group is the list's Discover filing alert (the same alert as Alerts › A list). */
function ListAlertsCard({ list }: { list: List }) {
  const { alerts, create, remove } = useAlerts();
  const { user } = useAuth();
  const { upgrade } = useUI();
  const ref = `watch:${list.id}`;
  const row = alerts.find((a) => a.metric === "discover_filing" && a.list === ref && a.status !== "done") ?? null;
  const saved: ListAlerts = useMemo(() => list.alerts
    ? { ...list.alerts, filings: row?.kinds ?? [] }
    : { target: DEFAULT_ALERTS.target, peer: list.labelAlert ?? DEFAULT_ALERTS.peer, filings: row?.kinds ?? DEFAULT_ALERTS.filings }, [list.alerts, list.labelAlert, row?.kinds]);
  const [draft, setDraft] = useState<ListAlerts>(saved), [msg, setMsg] = useState("");
  useEffect(() => { setDraft(saved); setMsg(""); }, [list.id, saved]);
  const pill = (on: boolean, label: string, click: () => void) => <button key={label} type="button" className="wp-pill" aria-pressed={on} onClick={() => { click(); setMsg(""); }}>{label}</button>;
  const save = async () => {
    if (!user && !DEMO) { upgrade("basic", "Alerts need a free account."); return; }
    wl.setAlerts(list.id, draft);
    const same = (row?.kinds ?? []).join(",") === [...draft.filings].join(",") && !!row === draft.filings.length > 0;
    if (!same) {
      try {
        if (row) await remove.mutateAsync(row.id);
        if (draft.filings.length) await create.mutateAsync({ symbol: "", metric: "discover_filing", op: "event", value: null, list: ref, kinds: draft.filings, digest: false, channels: ["app", "browser"], repeat: "every" });
      } catch (e) {
        const d = (e as { body?: { detail?: string | { detail?: string } } })?.body?.detail;
        setMsg(`Saved, but the filing alert was not set: ${typeof d === "string" ? d : d?.detail ?? "please try again."}`); return;
      }
    }
    setMsg("Saved.");
  };
  return (
    <details className="wp-sec wl-al" id="wl-al">
      <summary className="wl-al-s"><span className="wl-al-t"><h2 id="wl-al-h">Alerts for this list</h2><span className="wl-al-now" id="wl-al-now">{alertsLine(draft)}</span></span>{chev}</summary>
      <div className="wl-al-b"><p className="wp-sub">For every stock on {list.name}, now and as you add more.</p>
        <div className="wl-alg">
          <div className="wl-alr"><div><b>Price near your target</b><small>When a price comes within 5% of a target you set in the list.</small></div>
            <div className="wp-alert" role="group" aria-label="Target alert" data-one="1">{pill(draft.target, "On", () => setDraft((d) => ({ ...d, target: true })))}{pill(!draft.target, "Off", () => setDraft((d) => ({ ...d, target: false })))}</div></div>
          <div className="wl-alr"><div><b>Peer label changes</b><small>After the weekly check, when a stock becomes a Leader, In line or a Laggard.</small></div>
            <div className="wp-alert" role="group" aria-label="Which label changes" data-one="1">{PEER_BTNS.map((b) => pill(draft.peer === b.id, b.label, () => setDraft((d) => ({ ...d, peer: b.id }))))}</div></div>
          <div className="wl-alr"><div><b>New filings</b><small>From each weekday’s exchange filings: any of Discover’s eight kinds.</small></div>
            <div className="wp-alert" role="group" aria-label="Which filings">{FILING_PILLS.map((k) => pill(draft.filings.includes(k.k), k.label, () => setDraft((d) => ({ ...d, filings: FILING_PILLS.map((x) => x.k).filter((x) => (x === k.k ? !d.filings.includes(x) : d.filings.includes(x))) }))))}</div></div>
        </div>
        <div className="wl-al-f"><span className="wl-msg" id="wl-msg" role="status">{msg}</span><button className="btn primary" id="wl-save" type="button" disabled={create.isPending || remove.isPending} onClick={save}>Save alerts for this list</button></div>
      </div>
    </details>
  );
}

export function WatchlistPage() {
  useDocTitle("Watchlists", "The companies you follow: what moved, what is near your target, and what is new.");
  const { has, toast, upgrade, plan } = useUI();
  const { user, planKey } = useAuth();
  const nav = useNavigate();
  const st = useWatchlist();
  const uniQ = useUniverse(), rows = useMemo(() => uniQ.data?.rows || [], [uniQ.data]);
  const bySym = useMemo(() => new Map(rows.map((r) => [r.symbol, r])), [rows]);
  const [lid, setLid] = useState(st.lists[0].id);
  const [view, setView] = useState<View>("price"), [group, setGroup] = useState<GroupBy>("none"), [sort, setSort] = useState<string | null>(null), [dir, setDir] = useState<1 | -1>(-1);
  const [open, setOpen] = useState<Set<string>>(new Set()), [shut, setShut] = useState<Set<string>>(new Set()), [cmp, setCmp] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState(false), [name, setName] = useState(""), [edit, setEdit] = useState<string | null>(null), [todayOpen, setTodayOpen] = useState(false);
  const [targetText, setTargetText] = useState<Record<string, string>>({});
  const gold = has("gold");
  const list = st.lists.find((l) => l.id === lid) || st.lists[0];
  useEffect(() => { if (!st.lists.some((l) => l.id === lid)) setLid(st.lists[0].id); }, [st.lists, lid]);
  useEffect(() => { if (DEMO && !st.seeded && rows.length) wl.seed([...rows].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0)).slice(0, 9).map((r) => r.symbol)); }, [rows, st.seeded]);
  const syms = list.symbols;
  const data = useWatchData({ symbols: syms, meta: st.meta, view, open, gold, signedIn: !!user || DEMO });
  const logos = quoteMap(useQuotesFor(syms).data);
  const wc = useWhatChanged(syms, "watchlist");
  const stocks = useMemo(() => sortStocks(data.stocks, sort, dir), [data.stocks, sort, dir]);
  const looks = useMemo(() => lookCards(data.stocks, {
    results: data.resultsSoon, moved: data.moved, rotDate: data.rotDate, sectors: !data.sectorsLocked, scrAsOf: data.screens?.asOf ?? null, recordWeek: data.recordWeek, today: data.today,
    filings: wc.rows.filter((r) => r.fresh > 0).map((r) => ({ s: r.s, kind: KIND[r.k]?.row ?? "Filing", t: r.t, d: r.d })),
  }), [data.stocks, data.resultsSoon, data.moved, data.rotDate, data.sectorsLocked, data.screens, data.recordWeek, data.today, wc.rows]);
  const lim = limitsFor(plan), MAXL = lim.watchlist_lists;
  const full = !DEMO && wl.total() >= lim.watchlist_symbols ? fullText(lim.watchlist_symbols, memberPlanName(planKey, plan)) : null;   // the server's limits (auth LIMITS mirrors entitlements.LIMITS), counted across every list as the server counts
  const empty = syms.length === 0;
  const k = looks.length;
  const day = dayCounts(data.stocks);
  const pending = data.stocks.some((s) => s.pending && s.rawLabel && s.peer && s.rawLabel !== s.peer);

  const onSort = (key: string) => { if (key === sort) setDir((d) => (d === 1 ? -1 : 1)); else { setSort(key); setDir(ASC_FIRST.has(key) ? 1 : -1); } };
  const toggle = (set: Set<string>, v: string) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };
  const openStock = (s: string, at: "row" | "screens") => {
    setOpen((o) => new Set(o).add(s));
    const go = () => (at === "row" ? document.querySelector(`tr.wl-r[data-s="${s}"]`) : document.getElementById(`wls-${s}`))?.scrollIntoView?.({ block: at === "row" ? "start" : "center", behavior: "smooth" });
    requestAnimationFrame(() => requestAnimationFrame(go));
  };
  const addStock = (r: Row) => {
    if (full && !wl.has(r.symbol)) { if (gold) toast(`${full}.`); else upgrade("gold", `${full}.`); return; }
    wl.add(r.symbol, list.id, null); toast(`${r.symbol} added to ${list.name}.`);
  };
  const newList = () => { if (st.lists.length >= MAXL) { if (gold) toast(`You have reached ${MAXL} lists.`); else upgrade("gold", `Your plan includes ${MAXL} lists; ${plansFromText("gold")} include up to ${LIMITS.gold.watchlist_lists}.`); return; } const id = wl.create(name || `List ${st.lists.length + 1}`); setLid(id); setName(""); setNaming(false); };
  const setTarget = (s: string, v: string) => { setTargetText((x) => ({ ...x, [s]: v })); const n = parseFloat(v); wl.setMeta(s, { target: n > 0 ? n : undefined }); };
  const compareMax = lim.compare || 2;

  return (
    <div className="wrap wp sp wl-page">
      <header className="wp-head card" aria-labelledby="wp-title">
        <div className="wp-head-t">
          <h1 id="wp-title" className="ui-title">Watchlists</h1>
          <p>{PAGE_DESC}</p>
        </div>
        <div className="wp-lists" role="group" aria-label="Your lists">
          {st.lists.map((l) => edit === l.id
            ? <span key={l.id} className="wp-pill"><input autoFocus defaultValue={l.name} aria-label="List name" maxLength={28} onBlur={(e) => { wl.rename(l.id, e.target.value); setEdit(null); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEdit(null); }} /></span>
            : <button key={l.id} type="button" className="wp-pill" aria-pressed={l.id === list.id} onClick={() => { setLid(l.id); setCmp(new Set()); }} onDoubleClick={() => setEdit(l.id)}>{l.name} · {l.symbols.length}</button>)}
          {naming ? <span className="wp-pill"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="List name" aria-label="New list name" maxLength={28} onKeyDown={(e) => { if (e.key === "Enter") newList(); if (e.key === "Escape") setNaming(false); }} onBlur={() => !name && setNaming(false)} /></span>
            : <button type="button" className="wp-pill" onClick={() => (st.lists.length >= MAXL ? newList() : setNaming(true))}>+ New list</button>}
          <Add rows={rows} taken={syms} onAdd={addStock} full={full} />
          <div className="wp-manage">
            <button type="button" onClick={() => setEdit(list.id)}>Rename “{list.name}”</button>
            <button type="button" onClick={() => { if (st.lists.length < 2) { toast("This is your only list: add another before deleting it."); return; } wl.drop(list.id); toast(`Deleted “${list.name}”.`); }}>Delete this list</button>
          </div>
        </div>
      </header>

      <Gate tier={PLAN_FOR_WATCHLIST} title="Build your watchlist" points={["Named lists for your own themes", "What moved, what is near your target and what is new", "Alerts on targets, peer labels and filings"]}>
        <details className="wp-sec wl-today" id="wl-today" open={todayOpen} onToggle={(e) => setTodayOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="wl-al-s wl-td-s"><span className="wl-al-t"><h2 id="wl-today-h">Today on {list.name}</h2>
            <span className="wl-al-now" id="wl-td-now">{empty ? <b>No stocks yet</b> : data.loadingQuotes && !data.stocks.some((s) => s.px != null) ? "Loading prices…" : <>
              <b>{syms.length} stock{syms.length === 1 ? "" : "s"}</b> · <b>{day.up} up, {day.down} down</b>{day.day ? ` on ${day.day}` : ""}
              {k > 0 && <> · <span className="wl-nl"><span className="wl-n" id="wl-n2">{k}</span> to look at</span></>}</>}</span></span>{chev}</summary>
          <div className="wl-al-b wl-td-b">
            {!empty && k > 0 && <><div className="wl-lkh"><p className="wl-look-h">Needs a look <span className="wl-n" id="wl-n">{k}</span></p>{data.pricesAt && <p className="wl-sum">Prices at {pricesAt(data.pricesAt)}</p>}</div>
              <ul className="wl-look" id="wl-look">{looks.map((x, i) => <li key={x.s + x.k + i}><button type="button" className="wl-lk" data-go={x.s} onClick={() => { setView("price"); openStock(x.s, "row"); }}>
                <span className="wl-lk-top"><b>{x.s}</b><span className={"wl-k k-" + x.k}>{x.kl}</span></span><span className="wl-lk-t">{x.t}</span></button></li>)}</ul></>}
            <p className="wl-quiet" id="wl-quiet">{quietLine(data.stocks, looks)}</p>
          </div>
        </details>

        <section className="wp-sec wl-list" aria-labelledby="wp-list">
          <div className="wp-sec-h"><div><h2 id="wp-list">{list.name}</h2><p className="wp-sub" hidden={empty}>{LIST_SUB}</p></div>
            <div className="wl-ctl" hidden={empty}>
              <div className="wl-seg" role="group" aria-label="Columns to show">{VIEWS.map((v) => <button key={v.id} type="button" className="wp-pill" data-view={v.id} aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>)}</div>
              <div className="wp-group wl-grp" role="group" aria-label="Group by"><span>Group by</span>{GROUP_BTNS.map((g) => <button key={g.id} type="button" className="wp-pill" data-grp={g.id} aria-pressed={group === g.id} onClick={() => setGroup(group === g.id ? "none" : g.id)}>{g.label}</button>)}</div>
              <button type="button" className={"wp-pill wl-cmp" + (cmp.size > 1 ? " on" : "")} id="wl-cmp" onClick={() => { const c = [...cmp].filter((x) => syms.includes(x)); if (c.length > compareMax) { toast(`Compare up to ${compareMax} companies at a time.`); return; } nav(`/compare?c=${c.join(",")}`); }}>Compare {cmp.size}</button>
            </div></div>
          <div className="wl-empty" id="wl-empty" hidden={!empty}><p>{EMPTY_LIST}</p></div>
          <div className="wp-tw" hidden={empty}>
            {!empty && data.loadingQuotes && !data.stocks.some((s) => s.px != null) && uniQ.isLoading
              ? <div className="wl-skel" aria-busy="true" aria-label="Loading your stocks">{syms.map((s) => <div key={s} className="skeleton" />)}</div>
              : <Scroll label={`${list.name}: your stocks, scrolls sideways`}>
                <WatchTable stocks={stocks} view={view} group={group} sort={sort} dir={dir} open={open} shut={shut} cmp={cmp} data={data} logos={logos}
                  lists={st.lists.map((l) => ({ id: l.id, name: l.name }))} listId={list.id} targetText={targetText}
                  onSort={onSort} onToggle={(s) => setOpen((o) => toggle(o, s))} onShut={(x) => setShut((o) => toggle(o, x))} onCmp={(s, on) => setCmp((o) => { const n = new Set(o); if (on) n.add(s); else n.delete(s); return n; })}
                  onScreens={(s) => openStock(s, "screens")} onNote={(s) => { setOpen((o) => new Set(o).add(s)); requestAnimationFrame(() => document.getElementById(`nt-${s}`)?.focus()); }}
                  onTarget={setTarget} onNearAlert={(s, on) => wl.setMeta(s, { nearAlert: on ? undefined : false })} onNoteText={(s, v) => wl.setMeta(s, { note: v })}
                  onMove={(s, to) => { wl.move(s, list.id, to); toast(`Moved ${s} to ${st.lists.find((l) => l.id === to)?.name}.`); }}
                  onRemove={(s) => { wl.remove(s, list.id); setCmp((o) => { const n = new Set(o); n.delete(s); return n; }); toast(`${s} removed from ${list.name}.`); }} />
              </Scroll>}
            <p className="wl-foot" id="wl-foot" hidden={!(view === "prism" && pending)}>{PRISM_FOOT}</p>
            {view === "prism" && data.prismLocked && <p className="wl-foot">FinLit Prism’s scores come with {plansFromText("gold")}. <Link to="/plans">See plans →</Link></p>}
            <p className="wl-foot" id="wl-sfoot" hidden={view !== "sec"}>{data.sectorsLocked ? "Sector Pulse and Sector Rotation are not part of this plan." : `Industry readings for the week to ${data.sectorsDate ?? "the latest weekly run"}, from NSE daily data with equal-weighted industry groups.`}
              <span className="wl-fl2"><Link to="/sectors">Open Sector Pulse ↗</Link><Link to="/sectors/rotation">Open Sector Rotation ↗</Link></span></p>
          </div>
        </section>

        <WhatChanged watch symbols={syms} listName={list.name} listRef={`watch:${list.id}`} page="watchlist" className="wp-sec wc wl-wc" nameOf={(s) => bySym.get(s)?.name ?? undefined} />

        <ListAlertsCard list={list} />

        <p className="wp-plain"><b>In simple words:</b> {PLAIN}</p>
        <PageFaqs inline />
      </Gate>
    </div>
  );
}
