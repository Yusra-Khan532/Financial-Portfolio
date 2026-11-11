// Stress Lab (Silver and Gold): how a shock to crude, the rupee, inflation, rates or demand would move one company's earnings over the next 12 months, and two companies side by side (Gold).
// The page is the design team's reference page, drawn in a shadow root (so its own light "paper" styles cannot leak and the site's cannot reach in); the model runs in the browser
// (stress/engine.js, a port of finlit_technicals/stress.py) so the sliders answer at once. The server decides what each plan receives. Information only, never advice (docs/STRESS.md).
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/PageHeader";
import { OutlookPicker } from "../components/OutlookPicker";
import { Gate } from "../components/Gate";
import { useIndexFilter } from "../components/SearchFilters";
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
  return (
    <>
      <PageHeader wrap plan={has("gold") ? "gold" : "silver"} title="Stress Lab" art="chart" links={["/outlook", "/dcf", "/research"]}
        description={<>See how a shock to <b>crude, the rupee, inflation, interest rates or demand</b> would move a company's earnings over the next 12 months, under assumptions you can see. Illustrative, not a forecast and not advice.</>} />
      <div className="wrap ol"><OutlookPicker intro base={BASE} introText={<>Pick a large or mid cap that is not a bank, NBFC or insurer. Stress Lab starts from its last four reported quarters, applies the shock you choose, and shows what happens to earnings per share, interest cover and an earnings-based value, with every assumption and its source.</>} /></div>
    </>
  );
}

export function StressLabPage() {
  const { symbol = "" } = useParams();
  const sym = symbol.toUpperCase();
  useDocTitle(`${sym} Stress Lab`, "How a shock to crude, the rupee, inflation, interest rates or demand would move this company's earnings. Illustrative, not a forecast and not advice.");
  const { has } = useUI();
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
  const host = useRef<HTMLDivElement>(null);
  const data = q.data, peerData = peerQ.data;

  useEffect(() => { setPicked(withSym); }, [sym, withSym]);
  useEffect(() => {
    const el = host.current;
    if (!el || !data) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${css}</style>` + skeleton(data.plan === "gold" ? "gold" : "silver", data.disclaimer, data.model, data.as_of);
    const d = JSON.parse(JSON.stringify(data));                          // the page script adds fields to its data: keep the cached copy clean
    const peer = peerData && gold ? { company: JSON.parse(JSON.stringify(peerData.company)), scenarios: peerData.scenarios, history: peerData.history, same_quarter: peerData.company.base_end === data.company.base_end, picked: !picked } : null;
    if (peer) d.history = d.history.map((r: any, i: number) => ({ ...r, ...(peerData.history?.[i]?.[peer.company.symbol] !== undefined ? { [peer.company.symbol]: peerData.history[i][peer.company.symbol] } : {}) }));
    const h = mountStressLab(root, StressEngine, d, {
      view: peer && wantPeer ? "compare" : "single", peer, logoUrl: () => "",
      search: (t: string) => search.current(t, 6, [sym]), onCompany: (s: string) => nav(`${BASE}/${s}`), onPeer: (s: string) => { setPicked(s); setWantPeer(true); }, requestPeer: () => setWantPeer(true),
    });
    return () => { h.destroy(); root.innerHTML = ""; };
  }, [data, peerData, wantPeer, picked, gold, sym, nav]);

  const err = q.error, why = (err?.body?.detail as string) || "";
  return (
    <>
      <PageHeader wrap plan={gold ? "gold" : "silver"} title="Stress Lab" art="chart" links={[{ to: `/stocks/${encodeURIComponent(sym)}`, label: "Company report" }, BASE, "/outlook"]}
        description={<>{data?.company?.name ? <><b>{data.company.name}</b> <span className="mono faint">{sym}</span> · </> : <><span className="mono">{sym}</span> · </>}How a shock would move this company's earnings. Illustrative, not a forecast and not advice.</>} />
      <div className="wrap ol">
        <OutlookPicker current={sym} base={BASE} />
        <Gate tier="silver" title="Stress Lab" points={GATE}>
          {q.isLoading ? <div className="ol-skel" aria-busy="true" aria-label="Loading Stress Lab"><div className="sk-lines"><i /><i /><i /><i /><i /></div></div>
            : err ? <section className="card" role="alert"><h2>{err.status === 404 ? "Stress Lab does not cover this company yet" : err.status === 503 ? "Stress Lab is getting ready for this company" : "Stress Lab is unavailable right now"}</h2>
              <p className="muted">{why || "Please try again in a moment."}</p></section>
            : <div ref={host} className="sl-host" />}
          {peerQ.error && wantPeer && <p className="ol-note" role="note">{(peerQ.error.body?.detail as string) || "The second company could not be loaded."}</p>}
          {def.data && !def.data.peer && wantPeer && <p className="ol-note" role="note">No peer of this company is covered by Stress Lab yet. Use “Compare with” to search for one.</p>}
        </Gate>
      </div>
    </>
  );
}
