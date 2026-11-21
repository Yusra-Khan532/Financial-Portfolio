// Task #294 ("we need to make this on dashboard", the team's pictures of a Global Markets Tracker, 21 Nov 2026): the overnight and intraday context Indian
// markets open against. A world view (each overseas market where it is, coloured by its last day's move, open or closed now) beside a table of US, Europe
// and Asia indices, gold, crude, the rupee and the US 10-year yield with the 1-day, 1-week and 1-month moves and a 1-month line. Data: GET /api/global-markets
// (backend/finlit/global_markets.py: FRED, the site's FBIL rupee, Twelve Data where connected). A row without data says why. Describes; never advises.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import { apiGet } from "../../lib/api";
import { MINUS, nf } from "../../lib/format";
import { Card } from "./parts";
import "./global-markets.css";

type Place = { city: string; lat: number; lon: number; open?: boolean; local?: string; hours?: string };
export type GmRow = { key: string; label: string; group: string; unit: string; source: string; last: number | null; asOf: string | null; d1: number | null; w1: number | null; m1: number | null;
  line: [string, number][]; why: string | null; place: Place | null };
export type GmData = { rows: GmRow[]; home: Place & { open?: boolean }; asOfIst: string; summary: { open: number; markets: number; indices: number; down: number; up: number };
  disclaimer: string; sources: string };

const GROUPS = ["US", "Europe", "Asia", "Commodities", "Currency and yields"];
const LAND = feature(land110 as unknown as Topology, (land110 as unknown as Topology).objects.land);

/** A move: % for prices, percentage points for a yield; a real minus sign. */
export const move = (v: number | null, unit: string) => v == null ? MINUS : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), 2)}${unit === "%" ? " pts" : "%"}`;
const tone = (v: number | null) => (v == null || v === 0 ? "" : v > 0 ? "up" : "down");
const level = (r: GmRow) => r.last == null ? MINUS : r.unit === "₹" ? `₹${nf(r.last, 2)}` : r.unit === "%" ? `${nf(r.last, 2)}%` : r.unit.startsWith("US$") ? `$${nf(r.last, 2)}` : nf(r.last, 2);
const day = (iso: string | null) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";

export function useGlobalMarkets() {
  return useQuery<GmData>({ queryKey: ["global-markets"], queryFn: () => apiGet("/api/global-markets"), staleTime: 300_000, retry: 1 });
}

/** The world as seen from above the Arabian Sea: Europe to Japan, with India's market ringed. A market on the far side of the globe is not drawn here;
 *  every market is in the table. */
export function Globe({ d, size = 300 }: { d: GmData; size?: number }) {
  const proj = useMemo(() => geoOrthographic().rotate([-72, -24]).scale(size / 2 - 6).translate([size / 2, size / 2]).clipAngle(90), [size]);
  const path = useMemo(() => geoPath(proj), [proj]);
  const seen = new Map<string, { place: Place; d1: number | null; label: string }>();
  for (const r of d.rows) {
    if (!r.place || !["US", "Europe", "Asia"].includes(r.group)) continue;
    const had = seen.get(r.place.city);
    if (!had || (had.d1 == null && r.d1 != null)) seen.set(r.place.city, { place: r.place, d1: r.d1, label: r.label });   // the first index of a city with a move
  }
  const visible = (p: { lon: number; lat: number }) => { const c = proj.rotate(); const lon = (p.lon + c[0]) * Math.PI / 180, lat = p.lat * Math.PI / 180, lat0 = -c[1] * Math.PI / 180;
    return Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(lon) > 0; };
  const home = proj([d.home.lon, d.home.lat]);
  return (
    <svg className="gm-globe" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`World markets: ${[...seen.values()].map((m) => `${m.place.city} ${move(m.d1, "pts")}${m.place.open ? ", open" : ", closed"}`).join("; ")}`}>
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 6} className="gm-sea" />
      <path d={path(geoGraticule10()) ?? ""} className="gm-grat" />
      <path d={path(LAND) ?? ""} className="gm-land" />
      {home && <g className="gm-home"><circle cx={home[0]} cy={home[1]} r={22} className="gm-home-r" /><circle cx={home[0]} cy={home[1]} r={4} /><text x={home[0] - 8} y={home[1] + 4} textAnchor="end">Mumbai</text></g>}
      {(() => {
        // labels point inwards on the right half (never cut at the globe's edge); a market close to one already labelled keeps its dot but not its
        // label (London, Frankfurt and Paris sit within a few pixels): its figures are in the table. A market's move is labelled first.
        const pins = [...seen.values()].filter((m) => visible(m.place)).map((m) => ({ m, xy: proj([m.place.lon, m.place.lat]) })).filter((p) => p.xy) as { m: { place: Place; d1: number | null; label: string }; xy: [number, number] }[];
        pins.sort((a, b) => (a.m.d1 == null ? 1 : 0) - (b.m.d1 == null ? 1 : 0));
        const labelled: [number, number][] = [];
        return pins.map(({ m, xy }) => {
          const inward = xy[0] > size * 0.55, near = labelled.some(([x, y]) => Math.hypot(x - xy[0], y - xy[1]) < 16);
          if (!near) labelled.push(xy);
          return <g key={m.place.city} className={"gm-pin " + tone(m.d1) + (m.place.open ? " open" : "")}>
            <circle cx={xy[0]} cy={xy[1]} r={m.place.open ? 6 : 4.5} />
            {!near && <text x={xy[0] + (inward ? -8 : 8)} y={xy[1] - 6} textAnchor={inward ? "end" : "start"}>{m.d1 != null && <tspan className="gm-pv">{move(m.d1, "pts")} </tspan>}{m.place.city}</text>}
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

export function GlobalMarkets() {
  const q = useGlobalMarkets();
  const d = q.data;
  const s = d?.summary;
  return (
    <Card id="globalmarkets" title="Global markets" className="gm"
      sub="The overnight and intraday context Indian markets open against: US, Europe and Asia indices, gold, crude, the rupee and the US 10-year yield. 1-month trend with 1-day, 1-week and 1-month moves."
      right={d && <span className="gm-now"><b>{d.asOfIst}</b> IST · {s!.open} of {s!.markets} open · {s!.indices} overseas {s!.indices === 1 ? "index" : "indices"}: {s!.down ? <span className="down">{s!.down} down</span> : null}{s!.down && s!.up ? ", " : ""}{s!.up ? <span className="up">{s!.up} up</span> : null}{!s!.down && !s!.up ? "no change" : ""}</span>}>
      {q.isPending ? <p className="dsh-note" role="status">Loading world markets…</p>
        : q.isError || !d ? <p className="dsh-note" role="alert">World markets could not be loaded just now. Please try again in a moment.</p>
        : <div className="gm-body">
          <figure className="gm-world"><Globe d={d} />
            <figcaption>Dot colour is each market's latest 1-day index move; a bigger dot is open now. Mumbai is the home session.</figcaption></figure>
          <div className="gm-tables">{GROUPS.map((g) => {
            const rows = d.rows.filter((r) => r.group === g);
            return !rows.length ? null : (
              <div key={g} className="gm-grp">
                <h4>{g}</h4>
                <table className="gm-t"><thead><tr><th scope="col">Market</th><th scope="col" className="n">Last</th><th scope="col" className="n">1D</th><th scope="col" className="n">1W</th><th scope="col" className="n">1M</th><th scope="col">1 month</th></tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.key}>
                      <th scope="row">{r.label}<small>{r.place ? `${r.place.city}${r.place.open != null ? (r.place.open ? " · open" : " · closed") : ""}` : r.unit}{r.asOf ? ` · ${day(r.asOf)}` : ""}</small></th>
                      {r.last == null ? <td colSpan={5} className="gm-why">{r.why}</td> : <>
                        <td className="n">{level(r)}</td>
                        <td className={"n " + tone(r.d1)}>{move(r.d1, r.unit)}</td>
                        <td className={"n " + tone(r.w1)}>{move(r.w1, r.unit)}</td>
                        <td className={"n " + tone(r.m1)}>{move(r.m1, r.unit)}</td>
                        <td><Spark line={r.line} /></td></>}
                    </tr>))}</tbody></table>
              </div>);
          })}</div>
          <p className="gm-src">Sources: {d.sources}. {d.disclaimer}</p>
        </div>}
    </Card>
  );
}
