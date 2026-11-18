// Latest results, Industries view (task #194, pack finlit-latest-results-15nov; first drawn in docs/design/finlit-final-pages/11): every Sector Pulse group with enough
// results to compare, how its typical company did against the typical listed company, how many of its companies beat their industry, its share prices (Sector Rotation
// box and Sector Pulse state, each a coloured chip), and whether the two agree. One full-width table; a row opens its details right under it (one row at a time,
// Finance first). The four cards over it show their headline; a chevron opens the meaning and every group in it. Figures are the server's. Describes; never advice.
import { Fragment, useMemo, useState } from "react";
import { SortTh } from "../../SortTh";
import { useTableSort, type SortVal } from "../../../lib/tableSort";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../../lib/api";
import { usePortfolio } from "../../../lib/portfolio";
import { useWatchlist } from "../../../lib/watchlist";
import { Scroll, Section, Tip, BoxChip } from "../../sectors/pack/Common";
import { DashCards, DashCardsProvider, OpenAll } from "../../dashboard/DashCards";
import { useAuth } from "../../../lib/auth";
import { LockedBlock } from "../../sectors/Parts";
import { BOX, WORD, keyOf, type Card } from "../../../lib/pulsePack";
import type { StateKey } from "../../../lib/sectorHistory";
import { useQuarterResults } from "../../../lib/qresults";
import { useRotationMap, type RotationRow } from "../../../lib/rotation";
import { useSectorBoard, type GroupRow } from "../../../lib/sectors";
import { sp, type VRow } from "../../../lib/resultsPack";
import { VerdictCell } from "./ResultsPack";
import { useNseName } from "../../../lib/taxonomy";
import "../../../styles/table-grid.css";

export type Ind = { name: string; companies: number; declared: number; withNumbers?: number; medianRevenueYoY?: number | null; medianProfitYoY?: number | null; medianNpmChange?: number | null;
  revenueUpShare?: number | null; profitUpShare?: number | null; marginUpShare?: number | null; beat?: number; judged?: number; beatShare?: number | null; vsMarket?: "Ahead" | "In line" | "Behind" | null;
  market?: { medianRevenueYoY: number | null; medianProfitYoY: number | null; medianNpmChange: number | null } };
type Agree = "Agree" | "Mixed" | "Prices lag" | "Prices run ahead";
/** Results against share prices: the results' place against the market, the box's place on Sector Rotation. */
export function agreeOf(vs: Ind["vsMarket"], box: RotationRow["corner"] | null | undefined): Agree | null {
  if (!vs || !box || box === "middle") return null;
  const ahead = box === "ahead_gaining" || box === "ahead_slowing";
  if (vs === "In line") return "Mixed";
  if (vs === "Ahead") return ahead ? "Agree" : "Prices lag";
  return ahead ? "Prices run ahead" : "Agree";
}
const AGREE_TEXT: Record<Agree, string> = {
  Agree: "Results and share prices point the same way.", Mixed: "Results are about average; read the price trend on its own.",
  "Prices lag": "Strong results that the share prices have not yet reflected.", "Prices run ahead": "Shares are leading even though results trail the market.",
};

/** The four cards over the table (the dashboard's dropdown cards, shared): the kind and the headline show; the dropdown holds one line of meaning and EVERY group in it
 *  (the pack: not "and 15 more"), each a chip that opens that group's results. */
export function industryCards(rows: { i: Ind; agree: Agree | null }[], name: (n: string) => string = (n) => n): Card[] {
  const out: Card[] = [];
  const ahead = rows.filter((x) => x.i.vsMarket === "Ahead"), behind = rows.filter((x) => x.i.vsMarket === "Behind");
  const lag = rows.filter((x) => x.agree === "Prices lag"), run = rows.filter((x) => x.agree === "Prices run ahead");
  const are = (n: number) => `${n} ${n === 1 ? "group is" : "groups are"}`;
  const all = (xs: { i: Ind }[]) => (xs.length ? [{ label: `All ${xs.length}`, chips: xs.map((x) => ({ symbol: x.i.name, label: name(x.i.name), to: `/results/quarter?industry=${encodeURIComponent(x.i.name)}` })) }] : []);
  if (ahead.length) out.push({ kind: "good", title: `${are(ahead.length)} ahead of the market`, text: "Their typical company grew revenue and profit faster than the typical listed company.", groups: all(ahead) });
  out.push({ kind: "insight", title: `Results beat, prices lag: ${lag.length}`, text: lag.length ? "Strong results that the share prices have not yet reflected." : "No group has strong results with share prices that are behind.", groups: all(lag) });
  out.push({ kind: "watch", title: `Prices ahead of results: ${run.length}`, text: run.length ? "Shares are leading even though results trail the market." : "No group's share prices are running ahead of weak results.", groups: all(run) });
  if (behind.length) out.push({ kind: "warning", title: `${are(behind.length)} behind the market`, text: "Their typical company grew more slowly than the typical listed company.", groups: all(behind) });
  return out;
}

/** The pack's Sector Pulse chip colours on this page: Sold off red; Bouncing back and Bouncing back after a crash teal; Losing steam gold; Rising together green. */
export const PULSE_TONE: Record<StateKey, "bad" | "teal" | "gold" | "good" | "none"> = { sold_off: "bad", bouncing: "teal", crash: "teal", losing: "gold", rising: "good", no_signal: "none" };
export function PulseChip({ g }: { g: GroupRow | undefined }) {
  if (!g) return <span className="rs-na">Too small for a reading</span>;
  const k = keyOf(g);
  return <span className={"rs-pchip rs-p-" + PULSE_TONE[k]}>{WORD[k]}</span>;
}

function Ring({ v, label, tone }: { v: number | null | undefined; label: string; tone: string }) {
  const p = v == null ? 0 : Math.max(0, Math.min(100, v));
  return <div className="rs-ring"><span className={"rs-ring-c " + tone} style={{ ["--v" as string]: p }} role="img" aria-label={`${label}: ${v == null ? "no figure" : `${Math.round(v)}%`}`}><b>{v == null ? "–" : `${Math.round(v)}%`}</b></span><small>{label}</small></div>;
}

/** One group's details, right under its row, in three columns: how its companies did; the typical company and results vs share prices; its biggest companies. */
function Drawer({ i, rot, pulse }: { i: Ind; rot: RotationRow | undefined; pulse: GroupRow | undefined }) {
  const nse = useNseName();   // the group's name in NSE's spelling (Sector Pulse drops NSE's commas)
  const q = useQuarterResults({ industry: i.name, status: "declared", sort: "marketCap", dir: "desc", limit: 10 });
  const rows = (q.data?.rows ?? []) as VRow[], m = i.market, a = agreeOf(i.vsMarket, rot?.corner);
  const big = useTableSort(rows, (r, k): SortVal => ({ company: r.symbol, size: r.cap, rev: r.revenueYoY, profit: r.profitYoY, verdict: r.verdict } as Record<string, SortVal>)[k]);
  const typ = useTableSort([["Revenue growth YoY", i.medianRevenueYoY, m?.medianRevenueYoY], ["Profit growth YoY", i.medianProfitYoY, m?.medianProfitYoY], ["Margin change", i.medianNpmChange, m?.medianNpmChange]] as [string, number | null | undefined, number | null | undefined][],
    (r, k): SortVal => (k === "fig" ? r[0] : k === "ind" ? r[1] : r[2]));
  const tone = (v: number | null | undefined) => (v == null ? "" : v >= 0 ? "sp-good" : "sp-red");
  const row = (label: string, a1: number | null | undefined, b1: number | null | undefined) => <tr><th scope="row">{label}</th><td className={"r " + tone(a1)}>{sp(a1)}</td><td className={"r " + tone(b1)}>{sp(b1)}</td></tr>;
  if (i.medianRevenueYoY === undefined) return <div className="rs-dr rs-dr-locked"><LockedBlock plan="silver" title="Each group's figures are part of the Silver plan">The counts are open to everyone. {i.declared} of {i.companies} companies in {nse(i.name)} have declared.</LockedBlock></div>;
  return (
    <div className="rs-dr">
      <div>
        <p className="sp-cap">How its companies did</p>
        <div className="rs-rings"><Ring v={i.revenueUpShare} label="Revenue grew" tone="b" /><Ring v={i.profitUpShare} label="Profit grew" tone="t" /><Ring v={i.marginUpShare} label="Margin improved" tone="o" /><Ring v={i.beatShare} label="Beat the industry" tone="g" /></div>
        <p className="sp-note">{i.declared} of {i.companies} companies have declared</p>
      </div>
      <div>
        <p className="sp-cap">Typical company</p>
        <table className="sp-tb rs-typ kit-grid"><thead><tr><SortTh k="fig" label={<span className="sr-only">Figure</span>} sort={typ.sort} onSort={typ.toggle} /><SortTh k="ind" label="Industry" className="r" sort={typ.sort} onSort={typ.toggle} /><SortTh k="mkt" label="Market" className="r" sort={typ.sort} onSort={typ.toggle} /></tr></thead>
          <tbody>{typ.sorted.map((x) => <Fragment key={x[0]}>{row(x[0], x[1], x[2])}</Fragment>)}</tbody></table>
        <div className="rs-rvp"><p><b>Results vs share prices: {a ?? "no reading"}</b><Tip text="Results vs share prices. How the group's results compare with the market, set against where its share prices stand on Sector Rotation. Agree: both point the same way. Prices lag: results are ahead, prices behind. Prices run ahead: prices ahead, results behind. Mixed: results are about average." /></p>
          <p>{a ? AGREE_TEXT[a] : "Not enough results or no Sector Rotation reading yet."}{rot?.corner && rot.corner !== "middle" ? ` Sector Rotation: ${BOX[rot.corner].word}.` : ""}{pulse ? ` Sector Pulse: ${WORD[keyOf(pulse)]}.` : ""}</p></div>
      </div>
      <div>
        <p className="sp-cap">Biggest companies that declared</p>
        {q.data?.locked ? <p className="sp-note">Each company's verdict is part of the Silver plan.</p> : !rows.length ? <p className="sp-note">{q.isLoading ? "Loading…" : "No company has declared yet."}</p> :
          <div className="rs-dr-scroll" role="region" aria-label="Biggest companies that declared" tabIndex={0}><table className="sp-tb rs-big kit-grid"><thead><tr>{(["company:Company", "size:Size", "rev:Rev.:r", "profit:Profit:r", "verdict:Verdict"]).map((c) => { const [k, l, cls] = c.split(":"); return <SortTh key={k} k={k} label={l} className={cls} sort={big.sort} onSort={big.toggle} />; })}</tr></thead>
            <tbody>{big.sorted.map((r) => <tr key={r.symbol}><td><Link to={`/stocks/${r.symbol}#quarter`}><b>{r.symbol}</b></Link></td><td>{r.cap ?? "–"}</td><td className={"r " + tone(r.revenueYoY)}>{sp(r.revenueYoY)}</td><td className={"r " + tone(r.profitYoY)}>{r.loss && r.profitYoY == null ? "loss" : sp(r.profitYoY)}</td><td>{r.verdict ? <span className={"rs-v rs-v-" + r.verdict.toLowerCase().replace(" ", "")}>{r.verdict}</span> : <VerdictCell r={r} />}</td></tr>)}</tbody></table></div>}
        <Link className="sp-link" to={`/results/quarter?industry=${encodeURIComponent(i.name)}`}>All {i.declared} companies in {nse(i.name)} →</Link>
      </div>
    </div>
  );
}

const COLS = 8;
/** Green for growth, red for a fall; no colour for a blank or a figure the plan does not open. */
const signTone = (v: number | null | undefined) => (v == null ? "" : v >= 0 ? "sp-good" : "sp-red");
/** One spelling for matching group names: lower case, "and" as "&", only letters, digits and "&" (the server's taxonomy.key). */
export const nameKey = (s: string) => s.toLowerCase().replace(/ and /g, " & ").replace(/[^a-z0-9&]/g, "");
export function IndustriesView({ inds }: { inds: Ind[] }) {
  const nse = useNseName();
  const wl = useWatchlist(), pf = usePortfolio();
  const mineKey = useMemo(() => [...new Set([...wl.lists.flatMap((l) => l.symbols), ...pf.holdings.map((h) => h.symbol.toUpperCase())])].sort().join(","), [wl, pf.holdings]);
  const mem = useQuery<{ groups: Record<string, { name: string }> }, ApiError>({ queryKey: ["sectors", "membership", mineKey], queryFn: () => apiGet(`/api/sectors/membership?symbols=${encodeURIComponent(mineKey)}`), enabled: !!mineKey, staleTime: 3_600_000, retry: false });
  // Sector Pulse and Sector Rotation write NSE's names without their commas ("Paper Forest & Jute Products"); the results use NSE's spelling: match on one key
  const yours = useMemo(() => new Set(Object.values(mem.data?.groups ?? {}).map((g) => nameKey(g.name))), [mem.data]);   // the Sector Pulse groups of the member's shares
  const rq = useRotationMap(), bq = useSectorBoard();
  const rotM = useMemo(() => new Map((rq.data?.rows ?? []).map((r) => [nameKey(r.name), r])), [rq.data]), pulseM = useMemo(() => new Map((bq.data?.rows ?? []).map((r) => [nameKey(r.name), r])), [bq.data]);
  const rot = { get: (n: string) => rotM.get(nameKey(n)) }, pulse = { get: (n: string) => pulseM.get(nameKey(n)) };
  const shown = useMemo(() => inds.filter((i) => (i.withNumbers ?? i.declared) >= 5).sort((a, b) => (b.declared - a.declared) || a.name.localeCompare(b.name)), [inds]);
  const rows = shown.map((i) => ({ i, agree: agreeOf(i.vsMarket, rot.get(i.name)?.corner) }));
  // task #224 (A1): every heading sorts; a row and its open drawer move together (they are one unit below)
  const { sorted: sortedRows, sort, toggle } = useTableSort(rows, ({ i, agree }, k): SortVal => {
    const r = rot.get(i.name), g = pulse.get(i.name);
    return ({ name: nse(i.name), vs: i.vsMarket ?? null, rev: i.medianRevenueYoY ?? null, profit: i.medianProfitYoY ?? null, beat: i.beatShare ?? null,
      rot: r?.corner && r.corner !== "middle" ? BOX[r.corner].word : null, pulse: g ? WORD[keyOf(g)] : null, agree: agree ?? null } as Record<string, SortVal>)[k];
  });
  const H = (k: string, l: React.ReactNode, cls?: string, after?: React.ReactNode) => <SortTh k={k} label={l} sort={sort} onSort={toggle} className={cls} after={after} />;
  // One row open at a time; Finance first (the pack), else the largest group. `null` = the reader closed it.
  const [pick, setPick] = useState<string | null | undefined>(undefined);
  const openName = pick === undefined ? (shown.find((i) => i.name === "Finance") ?? shown[0])?.name : pick;
  const flip = (name: string) => setPick(openName === name ? null : name);
  const locked = shown.length > 0 && shown[0].medianRevenueYoY === undefined;
  const cards = industryCards(rows, nse);
  const { user } = useAuth();
  const rotWhy = "No Sector Rotation reading: the group has too few stocks with a long enough price history.";
  return (
    <Section id="rs-inds" title={groupsTitle(shown.map((i) => pulse.get(i.name)?.kind), !!bq.data)} help="Groups: the same groups as Sector Pulse, each an NSE industry, or an NSE sector where its industries are too small to read alone. Each has at least five results so far and is compared with the typical listed company."
      sub="Select a group to see how its companies did, right under it. Groups with too few results so far are left out until more report."
      why="Share prices often move before results arrive. Putting each group's results next to its price trend shows where the two agree, and where one is ahead of the other.">
      {!locked && cards.length > 0 && <DashCardsProvider userId={user?.id}>
        <div className="rs-cardbar"><OpenAll scope="results.groups" n={cards.length} /></div>
        <DashCards items={cards} scope="results.groups" cols={4} />
      </DashCardsProvider>}
      {/* task #224 (A2): say that every row opens */}
      <p className="rs-openhint"><span className="rs-chev" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></span><span><b>Every row opens.</b> Click an industry to see how its companies did, the typical company against the market, and its biggest results. Click a heading to sort.</span></p>
      <Scroll label="groups"><table className="sp-tb rs-it kit-grid">
        <thead>
          <tr className="kit-bands"><th aria-hidden="true" /><th colSpan={4} scope="colgroup" className="kit-band kit-b-green">Results this quarter</th><th colSpan={2} scope="colgroup" className="kit-band kit-b-blue">Share prices now</th><th scope="colgroup" className="kit-band kit-b-dark">Together</th></tr>
          <tr>{H("name", "Group")}{H("vs", "Vs market", undefined, <Tip text="Ahead: its typical company grew revenue and profit faster than the typical listed company. Behind: both slower. In line: in between." />)}
            {H("rev", "Revenue growth", "r", <Tip text="The typical company's revenue growth on a year ago." />)}{H("profit", "Profit growth", "r", <Tip text="The typical company's net profit growth on a year ago." />)}
            {H("beat", "Beat their industry", undefined, <Tip text="The share of its declared companies with a Strong or Good result against their industry." />)}
            {H("rot", "Sector Rotation", undefined, <Tip text="Its box on Sector Rotation: its price strength over the last few months and in recent weeks, against the average industry." />)}
            {H("pulse", "Sector Pulse", undefined, <Tip text="Its state on Sector Pulse: how many of its stocks are rising together." />)}
            {H("agree", "Results and prices", undefined, <Tip text="Whether the results and the share prices point the same way: Agree, Prices lag, Prices run ahead or Mixed." />)}</tr>
        </thead>
        <tbody>{sortedRows.map(({ i, agree }) => { const r = rot.get(i.name), g = pulse.get(i.name), on = openName === i.name, id = "rs-dr-" + i.name.replace(/[^a-zA-Z0-9]/g, ""); return (
          <Fragment key={i.name}>
            <tr className={"rs-ir" + (on ? " on" : "")} tabIndex={0} aria-expanded={on} aria-controls={on ? id : undefined} aria-label={`${nse(i.name)}: ${on ? "close" : "open"} its details`}
              onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) flip(i.name); }} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); flip(i.name); } }}>
              <td><span className="rs-iname"><span className="rs-chev" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></span><b>{nse(i.name)}</b>{yours.has(nameKey(i.name)) && <em className="rs-yours" title="You hold or follow a company in this group">Yours</em>}</span><small>{i.declared} of {i.companies} declared</small></td>
              <td>{i.vsMarket === undefined ? "Silver" : i.vsMarket ? <span className={"rs-vm rs-vm-" + i.vsMarket.toLowerCase().replace(" ", "")}>{i.vsMarket}</span> : <span className="rs-na">Too few figures</span>}</td>
              <td className={"r " + signTone(i.medianRevenueYoY)}>{i.medianRevenueYoY === undefined ? "Silver" : sp(i.medianRevenueYoY)}</td><td className={"r " + signTone(i.medianProfitYoY)}>{i.medianProfitYoY === undefined ? "Silver" : sp(i.medianProfitYoY)}</td>
              <td>{i.beatShare === undefined ? "Silver" : i.beatShare == null ? <span className="rs-na">Too few figures</span> : <span className="rs-dw"><span className="t" aria-hidden="true"><i style={{ width: `${Math.min(100, i.beatShare)}%` }} /></span><b>{Math.round(i.beatShare)}%</b></span>}</td>
              <td>{r?.corner && r.corner !== "middle" ? <BoxChip corner={r.corner} /> : <span className="rs-na" title={rotWhy}>No reading</span>}</td>
              <td><PulseChip g={g} /></td>
              <td>{agree ? <span className={"rs-ag rs-ag-" + agree.toLowerCase().replace(/ /g, "")}>{agree}</span> : <span className="rs-na" title={locked ? "Part of the Silver plan" : "Needs both the results and a Sector Rotation reading"}>—</span>}</td></tr>
            {on && <tr className="rs-drawer" id={id}><td colSpan={COLS}><Drawer i={i} rot={r} pulse={g} /></td></tr>}
          </Fragment>); })}</tbody>
      </table></Scroll>
    </Section>
  );
}

/** "47 groups with enough results to compare: 42 industries and 5 sectors" (task #192: the heading said "Industries" for a list that holds both levels). The split is
 *  given only once the Sector Pulse board has loaded (`known`): until then every group would read as an industry. A group the loaded board does not list is an industry
 *  (the results page reads it from NSE's quote page). */
export function groupsTitle(kinds: (string | undefined)[], known = true): string {
  const sectors = kinds.filter((k) => k === "sector").length, industries = kinds.length - sectors;
  const parts = [industries ? `${industries} ${industries === 1 ? "industry" : "industries"}` : "", sectors ? `${sectors} ${sectors === 1 ? "sector" : "sectors"}` : ""].filter(Boolean);
  return `${kinds.length} ${kinds.length === 1 ? "group" : "groups"} with enough results to compare${known && parts.length ? ": " + parts.join(" and ") : ""}`;
}
