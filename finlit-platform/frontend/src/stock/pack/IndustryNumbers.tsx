// Developer file 51: "The industry in numbers" in 14 Industry analysis (lib/industryNumbers says what and why). Nine rows in four groups; each row the
// company's figure, the industry median and one strip of dots (each company one grey dot, the company blue, the median the section's dashed gold line).
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { METRICS, fmt, useUniverse } from "../../lib/screener";
import { IND_GROUPS, fences, industryLead, industryNumbers, placeText, type IndMeasure } from "../../lib/industryNumbers";
import { stripDots } from "../../lib/standsList";
import { failureText, type GroupRow } from "../../lib/sectors";
import { dateIN } from "../../lib/format";
import { shortLabel } from "../../lib/companyLabel";
import { Tip } from "../../components/sectors/pack/Common";

type Membership = { date?: string | null; groups: Record<string, { slug: string; name: string }> };
/** The membership answer takes at most 200 symbols a call; the candidates go in sorted chunks, so the same industry asks the same question. */
export const membershipPaths = (symbols: string[]): string[] => {
  const s = [...new Set(symbols)].sort(), out: string[] = [];
  for (let i = 0; i < s.length; i += 200) out.push(`/api/sectors/membership?symbols=${s.slice(i, i + 200).join(",")}`);
  return out;
};

export function IndustryNumbers({ symbol, name, g }: { symbol: string; name: string; g: Pick<GroupRow, "slug" | "name" | "kind" | "sector" | "industries"> }) {
  const u = useUniverse();
  const ind = g.name;
  // the candidates: the screener's companies in the group's NSE industries (or its NSE sector); the membership answer keeps the group's own members
  const cands = useMemo(() => (u.data ? u.data.rows.filter((r) => (g.kind === "sector" ? r.nse_sector === g.sector : false) || (g.industries ?? [g.name]).includes(r.nse_industry ?? "")).map((r) => r.symbol) : []), [u.data, g]);
  const paths = useMemo(() => membershipPaths(cands), [cands]);
  const mq = useQueries({ queries: paths.map((p) => ({ queryKey: ["sectors", "membership", p], queryFn: () => apiGet<Membership>(p), staleTime: 3_600_000, retry: 1 })) });
  const memLoading = mq.some((q) => q.isLoading), memErr = mq.find((q) => q.isError)?.error;
  const members = useMemo(() => (memLoading || memErr ? [] : cands.filter((s) => mq.some((q) => q.data?.groups?.[s]?.slug === g.slug))), [cands, mq, memLoading, memErr, g.slug]);
  const res = useMemo(() => (u.data && members.length ? industryNumbers(u.data.rows, members, symbol) : null), [u.data, members, symbol]);
  const lead = res ? industryLead(name, ind, res.measures) : null;

  const head = <h3 className="ws-h3">The industry in numbers<Tip text={`${name} against the median of the NSE-listed ${ind} companies, on FinLit's screener figures (the Screener's definitions). Each company counts once, whatever its size. Describes; not a recommendation.`} label="About the industry in numbers" /></h3>;
  const retry = () => { u.refetch(); mq.forEach((q) => q.refetch()); };
  let body: React.ReactNode;
  if (u.isError || memErr) body = <p className="sp-note" role="status">The industry's figures could not be loaded: {failureText(u.error ?? memErr)} <button type="button" className="mf-linkbtn" onClick={retry}>Try again</button></p>;
  else if (u.isLoading || memLoading || (u.data && cands.length && !mq.length)) body = <p className="sp-note" aria-busy="true">Loading the {ind} companies' figures…</p>;
  else if (!res || res.n < 4) body = <p className="sp-note">Too few {ind} companies have screener figures for a comparison{res ? ` (${res.n})` : ""}.</p>;
  else if (!res.inIt) body = <p className="sp-note">{name} has no screener figures yet, so it cannot be placed among the {res.n} {ind} companies.</p>;
  else body = (<>
    {lead && <p className="in-lead">{lead}</p>}
    <p className="in-key" aria-hidden="true"><span><i className="in-k-me" />{name}</span><span><i className="ws6-medk" />Industry median</span><span><i className="in-k-dot" />Each other {ind} company</span></p>
    {IND_GROUPS.map(([title, keys]) => (
      <div key={title} className="in-grp" role="group" aria-label={title}>
        <p className="in-gt">{title}</p>
        {keys.map((k) => <Measure key={k} x={res.measures.find((m) => m.key === k)!} symbol={symbol} name={name} />)}
      </div>))}
    <p className="sp-note in-foot">The {res.n} NSE-listed {ind} companies on FinLit's screener figures{u.data?.asOf ? ` of ${dateIN(u.data.asOf)}` : ""}; the median is the middle company, each counted once. A company without a figure is left out of that row (a loss-making company has no P/E). A hollow dot at an end is another company further out than the strip shows; the end labels give the lowest and highest.</p>
  </>);
  return <div className="sp-sec in-sec" data-testid="industry-numbers">{head}{body}</div>;
}

function Measure({ x, symbol, name }: { x: IndMeasure; symbol: string; name: string }) {
  const m = METRICS[x.key];
  const vals = x.dots.map((d) => d.v), lo = vals.length ? Math.min(...vals) : null, hi = vals.length ? Math.max(...vals) : null;
  // the scale: Tukey's fences, always wide enough for the company's own value (its dot is never moved; only other far companies sit at an end, hollow)
  const f = useMemo(() => { const k = fences(x.dots.map((d) => d.v)); return k && x.me != null ? { lo: Math.min(k.lo, x.me), hi: Math.max(k.hi, x.me) } : k; }, [x.dots, x.me]);
  const clamp = (v: number) => (f ? Math.min(f.hi, Math.max(f.lo, v)) : v), out = (v: number) => !!f && (v > f.hi || v < f.lo);
  const strip = useMemo(() => stripDots(x.dots.map((d) => (f ? Math.min(f.hi, Math.max(f.lo, d.v)) : d.v)), 2.4, 3, false), [x.dots, f]);
  const place = placeText(x), lanes = Math.max(1, ...strip.dots.map((d) => (d ? d.lane + 1 : 1)));
  return (
    <div className="in-row">
      <span className="in-l">{m.label}<Tip text={m.say} label={`About ${m.label}`} /></span>
      <span className="in-v"><b className={x.me == null ? "in-me none" : "in-me"}>{fmt(m, x.me)}</b><span className="in-md">median {fmt(m, x.med)}</span></span>
      <div className="in-strip" role="img" aria-label={`${m.label}: ${name} ${fmt(m, x.me)}, industry median ${fmt(m, x.med)}; ${place.toLowerCase()}; ${x.dots.length} companies from ${fmt(m, lo)} to ${fmt(m, hi)}`}>
        <small className="in-end">{fmt(m, lo)}</small>
        <span className="in-track" style={{ height: 12 + lanes * 7 }}>
          {x.med != null && <i className="ws6-med in-med" style={{ left: `${strip.at(clamp(x.med))}%` }} />}
          {strip.dots.map((d) => { if (!d) return null; const c = x.dots[d.i], me = c.symbol === symbol;
            return <i key={c.symbol} className={"in-dot" + (me ? " me" : "") + (out(c.v) ? " out" : "")} style={{ left: `${d.pos}%`, bottom: 3 + d.lane * 7 }} title={`${me ? symbol : shortLabel(c)} ${fmt(m, c.v)}${out(c.v) ? " (further out than the strip shows)" : ""}`} />; })}
        </span>
        <small className="in-end">{fmt(m, hi)}</small>
      </div>
      <span className="in-pos" title={x.left > 0 ? `${x.left} of the ${x.dots.length + x.left} companies ${x.left === 1 ? "has" : "have"} no figure${x.key === "pe" ? " (a loss, or none reported)" : ""}` : undefined}>{place}</span>
    </div>);
}
