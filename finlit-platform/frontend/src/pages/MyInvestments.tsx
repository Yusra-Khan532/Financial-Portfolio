// /my-investments: All my investments (task #137, the team's 15 Nov 2026 pack "finlit-all-my-investments-15nov", which replaces the 14 Nov brief). One page that
// reads the member's three lists (Equity portfolio, MF portfolio, ETF portfolio) and their quantities, and looks through each fund and ETF to the companies
// inside. It keeps no list of its own: a change on a portfolio page shows here after a refresh. Layout: header, summary row (dark box + one tile per kind),
// four tabs (All together · Equity · Mutual funds · ETFs), the numbered sections bar of the open tab, then "What this means, in short", the disclaimer,
// the FAQ and the sources. Plans: Silver and Gold (shares with FinLit IQ on Silver, FinLit Prism on Gold; Mutual Fund Score on Gold). Describes; never advises.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Gate } from "../components/Gate";
import { StepsBar, type MenuGroup, type Step } from "../components/StepsBar";
import { usePortfolio } from "../lib/portfolio";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { KIND_NAME, betaTxt, chg, dateShort, joinWords, kindsHeld, lower, moneyByKind, pctOf, rupees, splitLine, useAllInvestments, type AccountPick, type AllInvestments, type Kind, type KindMoney, type Tab } from "../lib/myInvest";
import { apiGet } from "../lib/api";
import { DEFAULT_PF, type Holding, type Portfolio } from "../lib/portfolio";
import { StickySwitch, VIEW_ICON, type ViewDef } from "../portfolio/ViewKit";
import "../portfolio/holdings-kit.css";
import { ALL_SECTIONS, AllTogether } from "../myinvest/AllTogether";
import { NextView, TopCard, ViewTiles, useViewsSeen, type AccRow } from "../myinvest/Top";
import { aggOf } from "../lib/ledger";
import { EQ_SECTIONS, ETF_SECTIONS, EquityTab, EtfTab, MF_SECTIONS, MfTab } from "../myinvest/KindTabs";
import { QtyDialog } from "../myinvest/QtyDialog";
import "../styles/myinvest.css";

const TABS: { id: Tab; label: string; sub: string; sections: { id: string; label: string }[] }[] = [
  { id: "all", label: "All together", sub: "Money, mix, every company, health and risk", sections: ALL_SECTIONS },
  { id: "equity", label: "Equity", sub: "Your shares, their scores and their risk", sections: EQ_SECTIONS },
  { id: "mf", label: "Mutual funds", sub: "Health, cost, what is inside each fund", sections: MF_SECTIONS },
  { id: "etf", label: "ETFs", sub: "What they track, cost and how close to value", sections: ETF_SECTIONS },
];
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.id === v);
/** Pack B2 and C3: the four views, each with its colour and icon (All together #134e4a, Equity #0e6471, Mutual funds #9a6b12, ETFs #2f5a9e). */
const VIEW_LOOK: Record<Tab, [string, ReactNode, string]> = { all: ["#134e4a", VIEW_ICON.pie, "All together"], equity: ["#0e6471", VIEW_ICON.case, "Equity"], mf: ["#9a6b12", VIEW_ICON.pulse, "Mutual funds"], etf: ["#2f5a9e", VIEW_ICON.case, "ETFs"] };
const VIEWS: ViewDef<Tab>[] = TABS.map((t) => ({ id: t.id, label: t.label, short: VIEW_LOOK[t.id][2], sub: t.sub, color: VIEW_LOOK[t.id][0], icon: VIEW_LOOK[t.id][1] }));

/** Task #235 (pack C3): the accounts from the three portfolio pages, one tab per name (Upstox on the Equity page and Upstox on the ETF page are one account). */
type Acc = { id: string; name: string; eq: string[]; mf: string | null; etf: string | null };
function accountsOf(eqPfs: Portfolio[] | undefined, hs: Holding[], mf: Portfolio[] | undefined, etf: Portfolio[] | undefined, d: AllInvestments | undefined): Acc[] {
  if (!eqPfs?.length && !mf?.length && !etf?.length) return [];   // no named accounts on any page: nothing to pick between
  const out = new Map<string, Acc>();
  const put = (p: Portfolio, k: "eq" | "mf" | "etf") => { const key = p.name.trim().toLowerCase(); const a = out.get(key) ?? { id: "a-" + key.replace(/[^a-z0-9]+/g, "-").slice(0, 30), name: p.name.trim(), eq: [], mf: null, etf: null };
    if (k === "eq") a.eq.push(p.id); else a[k] = p.id; out.set(key, a); };
  (eqPfs?.length ? eqPfs : hs.length ? [{ id: DEFAULT_PF, name: "My portfolio" }] : []).forEach((p) => put(p, "eq"));
  (mf?.length ? mf : d?.counts.funds ? [{ id: DEFAULT_PF, name: "My funds" }] : []).forEach((p) => put(p, "mf"));
  (etf?.length ? etf : d?.counts.etfs ? [{ id: DEFAULT_PF, name: "My ETFs" }] : []).forEach((p) => put(p, "etf"));
  return [...out.values()];
}

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
  const { holdings, portfolios } = usePortfolio();
  const silver = has("silver");
  const qAll = useAllInvestments(holdings, silver);
  const mfB = useQuery({ queryKey: ["mf-portfolio", "book"], queryFn: () => apiGet<{ portfolios: Portfolio[] }>("/api/me/mf-portfolio/book"), enabled: silver, staleTime: 60_000, retry: false });
  const etfB = useQuery({ queryKey: ["etf-portfolio", "book"], queryFn: () => apiGet<{ portfolios: Portfolio[] }>("/api/me/etf-portfolio/book"), enabled: silver, staleTime: 60_000, retry: false });
  const accs = useMemo(() => accountsOf(portfolios, holdings, mfB.data?.portfolios, etfB.data?.portfolios, qAll.data), [portfolios, holdings, mfB.data, etfB.data, qAll.data]);
  const [params, setParams] = useSearchParams();
  const acc = accs.find((a) => a.id === params.get("acc")) ?? null;
  const pick: AccountPick | null = acc && accs.length > 1 ? { eq: acc.eq, mf: acc.mf ?? "none", etf: acc.etf ?? "none" } : null;
  const qPick = useAllInvestments(holdings, silver && !!pick, pick);
  const q = pick ? qPick : qAll;
  const d = q.data;
  const hsIn = pick?.eq ? holdings.filter((h) => pick.eq!.includes(h.pf ?? DEFAULT_PF)) : holdings;
  const money = useMemo(() => (d ? moneyByKind(d, hsIn) : null), [d, hsIn]);
  const setAcc = (id: string) => setParams((p) => { const n = new URLSearchParams(p); if (id === "all") n.delete("acc"); else n.set("acc", id); return n; }, { replace: true });
  const accFigs = (id: string) => { const dd = id === "all" ? qAll.data : id === acc?.id ? d : undefined; if (!dd) return { n: -1, now: 0, withQty: 0, gainPct: null };
    const m = moneyByKind(dd, id === "all" ? holdings : hsIn).all; return { n: m.n, now: m.now, withQty: m.now ? m.n : 0, gainPct: m.full && m.invested ? (m.gain / m.invested) * 100 : null }; };
  const tab: Tab = isTab(params.get("tab")) ? (params.get("tab") as Tab) : "all";
  const seen = useViewsSeen(tab);
  const accRows = useMemo(() => accRowsOf(accs, holdings, d, money), [accs, holdings, d, money]);
  const [qty, setQty] = useState(false);
  const toTab = (t: Tab, scroll?: string) => {
    setParams((p) => { const n = new URLSearchParams(p); if (t === "all") n.delete("tab"); else n.set("tab", t); return n; }, { replace: true });
    window.setTimeout(() => document.getElementById(scroll ?? "mi-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  // task #277 (change 11): the page keeps its own Step 1–6 numbers; Key figures (after Step 4 on All together, after Step 1 elsewhere) carries a dot, not a number
  const steps: Step[] = (TABS.find((t) => t.id === tab)?.sections ?? []).flatMap((s, i) => {
    const st: Step = { id: s.id, n: i + 1, title: s.label, sections: [] };
    return (tab === "all" ? s.id === "mi-every" : i === 0) ? [st, { id: "mi-kf", n: 0, title: "Key figures", sections: [] }, ...(tab === "all" ? [{ id: "what-changed", n: 0, title: "What changed", sections: [] }] : [])] : [st];
  });
  const menu: MenuGroup[] = TABS.map((t) => ({ title: t.label, items: t.sections.map((s, i) => ({ id: s.id, label: `${i + 1} · ${s.label}`, go: () => toTab(t.id, s.id) })) }));
  return (
    <>
      {/* task #277 (changes 1, 2): the compact top: title row, the money box that says what it covers, Your portfolios (they replace the header card,
          the accounts bar and the dark summary box) */}
      <TopCard d={d} money={money} accs={accRows} cur={acc?.id ?? "all"} onPick={setAcc} openQty={() => setQty(true)} loading={q.isLoading} />
      {q.isLoading && <div className="skeleton mi-skel" aria-busy="true" aria-label="Reading your three lists" />}
      {q.isError && <div className="state" role="alert"><h2>Could not read your investments</h2><p>{q.error?.message || "Please try again in a moment."} <button className="btn" onClick={() => q.refetch()}>Try again</button></p></div>}
      {d && kindsHeld(d).length === 0 && (
        <section className="card mi-empty"><h2>Nothing to read yet</h2><p>Add shares on the <Link to="/holdings">Equity portfolio</Link>, funds on the <Link to="/mf-portfolio">MF portfolio</Link> or ETFs on the <Link to="/etf-portfolio">ETF portfolio</Link>. This page reads the three lists; it keeps no list of its own.</p></section>)}
      {d && kindsHeld(d).length > 0 && <>
        {/* task #277 (change 16): the four views drawn as tabs; they replace the three kind tiles */}
        <ViewTiles d={d} view={tab} onView={(t) => toTab(t)} seen={seen} />
        <StepsBar key={tab} arrows steps={steps} menu={menu} label={`Sections of ${TABS.find((t) => t.id === tab)?.label}`}
          lead={<StickySwitch list={accs.length > 1 ? accs : []} cur={acc?.id ?? "all"} onPick={setAcc} figs={accFigs} defs={VIEWS} view={tab} onView={(t) => toTab(t)} tabsId="mi-tabs" noun={["holding", "holdings"]} />} />
        <div role="tabpanel" id={`mi-p-${tab}`} aria-labelledby={`mi-t-${tab}`} className="mi-panel">
          {tab === "all" && <AllTogether d={d} money={money} toTab={toTab} openQty={() => setQty(true)}
            stickyLead={<StickySwitch list={accs.length > 1 ? accs : []} cur={acc?.id ?? "all"} onPick={setAcc} figs={accFigs} defs={VIEWS} view={tab} onView={(t) => toTab(t)} tabsId="mi-tabs" noun={["holding", "holdings"]} />} />}
          {tab === "equity" && <EquityTab d={d} />}
          {tab === "mf" && <MfTab d={d} />}
          {tab === "etf" && <EtfTab d={d} />}
          <NextView d={d} view={tab} onView={(t) => toTab(t)} />
        </div>
        <InShort d={d} money={money} />
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

/** Task #277 (change 2): one row per account under Your portfolios, with what it holds and, when its holdings have quantities and buy prices, its value and
 *  gain. Shares are summed from the account's own buys; a fund or ETF account shows money only when it is the only one of its kind (the page's figures are its). */
const AV = ["#0e6471", "#4b4fc4", "#7a5c1f", "#a23b72", "#2f5a9e", "#134e4a"];
function accRowsOf(accs: Acc[], hs: Holding[], d: AllInvestments | undefined, money: Record<Kind | "all", KindMoney> | null): AccRow[] {
  const mfAccs = accs.filter((a) => a.mf).length, etfAccs = accs.filter((a) => a.etf).length;
  return accs.map((a, i) => {
    const mine = hs.filter((h) => a.eq.includes(h.pf ?? DEFAULT_PF)), syms = [...new Set(mine.map((h) => h.symbol.toUpperCase()))];
    let now = 0, inv = 0, priced = 0, valued = 0, n = 0;
    for (const s of syms) {
      const g = aggOf(mine, s, "all"), px = d?.shares.find((x) => x.symbol === s)?.price ?? null;
      if (g && g.qty === 0 && g.nBuys > 0) continue;                       // sold in full
      n++;
      if (g?.qty && px) { now += g.qty * px; valued++; if (g.invested != null) { inv += g.invested; priced++; } }
    }
    const nf_ = a.mf ? (mfAccs === 1 ? d?.counts.funds ?? 0 : null) : 0, ne = a.etf ? (etfAccs === 1 ? d?.counts.etfs ?? 0 : null) : 0;
    for (const [k, on] of [["funds", a.mf && mfAccs === 1], ["etfs", a.etf && etfAccs === 1]] as const) {
      const m = money?.[k]; if (on && m && m.now > 0) { now += m.now; valued++; if (m.full === m.n) { inv += m.invested; priced += m.full; } }
    }
    const parts = [n ? `${n} ${n === 1 ? "share" : "shares"}` : "", nf_ ? `${nf_} ${nf_ === 1 ? "fund" : "funds"}` : a.mf && nf_ == null ? "funds" : "", ne ? `${ne} ETF${ne === 1 ? "" : "s"}` : a.etf && ne == null ? "ETFs" : ""].filter(Boolean);
    return { id: a.id, name: a.name, sub: parts.join(" · ") || "nothing yet", value: valued ? now : null, gainPct: priced && priced === valued && inv ? ((now - inv) / inv) * 100 : null, color: AV[i % AV.length], initial: a.name.trim().charAt(0).toUpperCase() || "P" };
  });
}

function InShort({ d, money }: { d: AllInvestments; money: Record<Kind | "all", KindMoney> | null }) {
  const m = money?.all, share = (k: Kind) => (d.total ? Math.round((d.cards[k].value ?? 0) / d.total * 100) : 0);
  const twice = d.companies.filter((c) => c.held.length > 1), top = twice[0];
  const mix = d.madeOf.rows.filter((r) => r.all > 0).map((r) => `${lower(r.label)} ${pctOf(r.all, 0)}`);
  const lines: [string, string][] = [
    ["Data", d.byValue ? `By value now: shares ${share("shares")}%, mutual funds ${share("funds")}%, ETFs ${share("etfs")}%.${m && m.full ? ` ${m.gain >= 0 ? "+" : "−"}${rupees(Math.abs(m.gain))} (${chg((m.gain / m.invested) * 100)}) on ${rupees(m.invested)} invested; buy prices for ${m.full} of ${m.n}.` : ""}` : `${splitLine(d)} Quantities for ${d.quantities.have} of ${d.quantities.of}.${d.madeOf.notLoaded.length ? ` ${joinWords(d.madeOf.notLoaded.map((x) => x.name))}: file not loaded yet.` : ""}`],
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
  ["How is profit or loss worked out?", "From the average buy price of each holding, which you type in on its portfolio page or which comes with a broker file or CAS: gain or loss is value now minus quantity × average buy price. A holding without a buy price is left out of the gain and listed so you can add one. Dividends, charges and taxes are not included. Nothing is sent to your broker."],
  ["Why is a company counted more than one way?", "You can own it directly and also through a fund or an ETF. The company table adds the ways together so you see your real share of it; Held shows D (direct), F (through a fund) and E (through an ETF)."],
  ["Why is the beta against the Nifty 500?", "Shares, funds and ETFs each have their own benchmark on their own pages. To add them up, this page measures every kind against one yardstick, the Nifty 500. Beta together is the sum of each kind's share of money times its beta."],
  ["What does my plan show here?", "Silver: shares read with FinLit IQ, funds and ETFs. Gold: shares read with FinLit Prism, and each fund's Mutual Fund Score."],
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
