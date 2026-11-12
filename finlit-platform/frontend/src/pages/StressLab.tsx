// Stress Lab (Silver and Gold): how a shock to crude, the rupee, inflation, rates or demand would move one company's earnings over the next 12 months, and two companies side by side (Gold).
// The page is the design team's reference page, drawn in a shadow root (so its own light "paper" styles cannot leak and the site's cannot reach in); the model runs in the browser
// (stress/engine.js, a port of finlit_technicals/stress.py) so the sliders answer at once. The server decides what each plan receives. Information only, never advice (docs/STRESS.md).
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/PageHeader";
import { OutlookPicker } from "../components/OutlookPicker";
import { Gate } from "../components/Gate";
import { useIndexFilter } from "../components/SearchFilters";
import { useLogoMap } from "../components/CoLogo";
import { ApiError, apiGet } from "../lib/api";
import { useUI } from "../lib/ui";
import { useDocTitle } from "../lib/title";
import StressEngine from "../stress/engine";
import { mountStressLab } from "../stress/stressLab";
import { skeleton } from "../stress/skeleton";
import css from "../stress/stresslab.css?inline";

const BASE = "/research/stress-lab";
const GATE = ["How a shock to crude, the rupee, inflation, rates or demand moves a company's earnings, with every assumption shown", "Today's conditions and the past shocks of 2022 and 2020", "Gold adds the other scenarios, your own shocks, your own company settings and Compare two"];
const page = (sym: string) => apiGet<any>(`/api/stress/${encodeURIComponent(sym)}/page`);

export function StressLabIndexPage() {
  useDocTitle("Stress Lab", "See how a shock to crude, the rupee, inflation, interest rates or demand would move a company's earnings over the next 12 months.");
  const { has } = useUI();
  // The quick picks are the six largest covered companies that have a stored page, so every one opens (never a bank, never a company outside the launch list).
  const pq = useQuery<{ picks: { symbol: string; name: string }[] }, ApiError>({ queryKey: ["stress", "quick-picks"], queryFn: () => apiGet("/api/stress/quick-picks"), enabled: has("silver"), retry: false, staleTime: 300_000 });
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
  const { has, theme } = useUI();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const withSym = (sp.get("with") || "").toUpperCase().replace(/[^A-Z0-9&._-]/g, "").slice(0, 24) || null;   // "Stress test" in Peer Compare opens with the two companies picked there
  const silver = has("silver"), gold = has("gold");
  const q = useQuery<any, ApiError>({ queryKey: ["stress", sym], queryFn: () => page(sym), enabled: silver && !!sym, retry: false, staleTime: 300_000 });
  const [wantPeer, setWantPeer] = useState(() => !!withSym || (typeof location !== "undefined" && location.hash.startsWith("#compare")));
  const [picked, setPicked] = useState<string | null>(withSym);
  const def = useQuery<any, ApiError>({ queryKey: ["stress-peer", sym], queryFn: () => apiGet(`/api/stress/${encodeURIComponent(sym)}/peer`), enabled: gold && wantPeer && !picked && !!q.data, retry: false, staleTime: 300_000 });
  const peerSym = picked ?? def.data?.peer?.symbol ?? null;
  const peerQ = useQuery<any, ApiError>({ queryKey: ["stress", peerSym], queryFn: () => page(peerSym as string), enabled: gold && !!peerSym, retry: false, staleTime: 300_000 });
  const sf = useIndexFilter(true);
  const search = useRef(sf.search); search.current = sf.search;
  const logos = useLogoMap(), logoRef = useRef(logos); logoRef.current = logos;   // company logos from the site's shared list; a company without one shows its initials
  const host = useRef<HTMLDivElement>(null);
  const data = q.data, peerData = peerQ.data;
  const [drawFailed, setDrawFailed] = useState(false);

  useEffect(() => { host.current?.setAttribute("data-theme", theme); }, [theme, data, sym]);   // the page inside the shadow root has its own light and dark colours
  useEffect(() => { setPicked(withSym); setDrawFailed(false); }, [sym, withSym]);
  useEffect(() => {
    const el = host.current;
    if (!el || !data) return;
    let h: { destroy: () => void } | null = null;
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    try {
      root.innerHTML = `<style>${css}</style>` + skeleton(data.plan === "gold" ? "gold" : "silver", data.disclaimer, data.model, data.as_of);
      const d = JSON.parse(JSON.stringify(data));                          // the page script adds fields to its data: keep the cached copy clean
      const peer = peerData && gold ? { company: JSON.parse(JSON.stringify(peerData.company)), scenarios: peerData.scenarios, history: peerData.history, same_quarter: peerData.company.base_end === data.company.base_end, picked: !picked } : null;
      if (peer) d.history = d.history.map((r: any, i: number) => ({ ...r, ...(peerData.history?.[i]?.[peer.company.symbol] !== undefined ? { [peer.company.symbol]: peerData.history[i][peer.company.symbol] } : {}) }));
      h = mountStressLab(root, StressEngine, d, {
        view: peer && wantPeer ? "compare" : "single", peer, logoUrl: (s: string) => logoRef.current?.get(String(s).toUpperCase()) ?? "",
        search: (t: string) => search.current(t, 6, [sym]), onCompany: (s: string) => nav(`${BASE}/${s}`), onPeer: (s: string) => { setPicked(s); setWantPeer(true); }, requestPeer: () => setWantPeer(true),
      });
    } catch (e) {   // a page that cannot be drawn says so in words, never a blank body (the fault is in the console and the server log has its own reason)
      console.error("Stress Lab could not be drawn", e);
      setDrawFailed(true);
      return;
    }
    return () => { h?.destroy(); root.innerHTML = ""; };
  }, [data, peerData, wantPeer, picked, gold, sym, nav, !!logos]);

  // What the reader sees comes only from the status and fixed words: a not-covered company says why in the server's own plain words; every other fault is "being prepared"
  // (the real reason is in the server log, never on the page). A page that cannot be drawn gets the same card: the body is never blank.
  const err = q.error, why = err?.status === 404 ? ((err.body?.detail as string) || "") : "";
  const waiting = silver && (q.isPending || q.isLoading) && !q.isError;
  return (
    <>
      <PageHeader wrap eyebrow="Quant Lab" plan={gold ? "gold" : "silver"} title="Stress Lab" art="chart" links={[{ to: `/stocks/${encodeURIComponent(sym)}`, label: "Company report" }, BASE, "/outlook"]}
        description={<>{data?.company?.name ? <><b>{data.company.name}</b> <span className="mono faint">{sym}</span> · </> : <><span className="mono">{sym}</span> · </>}How a shock would move this company's earnings. Illustrative, not a forecast and not advice.</>} />
      <div className="wrap ol">
        <Gate tier="silver" title="Stress Lab" points={GATE}>
          {waiting ? <div className="ol-skel sl-skel" role="status" aria-busy="true"><div className="sk-lines"><i /><i /><i /><i /><i /></div><p className="muted sl-wait">Loading Stress Lab for {sym}…</p></div>
            : err || drawFailed ? <section className="card sl-err" role="alert">
              <h2>{err?.status === 404 ? "Stress Lab does not cover this company yet" : "Stress Lab for this company is being prepared"}</h2>
              <p className="muted">{err?.status === 404 ? why : "Please check back later."}</p>
              {err?.status === 404 && <p className="muted">{/financial/i.test(why) ? "Banks and lenders earn from interest, not from selling goods, so a fuel, currency or raw-material shock does not describe them. Stress Lab for banks is being built. Until then these pages describe this company:" : "These pages describe this company in the meantime:"}</p>}
              <p className="sl-nc"><Link className="btn primary" to={`/stocks/${encodeURIComponent(sym)}`}>Company report</Link>{" "}<Link className="btn" to={`/outlook/${encodeURIComponent(sym)}`}>Outlook</Link>{" "}<Link className="btn" to={BASE}>Pick another company</Link></p></section>
            : <div ref={host} className="sl-host" />}
          {peerQ.error && wantPeer && <p className="ol-note" role="note">{(peerQ.error.body?.detail as string) || "The second company could not be loaded."}</p>}
          {def.data && !def.data.peer && wantPeer && <p className="ol-note" role="note">No peer of this company is covered by Stress Lab yet. Use “Compare with” to search for one.</p>}
        </Gate>
      </div>
    </>
  );
}
