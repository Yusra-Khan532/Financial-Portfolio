// Task #294 ("we need to make this on dashboard", the team's pictures of a Global Markets Tracker, 21 Nov 2026): the overnight and intraday context Indian
// markets open against. A world view (each overseas market where it is, coloured by its last day's move, open or closed now) and a table of US, Europe
// and Asia indices, gold, crude, the rupee and the US 10-year yield with the 1-day, 1-week and 1-month moves and a 1-month line. Data: GET /api/global-markets
// (backend/finlit/global_markets.py: FRED, the site's FBIL rupee, Twelve Data where connected). A row without data says why. Describes; never advises.
// Task #298 (the team, 21 Nov): no white space under the globe: the globe and one tile per continent share the top band, the table runs the full width
// below it with every column lined up; continent headings in bold; pointing at a continent (its tile or its rows) turns the globe to it and lifts its
// markets' pins, pointing at a row lifts that one market. Markets without data say so once per continent, not once per row.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import { apiGet } from "../../lib/api";
import { MINUS, nf } from "../../lib/format";
import { Card } from "./parts";
import { Dd, useDashUi, useExpanded } from "./dx";
import { DASH_REGIONS } from "../../lib/prefs";
import "./global-markets.css";

type Place = { city: string; lat: number; lon: number; open?: boolean; local?: string; hours?: string };
export type GmRow = { key: string; label: string; group: string; unit: string; source: string; last: number | null; asOf: string | null; d1: number | null; w1: number | null; m1: number | null;
  line: [string, number][]; why: string | null; place: Place | null;
  /** the founder, 22 Nov 2026: the FTSE 100 shown through a fund that tracks it, labelled so (its price is the fund's, in pence or pounds) */
  tracker?: { name: string; code: string; unit: string; note: string } | null };
export type GmData = { rows: GmRow[]; home: Place & { open?: boolean }; asOfIst: string; summary: { open: number; markets: number; indices: number; down: number; up: number };
  disclaimer: string; sources: string };

const GROUPS = ["US", "Europe", "Asia", "Commodities", "Currency and yields"];
const INDEX_GROUPS = new Set(["US", "Europe", "Asia"]);
const LAND = feature(land110 as unknown as Topology, (land110 as unknown as Topology).objects.land);
/** Where the globe faces for each continent (the projection's rotation: minus the centre's longitude, minus its latitude); India by default. */
export const FACE: Record<string, [number, number]> = { US: [80, -32], Europe: [-6, -44], Asia: [-108, -28], home: [-72, -24] };
/** What the globe and the table point at: a continent, one market (its row), or nothing. */
export type Focus = { group: string; key?: string } | null;

/** A move: % for prices, percentage points for a yield; a real minus sign. */
export const move = (v: number | null, unit: string) => v == null ? MINUS : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), 2)}${unit === "%" ? " pts" : "%"}`;
const tone = (v: number | null) => (v == null || v === 0 ? "" : v > 0 ? "up" : "down");
const level = (r: GmRow) => r.last == null ? MINUS : r.unit === "₹" ? `₹${nf(r.last, 2)}` : r.unit === "%" ? `${nf(r.last, 2)}%` : r.unit.startsWith("US$") ? `$${nf(r.last, 2)}`
  : r.unit === "GBX" ? `${nf(r.last, 2)}p` : r.unit === "GBP" ? `£${nf(r.last, 2)}` : nf(r.last, 2);
const day = (iso: string | null) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
/** Pointing follows a mouse only: a tap (touch) sets the focus by its click, and the leave a touch screen sends after it must not undo that. */
const mouse = (e: { pointerType?: string }) => !e.pointerType || e.pointerType === "mouse";
const calm = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useGlobalMarkets() {
  return useQuery<GmData>({ queryKey: ["global-markets"], queryFn: () => apiGet("/api/global-markets"), staleTime: 300_000, retry: 1 });
}

/** The globe's rotation, eased to the face of the continent in focus (at once when the reader asks for less motion). */
function useFace(focus: Focus): [number, number] {
  const target = (focus && FACE[focus.group]) || FACE.home;
  const [rot, setRot] = useState<[number, number]>(target);
  const cur = useRef(rot);
  useEffect(() => {
    const from = cur.current, to = target;
    if (from[0] === to[0] && from[1] === to[1]) return;
    if (calm() || typeof requestAnimationFrame === "undefined") { cur.current = to; setRot(to); return; }
    const t0 = performance.now(), ms = 550;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const next: [number, number] = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
      cur.current = next; setRot(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target[0], target[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return rot;
}

/** The world with each overseas market pinned where it is. The continent in focus is turned to the front and its pins lifted; the others dim.
 *  A market on the far side of the globe is not drawn here; every market is in the table. */
export function Globe({ d, size = 260, focus = null }: { d: GmData; size?: number; focus?: Focus }) {
  const rot = useFace(focus);
  const proj = useMemo(() => geoOrthographic().rotate(rot).scale(size / 2 - 6).translate([size / 2, size / 2]).clipAngle(90), [size, rot]);
  const path = useMemo(() => geoPath(proj), [proj]);
  const seen = new Map<string, { place: Place; d1: number | null; label: string; group: string; keys: string[] }>();
  for (const r of d.rows) {
    if (!r.place || !INDEX_GROUPS.has(r.group)) continue;
    const had = seen.get(r.place.city);
    if (had) { had.keys.push(r.key); if (had.d1 == null && r.d1 != null) { had.d1 = r.d1; had.label = r.label; } }       // the first index of a city with a move
    else seen.set(r.place.city, { place: r.place, d1: r.d1, label: r.label, group: r.group, keys: [r.key] });
  }
  const visible = (p: { lon: number; lat: number }) => { const lon = (p.lon + rot[0]) * Math.PI / 180, lat = p.lat * Math.PI / 180, lat0 = -rot[1] * Math.PI / 180;
    return Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(lon) > 0; };
  const home = visible(d.home) ? proj([d.home.lon, d.home.lat]) : null;
  const lit = (m: { group: string; keys: string[] }) => !!focus && (focus.key ? m.keys.includes(focus.key) : focus.group === m.group);
  return (
    <svg className={"gm-globe" + (focus ? " gm-focus" : "")} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`World markets${focus ? `, turned to ${focus.group}` : ""}: ${[...seen.values()].map((m) => `${m.place.city} ${move(m.d1, "pts")}${m.place.open ? ", open" : ", closed"}`).join("; ")}`}>
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 6} className="gm-sea" />
      <path d={path(geoGraticule10()) ?? ""} className="gm-grat" />
      <path d={path(LAND) ?? ""} className="gm-land" />
      {home && <g className="gm-home"><circle cx={home[0]} cy={home[1]} r={20} className="gm-home-r" /><circle cx={home[0]} cy={home[1]} r={4} /><text x={home[0] - 8} y={home[1] + 4} textAnchor="end">Mumbai</text></g>}
      {(() => {
        // labels point inwards on the right half (never cut at the globe's edge); a market close to one already labelled keeps its dot but not its
        // label (London, Frankfurt and Paris sit within a few pixels), unless it is the one in focus. A lifted market and a market's move are labelled first.
        const pins = [...seen.values()].filter((m) => visible(m.place)).map((m) => ({ m, xy: proj([m.place.lon, m.place.lat]), on: lit(m) }))
          .filter((p) => p.xy) as { m: { place: Place; d1: number | null; label: string; group: string; keys: string[] }; xy: [number, number]; on: boolean }[];
        pins.sort((a, b) => Number(b.on) - Number(a.on) || (a.m.d1 == null ? 1 : 0) - (b.m.d1 == null ? 1 : 0));
        const labelled: [number, number][] = [];
        return pins.map(({ m, xy, on }) => {
          const inward = xy[0] > size * 0.55, near = labelled.some(([x, y]) => Math.hypot(x - xy[0], y - xy[1]) < 16);
          if (!near) labelled.push(xy);
          return <g key={m.place.city} className={"gm-pin " + tone(m.d1) + (m.place.open ? " open" : "") + (on ? " on" : "")} data-city={m.place.city}>
            {on && <circle cx={xy[0]} cy={xy[1]} r={12} className="gm-halo" />}
            <circle cx={xy[0]} cy={xy[1]} r={on ? 7 : m.place.open ? 6 : 4.5} />
            {!near && <text x={xy[0] + (inward ? -9 : 9)} y={xy[1] - 7} textAnchor={inward ? "end" : "start"}>{m.d1 != null && <tspan className="gm-pv">{move(m.d1, "pts")} </tspan>}{m.place.city}</text>}
          </g>;
        });
      })()}
    </svg>
  );
}

function Spark({ line }: { line: [string, number][] }) {
  if (line.length < 2) return <span className="gm-dash">{MINUS}</span>;
  const vs = line.map((p) => p[1]), lo = Math.min(...vs), hi = Math.max(...vs), w = 88, h = 26;
  const pts = vs.map((v, i) => `${(i / (vs.length - 1) * w).toFixed(1)},${(h - 2 - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (h - 4)).toFixed(1)}`).join(" ");
  return <svg className={"gm-spark " + tone(vs[vs.length - 1] - vs[0])} width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`1 month: ${line[0][0]} ${nf(vs[0], 2)} to ${line[line.length - 1][0]} ${nf(vs[vs.length - 1], 2)}`}><polyline points={pts} /></svg>;
}

const avgOf = (rows: GmRow[]) => { const d1s = rows.filter((r) => r.last != null).map((r) => r.d1).filter((v): v is number => v != null); return { avg: d1s.length ? d1s.reduce((a, b) => a + b, 0) / d1s.length : null, n: d1s.length }; };
const short = (r: GmRow) => r.label.replace(/ \(.*\)$/, "").replace("Rupee per US dollar", "Rupee").replace("US 10-year yield", "US 10Y").replace("Brent crude", "Brent");   // task #316 rework: fits a page tile
/** Task #316: a region's 1-day summary in the Region dropdown (the tile's figure as text). */
export function regionLine(g: string, rows: GmRow[]): string {
  if (INDEX_GROUPS.has(g)) { const { avg } = avgOf(rows); return avg == null ? "No data yet" : `${move(avg, "pts")} average 1D`; }
  return rows.map((r) => `${short(r)} ${r.last == null ? MINUS : move(r.d1, r.unit)}`).join(" · ");
}
/** The saved region (prefs.dashUi.region) and the table group it names. */
export const REGION_GROUP: Record<(typeof DASH_REGIONS)[number], string> = { us: "US", europe: "Europe", asia: "Asia", commod: "Commodities", fx: "Currency and yields" };

/** A continent's tile: its markets with data, how many are open, and the average 1-day move of its indices (or each item's move for the rest).
 *  Task #316: on the page (`pick`) the tiles choose which region's table shows; in the expanded view they point the globe, as on the live card. */
function RegionTile({ g, rows, focus, setFocus, pick }: { g: string; rows: GmRow[]; focus: Focus; setFocus: (f: Focus) => void; pick?: { on: boolean; choose: () => void } }) {
  const { avg, n: nd } = avgOf(rows), d1s = { length: nd };
  const opened = rows.filter((r) => r.place?.open).length, places = new Set(rows.map((r) => r.place?.city).filter(Boolean)).size;
  const on = pick ? pick.on : focus?.group === g && !focus.key;
  return <button type="button" className={"gm-rg" + (on ? " on" : "")} aria-pressed={on} data-group={g}
    onPointerEnter={(e) => mouse(e) && setFocus({ group: g })} onPointerLeave={(e) => mouse(e) && setFocus(null)} onFocus={() => setFocus({ group: g })} onBlur={() => setFocus(null)}
    onClick={() => pick ? pick.choose() : setFocus({ group: g })}>
    <b>{g}</b>
    {INDEX_GROUPS.has(g)
      ? <><span className={"gm-rv " + tone(avg)}>{avg == null ? "No data yet" : move(avg, "pts")}</span>
          <small>{avg == null ? `${rows.length} ${rows.length === 1 ? "index" : "indices"} not connected` : `average 1D of ${d1s.length} of ${rows.length} ${rows.length === 1 ? "index" : "indices"}`}{places ? ` · ${opened ? `${opened} open` : "closed"}` : ""}</small></>
      : <span className="gm-ri">{rows.map((r) => <span key={r.key}>{short(r)} <span className={tone(r.d1)}>{r.last == null ? MINUS : move(r.d1, r.unit)}</span></span>)}</span>}
  </button>;
}

export function GlobalMarkets() {
  const q = useGlobalMarkets();
  const d = q.data;
  const s = d?.summary;
  const [focus, setFocus] = useState<Focus>(null);
  // task #316: on the page one region's table shows, chosen with the live region buttons (a Region dropdown on a phone); the globe, the introduction, the region
  // headings, the 1-month lines and the sources are in the expanded view, which is the live card in full. The region is kept on the account.
  const xp = useExpanded(), [ui, setUi] = useDashUi(), region = REGION_GROUP[ui.region];
  const keyOf = (g: string) => (Object.entries(REGION_GROUP).find(([, v]) => v === g)?.[0] ?? "us") as (typeof DASH_REGIONS)[number];
  const groups = xp ? GROUPS : GROUPS.filter((g) => g === region);
  const cols = xp ? 6 : 5;
  return (
    <Card id="globalmarkets" title="Global markets" className={"gm" + (xp ? "" : " dx-card-gm")}
      sub={xp ? "The overnight and intraday context Indian markets open against: US, Europe and Asia indices, gold, crude, the rupee and the US 10-year yield. 1-month trend with 1-day, 1-week and 1-month moves." : undefined}
      right={d && <span className="gm-now"><b>{d.asOfIst}</b> IST · {s!.open} of {s!.markets} open · {s!.indices} overseas {s!.indices === 1 ? "index" : "indices"}: {s!.down ? <span className="down">{s!.down} down</span> : null}{s!.down && s!.up ? ", " : ""}{s!.up ? <span className="up">{s!.up} up</span> : null}{!s!.down && !s!.up ? "no change" : ""}</span>}>
      {q.isPending ? <p className="dsh-note" role="status">Loading world markets…</p>
        : q.isError || !d ? <p className="dsh-note" role="alert">World markets could not be loaded just now. Please try again in a moment.</p>
        : <div className="gm-body">
          <div className="gm-top">
            {xp && <figure className="gm-world"><Globe d={d} focus={focus} />
              <figcaption>Dot colour is each market’s latest 1-day move; a bigger dot is open now. Point at a continent to turn the globe to it.</figcaption></figure>}
            <div className="gm-regions dx-only-l" role="group" aria-label={xp ? "Continents: point at one to show it on the globe" : "Region to show"}>
              {GROUPS.map((g) => <RegionTile key={g} g={g} rows={d.rows.filter((r) => r.group === g)} focus={focus} setFocus={setFocus} pick={xp ? undefined : { on: g === region, choose: () => setUi({ region: keyOf(g) }) }} />)}
            </div>
            {!xp && <Dd k="Region" className="dx-only-s dx-wide" value={ui.region} onChange={(v) => setUi({ region: v })}
              options={DASH_REGIONS.map((v) => ({ v, label: REGION_GROUP[v], small: regionLine(REGION_GROUP[v], d.rows.filter((r) => r.group === REGION_GROUP[v])) }))} />}
          </div>
          <div className="gm-scroll">
            <table className="gm-t">
              <colgroup><col className="gm-c-name" /><col className="gm-c-n" /><col className="gm-c-n" /><col className="gm-c-n" /><col className="gm-c-n" />{xp && <col className="gm-c-line" />}</colgroup>
              <thead><tr><th scope="col">Market</th><th scope="col" className="n">Last</th><th scope="col" className="n">1D</th><th scope="col" className="n">1W</th><th scope="col" className="n">1M</th>{xp && <th scope="col">1 month</th>}</tr></thead>
              {groups.map((g) => {
                const rows = d.rows.filter((r) => r.group === g);
                if (!rows.length) return null;
                const empty = rows.filter((r) => r.last == null);
                const whys = [...new Set(empty.map((r) => r.why || "No close from the source yet."))];
                const on = focus?.group === g;
                return <tbody key={g} className={"gm-grp" + (on ? " on" : "")} data-group={g}
                  onPointerEnter={(e) => mouse(e) && setFocus({ group: g })} onPointerLeave={(e) => mouse(e) && setFocus(null)}>
                  {xp && <tr className="gm-gh"><th scope="colgroup" colSpan={cols}>{g}</th></tr>}
                  {rows.map((r) => (
                    <tr key={r.key} className={focus?.key === r.key ? "on" : undefined} onPointerEnter={(e) => mouse(e) && r.place && setFocus({ group: g, key: r.key })}
                      onPointerLeave={(e) => mouse(e) && r.place && setFocus({ group: g })}>
                      <th scope="row">{r.label}{r.tracker ? <span className="gm-trk" title={r.tracker.note}>via {r.tracker.code} fund</span> : null}<small>{r.place ? `${r.place.city}${r.place.open != null ? (r.place.open ? " · open" : " · closed") : ""}` : r.unit}{r.asOf ? ` · ${day(r.asOf)}` : ""}</small></th>
                      <td className="n">{level(r)}</td>
                      <td className={"n " + tone(r.d1)}>{move(r.d1, r.unit)}</td>
                      <td className={"n " + tone(r.w1)}>{move(r.w1, r.unit)}</td>
                      <td className={"n " + tone(r.m1)}>{move(r.m1, r.unit)}</td>
                      {xp && <td>{r.last == null ? <span className="gm-dash" title={r.why ?? undefined}>{MINUS}</span> : <Spark line={r.line} />}</td>}
                    </tr>))}
                  {rows.filter((r) => r.tracker && r.last != null).map((r) => <tr key={r.key + "-trk"} className="gm-why"><td colSpan={cols}>{r.label}: {r.tracker!.note.replace(/^./, (c) => c.toLowerCase())}</td></tr>)}
                  {empty.length > 0 && whys.map((w) => {
                    const names = empty.filter((r) => (r.why || "No close from the source yet.") === w).map((r) => r.label);
                    return <tr key={w} className="gm-why"><td colSpan={cols}>{names.length === rows.length ? "No figures for these markets yet" : `No figures yet for ${names.join(", ").replace(/, ([^,]*)$/, " and $1")}`}: {w.replace(/^Not connected yet: /, "").replace(/^./, (c) => c.toLowerCase())}</td></tr>;
                  })}
                </tbody>;
              })}
            </table>
          </div>
          {xp ? <p className="gm-src">Sources: {d.sources}. {d.disclaimer}</p> : <p className="gm-src">{d.disclaimer} The globe, every region and the 1-month lines are in the expanded view.</p>}
        </div>}
    </Card>
  );
}
