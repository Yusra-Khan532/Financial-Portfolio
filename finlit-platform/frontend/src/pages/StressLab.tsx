// Stress Lab (Silver and Gold): how a shock to crude, the rupee, inflation, rates or demand would move one company's earnings over the next 12 months, and two companies side by side (Gold).
// The page is the design team's reference page, drawn in a shadow root (so its own light "paper" styles cannot leak and the site's cannot reach in); the model runs in the browser
// (stress/engine.js, a port of finlit_technicals/stress.py) so the sliders answer at once. The server decides what each plan receives. Information only, never advice (docs/STRESS.md).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/PageHeader";
import { OutlookPicker } from "../components/OutlookPicker";
import { Gate } from "../components/Gate";
import { useIndexFilter } from "../components/SearchFilters";
import { useLogoMap } from "../components/CoLogo";
import { ApiError, apiGet } from "../lib/api";
import { reportError } from "../lib/resilience";
import { useUI } from "../lib/ui";
import { useDocTitle } from "../lib/title";
import StressEngine from "../stress/engine";
import { mountStressLab } from "../stress/stressLab";
import { skeleton } from "../stress/skeleton";
import css from "../stress/stresslab.css?inline";

const BASE = "/research/stress-lab";
const GATE = ["How a shock to crude, the rupee, inflation, rates or demand moves a company's earnings, with every assumption shown", "Today's conditions and the past shocks of 2022 and 2020", "Gold adds the other scenarios, your own shocks, your own company settings and Compare two"];
const page = (sym: string) => apiGet<any>(`/api/stress/${encodeURIComponent(sym)}/page`);

const PREPARE_CHECKS = 15;   // about five minutes of checking while a page is being prepared

export function StressLabIndexPage() {
  useDocTitle("Stress Lab", "See how a shock to crude, the rupee, inflation, interest rates or demand would move a company's earnings over the next 12 months.");
  const { has } = useUI();
  // The quick picks are the six largest covered companies that have a stored page, so every one opens (never a bank, never a company outside the launch list).
  // while fewer than six companies are ready the server is getting the largest ones ready: look again every 30 seconds for a few minutes so they appear here by themselves
  const pq = useQuery<{ picks: { symbol: string; name: string }[] }, ApiError>({ queryKey: ["stress", "quick-picks"], queryFn: () => apiGet("/api/stress/quick-picks"), enabled: has("silver"), retry: false, staleTime: 300_000,
    refetchInterval: (query) => ((query.state.data?.picks.length ?? 6) < 6 && query.state.dataUpdateCount < PREPARE_CHECKS ? 30_000 : false) });
  const picks = !has("silver") ? [] : pq.isPending ? null : pq.isError ? [] : pq.data.picks.map((p) => ({ symbol: p.symbol, name: p.name.replace(/\s+(Ltd|Limited)\.?$/i, "") }));
  return (
    <>
      <PageHeader wrap eyebrow="Quant Lab" plan={has("gold") ? "gold" : "silver"} title="Stress Lab" art="chart" links={["/outlook", "/dcf", "/research"]}
        description={<>See how a shock to <b>crude, the rupee, inflation, interest rates or demand</b> would move a company's earnings over the next 12 months, under assumptions you can see. Illustrative, not a forecast and not advice.</>} />
      <div className="wrap ol"><OutlookPicker intro base={BASE} picks={picks} recents={false} introText={<>Pick a large or mid cap that is not a bank, NBFC or insurer. Stress Lab starts from its last four reported quarters, applies the shock you choose, and shows what happens to earnings per share, interest cover and an earnings-based value, with every assumption and its source.</>} /></div>
    </>
  );
}

export function StressLabPage() {
  const { symbol = "" } = useParams();
  const sym = symbol.toUpperCase();
  useDocTitle(`${sym} Stress Lab`, "How a shock to crude, the rupee, inflation, interest rates or demand would move this company's earnings. Illustrative, not a forecast and not advice.");
  const { has, theme, upgrade } = useUI();
  const upgradeRef = useRef(upgrade); upgradeRef.current = upgrade;
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const withRaw = (sp.get("with") || "").toUpperCase().replace(/[^A-Z0-9&._-]/g, "").slice(0, 24) || null;   // "Stress test" in Peer Compare opens with the two companies picked there
  const withSym = withRaw && withRaw !== sym ? withRaw : null;   // ?with= the same company would set it against itself
  const silver = has("silver"), gold = has("gold");
  // "Being prepared" (503) means the server is building this company's page right now: check again by itself every 20 seconds for about five minutes, so it appears without a reload
  const q = useQuery<any, ApiError>({ queryKey: ["stress", sym], queryFn: () => page(sym), enabled: silver && !!sym, retry: false, staleTime: 300_000,
    refetchInterval: (query) => (query.state.error?.status === 503 && query.state.errorUpdateCount < PREPARE_CHECKS ? 20_000 : false) });
  const [wantPeer, setWantPeer] = useState(() => !!withSym || (typeof location !== "undefined" && location.hash.startsWith("#compare")));
  const [picked, setPicked] = useState<string | null>(withSym);
  const def = useQuery<any, ApiError>({ queryKey: ["stress-peer", sym], queryFn: () => apiGet(`/api/stress/${encodeURIComponent(sym)}/peer`), enabled: gold && wantPeer && !picked && !!q.data, retry: false, staleTime: 300_000 });
  const peerSym = picked ?? def.data?.peer?.symbol ?? null;
  // a second company whose page is being built appears by itself, as the first one does
  const peerQ = useQuery<any, ApiError>({ queryKey: ["stress", peerSym], queryFn: () => page(peerSym as string), enabled: gold && !!peerSym, retry: false, staleTime: 300_000,
    refetchInterval: (query) => (query.state.error?.status === 503 && query.state.errorUpdateCount < PREPARE_CHECKS ? 20_000 : false) });
  const sf = useIndexFilter(true);
  // the search boxes offer only companies Stress Lab covers (never a bank, an insurer or a company under the size rule): the server's list, kept for the visit; until it has arrived, or if it cannot be had, they offer everything and the page says why for the one that is not covered
  const cov = useQuery<{ symbols: string[] }, ApiError>({ queryKey: ["stress", "covered"], queryFn: () => apiGet("/api/stress/covered"), enabled: silver, retry: false, staleTime: 3_600_000 });
  const coveredSet = useMemo(() => (Array.isArray(cov.data?.symbols) ? new Set(cov.data!.symbols.map((x) => x.toUpperCase())) : null), [cov.data]);
  const covRef = useRef(coveredSet); covRef.current = coveredSet;
  const search = useRef(sf.search); search.current = sf.search;
  const searchCovered = (t: string, skip: readonly string[]) => {
    const set = covRef.current;
    return set ? search.current(t, 40, skip).filter((r: any) => set.has(String(r[0]).toUpperCase())).slice(0, 6) : search.current(t, 6, skip);
  };
  const logos = useLogoMap(), logoRef = useRef(logos); logoRef.current = logos;   // company logos from the site's shared list; a company without one shows its initials
  const host = useRef<HTMLDivElement>(null);
  const data = q.data, peerData = peerQ.data;
  const [drawFailed, setDrawFailed] = useState(false);
  // Gold asked for Compare two and there is no second company yet: why, in words the page shows next to its "Compare with" box (a failed /peer is the same as no peer)
  const peerErr = peerQ.error ? (peerQ.error.status === 503 ? "preparing" : peerQ.error.status === 404 ? "notcovered" : "error") : null;
  const peerReason = peerQ.error?.status === 404 ? String(peerQ.error.body?.detail || "") : "";   // the server's plain words for a company it does not cover
  const peerStatus = !gold || !wantPeer || peerData ? "" : picked ? (peerErr ?? "loading")
    : def.isError || (def.data && !def.data.peer) ? "none" : (peerErr ?? "loading");
  const pickPeer = (s: string) => {
    setPicked(s); setWantPeer(true);
    setSp((prev) => { const n = new URLSearchParams(prev); n.set("with", s); return n; }, { replace: true });   // a reload or a shared link keeps the pair
  };
  const pickRef = useRef(pickPeer); pickRef.current = pickPeer;

  useEffect(() => { host.current?.setAttribute("data-theme", theme); }, [theme, data, sym]);   // the page inside the shadow root has its own light and dark colours
  useEffect(() => { setPicked(withSym); setDrawFailed(false); }, [sym, withSym]);
  useEffect(() => {
    const el = host.current;
    if (!el || !data) return;
    let h: { destroy: () => void } | null = null;
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    try {
      root.innerHTML = `<style>${css}</style>` + skeleton(data.plan === "gold" ? "gold" : "silver", data.disclaimer, data.model, data.as_of, { fxSource: data.today_inputs?.usdinr_source, statement: data.company?.statement });
      const d = JSON.parse(JSON.stringify(data));                          // the page script adds fields to its data: keep the cached copy clean
      const peer = peerData && gold ? { company: JSON.parse(JSON.stringify(peerData.company)), scenarios: peerData.scenarios, history: peerData.history, same_quarter: peerData.company.base_end === data.company.base_end, picked: !picked } : null;
      if (peer && Array.isArray(d.history)) {   // the second company's falls, matched to the same episode (not to the row's position)
        const ps = peer.company.symbol, byEp = new Map<string, any>(((peerData.history || []) as any[]).map((r) => [r.episode, r]));
        d.history = d.history.map((r: any) => (byEp.get(r.episode)?.[ps] !== undefined ? { ...r, [ps]: byEp.get(r.episode)[ps] } : r));
      }
      h = mountStressLab(root, StressEngine, d, {
        view: peer && wantPeer ? "compare" : "single", peer, peerStatus, peerReason, logoUrl: (s: string) => logoRef.current?.get(String(s).toUpperCase()) ?? "",
        search: (t: string) => searchCovered(t, [sym, ...(peerSym ? [peerSym] : [])]), onCompany: (s: string) => nav(`${BASE}/${s}`), onPeer: (s: string) => pickRef.current(s), requestPeer: () => setWantPeer(true),
        onUpgrade: () => upgradeRef.current("gold", "Stress Lab's other scenarios, your own shocks and Compare two are part of Gold."), upgradeUrl: "/plans",
      });
    } catch (e) {   // the data arrived but the page could not be drawn from it: say so in words (never "being prepared", never a blank body) and log it
      console.error(`Stress Lab could not be drawn for ${sym}`, e);
      reportError(e, "render");
      h?.destroy(); root.innerHTML = "";
      setDrawFailed(true);
      return;
    }
    return () => { h?.destroy(); root.innerHTML = ""; };
  }, [data, peerData, wantPeer, picked, gold, sym, nav, !!logos, peerStatus, peerReason, peerSym]);

  // What the reader sees comes only from the status and fixed words: a not-covered company says why in the server's own plain words; every other server fault is "being prepared"
  // (the real reason is in the server log, never on the page). A page whose data arrived but could not be drawn says exactly that, with a reload: the body is never blank.
  const err = q.error, why = err?.status === 404 ? ((err.body?.detail as string) || "") : "";
  const unknown = err?.status === 404 && err.body?.status === "unknown_symbol";   // not a listed company at all: no report or Outlook to point to
  const waiting = silver && (q.isPending || q.isLoading) && !q.isError;
  return (
    <>
      <PageHeader wrap eyebrow="Quant Lab" plan={gold ? "gold" : "silver"} title="Stress Lab" art="chart" links={[{ to: `/stocks/${encodeURIComponent(sym)}`, label: "Company report" }, BASE, "/outlook"]}
        description={<>{data?.company?.name ? <><b>{data.company.name}</b> <span className="mono faint">{sym}</span> · </> : <><span className="mono">{sym}</span> · </>}How a shock would move this company's earnings. Illustrative, not a forecast and not advice.</>} />
      <div className="wrap ol">
        <Gate tier="silver" title="Stress Lab" points={GATE}>
          {waiting ? <div className="ol-skel sl-skel" role="status" aria-busy="true"><div className="sk-lines"><i /><i /><i /><i /><i /></div><p className="muted sl-wait">Loading Stress Lab for {sym}…</p></div>
            : !err && drawFailed ? <section className="card sl-err" role="alert">
              <h2>Stress Lab could not show this page</h2>
              <p className="muted">The figures for {data?.company?.name || sym} arrived, but the page could not be drawn from them. The fault has been logged. Reloading the page usually helps.</p>
              <p className="sl-nc"><button type="button" className="btn primary" onClick={() => location.reload()}>Reload the page</button>{" "}<Link className="btn" to={`/stocks/${encodeURIComponent(sym)}`}>Company report</Link>{" "}<Link className="btn" to={`/outlook/${encodeURIComponent(sym)}`}>Outlook</Link>{" "}<Link className="btn" to={BASE}>Pick another company</Link></p></section>
            : err ? <section className="card sl-err" role="alert">
              <h2>{unknown ? "We could not find that company" : err?.status === 404 ? "Stress Lab does not cover this company yet" : "Stress Lab for this company is being prepared"}</h2>
              <p className="muted">{err?.status === 404 ? why : "Please check back later."}</p>
              {err?.status === 503 && q.errorUpdateCount < PREPARE_CHECKS && <p className="muted sl-recheck" aria-live="polite">This page checks again by itself every 20 seconds, so you can wait here.</p>}
              {err?.status === 404 && !unknown && <p className="muted">{/financial/i.test(why) ? "Banks and lenders earn from interest, not from selling goods, so a fuel, currency or raw-material shock does not describe them. Stress Lab for banks is being built. Until then these pages describe this company:" : "These pages describe this company in the meantime:"}</p>}
              {unknown ? <p className="sl-nc"><Link className="btn primary" to={BASE}>Pick a company</Link></p>
                : <p className="sl-nc"><Link className="btn primary" to={`/stocks/${encodeURIComponent(sym)}`}>Company report</Link>{" "}<Link className="btn" to={`/outlook/${encodeURIComponent(sym)}`}>Outlook</Link>{" "}<Link className="btn" to={BASE}>Pick another company</Link></p>}</section>
            : <div ref={host} className="sl-host" />}
        </Gate>
      </div>
    </>
  );
}
