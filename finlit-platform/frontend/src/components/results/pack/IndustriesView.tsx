// Latest results, Industries view, as the "FinLit final pages" pack draws it (docs/design/finlit-final-pages/11): every Sector Pulse group with enough results to compare,
// how its typical company did against the typical listed company, how many of its companies are doing well, its share prices (Sector Rotation box, Sector Pulse state),
// and whether the two agree; and one selected industry in detail with its biggest companies' verdicts. Figures are the server's. Describes; never advice.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../../lib/api";
import { usePortfolio } from "../../../lib/portfolio";
import { useWatchlist } from "../../../lib/watchlist";
import { Cards, Scroll, Section, Tip, BoxChip } from "../../sectors/pack/Common";
import { LockedBlock } from "../../sectors/Parts";
import { BOX, WORD, keyOf, type Card } from "../../../lib/pulsePack";
import { useQuarterResults } from "../../../lib/qresults";
import { useRotationMap, type RotationRow } from "../../../lib/rotation";
import { useSectorBoard, type GroupRow } from "../../../lib/sectors";
import { sp, type VRow } from "../../../lib/resultsPack";
import { VerdictCell } from "./ResultsPack";
import { useNseName } from "../../../lib/taxonomy";

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
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const head = (xs: string[], n = 4) => `${xs.slice(0, n).join(", ")}${xs.length > n ? ` and ${xs.length - n} more` : ""}`;

export function industryCards(rows: { i: Ind; agree: Agree | null }[], name: (n: string) => string = (n) => n): Card[] {
  const out: Card[] = [], nm = (x: { i: Ind }) => name(x.i.name);
  const ahead = rows.filter((x) => x.i.vsMarket === "Ahead"), behind = rows.filter((x) => x.i.vsMarket === "Behind");
  const lag = rows.filter((x) => x.agree === "Prices lag"), run = rows.filter((x) => x.agree === "Prices run ahead");
  if (ahead.length) out.push({ kind: "good", title: `${ahead.length} ${ahead.length === 1 ? "group is" : "groups are"} ahead of the market`, text: `${head(ahead.map(nm))}: their typical company grew revenue and profit faster than the typical listed company.` });
  out.push({ kind: "insight", title: `Results beat, prices lag: ${lag.length}`, text: lag.length ? `${list(lag.map(nm))}. Strong results that the share prices have not yet reflected.` : "No group has strong results with share prices that are behind." });
  out.push({ kind: "watch", title: `Prices ahead of results: ${run.length}`, text: run.length ? `${list(run.map(nm))}. Shares are leading even though results trail the market.` : "No group's share prices are running ahead of weak results." });
  if (behind.length) out.push({ kind: "warning", title: `${behind.length} ${behind.length === 1 ? "group is" : "groups are"} behind the market`, text: `${head(behind.map(nm))}.` });
  return out;
}

function Ring({ v, label, tone }: { v: number | null | undefined; label: string; tone: string }) {
  const p = v == null ? 0 : Math.max(0, Math.min(100, v));
  return <div className="rs-ring"><span className={"rs-ring-c " + tone} style={{ ["--v" as string]: p }} role="img" aria-label={`${label}: ${v == null ? "no figure" : `${Math.round(v)}%`}`}><b>{v == null ? "–" : `${Math.round(v)}%`}</b></span><small>{label}</small></div>;
}

function Selected({ i, rot, pulse }: { i: Ind; rot: RotationRow | undefined; pulse: GroupRow | undefined }) {
  const nse = useNseName();   // the group's name in NSE's spelling (Sector Pulse drops NSE's commas)
  const q = useQuarterResults({ industry: i.name, status: "declared", sort: "marketCap", dir: "desc", limit: 10 });
  const rows = (q.data?.rows ?? []) as VRow[], m = i.market, a = agreeOf(i.vsMarket, rot?.corner);
  const row = (label: string, a1: number | null | undefined, b1: number | null | undefined) => <tr><th scope="row">{label}</th><td className={"r " + ((a1 ?? 0) >= 0 ? "sp-good" : "sp-red")}>{sp(a1)}</td><td className={"r " + ((b1 ?? 0) >= 0 ? "sp-good" : "sp-red")}>{sp(b1)}</td></tr>;
  return (
    <aside className="rs-sel" aria-label={`Selected group: ${nse(i.name)}`}>
      <p className="sp-cap">Selected group</p>
      <p className="rs-sel-h"><b>{nse(i.name)}</b>{i.vsMarket && <span className={"rs-vm rs-vm-" + i.vsMarket.toLowerCase().replace(" ", "")}>{i.vsMarket}</span>}</p>
      <p className="sp-note">{i.declared} of {i.companies} companies have declared</p>
      {i.medianRevenueYoY === undefined ? <LockedBlock plan="silver" title="Each group's figures are part of the Silver plan">The counts are open to everyone.</LockedBlock> : <>
        <div className="rs-rings"><Ring v={i.revenueUpShare} label="Revenue grew" tone="b" /><Ring v={i.profitUpShare} label="Profit grew" tone="t" /><Ring v={i.marginUpShare} label="Margin improved" tone="o" /><Ring v={i.beatShare} label="Beat the industry" tone="g" /></div>
        <p className="sp-cap">Typical company</p>
        <table className="sp-tb rs-typ"><thead><tr><th scope="col" /><th scope="col" className="r">Industry</th><th scope="col" className="r">Market</th></tr></thead>
          <tbody>{row("Revenue growth YoY", i.medianRevenueYoY, m?.medianRevenueYoY)}{row("Profit growth YoY", i.medianProfitYoY, m?.medianProfitYoY)}{row("Margin change", i.medianNpmChange, m?.medianNpmChange)}</tbody></table>
        <div className="rs-rvp"><p><b>Results vs share prices: {a ?? "no reading"}</b><Tip text="Results vs share prices. How the group's results compare with the market, set against where its share prices stand on Sector Rotation. Agree: both point the same way. Prices lag: results are ahead, prices behind. Prices run ahead: prices ahead, results behind. Mixed: results are about average." /></p>
          <p>{a ? AGREE_TEXT[a] : "Not enough results or no Sector Rotation reading yet."}{rot?.corner && rot.corner !== "middle" ? ` Sector Rotation: ${BOX[rot.corner].word}.` : ""}{pulse ? ` Sector Pulse: ${WORD[keyOf(pulse)]}.` : ""}</p></div>
        <p className="sp-cap">Biggest companies that declared</p>
        {q.data?.locked ? <p className="sp-note">Each company's verdict is part of the Silver plan.</p> : !rows.length ? <p className="sp-note">{q.isLoading ? "Loading…" : "No company has declared yet."}</p> :
          <table className="sp-tb rs-big"><thead><tr><th scope="col">Company</th><th scope="col">Size</th><th scope="col" className="r">Rev.</th><th scope="col" className="r">Profit</th><th scope="col">Verdict</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.symbol}><td><Link to={`/stocks/${r.symbol}#quarter`}><b>{r.symbol}</b></Link></td><td>{r.cap ?? "–"}</td><td className={"r " + ((r.revenueYoY ?? 0) >= 0 ? "sp-good" : "sp-red")}>{sp(r.revenueYoY)}</td><td className={"r " + ((r.profitYoY ?? 0) >= 0 ? "sp-good" : "sp-red")}>{r.loss && r.profitYoY == null ? "loss" : sp(r.profitYoY)}</td><td>{r.verdict ? <span className={"rs-v rs-v-" + r.verdict.toLowerCase().replace(" ", "")}>{r.verdict}</span> : <VerdictCell r={r} />}</td></tr>)}</tbody></table>}
        <Link className="sp-link" to={`/results/quarter?industry=${encodeURIComponent(i.name)}`}>All {i.declared} companies in {nse(i.name)} →</Link>
      </>}
    </aside>
  );
}

export function IndustriesView({ inds }: { inds: Ind[] }) {
  const nse = useNseName();
  const wl = useWatchlist(), pf = usePortfolio();
  const mineKey = useMemo(() => [...new Set([...wl.lists.flatMap((l) => l.symbols), ...pf.holdings.map((h) => h.symbol.toUpperCase())])].sort().join(","), [wl, pf.holdings]);
  const mem = useQuery<{ groups: Record<string, { name: string }> }, ApiError>({ queryKey: ["sectors", "membership", mineKey], queryFn: () => apiGet(`/api/sectors/membership?symbols=${encodeURIComponent(mineKey)}`), enabled: !!mineKey, staleTime: 3_600_000, retry: false });
  const yours = useMemo(() => new Set(Object.values(mem.data?.groups ?? {}).map((g) => g.name)), [mem.data]);   // the Sector Pulse groups of the member's shares
  const rq = useRotationMap(), bq = useSectorBoard();
  const rot = useMemo(() => new Map((rq.data?.rows ?? []).map((r) => [r.name, r])), [rq.data]), pulse = useMemo(() => new Map((bq.data?.rows ?? []).map((r) => [r.name, r])), [bq.data]);
  const shown = useMemo(() => inds.filter((i) => (i.withNumbers ?? i.declared) >= 5).sort((a, b) => (b.declared - a.declared) || a.name.localeCompare(b.name)), [inds]);
  const rows = shown.map((i) => ({ i, agree: agreeOf(i.vsMarket, rot.get(i.name)?.corner) }));
  const [pick, setPick] = useState<string | null>(null);
  const sel = shown.find((i) => i.name === pick) ?? shown.find((i) => i.name === "Finance") ?? shown[0];
  const locked = shown.length > 0 && shown[0].medianRevenueYoY === undefined;
  return (
    <Section id="rs-inds" title={groupsTitle(shown.map((i) => pulse.get(i.name)?.kind), !!bq.data)} help="Groups: the same groups as Sector Pulse, each an NSE industry, or an NSE sector where its industries are too small to read alone. Each has at least five results so far and is compared with the typical listed company."
      sub="Select a group to see its companies on the right. Groups with too few results so far are left out until more report."
      why="Share prices often move before results arrive. Putting each group's results next to its price trend shows where the two agree, and where one is ahead of the other.">
      {!locked && <Cards items={industryCards(rows, nse)} cols={4} />}
      <div className="rs-inds">
        <Scroll label="industries"><table className="sp-tb rs-it">
          <thead><tr><th scope="col">Group</th><th scope="col">Vs market<Tip text="Ahead: its typical company grew revenue and profit faster than the typical listed company. Behind: both slower. In line: in between." /></th>
            <th scope="col" className="r">Rev.<Tip text="The typical company's revenue growth on a year ago." /></th><th scope="col" className="r">Profit<Tip text="The typical company's net profit growth on a year ago." /></th>
            <th scope="col">Doing well<Tip text="The share of its declared companies with a Strong or Good result against their industry." /></th><th scope="col">Share prices<Tip text="Its box on Sector Rotation and its state on Sector Pulse." /></th><th scope="col">Agree?<Tip text="Whether the results and the share prices point the same way." /></th></tr></thead>
          <tbody>{rows.map(({ i, agree }) => { const r = rot.get(i.name), g = pulse.get(i.name), on = sel?.name === i.name; return (
            <tr key={i.name} className={"rs-ir" + (on ? " on" : "")}>
              <td><button type="button" className="rs-pick" aria-pressed={on} onClick={() => setPick(i.name)}><b>{nse(i.name)}{yours.has(i.name) && <em className="rp-yours"> · Yours</em>}</b><small>{i.declared} of {i.companies} declared</small></button></td>
              <td>{i.vsMarket ? <span className={"rs-vm rs-vm-" + i.vsMarket.toLowerCase().replace(" ", "")}>{i.vsMarket}</span> : "–"}</td>
              <td className={"r " + ((i.medianRevenueYoY ?? 0) >= 0 ? "sp-good" : "sp-red")}>{i.medianRevenueYoY === undefined ? "Silver" : sp(i.medianRevenueYoY)}</td><td className={"r " + ((i.medianProfitYoY ?? 0) >= 0 ? "sp-good" : "sp-red")}>{i.medianProfitYoY === undefined ? "" : sp(i.medianProfitYoY)}</td>
              <td>{i.beatShare == null ? "–" : <span className="rs-dw"><span className="t" aria-hidden="true"><i style={{ width: `${Math.min(100, i.beatShare)}%` }} /></span><b>{Math.round(i.beatShare)}%</b></span>}</td>
              <td>{r?.corner && r.corner !== "middle" ? <><BoxChip corner={r.corner} /><small className="rs-pulse">{g ? WORD[keyOf(g)] : ""}</small></> : <small>{g ? WORD[keyOf(g)] : "–"}</small>}</td>
              <td>{agree ? <span className={"rs-ag rs-ag-" + agree.toLowerCase().replace(/ /g, "")}>{agree}</span> : "–"}</td></tr>); })}</tbody>
        </table></Scroll>
        {sel && <Selected i={sel} rot={rot.get(sel.name)} pulse={pulse.get(sel.name)} />}
      </div>
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
