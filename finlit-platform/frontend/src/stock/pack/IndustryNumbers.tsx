// "In numbers", 14 Industry analysis's fourth tab (lib/industryNumbers says what and why). Developer file 52 (founder, 27 Nov 2026, 5:22 pm: "I am not
// able to understand what it is"): two plain parts. "Who makes up the industry": each company's share of the industry's market value, one bar. "How
// <company> compares with a typical <industry> company": what stands out, then one row a measure: what it measures in words, the company's figure, the
// typical company's, and where the company sits from the lowest to the highest, in words and on a simple scale (the middle mark is the typical company).
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { METRICS, fmt, useUniverse } from "../../lib/screener";
import { IND_GROUPS, PLAIN, industryNumbers, industryShares, sitAt, sitText, standouts, type IndMeasure } from "../../lib/industryNumbers";
import { failureText, type GroupRow } from "../../lib/sectors";
import { dateIN } from "../../lib/format";
import { ordinal } from "../../lib/standsPack";
import { Tip } from "../../components/sectors/pack/Common";

type Membership = { date?: string | null; groups: Record<string, { slug: string; name: string }> };
type G = Pick<GroupRow, "slug" | "name" | "kind" | "sector" | "industries">;
/** The membership answer takes at most 200 symbols a call; the candidates go in sorted chunks, so the same industry asks the same question. */
export const membershipPaths = (symbols: string[]): string[] => {
  const s = [...new Set(symbols)].sort(), out: string[] = [];
  for (let i = 0; i < s.length; i += 200) out.push(`/api/sectors/membership?symbols=${s.slice(i, i + 200).join(",")}`);
  return out;
};

/** The industry's members and figures, for the tab and for the section's top box (the queries are shared, so asking twice costs nothing). */
export function useIndustryNumbers(symbol: string, g: G | null) {
  const u = useUniverse(!!g);
  const cands = useMemo(() => (u.data && g ? u.data.rows.filter((r) => (g.kind === "sector" ? r.nse_sector === g.sector : false) || (g.industries ?? [g.name]).includes(r.nse_industry ?? "")).map((r) => r.symbol) : []), [u.data, g]);
  const paths = useMemo(() => membershipPaths(cands), [cands]);
  const mq = useQueries({ queries: paths.map((p) => ({ queryKey: ["sectors", "membership", p], queryFn: () => apiGet<Membership>(p), staleTime: 3_600_000, retry: 1 })) });
  const memLoading = mq.some((q) => q.isLoading), memErr = mq.find((q) => q.isError)?.error;
  const slug = g?.slug;
  const members = useMemo(() => (memLoading || memErr || !slug ? [] : cands.filter((s) => mq.some((q) => q.data?.groups?.[s]?.slug === slug))), [cands, mq, memLoading, memErr, slug]);
  const res = useMemo(() => (u.data && members.length ? industryNumbers(u.data.rows, members, symbol) : null), [u.data, members, symbol]);
  const shares = useMemo(() => (u.data && members.length ? industryShares(u.data.rows, members, symbol) : null), [u.data, members, symbol]);
  const error = u.error ?? memErr ?? null;
  const status: "loading" | "error" | "few" | "none" | "ok" = u.isError || memErr ? "error" : u.isLoading || memLoading || (u.data && cands.length && !mq.length) ? "loading" : !res || res.n < 4 ? "few" : !res.inIt ? "none" : "ok";
  const retry = () => { u.refetch(); mq.forEach((q) => q.refetch()); };
  return { status, error, retry, res, shares, asOf: u.data?.asOf ?? null };
}

/** The top box's fourth reading: the company's size in its industry. */
export function sizeReading(shares: ReturnType<typeof industryShares>): { chip: string; line: string } | null {
  if (!shares?.me) return null;
  const pct = shares.me.share >= 10 ? Math.round(shares.me.share) : Math.round(shares.me.share * 10) / 10;
  return { chip: shares.me.rank === 1 ? `Largest of ${shares.n}` : `${ordinal(shares.me.rank)} largest of ${shares.n}`, line: `${pct}% of the industry's market value${shares.missing > 0 ? ` (${shares.n} with a figure)` : ""}` };
}

const SHOWN = 4;   // the bar names the four largest; the rest are "the other N"
export function IndustryNumbers({ symbol, name, g }: { symbol: string; name: string; g: G }) {
  const d = useIndustryNumbers(symbol, g), ind = g.name;
  if (d.status === "error") return <p className="sp-note" role="status">The industry's figures could not be loaded: {failureText(d.error)} <button type="button" className="mf-linkbtn" onClick={d.retry}>Try again</button></p>;
  if (d.status === "loading") return <p className="sp-note" aria-busy="true">Loading the {ind} companies' figures…</p>;
  if (d.status === "few") return <p className="sp-note">Too few {ind} companies have screener figures for a comparison{d.res ? ` (${d.res.n})` : ""}.</p>;
  if (d.status === "none") return <p className="sp-note">{name} has no screener figures yet, so it cannot be placed among the {d.res!.n} {ind} companies.</p>;
  const res = d.res!, sh = d.shares, stand = standouts(name, res.measures), hl = new Set(stand.map((s) => s.key));
  const top = sh ? sh.list.slice(0, SHOWN) : [], rest = sh ? sh.list.slice(SHOWN) : [], restShare = rest.reduce((a, x) => a + x.share, 0);
  const pc = (x: number) => (x >= 10 ? `${Math.round(x)}%` : `${(Math.round(x * 10) / 10).toFixed(1)}%`);
  const second = sh ? sh.list.filter((x) => x.symbol !== symbol).slice(0, 2) : [];
  return (<div className="in-sec">
    {sh && sh.me && <div className="sp-sec in-part">
      <h3 className="ws-h3">Who makes up the industry<Tip text={`Each of the ${sh.n} ${ind} companies' share of their total market value (what the stock market values each company at), from FinLit's screener figures.`} label="About who makes up the industry" /></h3>
      <p className="in-txt"><b>{name} is {sh.me.rank === 1 ? "the largest" : `the ${ordinal(sh.me.rank)} largest`} of the {sh.n} {ind} companies{sh.missing > 0 ? " with a market value figure" : ""}</b>, with {pc(sh.me.share)} of the industry's market value{second.length === 2 ? `; the next largest, ${second[0].symbol} and ${second[1].symbol}, have ${pc(second[0].share)} and ${pc(second[1].share)}` : ""}.</p>
      <div className="in-bar" role="img" aria-label={`Share of the industry's market value: ${top.map((x) => `${x.symbol} ${pc(x.share)}`).join(", ")}${rest.length ? `, the other ${rest.length} ${pc(restShare)}` : ""}`}>
        {top.map((x) => <i key={x.symbol} className={x.symbol === symbol ? "me" : ""} style={{ flexGrow: x.share }} title={`${x.symbol} ${pc(x.share)}`} />)}
        {rest.length > 0 && <i className="rest" style={{ flexGrow: restShare }} title={`The other ${rest.length} ${pc(restShare)}`} />}
      </div>
      {sh.missing > 0 && <p className="sp-note in-miss">{sh.missing} of the {sh.n + sh.missing} companies {sh.missing === 1 ? "has" : "have"} no market value figure and {sh.missing === 1 ? "is" : "are"} not in the bar.</p>}
      <ul className="in-bar-key">{top.map((x) => <li key={x.symbol} className={x.symbol === symbol ? "me" : ""}><i />{x.symbol === symbol ? name : x.symbol} <b>{pc(x.share)}</b></li>)}{rest.length > 0 && <li className="rest"><i />The other {rest.length} <b>{pc(restShare)}</b></li>}</ul>
    </div>}
    <div className="sp-sec in-part">
      <h3 className="ws-h3">How {name} compares with a typical {ind} company<Tip text={`The typical company is the middle one when the ${res.n} ${ind} companies are lined up on a measure, each counted once, whatever its size. Figures are FinLit's screener figures, the same as on the Screener.`} label="About the typical company" /></h3>
      <p className="in-txt">The typical company is the middle one when the {res.n} companies are lined up on each measure, each counted once{sh?.me?.rank === 1 ? `: mostly companies far smaller than ${name}` : ""}.</p>
      {stand.length > 0 && <div className="in-stand"><p className="in-gt">What stands out</p><ul>{stand.map((s) => <li key={s.key}>{s.text}</li>)}</ul></div>}
      <div className="in-tab" role="table" aria-label={`${name} against a typical ${ind} company`}>
        <div className="in-row in-hd" role="row"><span role="columnheader">What it measures</span><span role="columnheader">{name}</span><span role="columnheader">Typical company</span><span role="columnheader">Where {name} sits <small>lowest → highest</small></span></div>
        {IND_GROUPS.map(([title, keys]) => (
          <div key={title} role="rowgroup" className="in-grp">
            <div className="in-gt" role="row"><span role="rowheader">{title}</span></div>
            {keys.map((k) => <MeasureRow key={k} x={res.measures.find((m) => m.key === k)!} name={name} hl={hl.has(k)} />)}
          </div>))}
      </div>
      <p className="sp-note in-foot">FinLit's screener figures{d.asOf ? ` of ${dateIN(d.asOf)}` : ""} for the {res.n} NSE-listed {ind} companies. A company without a figure is left out of that measure (a loss-making company has no price for its profit). Describes; not a recommendation.</p>
    </div>
  </div>);
}

function MeasureRow({ x, name, hl }: { x: IndMeasure; name: string; hl: boolean }) {
  const m = METRICS[x.key], p = PLAIN[x.key]!, s = sitText(x), at = sitAt(x), per = x.key === "sales_cagr" || x.key === "profit_cagr" ? " a year" : "";
  return (
    <div className={"in-row" + (hl ? " hl" : "")} role="row">
      <span className="in-what" role="rowheader">{p.what}<small>{p.term}<Tip text={m.say} label={`About ${m.label}`} /></small></span>
      <span className="in-me" role="cell"><small className="in-lab">{name}</small>{fmt(m, x.me)}{x.me != null ? per : ""}</span>
      <span className="in-ty" role="cell"><small className="in-lab">Typical</small>{fmt(m, x.med)}{x.med != null ? per : ""}</span>
      <span className="in-sit" role="cell">
        <span className="in-meter" aria-hidden="true"><i className="mid" />{at != null && <i className="dot" style={{ left: `${at * 100}%` }} />}</span>
        <span className="in-sw" title={x.left > 0 ? `${x.left} of the ${x.dots.length + x.left} companies ${x.left === 1 ? "has" : "have"} no figure for this` : undefined}><b>{s.word}</b>{s.detail && <small>{s.detail}</small>}</span>
      </span>
    </div>);
}
