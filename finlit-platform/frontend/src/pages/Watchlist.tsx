// Watchlists as the "FinLit final pages" pack draws it (board 16, 13 Nov 2026): the header panel with the lists and Add a stock, five tiles, My watchlist
// (Group by Against peers / Industry / Size, Download, the insight cards and the table), Price and business disagree, Tell me when a label changes,
// In simple words and the page's questions. Kept from the old page at the founder's request (13 Nov 2026): row actions (alert, move, remove), renaming
// and deleting a list, ticking rows to compare, and sorting by a column. The score is the plan's (task #100): FinLit Prism for Gold, the FinLit IQ for
// Silver. Words: lib/watchlistPack.ts. Styles: styles/watchlist-pack.css (wp-) on the pack's tokens (sectors-pack.css). Describes, never advises.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlertButton } from "../components/AlertComposer";
import { Gate } from "../components/Gate";
import { PageFaqs } from "../components/PageFaqs";
import { Cards, Scroll, Tip } from "../components/sectors/pack/Common";
import { Logo } from "../components/search/parts";
import { limitsFor } from "../lib/auth";
import { useQuotesFor } from "../lib/api";
import { DEMO } from "../lib/demo";
import { csvText, nf } from "../lib/format";
import { quoteMap } from "../lib/globalSearch";
import { Icon } from "../lib/icons";
import { useIndices } from "../lib/indices";
import { useLeadershipList } from "../lib/leadership";
import { rowScore, rowView, usePlanModel, type ScoreModel } from "../lib/planScore";
import { METRICS, fmt, useUniverse, type Row } from "../lib/screener";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { watch as wl, useWatchlist, type LabelAlert } from "../lib/watchlist";
import {
  ALERT_SUB, DISAGREE_SUB, DISAGREE_WHY, GROUP_SUB, HELP, PAGE_DESC, PEER_HELP, PLAIN, concentrationTile, dayName, dayTile, disagree, groupTone, groups, listCards, peerCell, peersTile,
  scoreTile, sizeWord, stocksTile, type GroupBy, type Item, type ListLead,
} from "../lib/watchlistPack";
import { saveFile } from "../stock/derive";
import "../styles/sectors-pack.css";
import "../styles/watchlist-pack.css";

type SortKey = "peers" | "name" | "price" | "pe" | "roe" | "size" | "score";
type Rich = Item & { row: Row };
const ASC: SortKey[] = ["peers", "name", "pe"];   // the rest sort highest first
const GROUP_BTNS: { id: GroupBy; label: string }[] = [{ id: "peers", label: "Against peers" }, { id: "industry", label: "Industry" }, { id: "size", label: "Size" }];
const ALERT_BTNS: { id: LabelAlert; label: string }[] = [{ id: "any", label: "Any change" }, { id: "laggard", label: "Only to Laggard" }, { id: "leader", label: "Only to Leader" }];

/** "Add a stock to this list": type a name or symbol, pick it from the list. */
function Add({ rows, taken, onAdd }: { rows: Row[]; taken: string[]; onAdd: (r: Row) => void }) {
  const [q, setQ] = useState(""), [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const s = q.trim().toLowerCase();
  const list = s ? rows.filter((r) => !taken.includes(r.symbol) && (r.symbol.toLowerCase().includes(s) || (r.name || "").toLowerCase().includes(s))).slice(0, 7) : [];
  return (
    <div className="wp-add" ref={box}>
      <input type="text" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Enter" && list[0]) { onAdd(list[0]); setQ(""); setOpen(false); } if (e.key === "Escape") setOpen(false); }}
        placeholder="Add a stock to this list" aria-label="Add a stock" aria-expanded={open && list.length > 0} aria-controls="wp-add-list" role="combobox" aria-autocomplete="list" />
      {open && list.length > 0 && <ul id="wp-add-list" role="listbox" aria-label="Matching stocks">{list.map((r) => <li key={r.symbol}><button type="button" role="option" aria-selected="false" onClick={() => { onAdd(r); setQ(""); setOpen(false); }}>{r.symbol}<small>{r.name} · {r.sector}</small></button></li>)}</ul>}
    </div>
  );
}

function Th({ k, label, sort, dir, on, r, help }: { k?: SortKey; label: string; sort: SortKey; dir: 1 | -1; on: (k: SortKey) => void; r?: boolean; help?: string }) {
  const active = k === sort;
  return (
    <th scope="col" className={r ? "r" : ""} aria-sort={k ? (active ? (dir === 1 ? "ascending" : "descending") : "none") : undefined}>
      <span className="wp-th">{k ? <button type="button" onClick={() => on(k)} title={`Sort by ${label}`}>{label}<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 5 6 2.5 8.5 5M3.5 7 6 9.5 8.5 7" /></svg></button> : label}
        {help && <Tip text={help} label={`About ${label}`} />}</span>
    </th>
  );
}

/** The flags of a stock worth a second look (used by the dashboard's older watchlist block): a low score, a weak balance sheet, a big fall in a month, a high P/E
 *  or a price near the member's own target. */
export function signals(r: Row, target?: number, model: ScoreModel = "iq"): string[] {
  const out: string[] = [];
  if (model === "prism") { const v = rowView("prism", r); if (v.band === "lo" && v.score != null) out.push(`FinLit Prism is ${v.score}, ${v.word ?? "below 50"}`); }
  else if (r.band === "watch") out.push(`FinLit IQ is ${r.overall}, in the Watch band`);
  if ((r.pillar_balance ?? 100) <= 35) out.push(`Weak balance sheet (${r.pillar_balance}/100)`);
  if ((r.return_1m ?? 0) <= -10) out.push(`Fell ${nf(Math.abs(r.return_1m!), 1)}% in a month`);
  if ((r.pe ?? 0) >= 60) out.push(`Expensive at ${nf(r.pe!, 0)}× earnings`);
  if (target && r.price) { const d = ((r.price - target) / target) * 100; if (Math.abs(d) <= 5) out.push(`Within ${nf(Math.abs(d), 1)}% of your target ₹${nf(target, 0)}`); }
  return out;
}

const leadOf = (l: ListLead | null | undefined) => (l && l.available ? l : null);
function sortValue(k: SortKey, i: Rich, model: ScoreModel): number | string | null {
  if (k === "name") return i.symbol;
  if (k === "peers") { const l = leadOf(i.lead); return l ? (l.rank - 1) / Math.max(1, l.ranked) : null; }
  if (k === "size") return i.marketCap;
  if (k === "score") return rowScore(model, i.row);
  return (i.row[k] as number | null) ?? null;
}

export function WatchlistPage() {
  useDocTitle("Watchlists", "The companies you are keeping an eye on: how they are doing, how they compare with their peers, and what to look at next.");
  const { has, toast, upgrade, plan } = useUI();
  const nav = useNavigate();
  const st = useWatchlist();
  const uniQ = useUniverse(), rows = useMemo(() => uniQ.data?.rows || [], [uniQ.data]);
  const bySym = useMemo(() => new Map(rows.map((r) => [r.symbol, r])), [rows]);
  const [lid, setLid] = useState(st.lists[0].id), [group, setGroup] = useState<GroupBy>("peers"), [sort, setSort] = useState<SortKey>("peers"), [dir, setDir] = useState<1 | -1>(1);
  const [sel, setSel] = useState<string[]>([]), [naming, setNaming] = useState(false), [name, setName] = useState(""), [edit, setEdit] = useState<string | null>(null);
  const gold = has("gold"), silver = has("silver");
  const model = usePlanModel() ?? "iq", scName = model === "prism" ? "FinLit Prism" : "FinLit IQ";
  const list = st.lists.find((l) => l.id === lid) || st.lists[0];
  const [pick, setPick] = useState<LabelAlert>(list.labelAlert ?? "any");
  useEffect(() => { if (!st.lists.some((l) => l.id === lid)) setLid(st.lists[0].id); }, [st.lists, lid]);
  useEffect(() => { setPick(list.labelAlert ?? "any"); }, [list.id, list.labelAlert]);
  useEffect(() => { if (DEMO && !st.seeded && rows.length) wl.seed([...rows].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0)).slice(0, 9).map((r) => r.symbol)); }, [rows, st.seeded]);
  const leadQ = useLeadershipList(list.symbols, silver);
  const leads = leadQ.data && leadQ.data.available ? leadQ.data.rows : null;
  const idx = useIndices();
  const logos = quoteMap(useQuotesFor(list.symbols).data);

  const items: Rich[] = useMemo(() => list.symbols.map((s) => bySym.get(s)).filter((r): r is Row => !!r).map((r) => {
    const v = rowView(model, r);
    return { symbol: r.symbol, name: r.name || r.symbol, sector: r.sector || null, marketCap: r.market_cap ?? null, change: r.change_pct ?? null, score: v.score, word: v.word, lead: leads?.[r.symbol] ?? null, row: r };
  }), [list, bySym, model, leads]);
  const sorted = useMemo(() => [...items].sort((a, b) => {
    const A = sortValue(sort, a, model), B = sortValue(sort, b, model);
    if (A == null && B == null) return a.symbol.localeCompare(b.symbol); if (A == null) return 1; if (B == null) return -1;
    return (typeof A === "string" ? A.localeCompare(B as string) : (A as number) - (B as number)) * dir;
  }), [items, sort, dir, model]);
  const grouped = useMemo(() => groups(group, sorted), [group, sorted]);
  const cards = useMemo(() => listCards(items), [items]);
  const dis = useMemo(() => disagree(items), [items]);
  const lim = limitsFor(plan), MAXL = lim.watchlist_lists;
  const onSort = (k: SortKey) => { if (k === sort) setDir((d) => (d === 1 ? -1 : 1)); else { setSort(k); setDir(ASC.includes(k) ? 1 : -1); } };

  const addStock = (r: Row) => { if (wl.total() >= lim.watchlist_symbols && !wl.has(r.symbol)) { if (gold) toast(`Your watchlist is full (${lim.watchlist_symbols} stocks).`); else upgrade("gold", "Silver holds up to 30 stocks; Gold holds up to 1,000."); return; } wl.add(r.symbol, list.id); toast(`${r.symbol} added to ${list.name}.`); };
  const newList = () => { if (st.lists.length >= MAXL) { if (gold) toast(`You have reached ${MAXL} lists.`); else upgrade("gold", "Silver includes 3 lists; Gold has up to 50."); return; } const id = wl.create(name || `List ${st.lists.length + 1}`); setLid(id); setName(""); setNaming(false); };
  const exportCsv = () => {
    if (!silver) { toast("Downloads come with the Silver plan."); nav("/plans"); return; }
    const esc = (s: string) => `"${csvText(s).replace(/"/g, '""')}"`;
    const head = ["Symbol", "Company", "Industry", "Price", "Change %", "P/E", "ROE %", "Size", "Market cap (Cr)", scName, "Against peers", "Peer rank", "Target", "Note"];
    const body = sorted.map((i) => { const p = peerCell(i.lead), m = st.meta[i.symbol]; return [i.symbol, i.name, i.sector || "", i.row.price ?? "", i.change ?? "", i.row.pe ?? "", i.row.roe ?? "", sizeWord(i.marketCap) ?? "", i.marketCap ?? "", i.score ?? "", p.chip, p.line, m?.target ?? "", m?.note ?? ""].map((v) => (typeof v === "string" ? esc(v) : v)).join(","); });
    saveFile("FinLit-watchlist.csv", [head.map(esc).join(","), ...body].join("\n"), "text/csv;charset=utf-8"); toast("Saved FinLit-watchlist.csv.");
  };
  const toggleSel = (s: string) => setSel((x) => (x.includes(s) ? x.filter((y) => y !== s) : x.length >= (gold ? 4 : 2) ? (toast(gold ? "Compare up to 4 companies." : "Silver compares 2 companies. Gold compares up to 4."), x) : [...x, s]));
  const openSample = (e: React.MouseEvent, r: Row) => { if (r.sample) { e.preventDefault(); toast("Sample company: the live site opens its report here."); } };

  const t1 = stocksTile(items), t2 = dayTile(items), t3 = scoreTile(items), t4 = peersTile(items), t5 = concentrationTile(items);
  const loading = items.length === 0 && list.symbols.length > 0 && (uniQ.isLoading || uniQ.isError);

  return (
    <div className="wrap wp sp">
      <header className="wp-head" aria-labelledby="wp-title">
        <div className="wp-head-t">
          <span className="wp-plan">SILVER</span>
          <h1 id="wp-title">Watchlists</h1>
          <p>{PAGE_DESC}</p>
        </div>
        <div className="wp-lists" role="group" aria-label="Your lists">
          {st.lists.map((l) => edit === l.id
            ? <span key={l.id} className="wp-pill"><input autoFocus defaultValue={l.name} aria-label="List name" maxLength={28} onBlur={(e) => { wl.rename(l.id, e.target.value); setEdit(null); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEdit(null); }} /></span>
            : <button key={l.id} type="button" className="wp-pill" aria-pressed={l.id === list.id} onClick={() => setLid(l.id)} onDoubleClick={() => setEdit(l.id)}>{l.name} · {l.symbols.length}</button>)}
          {naming ? <span className="wp-pill"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="List name" aria-label="New list name" maxLength={28} onKeyDown={(e) => { if (e.key === "Enter") newList(); if (e.key === "Escape") setNaming(false); }} onBlur={() => !name && setNaming(false)} /></span>
            : <button type="button" className="wp-pill" onClick={() => (st.lists.length >= MAXL ? newList() : setNaming(true))}>+ New list{st.lists.length >= MAXL && !gold ? " · Gold" : ""}</button>}
          <Add rows={rows} taken={list.symbols} onAdd={addStock} />
          <div className="wp-manage">
            <button type="button" onClick={() => setEdit(list.id)}>Rename “{list.name}”</button>
            {st.lists.length > 1 && <button type="button" onClick={() => { wl.drop(list.id); toast(`Deleted “${list.name}”.`); }}>Delete this list</button>}
          </div>
        </div>
      </header>

      <Gate tier="silver" title="Build your watchlist" points={["Named lists for your own themes", "Each stock against its peers, with notes and targets", "An alert when a stock's peer label changes"]}>
        {uniQ.data?.sample && <p className="wp-note" role="note"><b>Sample data.</b> Lists are saved in this browser. Reliance is real; the other companies are fictional (SMP-).</p>}
        <div className="wp-tiles">
          <div className="wp-tile wp-t-info"><span>Stocks</span><b>{t1.value}</b><small>{t1.sub}</small></div>
          <div className="wp-tile wp-t-day"><span>{dayName(idx.data?.asOf ?? uniQ.data?.asOf, !!idx.data?.live && !!idx.data?.marketOpen)}</span><b>{t2.value}</b><small>{t2.sub}</small></div>
          <div className="wp-tile wp-t-good"><span>Average {scName}</span><b>{t3.value}</b><small>{t3.sub}</small></div>
          <div className="wp-tile wp-t-good"><span>Against peers<Tip text={PEER_HELP} label="About Against peers" /></span><b>{leads ? t4.value : "—"}</b><small>{leads ? t4.sub : leadQ.isLoading ? "Loading the weekly check" : "The weekly peer check is not available yet"}</small></div>
          <div className="wp-tile wp-t-org"><span>Concentration</span><b>{t5.value}</b><small>{t5.sub}</small></div>
        </div>

        <section className="wp-sec" aria-labelledby="wp-list">
          <div className="wp-sec-h">
            <div><h2 id="wp-list">{list.name}</h2><p className="wp-sub">{GROUP_SUB[group]}</p></div>
            <div className="wp-group" role="group" aria-label="Group by"><span>Group by</span>
              {GROUP_BTNS.map((g) => <button key={g.id} type="button" className="wp-pill" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{g.label}</button>)}
              <button type="button" className="wp-pill" onClick={exportCsv}>Download</button>
            </div>
          </div>
          {loading ? (uniQ.isError
            ? <div className="wp-empty"><b>Your stocks could not be loaded.</b> The company data did not arrive; your list is safe. <div><button type="button" className="wp-pill" onClick={() => uniQ.refetch()}>Try again</button></div></div>
            : <div className="skeleton" style={{ height: 220, marginTop: 12 }} aria-busy="true" aria-label="Loading your stocks" />)
            : items.length === 0 ? (
              <div className="wp-empty">This list is empty. Type a stock in “Add a stock to this list”, or use Watchlist on any company report. Try one of these:
                <div>{[...rows].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0)).slice(0, 6).map((r) => <button key={r.symbol} type="button" className="wp-pill" onClick={() => addStock(r)}>+ {r.symbol}</button>)}</div></div>
            ) : (<>
              <Cards items={cards} cols={Math.min(3, cards.length)} />
              <div className="wp-tw"><Scroll label={`${list.name}: your stocks, scrolls sideways`}>
                <table className="wp-t" aria-label={`${list.name}: your stocks`}>
                  <thead><tr>
                    <Th k="name" label="Company" sort={sort} dir={dir} on={onSort} />
                    <Th label="Industry" sort={sort} dir={dir} on={onSort} />
                    <Th k="price" label="Price" sort={sort} dir={dir} on={onSort} r />
                    <Th k="pe" label="P/E" sort={sort} dir={dir} on={onSort} r help={HELP.pe} />
                    <Th k="roe" label="ROE" sort={sort} dir={dir} on={onSort} r help={HELP.roe} />
                    <Th k="size" label="Size" sort={sort} dir={dir} on={onSort} help={HELP.size} />
                    <Th k="score" label={scName} sort={sort} dir={dir} on={onSort} r help={model === "prism" ? HELP.prism : HELP.iq} />
                    <Th k="peers" label="Against peers" sort={sort} dir={dir} on={onSort} help={PEER_HELP} />
                    <Th label="Target" sort={sort} dir={dir} on={onSort} help={HELP.target} />
                    <Th label="Your note" sort={sort} dir={dir} on={onSort} />
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr></thead>
                  <tbody>
                    {grouped.map(([k, rs]) => (
                      <Fragment key={k}>
                        <tr className={"wp-grp " + groupTone(group === "peers" ? k : "")}><th colSpan={11} scope="colgroup"><div><b>{k}</b><span>{rs.length} stock{rs.length === 1 ? "" : "s"}</span></div></th></tr>
                        {rs.map((i) => {
                          const r = i.row, m = st.meta[i.symbol] || { added: 0 }, v = rowView(model, r), p = peerCell(i.lead), lg = logos.get(i.symbol);
                          const d = m.target && r.price ? ((m.target - r.price) / r.price) * 100 : null;
                          return (
                            <tr key={i.symbol}>
                              <td><div className="wp-co">
                                <input type="checkbox" checked={sel.includes(i.symbol)} onChange={() => toggleSel(i.symbol)} aria-label={`Select ${i.symbol} to compare`} />
                                <Logo src={lg?.logo} name={i.name} kind="stock" size={30} />
                                <Link to={`/stocks/${i.symbol}`} onClick={(e) => openSample(e, r)}><b>{i.symbol}</b><small>{i.name}</small></Link>
                              </div></td>
                              <td className="wp-ind">{i.sector || "—"}</td>
                              <td className="r wp-px"><b>{fmt(METRICS.price, r.price)}</b>{i.change != null && <span className={i.change >= 0 ? "wp-up" : "wp-dn"}>{(i.change > 0 ? "+" : i.change < 0 ? "−" : "") + nf(Math.abs(i.change), 2)}%</span>}</td>
                              <td className="r">{r.pe != null ? nf(r.pe, 1) + "×" : "—"}</td>
                              <td className="r">{r.roe != null ? nf(r.roe, 1) + "%" : "—"}</td>
                              <td className="wp-size">{sizeWord(i.marketCap) ?? "—"}{i.marketCap != null && <small>₹{nf(i.marketCap, 0)} Cr</small>}</td>
                              <td className={"r wp-sc " + v.band}>{v.score != null ? <><b>{v.score}</b>{v.word && <span>{v.word}</span>}</> : <span className="wp-na" title={v.why ?? undefined}>{model === "prism" ? (v.word === "Not rated" ? "Not rated" : "Not rated yet") : "Not scored yet"}</span>}</td>
                              <td className="wp-peer"><span className={"wp-chip " + p.tone}>{p.chip}</span><small>{p.line}</small></td>
                              <td>
                                <input className="wp-tg" type="number" inputMode="decimal" min={0} value={m.target ?? ""} placeholder="–" onChange={(e) => wl.setMeta(i.symbol, { target: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} aria-label={`${i.symbol} target price in rupees`} />
                                {d != null && <span className={"wp-tgd " + (d >= 0 ? "wp-up" : "wp-dn")}>{d >= 0 ? "+" : "−"}{nf(Math.abs(d), 1)}% away</span>}
                              </td>
                              <td><textarea className="wp-nt" rows={1} maxLength={200} placeholder="Add a note" value={m.note ?? ""} onChange={(e) => wl.setMeta(i.symbol, { note: e.target.value })} aria-label={`${i.symbol} note`} /></td>
                              <td className="wp-ac">
                                {st.lists.length > 1 && <select className="wp-mv" aria-label={`Move ${i.symbol} to another list`} value="" onChange={(e) => { if (e.target.value) { wl.move(i.symbol, list.id, e.target.value); toast(`Moved ${i.symbol}.`); } }}><option value="">Move…</option>{st.lists.filter((l) => l.id !== list.id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
                                <AlertButton symbol={i.symbol} className="wp-ib" />
                                <button type="button" className="wp-ib" onClick={() => { wl.remove(i.symbol, list.id); setSel((x) => x.filter((y) => y !== i.symbol)); }} aria-label={`Remove ${i.symbol} from this list`} title="Remove from this list"><Icon name="trash" /></button>
                              </td>
                            </tr>);
                        })}
                      </Fragment>))}
                  </tbody>
                </table>
              </Scroll></div>
            </>)}
        </section>

        <div className="wp-pair">
          <section className="wp-sec" aria-labelledby="wp-dis">
            <h2 id="wp-dis">Price and business disagree<Tip text={PEER_HELP} label="About Price and business disagree" /></h2>
            <p className="wp-sub">{DISAGREE_SUB}</p>
            <p className="wp-why"><b>Why it matters</b><span>{DISAGREE_WHY}</span></p>
            {dis.length ? (
              <div className="wp-dis">{dis.map((x) => (
                <div key={x.symbol} className="wp-dc">
                  <div className="wp-dc-h"><Logo src={logos.get(x.symbol)?.logo} name={bySym.get(x.symbol)?.name || x.symbol} kind="stock" size={28} /><Link to={`/stocks/${x.symbol}`}>{x.symbol}</Link></div>
                  <div className="wp-rk"><div className={x.priceAhead ? "good" : "bad"}><span>Price rank</span><b>{x.price}</b></div><div className={x.priceAhead ? "bad" : "good"}><span>Business rank</span><b>{x.business}</b></div></div>
                  {x.line && <p>{x.line}</p>}
                </div>))}</div>
            ) : <p className="wp-empty">{leads ? "On this list, the price rank and the business rank agree for every stock that is compared with its peers." : "This shows once the weekly peer check is available for the stocks on this list."}</p>}
          </section>
          <section className="wp-sec" aria-labelledby="wp-al">
            <h2 id="wp-al">Tell me when a label changes</h2>
            <p className="wp-sub">{ALERT_SUB}</p>
            <div className="wp-alert" role="group" aria-label="Which changes">
              {ALERT_BTNS.map((b) => <button key={b.id} type="button" className="wp-pill" aria-pressed={pick === b.id} onClick={() => setPick(b.id)}>{b.label}</button>)}
              <button type="button" className="wp-set" onClick={() => { wl.setLabelAlert(list.id, pick); toast(`Alert set for “${list.name}”: ${ALERT_BTNS.find((b) => b.id === pick)!.label.toLowerCase()}.`); }}>Set alert for this list</button>
              {list.labelAlert && <p className="wp-on" role="status">On for this list: {ALERT_BTNS.find((b) => b.id === list.labelAlert)!.label.toLowerCase()}, sent after the weekly check.<button type="button" onClick={() => { wl.setLabelAlert(list.id, null); toast(`Alert switched off for “${list.name}”.`); }}>Switch off</button></p>}
            </div>
          </section>
        </div>

        <p className="wp-plain"><b>In simple words:</b> {PLAIN}</p>
        <PageFaqs inline />

        {sel.length > 0 && (
          <div className="wp-dock" role="region" aria-label="Selected stocks"><span><b>{sel.length}</b> selected</span>
            <button type="button" className="btn primary" disabled={sel.length < 2} onClick={() => nav(`/compare?c=${sel.join(",")}`)}>{sel.length < 2 ? "Pick one more to compare" : "Compare selected"}</button>
            <button type="button" className="lnk" onClick={() => setSel([])}>Clear</button></div>)}
      </Gate>
    </div>
  );
}
