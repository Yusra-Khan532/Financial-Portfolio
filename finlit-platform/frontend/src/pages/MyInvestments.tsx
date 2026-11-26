// /my-investments: All my investments (task #137, the team's 15 Nov 2026 pack "finlit-all-my-investments-15nov", which replaces the 14 Nov brief). One page that
// reads the member's three lists (Equity portfolio, MF portfolio, ETF portfolio) and their quantities, and looks through each fund and ETF to the companies
// inside. It keeps no list of its own: a change on a portfolio page shows here after a refresh. Layout: header, summary row (dark box + one tile per kind),
// four tabs (All together · Equity · Mutual funds · ETFs), the numbered sections bar of the open tab, then "What this means, in short", the disclaimer,
// the FAQ and the sources. Plans: Silver and Gold (shares with FinLit Prism on Gold, names only on Silver; Mutual Fund Score on Gold). Describes; never advises.
// Task #391 PR A (developer file 35, 24 Nov updated 25 Nov): four calm cards, Since your last visit, Data as of under the section bar, and All together one
// stop at a time (7 numbered stops, Key figures inside stop 1, All sections puts them back), with &step= in the address and the member's last stop kept.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Gate } from "../components/Gate";
import { StepsBar, type Step } from "../components/StepsBar";
import { usePortfolio } from "../lib/portfolio";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { KIND_NAME, chg, dateShort, joinWords, kindsHeld, lower, moneyByKind, pctOf, rupees, splitLine, useAllInvestments, type AccountPick, type AllInvestments, type Kind, type KindMoney, type Tab } from "../lib/myInvest";
import { apiGet } from "../lib/api";
import { DEFAULT_PF, type Holding, type Portfolio } from "../lib/portfolio";
import { StickySwitch, VIEW_ICON, type ViewDef } from "../portfolio/ViewKit";
import "../portfolio/holdings-kit.css";
import { ALL_SECTIONS, AllTogether } from "../myinvest/AllTogether";
import { MiCards, NextView, TopCard, type AccRow } from "../myinvest/Top";
import { MiStepCtx } from "../myinvest/Steps391";
import { MI_STEPS, asOfParts, kindStepFromParam, kindStepParam, miSince, miStepFromParam, miStepParam, stepIn, movesAsMuchNifty, readMiStep, riskWord, saveMiStep, coLabel } from "../lib/mi391";
import { useWhatChanged } from "../components/changes/WhatChanged";
import { changesOf } from "../myinvest/Changes277";
import { dayMonth } from "../lib/whatChanged";
import { useAuth } from "../lib/auth";
import { useBarBottom } from "../portfolio/pack/Round388";
import { planName, plansFromText } from "../lib/planNames";
import { EQ_SECTIONS, EQ_STEPS, ETF_SECTIONS, ETF_STEPS, EquityTab, EtfTab, MF_SECTIONS, MF_STEPS, MfTab } from "../myinvest/KindTabs";
import { StepCtx } from "../portfolio/pack/EqSteps385";
import { QtyDialog } from "../myinvest/QtyDialog";
import "../styles/myinvest.css";
import { PLAN_FOR_ALL_INVESTMENTS, PLAN_FOR_PRISM } from "../lib/planGates";
import { accountFigs, accountSub, type AccountFigs } from "../lib/accountMoney";
import { bookRows, type Book } from "../lib/etfBook";
import { keyOf, mfRows } from "../lib/mfBook";
import { useMfPortfolio } from "../lib/mfPortfolio";

const TABS: { id: Tab; label: string; sub: string; sections: { id: string; label: string }[] }[] = [
  { id: "all", label: "All together", sub: "Money, mix, every company, health and risk", sections: ALL_SECTIONS },
  { id: "equity", label: "Equity", sub: "Your shares, their scores and their risk", sections: EQ_SECTIONS },
  { id: "mf", label: "Mutual funds", sub: "Health, cost, what is inside each fund", sections: MF_SECTIONS },
  { id: "etf", label: "ETFs", sub: "What they track, cost and how close to value", sections: ETF_SECTIONS },
];
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.id === v);
/** Task #391: each view's stops (one section at a time). */
const TAB_STEPS: Record<Tab, { id: string; label: string; secs: string[] }[]> = { all: MI_STEPS, equity: EQ_STEPS, mf: MF_STEPS, etf: ETF_STEPS };
const VIEW_IDS: Tab[] = ["all", "equity", "mf", "etf"];
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
      <Gate tier={PLAN_FOR_ALL_INVESTMENTS} title="See all your investments together" points={["Your shares, mutual funds and ETFs in one place, valued from your quantities", "Every company you own, counted once, looking through your funds and ETFs", "Each kind's beta against the Nifty 500, and beta together"]}>
        <Body />
      </Gate>
    </div>
  );
}

function Body() {
  const { has } = useUI();
  const { holdings, portfolios } = usePortfolio();
  const silver = has(PLAN_FOR_ALL_INVESTMENTS);
  const qAll = useAllInvestments(holdings, silver);
  const mfB = useQuery({ queryKey: ["mf-portfolio", "book"], queryFn: () => apiGet<{ portfolios: Portfolio[] }>("/api/me/mf-portfolio/book"), enabled: silver, staleTime: 60_000, retry: false });
  const etfB = useQuery({ queryKey: ["etf-portfolio", "book"], queryFn: () => apiGet<Book>("/api/me/etf-portfolio/book"), enabled: silver, staleTime: 60_000, retry: false });
  const accs = useMemo(() => accountsOf(portfolios, holdings, mfB.data?.portfolios, etfB.data?.portfolios, qAll.data), [portfolios, holdings, mfB.data, etfB.data, qAll.data]);
  // developer file 33: each account's funds and ETFs from the MF and ETF pages' own rows (the MF list is read only when there are two platforms or more)
  const mfAccs = accs.filter((a) => a.mf).length, etfAccs = accs.filter((a) => a.etf).length;
  const mfL = useMfPortfolio(silver && mfAccs > 1);
  const figs = useMemo(() => {
    const etfRows = etfB.data?.lots ? bookRows(etfB.data) : null;
    const mfR = mfL.data ? mfRows(mfL.data, mfB.data?.portfolios?.[0]?.id ?? DEFAULT_PF) : null;
    const navs = new Map((mfL.data?.holdings ?? []).map((h) => [keyOf(h.id), h.nav]));
    const books = { all: qAll.data, hs: holdings, etfRows, mfRows: mfR, nav: (k: string) => navs.get(k) ?? null, etfAccounts: etfAccs, mfAccounts: mfAccs };
    return new Map(accs.map((a) => [a.id, accountFigs(a, books)]));
  }, [accs, holdings, qAll.data, etfB.data, mfL.data, mfB.data, etfAccs, mfAccs]);
  const [params, setParams] = useSearchParams();
  const acc = accs.find((a) => a.id === params.get("acc")) ?? null;
  const pick: AccountPick | null = acc && accs.length > 1 ? { eq: acc.eq, mf: acc.mf ?? "none", etf: acc.etf ?? "none" } : null;
  const qPick = useAllInvestments(holdings, silver && !!pick, pick);
  const q = pick ? qPick : qAll;
  const d = q.data;
  const hsIn = pick?.eq ? holdings.filter((h) => pick.eq!.includes(h.pf ?? DEFAULT_PF)) : holdings;
  const money = useMemo(() => (d ? moneyByKind(d, hsIn) : null), [d, hsIn]);
  const setAcc = (id: string) => setParams((p) => { const n = new URLSearchParams(p); if (id === "all") n.delete("acc"); else n.set("acc", id); return n; }, { replace: true });
  // the money of every account together, whichever account is picked (All accounts under Your portfolios, and in the sticky menu)
  const moneyAll = useMemo(() => (qAll.data ? moneyByKind(qAll.data, holdings) : null), [qAll.data, holdings]);
  // developer file 33: the sticky account menu gives each account its own figures (it read "-1 holdings" for an account not picked)
  const accFigs = (id: string) => {
    if (id === "all") { const m = moneyAll?.all; return m ? { n: m.n, now: m.now, withQty: m.now ? m.n : 0, gainPct: m.full && m.invested ? (m.gain / m.invested) * 100 : null } : { n: 0, now: 0, withQty: 0, gainPct: null }; }
    const f = figs.get(id); return f ? { n: f.n, now: f.now, withQty: f.valued, gainPct: f.gainPct } : { n: 0, now: 0, withQty: 0, gainPct: null }; };
  const tab: Tab = isTab(params.get("tab")) ? (params.get("tab") as Tab) : "all";
  const accRows = useMemo(() => accRowsOf(accs, figs), [accs, figs]);
  const [qty, setQty] = useState(false);
  const { user } = useAuth();
  // task #391 (Section bar, Rules R8 and R9): one stop at a time in every view. The stop is in the address (&step=; none = the view's first stop, "all"
  // = All sections); on All together, with no step in the address, the member's last stop in this browser opens; the address wins
  const steps391 = TAB_STEPS[tab];
  const step = tab === "all" ? miStepFromParam(params.get("step")) : kindStepFromParam(steps391, params.get("step"));
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || !d) return; placed.current = true;
    if (tab !== "all" || params.get("step")) return;
    const last = readMiStep(user?.id); if (!last || last === MI_STEPS[0].id) return;
    setParams((p) => { const n = new URLSearchParams(p); n.set("step", miStepParam(last)); return n; }, { replace: true });
  }, [d]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !!d;
  useEffect(() => { if (tab === "all" && ready && placed.current && (params.get("step") || !readMiStep(user?.id) || step !== MI_STEPS[0].id)) saveMiStep(user?.id, step); }, [tab, step, user?.id, ready]);   // eslint-disable-line react-hooks/exhaustive-deps
  /** Back to the section bar's place when the page is below it (a new stop starts at its top). */
  const toBar = () => window.setTimeout(() => { const a = document.getElementById("mi-steps-top"); if (a && a.getBoundingClientRect().top < 0) a.scrollIntoView({ behavior: "smooth", block: "start" }); }, 40);
  const withView = (n: URLSearchParams, t: Tab) => { if (t === "all") n.delete("tab"); else n.set("tab", t); };
  const setStep = (id: string) => { setParams((p) => { const n = new URLSearchParams(p); withView(n, tab); n.set("step", tab === "all" ? miStepParam(id) : kindStepParam(id)); return n; }, { replace: true }); toBar(); };
  /** Opens the stop that holds a section (in this view when it has it, else in the view that does) and goes to it. All sections stays on if it is. */
  const openSec = (id: string, in0?: Tab) => {
    const t = in0 ?? ([tab, ...VIEW_IDS.filter((x) => x !== tab)].find((x) => stepIn(TAB_STEPS[x], id)) ?? tab);
    const to = stepIn(TAB_STEPS[t], id) ?? TAB_STEPS[t][0].id;
    setParams((p) => { const n = new URLSearchParams(p); const keepAll = t === tab && n.get("step") === "all"; withView(n, t); if (!keepAll) n.set("step", t === "all" ? miStepParam(to) : kindStepParam(to)); return n; }, { replace: true });
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  // the Equity, Mutual funds and ETFs views ask for a section by an event (KindTabs go): the page opens its step
  useEffect(() => { const f = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (typeof id === "string" && stepIn(TAB_STEPS[tab], id)) { e.preventDefault(); openSec(id, tab); } };
    addEventListener("mi-open", f); return () => removeEventListener("mi-open", f); });
  const toTab = (t: Tab, scroll?: string) => {
    if (scroll && stepIn(TAB_STEPS[t], scroll)) { openSec(scroll, t); return; }
    setParams((p) => { const n = new URLSearchParams(p); withView(n, t); n.delete("step"); return n; }, { replace: true });
    window.setTimeout(() => document.getElementById(scroll ?? "mi-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  // task #391 (Top 6): what is new since the last visit, from the What changed feed of the companies you own (one request, shared with stop 5)
  const ch = d ? changesOf(d) : { direct: [], through: [] };
  const wc = useWhatChanged(d ? [...ch.direct, ...ch.through] : [], "myinvest");
  // task #391 (Update 25 Nov, row 3): the filter row of Every company stops just under the section bar (--eq-bar-b)
  const bar = useRef<HTMLElement | null>(null), [barOn, setBarOn] = useState(false);
  useLayoutEffect(() => { const el = document.querySelector<HTMLElement>(".wrap.mi .stb-wrap"); bar.current = el; setBarOn(!!el); });
  useBarBottom(bar, barOn);
  // task #391: every stop numbered (fault 5): All together's seven, Key figures inside stop 1; the Equity, Mutual funds and ETFs views' steps (PR B's
  // EQ/MF/ETF_STEPS), Key figures inside their step 1 too
  const steps: Step[] = steps391.map((s, i) => ({ id: s.id, n: i + 1, title: s.label, sections: [] }));
  return (
    <>
      {/* task #277 (changes 1, 2): the compact top: title row, the money box that says what it covers, Your portfolios (they replace the header card,
          the accounts bar and the dark summary box) */}
      <TopCard d={d} money={money} allMoney={moneyAll} accs={accRows} cur={acc?.id ?? "all"} onPick={setAcc} openQty={() => setQty(true)} loading={q.isLoading} />
      {q.isLoading && <div className="skeleton mi-skel" aria-busy="true" aria-label="Reading your three lists" />}
      {q.isError && <div className="state" role="alert"><h2>Could not read your investments</h2><p>{q.error?.message || "Please try again in a moment."} <button className="btn" onClick={() => q.refetch()}>Try again</button></p></div>}
      {d && kindsHeld(d).length === 0 && (
        <section className="card mi-empty"><h2>Nothing to read yet</h2><p>Add shares on the <Link to="/holdings">Equity portfolio</Link>, funds on the <Link to="/mf-portfolio">MF portfolio</Link> or ETFs on the <Link to="/etf-portfolio">ETF portfolio</Link>. This page reads the three lists; it keeps no list of its own.</p></section>)}
      {d && kindsHeld(d).length > 0 && <>
        {/* task #391 (Top 1–5): four calm cards with a crown each; Open → switches the view in the page, as before */}
        <MiCards d={d} view={tab} onView={(t) => toTab(t)} />
        {/* task #391 (Top 6): one line under the cards; See what changed → opens stop 5 */}
        {wc.q.data && <MiSinceLine visit={wc.lastVisit ? dayMonth(wc.lastVisit) : null} fresh={wc.newN} onSee={() => openSec("what-changed")} />}
        <div id="mi-steps-top" className="mi391-anchor" aria-hidden="true" />
        <StepsBar key={tab} arrows steps={steps} step={step} onStep={setStep} label={`Sections of ${TABS.find((t) => t.id === tab)?.label}`}
          lead={<StickySwitch list={accs.length > 1 ? accs : []} cur={acc?.id ?? "all"} onPick={setAcc} figs={accFigs} defs={VIEWS} view={tab} onView={(t) => toTab(t)} tabsId="mi-tabs" noun={["holding", "holdings"]} />} />
        {/* task #391 (Top 7): which date each kind of figure runs to, one line under the section bar */}
        <AsOf parts={asOfParts(d, wc.q.data?.days ?? null)} />
        <div role="tabpanel" id={`mi-p-${tab}`} aria-labelledby={`mi-t-${tab}`} className="mi-panel">
          {tab === "all" && <MiStepCtx.Provider value={{ step, first: MI_STEPS[0].id }}><AllTogether d={d} money={money} toTab={toTab} openQty={() => setQty(true)} go={openSec} /></MiStepCtx.Provider>}
          {tab !== "all" && <StepCtx.Provider value={{ step, firstStep: steps391[0].id }}>
            {tab === "equity" && <EquityTab d={d} />}
            {tab === "mf" && <MfTab d={d} />}
            {tab === "etf" && <EtfTab d={d} />}
          </StepCtx.Provider>}
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
 *  gain. Developer file 33: the account's shares, funds and ETFs, each from its own page's rows (lib/accountMoney), so a row is the Equity, MF and ETF
 *  pages' rows of that name added up; until 23 Nov 2026 its funds and ETFs counted only when it was the only account of that kind. */
const AV = ["#0e6471", "#4b4fc4", "#7a5c1f", "#a23b72", "#2f5a9e", "#134e4a"];
function accRowsOf(accs: Acc[], figs: Map<string, AccountFigs>): AccRow[] {
  return accs.map((a, i) => {
    const f = figs.get(a.id);
    return { id: a.id, name: a.name, sub: f ? accountSub(f) : "nothing yet", value: f?.valued ? f.now : null, gainPct: f?.gainPct ?? null, color: AV[i % AV.length], initial: a.name.trim().charAt(0).toUpperCase() || "P" };
  });
}

function InShort({ d, money }: { d: AllInvestments; money: Record<Kind | "all", KindMoney> | null }) {
  const m = money?.all, share = (k: Kind) => (d.total ? Math.round((d.cards[k].value ?? 0) / d.total * 100) : 0);
  const twice = d.companies.filter((c) => c.held.length > 1), top = twice[0];
  const mix = d.madeOf.rows.filter((r) => r.all > 0).map((r) => `${lower(r.label)} ${pctOf(r.all, 0)}`);
  const lines: [string, string][] = [
    ["Data", d.byValue ? `By value now: shares ${share("shares")}%, mutual funds ${share("funds")}%, ETFs ${share("etfs")}%.${m && m.full ? ` ${m.gain >= 0 ? "+" : "−"}${rupees(Math.abs(m.gain))} (${chg((m.gain / m.invested) * 100)}) on ${rupees(m.invested)} invested; buy prices for ${m.full} of ${m.n}.` : ""}` : `${splitLine(d)} Quantities for ${d.quantities.have} of ${d.quantities.of}.${d.madeOf.notLoaded.length ? ` ${joinWords(d.madeOf.notLoaded.map((x) => x.name))}: file not loaded yet.` : ""}`],
    ["Held twice", twice.length ? `${twice.length} ${twice.length === 1 ? "company is" : "companies are"} held more than one way, led by ${coLabel(top)} (${pctOf(top.all, 2)} of everything, ${top.held.length} ways).` : "No company is held more than one way."],
    ["Mix", mix.length ? joinWords(mix) + "." : "—"],
    // task #391 (X7, X8, X9): "Together it moves 0.91× as much as the Nifty 500: similar." with the range word in the shared words
    ["Risk", d.risk.beta != null ? `Together it ${movesAsMuchNifty(d.risk.beta)}${riskWord(d.risk.band, d.risk.beta, d.risk.bandKey) ? `: ${riskWord(d.risk.band, d.risk.beta, d.risk.bandKey)!.toLowerCase()}` : ""}.${d.risk.largest ? ` ${KIND_NAME[d.risk.largest]} carry ${pctOf(d.risk.parts.find((p) => p.kind === d.risk.largest)?.riskShare, 0)} of the market risk on ${pctOf(d.risk.parts.find((p) => p.kind === d.risk.largest)?.money, 0)} of the money.` : ""}` : d.risk.why ?? "—"],
  ];
  return (
    <section className="card mi-short" aria-labelledby="mi-short-h"><h2 id="mi-short-h">What this means, in short</h2><p className="mi-small">Written from your figures{d.byValue ? "" : ", with each kind counting the same until you add quantities"}.</p>
      <dl>{lines.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
  );
}

/** Task #391 (Top 6): "Since your last visit on 23 Nov: 1 new filing at companies you own." with See what changed → when something is new. */
export function MiSinceLine({ visit, fresh, onSee }: { visit: string | null; fresh: number; onSee: () => void }) {
  const t = miSince(visit, fresh);
  return <div className="mi391-since" role="note"><i className="mi391-dot" aria-hidden="true" /><span><b>{t.lead}</b> {t.rest}</span>
    {visit && fresh > 0 && <button type="button" onClick={onSee}>See what changed →</button>}</div>;
}
/** Task #391 (Top 7): "Data as of · Prices close of 23 Nov · Fund and ETF holdings each file of 31 Oct 2026 · Filings the last 90 days · Risk weekly prices, past year". */
export function AsOf({ parts }: { parts: [string, string][] }) {
  if (!parts.length) return null;
  return <p className="mi391-asof"><b>Data as of</b>{parts.map(([k, t], i) => <span key={k} className="mi391-ai">{i > 0 && <i aria-hidden="true">·</i>}<span className="mi391-ak">{k}</span> {t}</span>)}</p>;
}

const FAQ: [string, string][] = [
  ["Where do the numbers come from?", "Your three portfolio lists and their quantities; NSE closing prices for shares and ETFs; AMFI NAVs and costs for funds; each fund house's monthly portfolio file for what sits inside a fund or ETF; the Nifty 500 from NSE."],
  ["Why do I need quantities?", "Without them FinLit cannot know how much money is in each holding. Until you add them, each kind (shares, funds, ETFs) counts the same and so does each holding inside it, and the page says so. The figures then describe your lists, not your money."],
  ["How are funds and ETFs looked through?", "Each fund's and ETF's latest monthly file lists what it holds. Your share of a company through a fund is your share of that fund times the company's weight in it; the same for ETFs. Every line of each file is counted. A fund or ETF whose file is not loaded yet is named and counted as \"File not loaded yet\"."],
  ["How is profit or loss worked out?", "Gain or loss is today's value minus what you paid, from the buy price you gave. A holding without a buy price is left out and listed so you can add one. Dividends, charges and taxes are not included."],
  ["Why is a company counted more than one way?", "You can own it directly and also through a fund or an ETF. The company table adds the ways together so you see your real share of it; Held shows D (direct), F (through a fund) and E (through an ETF)."],
  ["Why is the beta against the Nifty 500?", "Shares, funds and ETFs each have their own benchmark on their own pages. To add them up, this page measures every kind against one yardstick, the Nifty 500."],
  // task #391 (C8, fault 11): the plan names come from the plan list (lib/planNames), never a fixed string
  ["What does my plan show here?", `This page is in ${plansFromText(PLAN_FOR_ALL_INVESTMENTS)}: your shares, mutual funds and ETFs together. On ${planName(PLAN_FOR_PRISM)} the shares are read with FinLit Prism, FinLit's only company score, and each fund with its Mutual Fund Score; below it the shares show by name.`],
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
