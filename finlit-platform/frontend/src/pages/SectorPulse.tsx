// Sector Pulse (/sectors): is buying spreading through an industry, or drying up? Every NSE industry (or sector group of small ones) with its state, breadth, thrust
// and leader flags, from GET /api/sectors. Every number is the server's; what the plan does not include arrives null with a reason and is said in words.
// Describes price and breadth data; never advice. Styles: styles/sectors.css.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { HScroll } from "../components/HScroll";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import {
  FILTERS, SORT_LABEL, averageLabel, STATES, count, failureText, filterCounts, flagAge, flagText, fullDate, groupKindText, thrustHelp, FLAGS_HELP, countedText, groupsLine, inFilter, level, plural, signedPct, sortRows, thrustText,
  useSectorBoard, type Board, type FilterKey, type GroupRow, type SortKey,
} from "../lib/sectors";
import { CornerBadge, RankMove, SectorTabs } from "../components/rotation/Parts";
import { HowToGuide } from "../components/sectors/HowTo";
import { BreadthBars, Blank, LockedBlock, SectorFooter, StateChip } from "../components/sectors/Parts";

const TITLE = "Sector Pulse";
const DESC = "Is buying spreading through an industry, or drying up? Every evening we check how many stocks in each NSE industry are above their short, medium and longer-term averages. Only liquid, established stocks are counted, so a few thinly traded names cannot swing the reading.";

function Tiles({ b }: { b: Board }) {
  return (
    <ul className="sx-tiles" aria-label="How many groups are in each state" style={{ listStyle: "none", padding: 0 }}>
      {STATES.map((s) => {
        const n = b.counts?.[s.name] ?? 0;
        return <li key={s.code} className={"sx-tile" + (n === 0 ? " zero" : "")}><div className="sx-top"><span className="n">{count(n)}</span><span className={`sx-chip st-${s.code}`}>{s.name}</span></div><p>{b.state_meanings?.[s.name]}</p></li>;
      })}
    </ul>
  );
}

function Market({ b }: { b: Board }) {
  const m = b.market;
  if (!m) return <section className="sx-card"><h2>The market behind the industries</h2><p className="sx-sub">The Nifty 50 index file is not part of this data set yet, so the market context is blank. It appears with the next nightly run that includes it.</p></section>;
  const below = m.above_200d === false;
  return (
    <section className="sx-card" aria-labelledby="sx-mkt">
      <div className="sx-mkt-h"><h2 id="sx-mkt">The market behind the industries</h2>{m.above_200d != null && <span className={`sx-chip ${below ? "st-fading" : "st-confirmed"}`}>{below ? "Below its " : "Above its "}{averageLabel(m)}</span>}</div>
      <div className="sx-nums">
        <div className="sx-num"><small>Nifty 50</small><b>{level(m.nifty50)}</b></div>
        <div className="sx-num"><small>{averageLabel(m)[0].toUpperCase() + averageLabel(m).slice(1)}</small><b>{level(m.nifty50_200d_average)}</b></div>
        <div className="sx-num"><small>Difference</small><b className={m.pct_vs_200d != null ? (m.pct_vs_200d < 0 ? "neg" : "pos") : ""}>{signedPct(m.pct_vs_200d, 1)}</b></div>
      </div>
      {m.note && <p className="sx-sub" style={{ marginBottom: 0 }}>{m.note}</p>}
    </section>
  );
}

/** Four short steps for the top of the page: the server writes them (how_to_use), so the words are the same everywhere. */
function HowTo({ b }: { b: Board }) {
  return <HowToGuide kind="pulse" steps={b.how_to_use ?? []} learnTo="/learn/sector-signals" learnLabel="How to use Sector Pulse" />;
}

function Cycle() {
  return (
    <section className="sx-card" aria-labelledby="sx-cyc">
      <h2 id="sx-cyc">The industry cycle</h2>
      <div className="sx-cycle">
        <div className="sx-stage st-washout"><b>Sold off</b>Heavily sold; no broad rebound yet</div><span className="arrow" aria-hidden="true">→</span>
        <div className="sx-stage st-thrust"><b>Bouncing back</b>Most stocks turn up together</div><span className="arrow" aria-hidden="true">→</span>
        <div className="sx-stage st-confirmed"><b>Rising together</b>Most stocks trending up together</div>
      </div>
      <div className="sx-cycle-fade"><span className="arrow" aria-hidden="true">↓</span><div className="sx-stage st-fading"><b>Losing steam</b>A rebound or trend lost its breadth. Industries that match none of these are Neutral.</div></div>
    </section>
  );
}

function Th({ k, label, sort, dir, onSort, cls = "" }: { k: SortKey; label: string; sort: SortKey | null; dir: "asc" | "desc"; onSort: (k: SortKey) => void; cls?: string }) {
  const on = sort === k;
  return (
    <th scope="col" className={cls} aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={"sx-sortbtn" + (on ? " on" : "")} onClick={() => onSort(k)}>{label}<span className="ar" aria-hidden="true">{on ? (dir === "asc" ? "▲" : "▼") : ""}</span></button>
    </th>
  );
}

function GroupsTable({ b }: { b: Board }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const counts = useMemo(() => filterCounts(b.rows), [b.rows]);
  const rows = useMemo(() => sortRows(b.rows.filter((r) => inFilter(r, filter)), sort, dir), [b.rows, filter, sort, dir]);
  const flagsLocked = b.rows.some((r) => r.leader_flags == null);
  const onSort = (k: SortKey) => { if (sort === k) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(k); setDir(k === "name" || k === "state" || k === "thrust" || k === "index" || k === "rotation" ? "asc" : "desc"); } };
  return (
    <section className="sx-sec" aria-labelledby="sx-all">
      <div className="sx-bar">
        <div><h2 id="sx-all">All industries and sector groups</h2><p className="sx-sub" style={{ margin: 0 }}>Bouncing back first, then Sold off, then Losing steam. Select a name to open it.</p></div>
        <div className="sx-filters" role="group" aria-label="Show">
          {FILTERS.map((f) => {
            const n = counts[f.key];
            const off = f.key === "flags" && flagsLocked;
            return <button key={f.key} type="button" className="sx-fbtn" aria-pressed={filter === f.key} disabled={off} title={off ? "Leader flags are part of the Silver plan" : undefined} onClick={() => setFilter(f.key)}>{f.label}{f.key === "all" ? ` ${count(b.rows.length)}` : n == null ? "" : ` · ${n}`}{off ? <Icon name="lock" /> : null}</button>;
          })}
        </div>
      </div>
      <div className="sx-sortsel"><label htmlFor="sx-sort">Sort by</label>
        <select id="sx-sort" value={sort ?? ""} onChange={(e) => { const v = e.target.value as SortKey | ""; if (v) { setSort(v); setDir(v === "name" || v === "state" || v === "thrust" || v === "index" || v === "rotation" ? "asc" : "desc"); } else setSort(null); }}>
          <option value="">The board's order</option>{(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
        </select>
        {sort && <button type="button" className="btn" style={{ height: 38 }} onClick={() => setDir(dir === "asc" ? "desc" : "asc")} aria-label={dir === "asc" ? "Lowest first; switch to highest first" : "Highest first; switch to lowest first"}>{dir === "asc" ? "▲ Low to high" : "▼ High to low"}</button>}
      </div>
      <ul className="sx-legend2" aria-label="What the three bar colours mean">
        <li><i className="k9" aria-hidden="true" /><b>9-day</b> average: the short-term trend</li>
        <li><i className="k20" aria-hidden="true" /><b>20-day</b> average: the medium trend</li>
        <li><i className="k50" aria-hidden="true" /><b>50-day</b> average: the longer trend</li>
        <li className="sx-legend2-note">Each bar is the share of the group's counted stocks trading above that average. The colours are the same everywhere on Sector Pulse.</li>
      </ul>
      <div className="sx-tablebox" style={{ marginTop: 10 }}>
        <HScroll label="industries table" className="sx-scroll">
          <table className="sx-t sx-pulse" data-testid="groups-table">
            <caption className="sx-visually">Every industry and sector group with a reading: state, breadth, index against its 52-week high, last bounce and leader flags</caption>
            <colgroup><col className="c-name" /><col className="c-state" /><col className="c-bars" /><col className="c-idx" /><col className="c-thr" /><col className="c-flag" /><col className="c-cor" /><col className="c-rk" /></colgroup>
            <thead><tr>
              <Th k="name" label="Industry" sort={sort} dir={dir} onSort={onSort} />
              <Th k="state" label="Cycle state" sort={sort} dir={dir} onSort={onSort} cls="l" />
              <th scope="col" className="l">Above 9 / 20 / 50-day avg<span className="sx-visually"> (sort with the Sort by menu)</span>
                <span className="sx-minis">{(["above_9", "above_20", "above_50"] as const).map((k) => <button key={k} type="button" className={"sx-sortbtn sx-mini" + (sort === k ? " on" : "")} aria-label={`Sort by the share above the ${k.slice(6)}-day average`} onClick={() => onSort(k)}>{k.slice(6)}{sort === k ? (dir === "asc" ? "▲" : "▼") : ""}</button>)}</span></th>
              <Th k="index" label="Index vs 52-week high" sort={sort} dir={dir} onSort={onSort} />
              <Th k="thrust" label="Last bounce" sort={sort} dir={dir} onSort={onSort} cls="l" />
              <Th k="flags" label="Leader flags" sort={sort} dir={dir} onSort={onSort} cls="c" />
              <th scope="col" className="l rt-colh">Corner</th>
              <Th k="rotation" label="Rotation rank" sort={sort} dir={dir} onSort={onSort} cls="rt-colh" />
            </tr></thead>
            <tbody>
              {rows.map((r) => <Row key={r.slug} r={r} />)}
              {!rows.length && <tr><td colSpan={8} className="l" style={{ whiteSpace: "normal", textAlign: "left" }}>{filter === "thrust" ? "No group is bouncing back today." : "No group matches this filter today."}</td></tr>}
            </tbody>
          </table>
        </HScroll>
      </div>
      <p className="sx-note sx-foot">Index: the counted stocks averaged with equal weight. Bounce ages are in trading sessions.{flagsLocked && <> Leader-flag counts are part of the Silver plan.</>}</p>
    </section>
  );
}

function Row({ r }: { r: GroupRow }) {
  const t = r.last_thrust;
  return (
    <tr>
      <td><div className="sx-name"><Link to={`/sectors/${r.slug}`}>{r.name}</Link><small title={groupKindText(r)}>{r.kind === "sector" ? "Sector group · " : ""}{countedText(r)}</small></div></td>
      <td className="l"><StateChip state={r.state} /></td>
      <td className="l"><BreadthBars b={r.breadth} name={r.name} /></td>
      <td className="num">{signedPct(r.index_vs_52w_high, 1)}</td>
      <td className="l"><span className="sx-thr" tabIndex={0} title={thrustHelp(t)} aria-label={`${thrustText(t)}. ${thrustHelp(t)}`}>{t ? <><b>{t.type === "CAP" ? "Bounce after a crash" : "Bounce"}</b><small>{t.sessions_ago === 0 ? "today" : `${t.sessions_ago} ${t.sessions_ago === 1 ? "session" : "sessions"} ago`}</small></> : <small>None in the past year</small>}</span></td>
      <td className="c sx-flagn">{r.leader_flags == null ? <span className="sx-na" title="Leader flags are part of the Silver plan">Silver</span> : r.leader_flags > 0 ? <span className="sx-flagpill" tabIndex={0} title={FLAGS_HELP} aria-label={`${r.leader_flags} leader ${r.leader_flags === 1 ? "flag" : "flags"}. ${FLAGS_HELP}`}>{r.leader_flags}</span> : <span className="sx-na" aria-label="none">—</span>}</td>
      <td className="l rt-colc">{r.rotation ? <Link to={`/sectors/rotation?corner=${r.rotation.corner}`} className="rt-clink" title="Open Sector Rotation, filtered to this corner"><CornerBadge corner={r.rotation.corner} name={r.rotation.corner_name} /></Link> : <span className="sx-na" title="Fewer than 8 counted stocks: too few for a rotation reading, or the rotation files are not in this data set yet">No reading</span>}</td>
      <td className="rt-colc">{r.rotation?.rank != null ? <span className="rt-rk2"><b>{r.rotation.rank}</b><RankMove v={r.rotation.rank_change_1w} /></span> : r.rotation ? <span className="sx-na">Not ranked yet</span> : <span className="sx-na">—</span>}</td>
    </tr>
  );
}

function TooFew({ b }: { b: Board }) {
  if (!b.too_few_stocks?.length) return null;
  const total = b.too_few_stocks.reduce((s, x) => s + x.stocks_counted, 0);
  return (
    <section className="sx-card sx-sec" aria-labelledby="sx-few">
      <h2 id="sx-few">Too few stocks for a reading</h2>
      <p className="sx-sub">These groups have too few counted stocks for a steady reading, so they are shown without a state until they grow. The {b.too_few_stocks.length} groups hold {count(total)} counted stocks between them.</p>
      <ul className="sx-chips" style={{ listStyle: "none", padding: 0 }}>{b.too_few_stocks.map((g) => <li key={g.slug} className="sx-pill">{g.name} <small>· {g.stocks_counted} counted</small></li>)}</ul>
    </section>
  );
}

function Counted({ b }: { b: Board }) {
  const u = b.universe;
  if (!u) return null;
  return (
    <section className="sx-card sx-sec" aria-labelledby="sx-counted">
      <h2 id="sx-counted">Which stocks are counted</h2>
      {u.text && <p className="sx-sub">{u.text}</p>}
      <div className="sx-ustats">
        <div className="sx-num"><small>NSE stocks with an industry, traded on {fullDate(u.date).replace(/ \d{4}$/, "")}</small><b>{count(u.stocks_with_industry_traded)}</b></div>
        <div className="sx-num"><small>Meet the rules</small><b>{count(u.meet_rules)}</b></div>
        <div className="sx-num on"><small>Counted in the {b.groups} groups with a reading</small><b>{count(u.counted_in_groups_with_reading)}</b></div>
      </div>
    </section>
  );
}

function Flags({ b }: { b: Board }) {
  const [all, setAll] = useState(false);
  if (b.leader_flags == null) {
    return (
      <section className="sx-card sx-sec" aria-labelledby="sx-flags">
        <h2 id="sx-flags">Leader flags: 52-week highs inside weak industries</h2>
        <LockedBlock plan="silver" title="The list of leader flags is part of the Silver plan">The industry states and breadth above are open to everyone. Silver adds the stocks that closed at a 52-week high while their industry is 10% or more below its own high, with the industry, the age of the flag and the stock's 6-month quarter.</LockedBlock>
      </section>
    );
  }
  const list = all ? b.leader_flags : b.leader_flags.slice(0, 10);
  const full = b.leader_flags.filter((f) => /full/i.test(f.tier)).length;
  const groups = new Set(b.leader_flags.map((f) => f.group_slug)).size;
  return (
    <section className="sx-card sx-sec" aria-labelledby="sx-flags">
      <div className="sx-bar" style={{ marginBottom: 0 }}><div><h2 id="sx-flags">Leader flags: 52-week highs inside weak industries</h2>
        <p className="sx-sub">{b.leader_flag_text} {b.leader_flags.length} flags are live in {groups} groups: {full} full flags and {b.leader_flags.length - full} in the softer tier.</p></div>
        {b.leader_flags.length > 10 && <button type="button" className="btn" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${b.leader_flags.length}`}</button>}</div>
      {!b.leader_flags.length ? <p className="sx-note" role="status">No stock is flagged today.</p> :
        <ul className="sx-flags" style={{ listStyle: "none", padding: 0 }}>{list.map((f) => (
          <li className="sx-flag" key={f.symbol + f.group_slug}><div className="h"><Link to={`/stocks/${f.symbol}`}>{f.symbol}</Link><span className={"tier" + (/full/i.test(f.tier) ? "" : " soft")}>{flagText(f)}</span></div>
            <span>{f.group}</span><span>{flagAge(f.sessions_ago)}{f.quarter ? ` · 6-month quarter ${f.quarter}` : ""}</span></li>))}</ul>}
    </section>
  );
}

export function SectorPulsePage() {
  useDocTitle(TITLE, DESC);
  const q = useSectorBoard();
  const b = q.data;
  return (
    <div className="wrap sx" data-testid="sector-pulse">
      <PageHeader eyebrow="Sectors" title={TITLE} description={DESC} meta={b ? groupsLine(b) : undefined} links={["/learn/sector-signals"]} learn={false}><SectorTabs active="pulse" /></PageHeader>
      {q.isLoading && <div className="sx-skel sx-sec" role="status" aria-label="Loading the sector readings" />}
      {q.isError && <div className="sx-sec"><Blank title="Sector Pulse is not available right now" reason={failureText(q.error)}><button type="button" className="btn" onClick={() => q.refetch()}>Try again</button></Blank></div>}
      {b && (
        <>
          <Tiles b={b} />
          <HowTo b={b} />
          <div className="sx-two sx-mk">
            <Market b={b} />
            {b.market_note && <section className="sx-warn" role="note" aria-labelledby="sx-wn"><h2 id="sx-wn"><Icon name="alert" /> Breadth is weak almost everywhere</h2><p>{b.market_note}{b.counts ? ` ${plural(b.counts.Washout ?? 0, "group")} ${(b.counts.Washout ?? 0) === 1 ? "is" : "are"} in a Washout; ${b.counts.Confirmed ? plural(b.counts.Confirmed, "group") + " Confirmed" : "none is Confirmed"} and ${(b.counts["Thrust C"] ?? 0) + (b.counts["Thrust CAP"] ?? 0) ? plural((b.counts["Thrust C"] ?? 0) + (b.counts["Thrust CAP"] ?? 0), "group") + " had a thrust today" : "none had a thrust today"}.` : ""}</p></section>}
          </div>
          <div style={{ marginTop: 16 }}><Cycle /></div>
          <GroupsTable b={b} />
          <TooFew b={b} />
          <Counted b={b} />
          <Flags b={b} />
          <SectorFooter disclaimer={b.disclaimer} />
        </>
      )}
    </div>
  );
}
