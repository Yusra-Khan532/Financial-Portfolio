// Sector Rotation (/sectors/rotation): which NSE industry groups are pulling ahead of the average industry, which are falling behind, and how their ranks change, from GET /api/rotation.
// Every number and group name is the server's. Corners always carry their name and 2x2 glyph; a corner is confirmed after two weekly closes, and a hollow dot / "this week reads" says when
// the week's reading differs. Describes past prices; never advice. The API sends what the page shows and never how the reading is made. Styles: styles/rotation.css.
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { HScroll } from "../components/HScroll";
import { Blank, StateChip } from "../components/sectors/Parts";
import { CornerBadge, RankMove, SectorTabs, Spark } from "../components/rotation/Parts";
import { RotationMapChart } from "../components/rotation/RotationMap";
import { useDocTitle } from "../lib/title";
import { level } from "../lib/sectors";
import {
  CORNERS, asFilter, cornerName, failureText, inCorner, pts, rankGrid, rowsByRank, shade, shortDate, shortName, useRotationMap, weeksText,
  type CornerFilter, type RotationMap, type RotationRow,
} from "../lib/rotation";

const TITLE = "Sector Rotation";
const DESC = "Which NSE industries are pulling ahead of the average industry, and which are falling behind? Each evening every industry is placed in one of four corners and ranked.";
export const DATA_LINE = "NSE daily data, equal-weighted industry groups";

function dataLine(m: RotationMap): string {
  const ind = m.rows.filter((r) => r.kind === "industry").length;
  const a = m.average_industry;
  return `Data as of ${m.date_label ?? m.date}, after the close${m.week_closed ? "" : " (week in progress)"} · ${DATA_LINE} · ${m.groups} groups with a reading (${ind} NSE industries and ${m.groups - ind} sector groups) · the same counted stocks as Sector Pulse · the average industry: ${pts(a.return_6m)}% over 6 months, ${pts(a.return_1m)}% over 1 month`;
}

function Tiles({ m, filter, setFilter }: { m: RotationMap; filter: CornerFilter; setFilter: (f: CornerFilter) => void }) {
  return (
    <ul className="rt-tiles" aria-label="Industries in each corner. Select one to filter the lists below." style={{ listStyle: "none", padding: 0 }}>
      {CORNERS.map((c) => {
        const name = cornerName(c), n = m.counts?.[name] ?? 0, on = filter === c;
        return (
          <li key={c}>
            <button type="button" className={`rt-tile c-${c}${on ? " on" : ""}`} aria-pressed={on} onClick={() => setFilter(on ? "all" : c)} data-testid={`tile-${c}`}>
              <span className="rt-top"><CornerBadge corner={c} name={name} /><b className="n">{n}</b></span>
              <span className="mean">{m.corner_meanings?.[name]}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MarketStrip({ m }: { m: RotationMap }) {
  const k = m.market;
  if (!k || k.pct_vs_200d == null) return <div className="rt-card rt-strip" role="note"><span className="k">The market</span><span>The Nifty 50 reading is not in this data set yet, so the market context is blank.</span></div>;
  return (
    <div className="rt-card rt-strip" role="note">
      <span className="k">The market</span>
      <span><b>Nifty 50 {level(k.nifty50)}</b>, {Math.abs(k.pct_vs_200d).toFixed(1)}% {k.pct_vs_200d < 0 ? "below" : "above"} its {k.average_label ?? "200-day average"} of {level(k.nifty50_200d_average)}</span>
      {k.note && <span className="why">{k.note}</span>}
    </div>
  );
}

function CornerBoxes({ m, filter, onOpen }: { m: RotationMap; filter: CornerFilter; onOpen: (s: string) => void }) {
  const order: CornerFilter[] = ["behind_gaining", "ahead_gaining", "behind_slipping", "ahead_slowing"];
  return (
    <div className="rt-boxes">
      <span className="rt-axl y">Gaining last month</span>
      <div className="rt-grid2">
        {order.map((c) => {
          const rows = m.rows.filter((r) => r.corner === c).sort((a, b) => (b.strength_pts ?? 0) - (a.strength_pts ?? 0));
          return (
            <section key={c} className={`rt-box c-${c}${filter !== "all" && filter !== c ? " dim" : ""}`} aria-label={`${cornerName(c)}: ${rows.length} groups`}>
              <h3><CornerBadge corner={c} /><span className="cnt">{rows.length} groups</span></h3>
              <p className="rt-note">{m.corner_meanings?.[cornerName(c)]}</p>
              <table className="rt-mini">
                <thead><tr><th scope="col">Industry</th><th scope="col">6 months</th><th scope="col">Last month</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.slug}>
                      <th scope="row"><button type="button" className="rt-link" onClick={() => onOpen(r.slug)}>{r.name}</button>{r.weeks_in_corner === 1 && r.previous_corner ? <span className="rt-new"> New</span> : null}
                        <small>{r.rank_label ? `Rank ${r.rank_label}` : r.rank != null ? `Rank ${r.rank}` : "Not ranked yet"} · {weeksText(r.weeks_in_corner)} here{r.this_week_reading_name ? ` · this week reads ${r.this_week_reading_name}` : ""}</small></th>
                      <td className="num">{pts(r.strength_pts)}</td><td className="num">{pts(r.change_pts)}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={3} className="rt-note">No group is in this corner today.</td></tr>}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
      <span className="rt-axl x"><span>Behind the average over 6 months</span><span>Ahead of the average over 6 months</span></span>
    </div>
  );
}

function Stands({ m, filter, onOpen }: { m: RotationMap; filter: CornerFilter; onOpen: (s: string) => void }) {
  const [view, setView] = useState<"corners" | "map">("corners");
  return (
    <section className="rt-card rt-stands" aria-labelledby="rt-stands">
      <div className="rt-head"><div><h2 id="rt-stands">Where each industry stands</h2>
        <p className="rt-sub">Each industry is compared with the average industry twice: over 6 months (ahead or behind) and over the last month (gaining or slowing). The two answers put it in one of four boxes. Numbers are points against the average.</p></div>
        <div className="rt-seg" role="group" aria-label="View"><button type="button" aria-pressed={view === "corners"} onClick={() => setView("corners")}>Corners</button><button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>Map</button></div></div>
      {view === "corners" ? <CornerBoxes m={m} filter={filter} onOpen={onOpen} /> : <RotationMapChart rows={m.rows} date={m.date} onOpen={onOpen} filterCorner={filter === "all" ? undefined : filter} />}
      <p className="rt-note">“New”: moved into this box this week. “this week reads”: this week's reading is in another box, and a second weekly close there would move it. Select a name to open its page.</p>
    </section>
  );
}

function Rail({ m }: { m: RotationMap }) {
  const moved = m.moved_this_week;
  return (
    <aside className="rt-rail" aria-label="This week">
      <section className="rt-card">
        <h2>Changed corner this week</h2>
        <p className="rt-note">Industries in a new corner this week. {moved.length} of {m.groups}.</p>
        {moved.length ? <ul className="rt-moved">{moved.map((x) => <li key={x.slug}><Link to={`/sectors/${x.slug}`}>{x.name}</Link><span>{x.from} <i aria-hidden="true">→</i> <b>{x.to}</b></span></li>)}</ul> : <p className="rt-note" role="status">No industry changed corner this week.</p>}
      </section>
      <section className="rt-card">
        <h2>Biggest rank moves, 4 weeks</h2>
        <div className="rt-two">
          <div><h3 className="up">Climbed</h3>{m.climbers_4w.length ? <ul>{m.climbers_4w.map((x) => <li key={x.slug}><Link to={`/sectors/${x.slug}`}>{x.name}</Link><span><RankMove v={x.change} /> <small>rank {x.rank}</small></span></li>)}</ul> : <p className="rt-note">None climbed 3 or more places.</p>}</div>
          <div><h3 className="down">Fell</h3>{m.fallers_4w.length ? <ul>{m.fallers_4w.map((x) => <li key={x.slug}><Link to={`/sectors/${x.slug}`}>{x.name}</Link><span><RankMove v={x.change} /> <small>rank {x.rank}</small></span></li>)}</ul> : <p className="rt-note">None fell 3 or more places.</p>}</div>
        </div>
        <p className="rt-note">Places moved since 4 weekly closes ago, then the rank now.</p>
      </section>
    </aside>
  );
}

function Ranking({ m, filter, setFilter }: { m: RotationMap; filter: CornerFilter; setFilter: (f: CornerFilter) => void }) {
  const rows = useMemo(() => rowsByRank(m.rows).filter((r) => inCorner(r, filter)), [m.rows, filter]);
  const worst = Math.max(...m.rows.map((r) => r.rank_worst_26w ?? r.ranked ?? 1), m.groups);
  return (
    <section className="rt-card rt-rank" aria-labelledby="rt-rank">
      <h2 id="rt-rank">Rotation rank</h2>
      <p className="rt-sub">Every group on one list, ranked each week against the average industry. The arrows show the places moved since last week and since 4 weeks ago. {m.groups_line ?? `All ${m.groups} groups`}.</p>
      <div className="rt-pills" role="group" aria-label="Show">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All {m.groups}</button>
        {CORNERS.map((c) => <button key={c} type="button" aria-pressed={filter === c} onClick={() => setFilter(filter === c ? "all" : c)}>{cornerName(c)} · {m.counts?.[cornerName(c)] ?? 0}</button>)}
      </div>
      <div className="rt-tablebox"><HScroll label="rotation ranking table" className="rt-scroll">
        <table className="rt-t" data-testid="rank-table">
          <caption className="sx-visually">Every group with a rotation reading, by rank: places moved in 1 and 4 weeks, corner, strength and change against the average industry, breadth, Sector Pulse state and the rank over 26 weeks</caption>
          <thead><tr><th scope="col" className="r">Rank</th><th scope="col">Moved</th><th scope="col" className="l">Industry or sector group</th><th scope="col" className="l">Corner</th><th scope="col" className="r">6M vs avg</th><th scope="col" className="r">1M vs avg</th><th scope="col" className="l">Breadth</th><th scope="col" className="l">Sector Pulse</th><th scope="col" className="l">Rank, last 26 weeks</th></tr></thead>
          <tbody>
            {rows.map((r) => <RankRow key={r.slug} r={r} worst={worst} />)}
            {!rows.length && <tr><td colSpan={9} className="rt-note">No group is in this corner today.</td></tr>}
          </tbody>
        </table>
      </HScroll></div>
      <p className="rt-note">Breadth: the share of the group's counted stocks above their 50-day average. A sparkline higher up means a better rank. Ties share a rank.</p>
    </section>
  );
}
function RankRow({ r, worst }: { r: RotationRow; worst: number }) {
  const b = r.breadth_above_50;
  return (
    <tr>
      <td className="r rt-rk">{r.rank ?? <span className="rt-note">Not ranked yet</span>}</td>
      <td className="rt-mvc">{r.rank == null ? "–" : <><RankMove v={r.rank_change_1w} /> <RankMove v={r.rank_change_4w} /></>}</td>
      <th scope="row" className="l nm"><Link to={`/sectors/${r.slug}`}>{r.name}</Link><small>{r.stocks_counted} stocks counted{r.kind === "sector" ? " · sector group" : ""}{r.leader_flags ? ` · ${r.leader_flags} leader ${r.leader_flags === 1 ? "flag" : "flags"}` : ""}</small></th>
      <td className="l"><CornerBadge corner={r.corner} /><small className="sub">{weeksText(r.weeks_in_corner)}{r.weeks_in_corner === 1 && r.previous_corner ? " · new this week" : ""}{r.this_week_reading_name ? ` · this week reads ${r.this_week_reading_name}` : ""}</small></td>
      <td className="r num v1">{pts(r.strength_pts)}</td><td className="r num v2">{pts(r.change_pts)}</td>
      <td className="l br">{b == null ? <span className="rt-note">No reading</span> : <><span className="rt-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, b))}%` }} className={r.breadth ?? ""} /></span><b>{Math.round(b)}%</b><small className="sub">{r.breadth_name}</small></>}</td>
      <td className="l">{r.sector_state ? <StateChip state={r.sector_state} /> : <span className="rt-note">—</span>}</td>
      <td className="l sp"><Spark hist={r.rank_history} worst={worst} /><small className="sub">best {r.rank_best_26w ?? "—"}<br />worst {r.rank_worst_26w ?? "—"}</small></td>
    </tr>
  );
}

function RankGrid({ m }: { m: RotationMap }) {
  const g = useMemo(() => rankGrid(m.rows, 12), [m.rows]);
  return (
    <section className="rt-card" aria-labelledby="rt-grid">
      <h2 id="rt-grid">How the ranking changed</h2>
      <p className="rt-note">Each group's rank at the last {g.weeks.length} weekly closes, in today's order. Darker cells are higher ranks.</p>
      <div className="rt-tablebox"><HScroll label="rank history grid" className="rt-scroll"><table className="rt-grid" data-testid="rank-grid">
        <caption className="sx-visually">Rank of each group at each of the last {g.weeks.length} weekly closes</caption>
        <thead><tr><th scope="col" className="l">Group</th>{g.weeks.map((d) => <th key={d} scope="col">{shortDate(d)}</th>)}</tr></thead>
        <tbody>{g.rows.map(({ row, cells }) => (
          <tr key={row.slug}><th scope="row" className="l" title={row.name}>{row.rank}. {shortName(row.name)}</th>
            {cells.map((c, j) => <td key={j} className={`s${shade(c, row.ranked)}`}>{c ?? "–"}</td>)}</tr>))}</tbody>
      </table></HScroll></div>
    </section>
  );
}

/** Four short steps for the top of the page. The server writes them, so the words are the same everywhere. */
function HowTo({ m }: { m: RotationMap }) {
  const steps = m.how_to_use ?? [];
  if (!steps.length) return null;
  return (
    <section className="sx-sec" aria-labelledby="rt-how">
      <h2 id="rt-how">How to read this page</h2>
      <ul className="sx-how">{steps.map((x) => <li key={x.title}><b>{x.title}</b><p>{x.text}</p></li>)}</ul>
      <p style={{ marginTop: 12 }}><Link className="sx-link" to="/learn/sector-rotation">How to use Sector Rotation →</Link></p>
    </section>
  );
}

export function SectorRotationPage() {
  useDocTitle(TITLE, DESC);
  const q = useRotationMap();
  const m = q.data;
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const filter = asFilter(sp.get("corner"));
  const setFilter = (f: CornerFilter) => { const n = new URLSearchParams(sp); if (f === "all") n.delete("corner"); else n.set("corner", f); setSp(n, { replace: true }); };
  const open = (slug: string) => nav(`/sectors/${slug}`);
  return (
    <div className="wrap sx rt" data-testid="sector-rotation">
      <PageHeader eyebrow="Sectors" title={TITLE} description={DESC} meta={m ? dataLine(m) : undefined} links={["/learn/sector-rotation"]} learn={false}><SectorTabs active="rotation" /></PageHeader>
      {q.isLoading && <div className="sx-skel sx-sec" role="status" aria-label="Loading the rotation readings" />}
      {q.isError && <div className="sx-sec"><Blank title="Sector Rotation is not available right now" reason={failureText(q.error)}><button type="button" className="btn" onClick={() => q.refetch()}>Try again</button></Blank></div>}
      {m && (
        <div className="rt-stack">
          {!m.week_closed && <p className="rt-week" role="status">Week in progress: readings as of {shortDate(m.date)}</p>}
          <HowTo m={m} />
          <Tiles m={m} filter={filter} setFilter={setFilter} />
          <MarketStrip m={m} />
          <div className="rt-main"><Stands m={m} filter={filter} onOpen={open} /><Rail m={m} /></div>
          <Ranking m={m} filter={filter} setFilter={setFilter} />
          <RankGrid m={m} />
          <footer className="sx-footer"><p>{m.disclaimer}</p><p>Sources: NSE daily files and industry classification; AMFI market caps. <Link className="sx-link" to="/learn/sector-rotation">How to use Sector Rotation</Link></p></footer>
        </div>
      )}
    </div>
  );
}
