// Task #267: Discover's "Earnings calls" and "Results filings" views (/discover/calls, /discover/results, each bucket at /discover/<view>/<slug>). The
// keyword directory's call buckets (8) and results buckets (7), read from each company's newest call transcript and results filing of the last 400 days,
// drawn as the Themes view: a card per bucket with its company count; a bucket's page lists its companies with the sentences that name a keyword and
// hold a figure, the document's date and its exchange link, and the bucket's "What to verify". Data: GET /api/discovery/sources (model.ts useSources).
// Describes what companies said and filed; never a pick.
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useRotationMap } from "../lib/rotation";
import type { CompanySize } from "../lib/companySize";
import { useDsc } from "./ctx";
import { ActiveChips, FilterCard, Sel } from "./FilterCard";
import { BKEYS, BUCKET_SORTS, BUCKET_VIEWS, FILED, NAMED, bucketRows, filterBucket, freshB, sortBucket, type BRow, type BState } from "./bucket";
import { ARROW, CORNERS, SIZES, SOURCES, VIEW_PATH, bucketPath, fmtDate, linkFilters, readT, short, treeOf, useSources, writeT, type Source, type SrcBucket, type TState } from "./model";
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

function Status({ q, children }: { q: { isError: boolean; data?: unknown }; children: () => React.ReactNode }) {
  if (q.isError) return <p className="dsc-empty" role="alert">This view could not be loaded just now. Please try again in a moment.</p>;
  if (!q.data) return <p className="dsc-empty" aria-busy="true">Loading…</p>;
  return <>{children()}</>;
}

function BucketCard({ src, b }: { src: Source; b: SrcBucket }) {
  return <Link className={"dsc-cd" + (b.companies ? "" : " dashed")} to={bucketPath(src, b.name)} data-src-bucket={b.name}>
    <div className="dsc-top"><h3>{b.label}</h3></div>
    <div className="n">{b.companies.toLocaleString("en-IN")}<small>{b.companies === 1 ? "company" : "companies"}</small></div>
    {b.companies ? <p className="dsc-kd-l">{plural(b.withEvidence, "with a sentence that holds a figure", "with a sentence that holds a figure")}</p>
      : <p className="dsc-kd-l dsc-kd-why">{b.reason}</p>}
    <div className="dsc-ex">{b.preview?.length ? b.preview.map(short).join(", ") : `${b.keywords.length} keywords in this bucket`}</div>
  </Link>;
}

/** The Earnings calls or Results filings view: one card per bucket of the directory, in its order. */
export function SourcesView({ src }: { src: Source }) {
  const q = useSources(src), S = SOURCES[src];
  return <Status q={q}>{() => {
    const d = q.data!;
    return <>
      {/* task #291 (the team, 21 Nov 2026: "remove this paragraph"): the method paragraph above the buckets is gone; each empty card still says why */}
      <div className="dsc-grid" aria-label={S.label + " buckets"}>{d.buckets.map((b) => <BucketCard key={b.name} src={src} b={b} />)}</div>
    </>;
  }}</Status>;
}

function Evidence({ c, doc, kw }: { c: BRow; doc: string; kw: string }) {
  const where = [c.sct, c.ind, c.sz ? "Size: " + SIZES[c.sz] : null].filter(Boolean).join(" · ");
  return <li className="dsc-kd-co" data-src-co={c.symbol}>
    <div className="dsc-kd-h"><Link to={`/stocks/${encodeURIComponent(c.symbol)}`} className="dsc-kd-n">{short(c.company)}</Link><small>{/^\d{6}$/.test(c.symbol) ? "BSE " + c.symbol : c.symbol}</small></div>
    {where ? <p className="dsc-kd-l dsc-kd-where">{where}</p> : null}
    <p className="dsc-kd-kw"><span className="dsc-lab">Keywords named</span> {c.keywords.map((k) => <span key={k} className="dsc-ev" data-on={k === kw || undefined}>{k}</span>)}</p>
    {c.evidence.length ? <ul className="dsc-kd-ev">{c.evidence.map((s) => <li key={s}>“{s}”</li>)}</ul>
      : <p className="dsc-na">No sentence names one of these keywords with a figure, so there is nothing to quote: the mention alone is not evidence.</p>}
    <p className="dsc-kd-doc">{doc}{c.document.date ? ` of ${fmtDate(c.document.date)}` : ", date not stated"}
      {c.document.link ? <> · <a href={c.document.link} target="_blank" rel="noopener noreferrer">Open the filing ↗</a></> : <> · <span className="dsc-na">the exchange link is not held</span></>}
      {c.tone.label ? ` · Tone of its wording: ${c.tone.label}` : ""}</p>
    {c.verify.length > 0 && <p className="dsc-kd-vf"><span className="dsc-lab">What to verify</span> {c.verify.join(" ")}</p>}
  </li>;
}

/** The page state in the address: the shared keys (readT / writeT) and the bucket's own (kw, named, tone, filed); views and sorts of the bucket's own. */
function useBucketState() {
  const loc = useLocation(), nav = useNavigate();
  const sp = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  const S = useMemo(() => {
    const t = readT(sp, "best");
    t.lenses = (sp.get("v") ?? "").split(",").filter((x) => BUCKET_VIEWS.some((v) => v.k === x));
    if (!BUCKET_SORTS.some((x) => x.k === t.sort)) t.sort = "best";
    return t;
  }, [sp]);
  const B = useMemo(() => { const b = freshB(); for (const k of BKEYS) b[k] = sp.get(k) ?? ""; return b; }, [sp]);
  const write = (pt: Partial<TState>, pb: Partial<BState> = {}) => {
    const next = writeT({ ...S, ...pt }, "best"), nb = { ...B, ...pb };
    for (const k of BKEYS) if (nb[k]) next.set(k, nb[k]);
    const q = next.toString();
    nav({ pathname: loc.pathname, search: q ? "?" + q : "" }, { replace: true });
  };
  return { S, B, write };
}

const TONE_ORDER = ["Positive", "Mixed", "Neutral", "Negative"];

/** One bucket: the filter card every Discover list has (task #296), its own row (keyword, keywords named, tone, filed), sort and pages; each company with
 *  where it sits, its keywords (the one picked is marked), up to 2 sentences with figures, the document and what to verify. */
export function BucketPage({ src, slug }: { src: Source; slug: string }) {
  const S0 = SOURCES[src], c = useDsc();
  const list = useSources(src);
  const b0 = list.data?.buckets.find((x) => bucketPath(src, x.name) === `${VIEW_PATH[src]}/${slug}`);
  const one = useSources(b0 ? src : null, b0?.name);
  const rot = useRotationMap();
  // the header reads the bucket's own answer once it is in, so the count and the list always agree (the landing summary can be older)
  const b = one.data?.buckets.find((x) => x.name === b0?.name) ?? b0;
  const rows = useMemo(() => bucketRows(b?.list ?? [], c.d.uni, rot.data?.rows), [b, c.d.uni, rot.data]);
  const { S, B, write } = useBucketState();
  const set = (p: Partial<TState>) => write(p);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 5000); return () => clearTimeout(t); }, [note]);
  const tree = useMemo(() => treeOf(rows), [rows]);
  const unviewed = useMemo(() => filterBucket(rows, S, B, c.onList, false), [rows, S, B, c]);
  const all = useMemo(() => sortBucket(filterBucket(rows, S, B, c.onList), S.sort), [rows, S, B, c]);
  const pages = Math.max(1, Math.ceil(all.length / S.per)), page = Math.min(S.page, pages - 1);
  const vis = all.slice(page * S.per, (page + 1) * S.per);
  const count = (pb: Partial<BState>, pt: Partial<TState> = {}) => filterBucket(rows, { ...S, ...pt }, { ...B, ...pb }, c.onList).length;
  const kwCount = (k: string) => count({ kw: k });
  // the NSE levels of this list, linked as on every Discover list
  const macs = useMemo(() => [...new Set(rows.map((r) => r.mac).filter((x): x is string => !!x))].sort(), [rows]);
  const scts = useMemo(() => [...new Set(rows.filter((r) => !S.mac || r.mac === S.mac).map((r) => r.sct).filter((x): x is string => !!x))].sort(), [rows, S.mac]);
  const inds = useMemo(() => [...new Set(rows.filter((r) => (!S.mac || r.mac === S.mac) && (!S.sct || r.sct === S.sct)).map((r) => r.ind).filter((x): x is string => !!x))].sort(), [rows, S.mac, S.sct]);
  const cnt = (k: "mac" | "sct" | "ind", v: string) => count({}, { [k]: v, ...(k === "mac" ? { sct: "", ind: "" } : k === "sct" ? { ind: "" } : {}) });
  const setNse = (k: "mac" | "sct" | "ind", v: string) => {
    const l = linkFilters({ mac: S.mac, sct: S.sct, ind: S.ind, [k]: v }, tree);
    if (l.dropped) setNote(l.dropped);
    set({ mac: l.mac, sct: l.sct, ind: l.ind, page: 0 });
  };
  const tones = useMemo(() => [...new Set(rows.map((r) => r.tone?.label).filter((x): x is string => !!x))].sort((x, y) => (TONE_ORDER.indexOf(x) + 99) % 99 - (TONE_ORDER.indexOf(y) + 99) % 99 || x.localeCompare(y)), [rows]);
  const yours = rows.filter((r) => c.onList(r.s));

  if (list.data && !b0) return <><Crumb src={src} here="Not found" /><p className="dsc-empty">There is no such bucket. <Link to={VIEW_PATH[src]}>See every {S0.label.toLowerCase()} bucket</Link>.</p></>;
  const inDoc = src === "calls" ? "In the call" : "In the filing", docSub = src === "calls" ? "newest transcript" : "newest results filing";
  const extra = b && b.companies > 0 && <div className="dsc-frow" role="group" aria-labelledby="dsc-fh-doc"><div className="dsc-fh" id="dsc-fh-doc">{inDoc} <small>{docSub}</small></div>
    <Sel label="Keyword" info="kw" value={B.kw} opts={[["", "Any keyword"], ...b.keywords.map((k) => [k, `${k} (${kwCount(k)})`] as [string, string])]} onChange={(v) => write({ page: 0 }, { kw: v })} />
    <Sel label="Keywords named" info="named" value={B.named} opts={[["", "Any number"], ...NAMED.map(([k, t]) => [k, `${t} (${count({ named: k })})`] as [string, string])]} onChange={(v) => write({ page: 0 }, { named: v })} />
    <Sel label="Tone of its wording" info="wtone" value={B.tone} opts={[["", "Any tone"], ...tones.map((k) => [k, `${k} (${count({ tone: k })})`] as [string, string])]} onChange={(v) => write({ page: 0 }, { tone: v })} />
    <Sel label="Filed" info="filed" value={B.filed} opts={[["", "Any date"], ...FILED.map(([k, t]) => [k, `${t} (${count({ filed: k })})`] as [string, string])]} onChange={(v) => write({ page: 0 }, { filed: v })} />
  </div>;

  const chips: [string, string][] = [];
  if (B.kw) chips.push(["b:kw", "Keyword: " + B.kw]);
  if (B.named) chips.push(["b:named", "Keywords named: " + (NAMED.find((x) => x[0] === B.named)?.[1] ?? B.named)]);
  if (B.tone) chips.push(["b:tone", "Tone: " + B.tone]);
  if (B.filed) chips.push(["b:filed", "Filed: " + (FILED.find((x) => x[0] === B.filed)?.[1] ?? B.filed)]);
  const lab: Record<string, string> = { size: "Size", lt: "Long-term trend", pr: "Prism", mac: "Macro sector", sct: "Sector", ind: "Industry", cn: "Sector Rotation" };
  (["size", "lt", "pr", "mac", "sct", "ind", "cn"] as const).forEach((k) => {
    if (!S[k]) return;
    const v = k === "size" ? SIZES[S[k] as CompanySize] ?? S[k] : k === "cn" ? `${ARROW[S[k] as keyof typeof ARROW] ?? ""} ${CORNERS[S[k] as keyof typeof CORNERS] ?? S[k]}` : S[k] === "none" ? "Not rated" : S[k];
    chips.push([k, `${lab[k]}: ${v}`]);
  });
  if (S.mine) chips.push(["mine", "Only my names"]);
  if (S.q) chips.push(["q", `“${S.q}”`]);
  S.lenses.forEach((l) => chips.push(["lens:" + l, BUCKET_VIEWS.find((x) => x.k === l)!.t]));
  const unset = (k: string) => {
    if (k === "all") return write({ size: "", lt: "", pr: "", cn: "", mac: "", sct: "", ind: "", mine: false, q: "", lenses: [], page: 0 }, freshB());
    if (k.startsWith("b:")) return write({ page: 0 }, { [k.slice(2)]: "" });
    if (k.startsWith("lens:")) return set({ lenses: S.lenses.filter((x) => x !== k.slice(5)), page: 0 });
    if (k === "mine") return set({ mine: false, page: 0 });
    if (k === "mac") return set({ mac: "", sct: "", ind: "", page: 0 });
    if (k === "sct") return set({ sct: "", ind: "", page: 0 });
    set({ [k]: "", page: 0 } as Partial<TState>);
  };
  const sorts = BUCKET_SORTS.filter((x) => !x.gold || c.prismOpen);
  const total = rows.length;

  return <Status q={list}>{() => <>
    <Crumb src={src} here={b!.label} />
    <div className="dsc-dh"><div><h2>{b!.label}</h2>
      <p>{b!.companies ? <>{plural(b!.companies, "company’s", "companies’")} newest {list.data!.document} {b!.companies === 1 ? "names" : "name"} this bucket’s keywords; {b!.withEvidence.toLocaleString("en-IN")} with a sentence that holds a figure.</>
        : b!.reason}</p></div></div>
    <div className="dsc-two">
      <div className="dsc-panel"><h3>What to verify</h3>
        {b!.verify.length ? <ul>{b!.verify.map((v) => <li key={v}>{v}</li>)}</ul> : <p className="dsc-na">The directory gives no check for this bucket.</p>}
        <p className="dsc-note">A keyword mention by itself is not proof of material business exposure. Check the figures in the filing itself.</p></div>
      <div className="dsc-panel"><h3>Keywords in this bucket</h3>
        {rows.length ? <><p className="dsc-kd-kw" role="group" aria-label="Keywords in this bucket">{b!.keywords.map((k) => { const n = kwCount(k), on = B.kw === k;
          return <button key={k} type="button" className="dsc-ev" aria-pressed={on} disabled={!n && !on} onClick={() => write({ page: 0 }, { kw: on ? "" : k })}>{k}<span className="dsc-c">{n.toLocaleString("en-IN")}</span></button>; })}</p>
          <p className="dsc-note">The number is how many companies in this list name it, given your filters. Tap a keyword to list only those companies. Each keyword is searched with its related terms from the directory, as whole words.</p></>
          : <><p className="dsc-kd-kw">{b!.keywords.map((k) => <span key={k} className="dsc-ev">{k}</span>)}</p>
            <p className="dsc-note">Each keyword is searched with its related terms from the directory, as whole words.</p></>}</div>
    </div>
    {b!.companies > 0 && <Status q={one}>{() => <section className="dsc-kd-sec dsc-tsec" aria-label={"Companies in " + b!.label}>
      <div className="dsc-secth"><h3>Companies</h3></div>
      {yours.length > 0 && <div className="dsc-yh"><span>Yours here (★ watchlist):</span>{yours.map((r) => (
        <button key={r.s} type="button" className="dsc-chip" onClick={() => set({ q: r.n, page: 0 })}>{r.n}{c.isHeld(r.s) ? "" : " ★"}</button>))}</div>}
      <FilterCard S={S} set={set} prismOpen={c.prismOpen} signedIn={c.signedIn} hideStage extra={extra}
        views={BUCKET_VIEWS.map((v) => ({ k: v.k, t: v.t, n: unviewed.filter(v.f).length, gold: !!v.gold && !c.prismOpen }))}
        nse={{ macs, scts, inds, cnt, set: setNse }} />
      {note && <p className="dsc-taken" role="status">{note}</p>}
      <ActiveChips chips={chips} unset={unset} />
      <div className="dsc-rhead"><span className="dsc-cnt" aria-live="polite">{all.length === total ? plural(total, "company", "companies") : `${all.length.toLocaleString("en-IN")} of ${plural(total, "company", "companies")}`}</span>
        <label className="dsc-sortl">Sort by <select aria-label="Sort by" value={S.sort} onChange={(e) => set({ sort: e.target.value, page: 0 })}>{sorts.map((x) => <option key={x.k} value={x.k}>{x.t}</option>)}</select></label></div>
      {vis.length ? <ul className="dsc-kd-ls">{vis.map((r) => <Evidence key={r.symbol} c={r} doc={S0.doc} kw={B.kw} />)}</ul> : <p className="dsc-empty">No company matches these filters. Remove one or two above.</p>}
      <div className="dsc-pager"><span>{all.length ? `${(page * S.per + 1).toLocaleString("en-IN")}–${Math.min(all.length, (page + 1) * S.per).toLocaleString("en-IN")} of ${all.length.toLocaleString("en-IN")}` : ""}</span>
        <span className="dsc-pgr"><label>Rows <select aria-label="Rows per page" value={S.per} onChange={(e) => set({ per: Number(e.target.value), page: 0 })}>{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label>
          <button type="button" className="dsc-btn" disabled={!page} onClick={() => set({ page: page - 1 })}>← Previous</button>
          <button type="button" className="dsc-btn" disabled={page >= pages - 1} onClick={() => set({ page: page + 1 })}>Next →</button></span></div>
    </section>}</Status>}
  </>}</Status>;
}

function Crumb({ src, here }: { src: Source; here: string }) {
  return <nav className="dsc-crumb" aria-label="Breadcrumb"><span className="dsc-cr"><Link to={VIEW_PATH[src]}>{SOURCES[src].label}</Link><span aria-hidden="true">›</span></span><span aria-current="page">{here}</span></nav>;
}

