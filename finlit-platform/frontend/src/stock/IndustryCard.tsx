// Section 05, "Against its industry this quarter" (task #222, pack finlit-company-report-update-18nov v3: the v2 key-read card and the v3 sortable table of the
// industry's biggest companies). It reads the company's row and its group on Latest results -> Industries for the same quarter (GET /api/results/quarter, the same
// figures and verdicts as that page; Silver), and Sector Rotation for "Results and prices" (the Latest results rule). The rules are in lib/industryCard.ts.
// Styles: styles/industry-card.css, scoped to #aiq. Describes the results; never advice.
// Developer file 47 (founder, 27 Nov 2026: "the box is too big, way too colourful, and why is The biggest in Petroleum Products not coming"): one plain card in the
// report's colours (ink, the gold edge, blue only for this company's bar), the eyebrow and the fact icons gone, and a failed list says why with Try again.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Info } from "../components/Info";
import { useQuarterResults, type QResp } from "../lib/qresults";
import type { VRow } from "../lib/resultsPack";
import { useRotationMap } from "../lib/rotation";
import { nameKey } from "../lib/taxonomy";
import { agreeOf, type Ind } from "../components/results/pack/IndustriesView";
import { LockedBlock } from "../components/sectors/Parts";
import {
  bulletScale, columnScale, edge, gapChip, keyLine, leadParts, nextDir, shortName, signed, sortPeers, verdictTone, type PeerRow, type SortKey,
} from "../lib/industryCard";
import "../styles/industry-card.css";
import { coTitle, shortLabel } from "../lib/companyLabel";

const AGREE_TEXT: Record<string, string> = {
  Agree: "Results and share prices point the same way.", Mixed: "Results are about average; read the price trend on its own.",
  "Prices lag": "Strong results that the share prices have not yet reflected.", "Prices run ahead": "Shares are leading even though results trail the market.",
};
const VS_TEXT: Record<string, string> = { Ahead: "Ahead of the market", "In line": "In line with the market", Behind: "Behind the market" };
const INFO = "Compares this quarter's growth against a year ago with the middle company (the median) of its industry and of the whole market, from Results. Describes the results; not a recommendation.";
// task #265: the site's shared i (hover, keyboard focus or a tap opens it), in place of a native title that showed only after a long hover and never on a phone
const INFO_G = { key: "aiq", label: "Against its industry this quarter", what: INFO };

export type IndustryRead = {
  state: "none" | "loading" | "nogroup" | "locked" | "ready";
  row?: VRow; ind?: Ind; peers?: VRow[]; quarter?: QResp["quarter"]; name: string; declared: boolean;
  /** developer file 47: why the industry's biggest companies did not load, and a way to ask again (a failed request used to read "Loading…" for good) */
  peersError?: string; retryPeers?: () => void;
};

/** The company's row and its group this quarter, read once and shared by the card and the key-points line. */
export function useIndustryRead(symbol: string | undefined, companyName?: string): IndustryRead {
  const me = useQuarterResults({ q: symbol, limit: 20 }, !!symbol);
  const row = (me.data?.rows as VRow[] | undefined)?.find((r) => r.symbol === symbol);
  const industry = row?.industry ?? undefined;
  const ind = (me.data?.industries as Ind[] | undefined)?.find((i) => industry && i.name === industry);
  const peersQ = useQuarterResults({ industry, status: "declared", sort: "marketCap", dir: "desc", limit: 10 }, !!ind && ind.medianRevenueYoY !== undefined);
  const name = shortName(companyName || row?.name || symbol || "");
  const declared = !!row && row.status === "declared" && row.revenueYoY != null && row.profitYoY != null;
  if (!symbol || me.isError) return { state: "none", name, declared };
  if (me.isPending) return { state: "loading", name, declared };
  if (!row) return { state: "none", name, declared };            // not in this quarter's results (an ETF, a fund, a company not followed): no card
  if (!ind) return { state: "nogroup", row, name, declared, quarter: me.data?.quarter };
  if (ind.medianRevenueYoY === undefined) return { state: "locked", row, ind, name, declared, quarter: me.data?.quarter };
  const peers = (peersQ.data?.rows as VRow[] | undefined) ?? undefined;
  return { state: "ready", row, ind, peers, name, declared, quarter: me.data?.quarter,
    peersError: !peers && peersQ.isError ? (peersQ.error?.message || "no answer") : undefined, retryPeers: () => { void peersQ.refetch(); } };
}

/** The line at the end of the key points: kept with its numbers; none when the company has not declared or a figure is missing. */
export function industryKeyLine(r: IndustryRead): string | null {
  if (r.state !== "ready" || !r.declared || !r.row || !r.ind) return null;
  const { medianRevenueYoY: a, medianProfitYoY: b } = r.ind;
  if (a == null || b == null) return null;
  return keyLine(r.ind.name, r.row.revenueYoY as number, r.row.profitYoY as number, a, b);
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Sep 2026": the quarter by the month it ends (the site writes Sep, where en-IN would say Sept). */
const qLabel = (q: QResp["quarter"] | undefined) => (q ? `${MON[+q.periodEnd.slice(5, 7) - 1]} ${q.periodEnd.slice(0, 4)}` : "the latest");

function Head({ r, children }: { r: IndustryRead; children?: React.ReactNode }) {
  const i = r.ind, q = qLabel(r.quarter);
  return (
    <div className="aiq-hl">
      <h3 id="aiq-h">Against its industry this quarter<Info g={INFO_G} /></h3>
      {children}
      {i && <p className="aiq-sub">{i.name} · {i.declared} of {i.companies} companies have declared · revenue and net profit, {q} quarter against a year ago</p>}
    </div>
  );
}

/** One score tile: the company's figure, the gap chip, and the bullet bar with the industry tick above and the market tick below. */
function Score({ label, name, mine, indV, mktV, industry }: { label: string; name: string; mine: number | null; indV: number | null; mktV: number | null; industry: string }) {
  const vals = [mine, indV, mktV].filter((v): v is number => v != null);
  const pos = bulletScale(vals.length ? vals : [0]);
  const gap = mine != null && indV != null ? gapChip(mine, indV) : null;
  const aria = `${label}: ${name} ${mine == null ? "not declared yet" : signed(mine)}, typical ${industry} company ${indV == null ? "no figure" : signed(indV)}, typical company, all industries ${mktV == null ? "no figure" : signed(mktV)}`;
  const zero = pos(0);
  return (
    <article className="aiq-k">
      <header><h4>{label}</h4>{gap && <span className={"aiq-gap " + gap.cls}>{gap.text}</span>}</header>
      <div className="aiq-big">{mine == null ? <b className="nd">Not declared yet</b> : <b className={mine < 0 ? "neg" : ""}>{signed(mine)}</b>}<span>{name}</span></div>
      <div className="aiq-bul" role="img" aria-label={aria}>
        {mine != null && <i className={"bar" + (mine < 0 ? " neg" : "")} style={{ left: `${Math.min(pos(mine), zero)}%`, width: `${Math.abs(pos(mine) - zero)}%` }} />}
        {zero > 0.5 && <span className="z" style={{ left: `${zero}%` }} />}
        {indV != null && <span className={"tk ind " + edge(pos(indV))} style={{ left: `${pos(indV)}%` }}><em>Industry {signed(indV)}</em></span>}
        {mktV != null && <span className={"tk mkt " + edge(pos(mktV))} style={{ left: `${pos(mktV)}%` }}><em>Market {signed(mktV)}</em></span>}
      </div>
    </article>
  );
}

const SORTS: [SortKey, string][] = [["sz", "Size"], ["rv", "Revenue growth"], ["pf", "Profit growth"], ["vd", "Verdict"]];
const HEADS: [SortKey, string][] = [["co", "Company"], ["sz", "Size"], ["rv", "Revenue growth"], ["pf", "Profit growth"], ["vd", "Verdict"]];

/** The biggest companies of the industry (v3): the sort bar, the pinned typical company, size and verdict chips, and growth bars with the industry tick. */
function Peers({ r }: { r: IndustryRead }) {
  const ind = r.ind!, symbol = r.row!.symbol;
  const base = useMemo<PeerRow[]>(() => (r.peers ?? []).map((p) => ({ symbol: p.symbol, name: p.name, size: p.cap, rev: p.revenueYoY, profit: p.profitYoY, verdict: p.verdict ?? null })), [r.peers]);
  const [sk, setSk] = useState<SortKey>("sz"), [dir, setDir] = useState<"asc" | "desc">("desc"), [chose, setChose] = useState(false);   // on load the headings rest (↕), as in the pack
  const rows = useMemo(() => sortPeers(base, sk, dir), [base, sk, dir]);
  const sortBy = (k: SortKey) => { setDir(nextDir(sk, dir, k)); setSk(k); setChose(true); };
  const iR = ind.medianRevenueYoY ?? null, iP = ind.medianProfitYoY ?? null;
  const rvS = columnScale([iR, ...base.map((x) => x.rev)]), pfS = columnScale([iP, ...base.map((x) => x.profit)]);
  const listed = base.some((x) => x.symbol === symbol);
  const cell = (v: number | null, s: ReturnType<typeof columnScale>, mark: number | null, label: string) => {
    const b = v == null ? null : s.bar(v);
    return (
      <td className="g" data-l={label}>
        <span className={"gv" + (v == null ? "" : v > 0 ? " up" : v < 0 ? " dn" : "")}>{v == null ? "–" : signed(v)}</span>
        <span className="gb" aria-hidden="true">
          {b && <i className={v! < 0 ? "neg" : ""} style={{ left: `${b.left}%`, width: `${b.width}%` }} />}
          {mark != null && <s style={{ left: `${s.pos(mark)}%` }} />}
          {s.zero > 0.5 && <u style={{ left: `${s.zero}%` }} />}
        </span>
      </td>
    );
  };
  if (!r.peers && r.peersError) return (
    <p className="aiq-foot aiq-err" role="alert">The industry's biggest companies could not be loaded ({r.peersError}).{" "}
      {r.retryPeers && <button type="button" className="btn" onClick={r.retryPeers}>Try again</button>}{" "}
      <Link to={`/results?view=companies&industry=${encodeURIComponent(ind.name)}`}>All {ind.companies} companies in {ind.name} on Results →</Link></p>);
  if (!r.peers) return <p className="aiq-foot" role="status">Loading the industry's biggest companies…</p>;
  return (
    <>
      <div className="aiq-tbar"><span>Sort by</span>
        <div className="aiq-sb" role="group" aria-label="Sort the companies">{SORTS.map(([k, l]) => <button key={k} type="button" aria-pressed={sk === k} onClick={() => sortBy(k)}>{l}</button>)}</div>
        <span className="aiq-lg"><s aria-hidden="true" />Typical {ind.name} company</span></div>
      <div className="aiq-tw">
        <table className="aiq-t">
          <thead><tr>{HEADS.map(([k, l]) => (
            <th key={k} scope="col" aria-sort={chose && sk === k ? (dir === "asc" ? "ascending" : "descending") : "none"}>
              <button type="button" onClick={() => sortBy(k)}>{l}<span className="si" aria-hidden="true">{chose && sk === k ? (dir === "asc" ? "▲" : "▼") : "↕"}</span></button></th>))}</tr></thead>
          <tbody>
            <tr className="ref"><td><b>Typical {ind.name} company</b><small>the middle company of the industry</small></td><td />
              {cell(iR, rvS, iR, "Revenue growth")}{cell(iP, pfS, iP, "Profit growth")}<td /></tr>
            {rows.map((p) => (
              <tr key={p.symbol} className={"pr" + (p.symbol === symbol ? " me" : "")}>
                <td><Link to={`/stocks/${encodeURIComponent(p.symbol)}`}><b title={coTitle(p)}>{shortLabel(p)}</b></Link>{p.symbol === symbol && <em>This company</em>}</td>
                <td>{p.size ? <span className={"sz sz-" + (p.size === "Micro" ? "X" : p.size[0])}>{p.size}</span> : <span className="aiq-na">–</span>}</td>
                {cell(p.rev, rvS, iR, "Revenue growth")}{cell(p.profit, pfS, iP, "Profit growth")}
                <td>{p.verdict ? <span className={"vc " + verdictTone(p.verdict)}>{p.verdict}</span> : <span className="aiq-na">–</span>}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      {!listed && <p className="aiq-foot">{symbol} is not among the {base.length} biggest; its own verdict is on <Link to={`/results?view=companies&q=${encodeURIComponent(symbol)}`}>Results</Link>.</p>}
      <p className="aiq-foot"><Link to={`/results?view=companies&industry=${encodeURIComponent(ind.name)}`}>All {ind.companies} companies in {ind.name} →</Link></p>
    </>
  );
}

export function IndustryCard({ read: r }: { read: IndustryRead }) {
  const rq = useRotationMap();
  const [tab, setTab] = useState<0 | 1>(0);
  const tabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault(); const n = tab === 0 ? 1 : 0; setTab(n); document.getElementById(n === 0 ? "aiq-t1" : "aiq-t2")?.focus();
  };
  if (r.state === "none" || r.state === "loading") return null;
  const row = r.row!, ind = r.ind;
  if (r.state === "nogroup") return (
    <section className="aiq" id="aiq" aria-labelledby="aiq-h"><div className="aiq-hd"><Head r={r}><p className="aiq-sub">{row.industry ? `Its industry, ${row.industry}, has too few results this quarter to compare.` : "Its industry is not known for this quarter, so it cannot be compared yet."} The comparison appears here once enough of its companies have declared.</p></Head></div></section>);
  if (r.state === "locked") return (
    <section className="aiq" id="aiq" aria-labelledby="aiq-h"><div className="aiq-hd"><Head r={r} /></div>
      <div className="aiq-lock"><LockedBlock plan="silver" title="How it did against its industry is part of every paid plan">The counts are open to everyone: {ind!.declared} of {ind!.companies} companies in {ind!.name} have declared. Silver shows its growth against the typical company of its industry and of the market, and the industry's biggest companies.</LockedBlock></div>
    </section>);
  const i = ind!, iR = i.medianRevenueYoY ?? null, iP = i.medianProfitYoY ?? null, mR = i.market?.medianRevenueYoY ?? null, mP = i.market?.medianProfitYoY ?? null;
  const rev = r.declared ? row.revenueYoY : null, profit = r.declared ? row.profitYoY : null;
  const listed = (r.peers ?? []).some((p) => p.symbol === row.symbol), verdict = (r.peers ?? []).find((p) => p.symbol === row.symbol)?.verdict ?? null;
  const rot = (rq.data?.rows ?? []).find((x) => nameKey(x.name) === nameKey(i.name));
  const agree = agreeOf(i.vsMarket ?? null, rot?.corner);
  const noAgree = !rot ? "Not on Sector Rotation: too few stocks with a long enough price history." : "Its share prices sit in the middle of Sector Rotation, so they point neither way.";
  return (
    <section className="aiq" id="aiq" aria-labelledby="aiq-h">
      <div className="aiq-hd">
        <Head r={r}>{r.declared && iR != null && iP != null && <p className="aiq-lead">{leadParts(r.name, i.name, rev!, profit!, iR, iP).map(([t, b], k) => b ? <b key={k}>{t}</b> : <span key={k}>{t}</span>)}</p>}
          {!r.declared && <p className="aiq-lead">{r.name} has not declared this quarter's results yet.</p>}</Head>
        {r.peers && (listed && verdict
          ? <div className={"aiq-vb " + verdictTone(verdict)}><small>Its verdict on Results</small><b>{verdict}</b></div>
          : <Link className="aiq-vb v-none" to={`/results?view=companies&q=${encodeURIComponent(row.symbol)}`}><small>Its own verdict</small><b>On Results →</b></Link>)}
      </div>
      {/* task #328 (developer file 27, change 3): the industry's biggest companies are a tab under the header, not a closed row at the foot that read as a caption.
          Both panes stay mounted, so the table keeps its sort while the member switches tabs. */}
      <div className="aiq-tabs" role="tablist" aria-label="Views of this quarter">
        <button type="button" role="tab" id="aiq-t1" aria-controls="aiq-p1" aria-selected={tab === 0} tabIndex={tab === 0 ? 0 : -1} onClick={() => setTab(0)} onKeyDown={tabKey}>{r.name} against its industry</button>
        <button type="button" role="tab" id="aiq-t2" aria-controls="aiq-p2" aria-selected={tab === 1} tabIndex={tab === 1 ? 0 : -1} onClick={() => setTab(1)} onKeyDown={tabKey}>The {r.peers ? `${r.peers.length} ` : ""}biggest in {i.name}{r.peers ? <b>{r.peers.length}</b> : r.peersError ? <b className="aiq-tn-err" title="Could not be loaded">!</b> : null}</button>
      </div>
      <div className="aiq-pane" id="aiq-p1" role="tabpanel" aria-labelledby="aiq-t1" hidden={tab !== 0}>
      <div className="aiq-kp">
        <Score label="Revenue growth" name={r.name} mine={rev} indV={iR} mktV={mR} industry={i.name} />
        <Score label="Profit growth" name={r.name} mine={profit} indV={iP} mktV={mP} industry={i.name} />
      </div>
      <p className="aiq-key"><span><i />{r.name}</span><span><i className="ind" />Typical {i.name} company</span><span><i className="mkt" />Typical company, all industries</span></p>
      <div className="aiq-facts">
        <div className="aiq-f">
          <div><small>The industry against the market</small><b>{i.vsMarket ? VS_TEXT[i.vsMarket] : "No reading yet"}</b>{!i.vsMarket && <span className="aiq-why">Too few of its companies have figures to compare.</span>}</div></div>
        <div className="aiq-f">
          <div><small>Beat their industry</small><b>{i.beatShare == null ? "No reading yet" : `${Math.round(i.beatShare)}% of its companies`}</b>
            {i.beatShare != null && <span className="aiq-meter" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, i.beatShare))}%` }} /></span>}</div></div>
        <div className="aiq-f" title={agree ? AGREE_TEXT[agree] : noAgree}>
          <div><small>Results and prices</small><b>{agree ?? "No clear reading"}</b><a href="#sector">See prices in 14 →</a></div></div>
      </div>
      </div>
      <div className="aiq-pane peers" id="aiq-p2" role="tabpanel" aria-labelledby="aiq-t2" hidden={tab !== 1}>
        <Peers r={r} />
      </div>
    </section>
  );
}
