// /my-investments: All my investments (task #137, the team's 15 Nov 2026 pack "finlit-all-my-investments-15nov", which replaces the 14 Nov brief). One page that
// reads the member's three lists (Equity portfolio, MF portfolio, ETF portfolio) and their quantities, and looks through each fund and ETF to the companies
// inside. It keeps no list of its own: a change on a portfolio page shows here after a refresh. Layout: header, summary row (dark box + one tile per kind),
// four tabs (All together · Equity · Mutual funds · ETFs), the numbered sections bar of the open tab, then "What this means, in short", the disclaimer,
// the FAQ and the sources. Plans: Silver and Gold (shares with FinLit IQ on Silver, FinLit Prism on Gold; FinLit FundPulse on Gold). Describes; never advises.
import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { Gate } from "../components/Gate";
import { StepsBar, type MenuGroup, type Step } from "../components/StepsBar";
import { nf } from "../lib/format";
import { usePortfolio } from "../lib/portfolio";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { KINDS, KIND_NAME, KIND_TAB, MODEL_NAME, betaTxt, chg, dateShort, joinWords, kindsHeld, lower, pctOf, rupees, splitLine, useAllInvestments, type AllInvestments, type Kind, type Tab } from "../lib/myInvest";
import { ALL_SECTIONS, AllTogether } from "../myinvest/AllTogether";
import { EQ_SECTIONS, ETF_SECTIONS, EquityTab, EtfTab, MF_SECTIONS, MfTab } from "../myinvest/KindTabs";
import { BandStrip, I } from "../myinvest/parts";
import { QtyDialog } from "../myinvest/QtyDialog";
import "../styles/myinvest.css";

const TABS: { id: Tab; label: string; sub: string; sections: { id: string; label: string }[] }[] = [
  { id: "all", label: "All together", sub: "Money, mix, every company, health and risk", sections: ALL_SECTIONS },
  { id: "equity", label: "Equity", sub: "Your shares, their scores and their risk", sections: EQ_SECTIONS },
  { id: "mf", label: "Mutual funds", sub: "Health, cost, what is inside each fund", sections: MF_SECTIONS },
  { id: "etf", label: "ETFs", sub: "What they track, cost and how close to value", sections: ETF_SECTIONS },
];
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.id === v);

export function MyInvestmentsPage() {
  useDocTitle("All my investments", "Your shares, mutual funds and ETFs in one place: how much you have, what it is made of, what you really own underneath, how healthy and how risky it is all together. Information only, not investment advice.");
  return (
    <div className="wrap mi">
      <Gate tier="silver" title="See all your investments together" points={["Your shares, mutual funds and ETFs in one place, valued from your quantities", "Every company you own, counted once, looking through your funds and ETFs", "Each kind's beta against the Nifty 500, and beta together"]}>
        <Body />
      </Gate>
    </div>
  );
}

function Body() {
  const { has } = useUI();
  const { holdings } = usePortfolio();
  const q = useAllInvestments(holdings, has("silver"));
  const d = q.data;
  const [params, setParams] = useSearchParams();
  const tab: Tab = isTab(params.get("tab")) ? (params.get("tab") as Tab) : "all";
  const [qty, setQty] = useState(false);
  const toTab = (t: Tab, scroll?: string) => {
    setParams((p) => { const n = new URLSearchParams(p); if (t === "all") n.delete("tab"); else n.set("tab", t); return n; }, { replace: true });
    window.setTimeout(() => document.getElementById(scroll ?? "mi-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  const steps: Step[] = (TABS.find((t) => t.id === tab)?.sections ?? []).map((s, i) => ({ id: s.id, n: i + 1, title: s.label, sections: [] }));
  const menu: MenuGroup[] = TABS.map((t) => ({ title: t.label, items: t.sections.map((s, i) => ({ id: s.id, label: `${i + 1} · ${s.label}`, go: () => toTab(t.id, s.id) })) }));
  return (
    <>
      <Header d={d} loading={q.isLoading} openQty={() => setQty(true)} />
      {q.isLoading && <div className="skeleton mi-skel" aria-busy="true" aria-label="Reading your three lists" />}
      {q.isError && <div className="state" role="alert"><h2>Could not read your investments</h2><p>{q.error?.message || "Please try again in a moment."} <button className="btn" onClick={() => q.refetch()}>Try again</button></p></div>}
      {d && kindsHeld(d).length === 0 && (
        <section className="card mi-empty"><h2>Nothing to read yet</h2><p>Add shares on the <Link to="/holdings">Equity portfolio</Link>, funds on the <Link to="/mf-portfolio">MF portfolio</Link> or ETFs on the <Link to="/etf-portfolio">ETF portfolio</Link>. This page reads the three lists; it keeps no list of its own.</p></section>)}
      {d && kindsHeld(d).length > 0 && <>
        <Summary d={d} toTab={toTab} openQty={() => setQty(true)} />
        <div className="mi-tabs" id="mi-tabs" role="tablist" aria-label="All my investments">
          {TABS.map((t) => <button key={t.id} type="button" role="tab" id={`mi-t-${t.id}`} aria-selected={tab === t.id} aria-controls={`mi-p-${t.id}`} onClick={() => toTab(t.id)}><b>{t.label}</b><small>{t.sub}</small></button>)}
        </div>
        <StepsBar key={tab} steps={steps} menu={menu} label={`Sections of ${TABS.find((t) => t.id === tab)?.label}`} />
        <div role="tabpanel" id={`mi-p-${tab}`} aria-labelledby={`mi-t-${tab}`} className="mi-panel">
          {tab === "all" && <AllTogether d={d} toTab={toTab} openQty={() => setQty(true)} />}
          {tab === "equity" && <EquityTab d={d} />}
          {tab === "mf" && <MfTab d={d} />}
          {tab === "etf" && <EtfTab d={d} />}
        </div>
        <InShort d={d} />
        {(d.unknown.length > 0 || d.gone.length > 0) && <p className="mi-small mi-note">{d.unknown.length > 0 && <>Not read: {d.unknown.join(", ")} (not a company FinLit lists). </>}{d.gone.length > 0 && <>No longer listed: {d.gone.join(", ")}.</>}</p>}
      </>}
      <details className="card mi-fold"><summary><span><b>Disclaimer</b><small>What this page is, and is not</small></span><span className="mi-chev" aria-hidden="true" /></summary>
        <p>{d?.disclaimer ?? "Information only, not investment advice."}</p><p>This page describes your lists; it does not tell you what to do with them. Nothing is sent to a broker.</p></details>
      <Faq />
      {d && <p className="mi-small mi-src">Shares and ETFs: NSE closing prices to {dateShort(d.sources.pricesTo)}. Funds: NAVs and costs from AMFI to {dateShort(d.sources.navsTo)}; holdings from each fund house's monthly portfolio file{d.sources.filesTo ? ` (${d.sources.filesFrom === d.sources.filesTo ? dateShort(d.sources.filesTo) : `${dateShort(d.sources.filesFrom)} to ${dateShort(d.sources.filesTo)}`})` : ""}. Nifty 500 from NSE. Mutual fund investments are subject to market risks; read all scheme-related documents carefully. Past figures do not guarantee future returns. Information only, not investment advice.</p>}
      {qty && d && <QtyDialog d={d} onClose={() => setQty(false)} />}
    </>
  );
}

function Header({ d, loading, openQty }: { d?: AllInvestments; loading: boolean; openQty: () => void }) {
  const [imp, setImp] = useState(false);
  return (
    <header className="card mi-head">
      <div className="mi-hl">
        <p className="mi-tags"><span className="mi-tag new">New page</span>{d && <span className="mi-tag">{d.plan === "gold" ? "Gold · FinLit Prism" : "Silver · FinLit IQ"}</span>}</p>
        <h1>All my investments</h1>
        <p className="mi-lede">Your shares, mutual funds and ETFs read together: how much you have and where it sits, what it is made of, what you really own underneath, how healthy it is and how risky it is as a whole.</p>
        <p className="mi-links"><Link to="/holdings">Equity portfolio</Link><Link to="/mf-portfolio">MF portfolio</Link><Link to="/etf-portfolio">ETF portfolio</Link><a href="#mi-faq">How it is counted</a></p>
      </div>
      <div className="mi-hr">
        <div className="mi-acts">
          <button type="button" className="btn primary" disabled={!d} onClick={openQty}>Add quantities</button>
          <span className="mi-pop"><button type="button" className="btn" aria-expanded={imp} onClick={() => setImp(!imp)}>Import a broker file</button>
            {imp && <span className="mi-pop-m" role="menu"><Link role="menuitem" to="/holdings">Shares: broker file on the Equity portfolio</Link><Link role="menuitem" to="/mf-portfolio?tab=import">Mutual funds: CAS or statement on the MF portfolio</Link><Link role="menuitem" to="/etf-portfolio?tab=import">ETFs: broker file on the ETF portfolio</Link></span>}</span>
        </div>
        <p className="mi-count" aria-live="polite">{d ? <>{nf(d.counts.shares, 0)} share{d.counts.shares === 1 ? "" : "s"} · {nf(d.counts.funds, 0)} mutual fund{d.counts.funds === 1 ? "" : "s"} · {nf(d.counts.etfs, 0)} ETF{d.counts.etfs === 1 ? "" : "s"} · quantities for {d.quantities.have} of {d.quantities.of}</> : loading ? "Reading your three lists…" : ""}</p>
        <p className="mi-small">This page reads your three portfolio lists. Add or remove a holding on its own page and it changes here. Nothing is sent to a broker.</p>
      </div>
    </header>
  );
}

function Summary({ d, toTab, openQty }: { d: AllInvestments; toTab: (t: Tab) => void; openQty: () => void }) {
  const kinds = kindsHeld(d), n = kinds.reduce((a, k) => a + d.counts[k], 0);
  return (
    <div className="mi-sum">
      <div className="mi-dark" onClick={() => toTab("all")}>
        <p className="mi-cap">All your investments<I k="All your investments" what="Everything on your three lists together." read={d.byValue ? "The total is quantity × last price or NAV; the 1-year change is on what you hold now." : "Without quantities the split shows each kind counting the same; it is not your money."} /></p>
        {d.byValue ? <><p className="mi-dark-v">{rupees(d.total ?? 0)}</p><p className="mi-dark-l">{chg(d.chg1y)} over 1 year, on what you hold now</p></>
          : <><p className="mi-dark-v">{n} holdings</p><p className="mi-dark-l">{splitLine(d)}</p></>}
        <div className="mi-stack dark" aria-hidden="true">{kinds.map((k) => <i key={k} className={"k-" + k} style={{ flexGrow: d.cards[k].share }} />)}</div>
        <ul className="mi-dkey">{kinds.map((k) => <li key={k}><i className={"k-" + k} aria-hidden="true" />{pctOf(d.cards[k].share, 0)} {KIND_NAME[k]}{d.byValue && d.cards[k].value != null ? ` · ${rupees(d.cards[k].value!)}` : ""}</li>)}</ul>
        <p className="mi-dark-acts"><button type="button" className="btn mi-dark-b" onClick={(e) => { e.stopPropagation(); openQty(); }}>{d.byValue ? "Edit quantities" : "Add quantities"}</button><button type="button" className="mi-link light" onClick={(e) => { e.stopPropagation(); toTab("all"); }}>Open All together →</button></p>
      </div>
      {KINDS.map((k) => <Tile key={k} d={d} k={k} go={() => toTab(KIND_TAB[k])} />)}
    </div>
  );
}

const TILE_INFO: Record<Kind, [string, string]> = {
  shares: ["The shares on your Equity portfolio: their part of everything, their average score, beta and 1-year change.", "The band strip counts your shares in each band of the score your plan shows."],
  funds: ["The funds on your MF portfolio: their part of everything, average FinLit FundPulse, beta and 1-year change.", "Each fund keeps its own FundPulse band; the strip counts them."],
  etfs: ["The ETFs on your ETF portfolio: their part of everything, yearly cost, beta and 1-year change.", "The strip shows the kinds of ETF you hold."],
};
function Tile({ d, k, go }: { d: AllInvestments; k: Kind; go: () => void }) {
  const c = d.cards[k];
  if (!c.count) return (
    <button type="button" className="mi-tile empty" onClick={go}><p className="mi-cap">{KIND_NAME[k]}</p><p className="mi-small">None on your {k === "shares" ? "Equity" : k === "funds" ? "MF" : "ETF"} portfolio yet{k === "etfs" ? ": the other tabs leave ETFs out" : ""}.</p><span className="mi-link">Open {KIND_NAME[k]} →</span></button>);
  const model = MODEL_NAME[c.scoreModel ?? "iq"];
  const read: ReactNode = k === "shares" ? <>{c.count} shares · Average {model} {c.score ?? "—"} · Beta {betaTxt(c.beta)} · {chg(c.chg1y)} in a year</>
    : k === "funds" ? <>{c.count} {c.count === 1 ? "fund" : "funds"} · {c.scoreLocked ? "FundPulse on Gold" : c.score != null ? `${c.count === 1 ? "FinLit FundPulse" : "Average FundPulse"} ${c.score}${(c.count === 1 ? d.funds[0]?.label : c.scoreWord) ? " · " + (c.count === 1 ? d.funds[0].label : c.scoreWord) : ""}` : "No FundPulse yet"} · Beta {betaTxt(c.beta)} · {chg(c.chg1y)} in a year</>
    : <>{c.count} ETFs · Cost {c.ter != null ? pctOf(c.ter, 2) : "—"} a year · Beta {betaTxt(c.beta)} · {chg(c.chg1y)} in a year{c.repeats?.length ? ` · ${joinWords(c.repeats.map((r) => r.label ?? ""))} held twice` : ""}</>;
  return (
    <div className="mi-tile" onClick={go}>
      <p className="mi-cap"><i className={"mi-dot k-" + k} aria-hidden="true" />{KIND_NAME[k]}<I k={KIND_NAME[k]} what={TILE_INFO[k][0]} read={TILE_INFO[k][1]} /><span className="mi-pill">{pctOf(c.share, 0)}</span></p>
      <p className="mi-tile-v">{d.byValue && c.value != null ? rupees(c.value) : `${c.count} ${k === "funds" ? (c.count === 1 ? "fund" : "funds") : k === "etfs" ? "ETFs" : "shares"}`}</p>
      <p className="mi-small">{read}</p>
      {k === "etfs" ? (c.types?.length ? <div className="mi-band" role="img" aria-label={"By type: " + c.types.map((t) => `${t.count} ${t.label}`).join(", ")}>{c.types.map((t, i) => <i key={t.label} className={"t-type" + (i % 4)} style={{ flexGrow: t.count }} title={`${t.label}: ${t.count}`}>{t.count}</i>)}</div> : null)
        : c.bands ? <BandStrip label={k === "shares" ? `Shares by ${model}` : "Funds by FundPulse"} bands={c.bands} notRated={k === "shares" ? d.health.shares?.notRated : (d.health.funds && !d.health.funds.locked ? d.health.funds.notRated : undefined)} /> : null}
      {k === "etfs" && c.types?.length ? <p className="mi-small">{c.types.map((t) => `${t.count} ${t.label}`).join(" · ")}</p> : null}
      <p className="mi-cap">{c.firstIs === "largest" ? "Largest" : "On your list"}</p>
      <p className="mi-small">{c.first.map((x) => x.name).join(" · ")}{c.count > 3 ? ` · +${c.count - 3} more` : ""}</p>
      <button type="button" className="mi-link" onClick={(e) => { e.stopPropagation(); go(); }}>Open {KIND_NAME[k]} →</button>
    </div>
  );
}

function InShort({ d }: { d: AllInvestments }) {
  const twice = d.companies.filter((c) => c.held.length > 1), top = twice[0];
  const mix = d.madeOf.rows.filter((r) => r.all > 0).map((r) => `${lower(r.label)} ${pctOf(r.all, 0)}`);
  const lines: [string, string][] = [
    ["Data", d.byValue ? `Values use your quantities for all ${d.quantities.of} holdings.` : `${splitLine(d)} Quantities for ${d.quantities.have} of ${d.quantities.of}.${d.madeOf.notLoaded.length ? ` ${joinWords(d.madeOf.notLoaded.map((x) => x.name))}: file not loaded yet.` : ""}`],
    ["Held twice", twice.length ? `${twice.length} ${twice.length === 1 ? "company is" : "companies are"} held more than one way, led by ${top.symbol ?? top.name} (${pctOf(top.all, 2)} of everything, ${top.held.length} ways).` : "No company is held more than one way."],
    ["Mix", mix.length ? joinWords(mix) + "." : "—"],
    ["Risk", d.risk.beta != null ? `Together Beta ${betaTxt(d.risk.beta)} against the Nifty 500: ${d.risk.band?.toLowerCase()}.${d.risk.largest ? ` ${KIND_NAME[d.risk.largest]} carry ${pctOf(d.risk.parts.find((p) => p.kind === d.risk.largest)?.riskShare, 0)} of the market risk on ${pctOf(d.risk.parts.find((p) => p.kind === d.risk.largest)?.money, 0)} of the money.` : ""}` : d.risk.why ?? "—"],
  ];
  return (
    <section className="card mi-short" aria-labelledby="mi-short-h"><h2 id="mi-short-h">What this means, in short</h2><p className="mi-small">Written from your figures{d.byValue ? "" : ", with each kind counting the same until you add quantities"}.</p>
      <dl>{lines.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
  );
}

const FAQ: [string, string][] = [
  ["Where do the numbers come from?", "Your three portfolio lists and their quantities; NSE closing prices for shares and ETFs; AMFI NAVs and costs for funds; each fund house's monthly portfolio file for what sits inside a fund or ETF; the Nifty 500 from NSE."],
  ["Why do I need quantities?", "Without them FinLit cannot know how much money is in each holding. Until you add them, each kind (shares, funds, ETFs) counts the same and so does each holding inside it, and the page says so. The figures then describe your lists, not your money."],
  ["How are funds and ETFs looked through?", "Each fund's and ETF's latest monthly file lists what it holds. Your share of a company through a fund is your share of that fund times the company's weight in it; the same for ETFs. Every line of each file is counted. A fund or ETF whose file is not loaded yet is named and counted as \"File not loaded yet\"."],
  ["Why is there no profit or loss here?", "FinLit does not ask what you paid on this page, so it cannot work out a gain against cost. The 1-year change is how what you hold now has moved over the past year. Your gains are on each portfolio page."],
  ["Why is a company counted more than one way?", "You can own it directly and also through a fund or an ETF. The company table adds the ways together so you see your real share of it; Held shows D (direct), F (through a fund) and E (through an ETF)."],
  ["Why is the beta against the Nifty 500?", "Shares, funds and ETFs each have their own benchmark on their own pages. To add them up, this page measures every kind against one yardstick, the Nifty 500. Beta together is the sum of each kind's share of money times its beta."],
  ["What does my plan show here?", "Silver: shares read with FinLit IQ, funds and ETFs. Gold: shares read with FinLit Prism, and each fund's FinLit FundPulse."],
  ["Is anything sent to my broker?", "No. The lists stay in your FinLit account; nothing is sent to a broker."],
];
function Faq() {
  useEffect(() => { if (location.hash === "#mi-faq") document.getElementById("mi-faq")?.scrollIntoView(); }, []);
  return (
    <section className="card mi-faq" id="mi-faq" aria-labelledby="mi-faq-h"><p className="mi-eyebrow">Questions about this page</p><h2 id="mi-faq-h">All my investments · {FAQ.length} questions</h2>
      {FAQ.map(([q, a], i) => <details key={q} open={i === 0}><summary>{q}<span className="mi-chev" aria-hidden="true" /></summary><p>{a}</p></details>)}
      <p className="mi-small">Information only, not investment advice.</p></section>
  );
}
