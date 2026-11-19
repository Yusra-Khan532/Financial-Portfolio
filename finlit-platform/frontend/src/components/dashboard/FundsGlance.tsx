// Task #135 (dashboard pack 06, section 3): "Your mutual funds at a glance" and "Your ETFs at a glance", beside "Your shares at a glance". The fund figures are the
// MF portfolio page's own (its holdings, Mutual Fund Scores, overlap, stocks underneath and risk answers, all cached and shared with that page). Task #195: the ETF
// panel is a one-line strip until ETFs are added; task #223: a full card from the ETF portfolio once they are. Descriptive only; information only.
import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type ApiError } from "../../lib/api";
import { useUI } from "../../lib/ui";
import { useMfPortfolio, useMfSpread } from "../../lib/mfPortfolio";
import { useEtfPortfolio, useEtfRisk } from "../../lib/etfPortfolio";
import { etfGlance, type EtfGlance } from "../../lib/etfGlance";
import "../../styles/dash223.css";
import { shortFund, type MfRisk } from "../../lib/mfPack";
import { fundBandLine, mfGlance } from "../../lib/dashInvest";
import { MINUS, nf } from "../../lib/format";
import { dayMonth } from "../../lib/dashboard";
import { Tip } from "../sectors/pack/Common";
import { Card, Rows } from "./parts";
import { DashCards } from "./DashCards";
import { ScoreRing } from "../ScoreRing";

const signed = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), d)}%`);

/** `pf` (task #248): the platforms the dashboard's Showing bar picked ("all", one id, or ids joined by commas). */
export function FundsGlance({ pf = "all" }: { pf?: string }) {
  const { has } = useUI();
  const silver = has("silver");
  const q = useMfPortfolio(silver, pf);
  const n = q.data?.count ?? 0;
  const sp = useMfSpread(silver && n > 0, pf);
  const rk = useQuery<MfRisk, ApiError>({ queryKey: ["mf-portfolio", "risk", n, pf], queryFn: () => apiGet<MfRisk>("/api/me/mf-portfolio/risk" + (pf === "all" ? "" : `?pf=${encodeURIComponent(pf)}`)), enabled: silver && n > 0, staleTime: 5 * 60_000, retry: false });
  const d = q.data;
  const g = useMemo(() => d ? mfGlance(d.holdings.map((h) => ({ code: h.code, name: h.name, weight: h.weight, r1y: h.returns.r1y, score: h.score.final, label: h.score.label, locked: h.score.locked, parts: h.score.parts })),
    { value: d.summary.score.value, label: d.summary.score.label, locked: d.summary.score.locked }) : null, [d]);
  const nameOf = (code: number) => shortFund(d?.holdings.find((h) => h.code === code)?.name ?? null) || `Scheme ${code}`;

  if (!silver) return (
    <Card id="mfglance" title="Your mutual funds at a glance">
      <div className="dsh-empty"><b>Track your mutual funds</b><p>The MF portfolio is part of Silver: add your funds to see their health, overlap and the stocks underneath here.</p><Link className="dsh-btn" to="/plans">See plans</Link></div>
    </Card>);
  if (q.isLoading) return <Card id="mfglance" title="Your mutual funds at a glance"><Rows n={3} h={40} /></Card>;
  if (q.isError) return <Card id="mfglance" title="Your mutual funds at a glance"><p className="dsh-note" role="alert">Your mutual funds could not be read just now. <Link to="/mf-portfolio">Open the MF portfolio</Link>.</p></Card>;
  if (!d || !n || !g) return (
    <Card id="mfglance" title="Your mutual funds at a glance">
      <div className="dsh-empty"><b>No mutual funds added yet</b><p>Add your mutual funds to see their health and overlap here.</p><Link className="dsh-btn" to="/mf-portfolio">Add a fund →</Link></div>
    </Card>);

  const top = sp.data?.readings.overlap.top ?? null, stock = sp.data?.topStocks?.[0] ?? null;
  const total = Math.max(1, g.bands.g + g.bands.o + g.bands.r + g.bands.n), w = (k: number) => `${(k / total) * 100}%`;
  const watch = g.weakest ? [{ kind: "watch" as const, title: `${shortFund(g.weakest.name)} scores ${g.weakest.label ?? g.weakest.score}`,
    text: `${shortFund(g.weakest.name)} has the lowest Mutual Fund Score of your funds (${g.weakest.score}${g.weakest.label ? `, ${g.weakest.label}` : ""})${g.weakest.parts.length ? `; its weakest parts are ${g.weakest.parts.join(" and ")}` : ""}.` }] : [];
  return (
    <Card id="mfglance" className="dsh-pg dsh-fg" title={<>Your mutual funds at a glance<Tip text="The same figures as the MF portfolio page: Mutual Fund Score (Gold), how much your funds overlap, the stocks underneath and how much they swing." label="About “Your mutual funds at a glance”" /></>}
      sub={`${n} ${n === 1 ? "fund" : "funds"}${d.dataDate ? ` · NAVs of ${dayMonth(d.dataDate)}` : ""}`}>
      {g.locked ? <p className="dsh-note">Mutual Fund Score of each fund is part of Gold. <Link to="/plans">See plans</Link>.</p> : (
        <div className="dsh-pg-top">
          <div className="dsh-pg-ringw" role="img" aria-label={`Average Mutual Fund Score ${g.avg ?? "not available"} out of 100${g.avgLabel ? `, ${g.avgLabel}` : ""}; one arc per fund`}>
            <ScoreRing parts={d.holdings.map((h) => ({ key: String(h.id ?? h.code), value: h.score.final }))} score={g.avg} word={g.avgLabel} /></div>
          <div>
            <p className="dsh-lh first">Mutual Fund Score{g.avgLabel ? ` · ${g.avgLabel}` : ""}</p>
            <div className="dsh-pg-mix" role="img" aria-label={fundBandLine(g.bands)}>
              {g.bands.g > 0 && <i className="g" style={{ width: w(g.bands.g) }} />}{g.bands.o > 0 && <i className="o" style={{ width: w(g.bands.o) }} />}{g.bands.r > 0 && <i className="r" style={{ width: w(g.bands.r) }} />}{g.bands.n > 0 && <i className="n" style={{ width: w(g.bands.n) }} />}
            </div>
            <p className="dsh-pg-legend" aria-hidden="true">{fundBandLine(g.bands)}</p>
          </div>
        </div>)}
      <dl className="dsh-fg-kv">
        <div><dt>Highest overlap</dt><dd>{sp.isLoading ? <i className="skeleton sk-n" /> : top && top.n > 0 ? `${Math.round(top.pct)}% · ${nameOf(top.a)} and ${nameOf(top.b)}` : <span title={n < 2 ? "Needs two or more funds" : "Needs the share holdings of two or more funds"}>—</span>}</dd></div>
        <div><dt>Biggest stock underneath</dt><dd>{sp.isLoading ? <i className="skeleton sk-n" /> : stock ? `${stock.name} ${nf(stock.w * 100, 1)}%` : <span title="No fund's share holdings are loaded yet">—</span>}</dd></div>
        <div><dt>Swing a year</dt><dd>{rk.isLoading ? <i className="skeleton sk-n" /> : rk.data?.list.swing != null ? `${nf(rk.data.list.swing, 1)}% · Nifty 500 ${rk.data.bench.swing != null ? nf(rk.data.bench.swing, 1) + "%" : "—"}` : <span title={rk.data?.list.why ?? rk.data?.why ?? "Not enough NAV history yet"}>—</span>}</dd></div>
        <div><dt>Over 1 year</dt><dd className={g.r1y == null ? "" : g.r1y > 0 ? "up" : g.r1y < 0 ? "down" : ""}>{g.r1y == null ? <span title="No fund has a year of NAVs yet">—</span> : signed(g.r1y)}</dd></div>
      </dl>
      {watch.length > 0 && <div className="sp dsh-cards dsh-cards-after"><DashCards items={watch} scope="mfglance" /></div>}
      <Link className="dsh-link foot" to="/mf-portfolio">Open the MF portfolio →</Link>
    </Card>
  );
}

/** Task #223 (dashboard pack of 18 Nov, D2): "Your ETFs at a glance" is one card the size of the funds card, fed from the ETF portfolio: a ring of what the ETFs
 *  track with the count inside, the mix bar and its legend, the risk level, and four key figures (yearly cost, price against NAV, swing a year, what they
 *  follow), each the ETF page's own figure. ETFs have no FinLit score, so there is no score ring. With no ETFs it stays a short strip. */
/** Each kind's colour, from styles/dash223.css (a lighter shade in the dark theme so the legend stays readable). */
const MIX_SLUG: Record<string, string> = { indian: "in", abroad: "ab", gold: "au", silver: "ag", debt: "dt", liquid: "lq" };
const MIX_COLOUR = new Proxy({} as Record<string, string>, { get: (_t, k: string) => `var(--eg-${MIX_SLUG[k] ?? "ot"})` });
function MixRing({ g }: { g: EtfGlance }) {
  const R = 62, C = 2 * Math.PI * R, gap = g.mix.length > 1 ? 3 : 0;
  let at = 0;
  return (
    <svg width="152" height="152" viewBox="0 0 160 160" aria-hidden="true">
      <circle cx="80" cy="80" r={R} fill="none" stroke="var(--s2)" strokeWidth="18" />
      {g.mix.map((m) => { const len = (m.share / 100) * C; const el = <circle key={m.key} cx="80" cy="80" r={R} fill="none" stroke={MIX_COLOUR[m.key]} strokeWidth="18"
        strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-at} transform="rotate(-90 80 80)" />; at += len; return el; })}
      <text x="80" y="78" textAnchor="middle" className="eg-n">{g.n}</text>
      <text x="80" y="100" textAnchor="middle" className="eg-u">{g.n === 1 ? "ETF" : "ETFs"}</text>
    </svg>);
}
/** `pf` (task #248): the accounts the dashboard's Showing bar picked ("all", one id, or ids joined by commas). */
export function EtfsGlance({ pf = "all" }: { pf?: string }) {
  const { has } = useUI();
  const silver = has("silver");
  const q = useEtfPortfolio(silver, pf);
  const n = q.data?.items.filter((e) => !e.gone).length ?? 0;
  const rk = useEtfRisk(silver && n > 0, String(n), pf);
  const rkWhy = rk.isError ? "The risk figures could not be worked out just now" : null;
  const g = useMemo(() => (q.data && n ? etfGlance(q.data, rk.data, rkWhy) : null), [q.data, n, rk.data, rkWhy]);
  // no ETFs (or no ETF portfolio on this plan): the short strip
  if (!silver || (!q.isLoading && !q.isError && !n)) return (
    <section className="dsh-card dsh-strip dsh-strip1" aria-labelledby="dsh-etfglance">
      <h2 id="dsh-etfglance" className="t">Your ETFs at a glance</h2>
      <p className="m">{silver ? "No ETFs added yet. Add them to see what they track, their yearly cost and their price against NAV." : "The ETF portfolio is part of Silver: add your ETFs to see what they track, their yearly cost and their price against NAV."}</p>
      <Link className="dsh-btn" to={silver ? "/etf-portfolio" : "/etfs"}>{silver ? "Add your ETFs on the ETF portfolio page →" : "See ETFs →"}</Link>
    </section>);
  const dash = (why?: string | null) => <span title={why ?? "Not available yet"}>—</span>;
  const wait = q.isLoading || !g;
  return (
    <Card id="etfglance" className="dsh-pg dsh-fg dsh-eg" title="Your ETFs at a glance"
      sub={g ? `${g.n} ${g.n === 1 ? "ETF" : "ETFs"}${g.asOf ? ` · NSE closes of ${g.asOf}` : ""} · from your ETF portfolio` : "From your ETF portfolio"}>
      {q.isError ? <p className="dsh-note" role="alert">Your ETFs could not be read just now. <Link to="/etf-portfolio">Open the ETF portfolio</Link>.</p> : (
      <div className="eg-row">
        <div className="dsh-pg-ringw" role="img" aria-label={g ? `What your ${g.n} ETFs track: ${g.mix.map((m) => `${m.n} ${m.word}`).join(" · ")}` : "Loading your ETFs"}>
          {g ? <MixRing g={g} /> : <i className="skeleton eg-sk" />}</div>
        <div className="eg-mid">
          <p className="dsh-lh first">What they track</p>
          {g ? <>
            <div className="dsh-pg-mix" role="img" aria-label={g.mix.map((m) => `${m.n} ${m.word}`).join(" · ")}>{g.mix.map((m) => <i key={m.key} style={{ width: `${m.share}%`, background: MIX_COLOUR[m.key] }} />)}</div>
            <p className="dsh-pg-legend" aria-hidden="true">{g.mix.map((m) => <span key={m.key}><b style={{ color: MIX_COLOUR[m.key] }}>{m.n}</b> {m.word}</span>)}</p>
          </> : dash()}
          <p className="dsh-lh">Risk level</p>
          <p className="eg-risk">{rk.isLoading || wait ? <i className="skeleton sk-n" /> : g!.level ? <><b className={g!.level.higher ? "eg-hi" : "eg-lv"}>{g!.level.word}</b> {g!.level.rest}</> : dash(g!.levelWhy)}</p>
        </div>
        <dl className="dsh-fg-kv eg-kv">
          <div><dt>Yearly cost</dt><dd>{wait ? <i className="skeleton sk-n" /> : g!.cost ?? dash("No expense ratio is published for these ETFs in our sources")}</dd></div>
          <div><dt>Price against NAV</dt><dd>{wait ? <i className="skeleton sk-n" /> : g!.nav ?? dash("No NAV for the day of the last close")}</dd></div>
          <div><dt>Swing a year</dt><dd>{rk.isLoading || wait ? <i className="skeleton sk-n" /> : g!.swing ?? dash(g!.levelWhy ?? "Not enough price history yet")}</dd></div>
          <div><dt>What they follow</dt><dd>{wait ? <i className="skeleton sk-n" /> : g!.indexes}</dd></div>
        </dl>
      </div>)}
      <Link className="dsh-link foot" to="/etf-portfolio">Open the ETF portfolio →</Link>
    </Card>
  );
}
