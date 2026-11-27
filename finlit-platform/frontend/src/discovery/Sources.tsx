// Task #267: Discover's "Earnings calls" and "Results filings" views (founder, 25 Nov 2026: Results filings is no longer shown; /discover/results opens Earnings calls) (/discover/calls, /discover/results, each bucket at /discover/<view>/<slug>). The
// keyword directory's call buckets (8) and results buckets (7), read from each company's newest call transcript and results filing of the last 400 days,
// drawn as the Themes view: a card per bucket with its company count; a bucket's page lists its companies with the sentences that name a keyword and
// hold a figure, the document's date and its exchange link, and the bucket's "What to verify". Data: GET /api/discovery/sources (model.ts useSources).
// Task #303 (developer file 13): a bucket's page is the compact layout: figures in one line, What to verify as a dropdown, the dropdown toolbar and one row
// per company that opens to its sentences, document, keywords and checks.
// Describes what companies said and filed; never a pick.
import { Fragment, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useRotationMap } from "../lib/rotation";
import type { CompanySize } from "../lib/companySize";
import { useDsc } from "./ctx";
import { AboutCompany, Chips, Dd, FSel, Ico, OptList, PopFoot, Search, Seg, Sw, industryItems, pickIndustry, pickSector, sectorItems, sharedChips, sizeItems, unsetShared } from "./Toolbar";
import { MyNames } from "./CompanyTable";
import { BKEYS, BUCKET_SORTS, BUCKET_VIEWS, FILED, NAMED, bucketRows, filterBucket, freshB, sortBucket, type BRow, type BState } from "./bucket";
import { SIZES, SOURCES, VIEW_PATH, bucketPath, codeOf, fmtDate, readT, short, useSources, writeT, type Source, type SrcBucket, type TState } from "./model";
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
      {/* task #291 (the team, 21 Nov 2026: "remove this paragraph and add something like plans coming soon"): the method paragraph above the buckets is
          gone (each empty card still says why); in its place one short line that plans are coming soon and these views are open to everyone for now */}
      <p className="dsc-soon" role="note"><span className="dsc-flg teal">Coming soon</span> Paid plans are coming soon. For now, every earnings-call view here is open to everyone.</p>
      <div className="dsc-grid" aria-label={S.label + " buckets"}>{d.buckets.map((b) => <BucketCard key={b.name} src={src} b={b} />)}</div>
    </>;
  }}</Status>;
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
const toneKey = (t: string | null | undefined) => (t === "Positive" ? "pos" : t === "Negative" ? "neg" : t === "Mixed" ? "mix" : "na");
const dshort = (d: string | null | undefined, now = new Date()) => {
  if (!d) return "Date not stated";
  const x = new Date(d.length === 10 ? d + "T00:00:00" : d);
  if (Number.isNaN(x.getTime())) return "Date not stated";
  return x.getFullYear() === now.getFullYear() ? x.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : x.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

/** Task #303 (developer file 13): one bucket as a compact page. The header with one line of figures and What to verify as a dropdown; the toolbar of every
 *  Discover list (search · Keyword · Sector · Industry · Size · More filters with the quick views and the call's own filters · My names), the chips, the count
 *  and Sort; one row per company (keywords, the first sentence with a figure, filed, tone) that opens to every sentence, the document, the keywords, what to
 *  verify and where the company sits. Task #296's filters and their address keys (kw, named, tone, filed and the shared ones) are unchanged. */
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
  const [exp, setExp] = useState<Set<string>>(new Set());
  const unviewed = useMemo(() => filterBucket(rows, S, B, c.onList, false), [rows, S, B, c]);
  const all = useMemo(() => sortBucket(filterBucket(rows, S, B, c.onList), S.sort), [rows, S, B, c]);
  const pages = Math.max(1, Math.ceil(all.length / S.per)), page = Math.min(S.page, pages - 1);
  const vis = all.slice(page * S.per, (page + 1) * S.per);
  const count = (pb: Partial<BState>, pt: Partial<TState> = {}) => filterBucket(rows, { ...S, ...pt }, { ...B, ...pb }, c.onList).length;
  const cnt = (pt: Partial<TState>) => count({}, pt);
  const tones = useMemo(() => [...new Set(rows.map((r) => r.tone?.label).filter((x): x is string => !!x))].sort((x, y) => (TONE_ORDER.indexOf(x) + 99) % 99 - (TONE_ORDER.indexOf(y) + 99) % 99 || x.localeCompare(y)), [rows]);
  const mine = rows.filter((r) => c.onList(r.s));

  if (list.data && !b0) return <><Crumb src={src} here="Not found" /><p className="dsc-empty">There is no such bucket. <Link to={VIEW_PATH[src]}>See every {S0.label.toLowerCase()} bucket</Link>.</p></>;
  const calls = src === "calls", said = calls ? "What management said" : "What the filing says";

  const chips: [string, string][] = [];
  if (B.kw) chips.push(["b:kw", "Keyword: " + B.kw]);
  if (B.named) chips.push(["b:named", "Keywords named: " + (NAMED.find((x) => x[0] === B.named)?.[1] ?? B.named)]);
  if (B.tone) chips.push(["b:tone", "Tone: " + B.tone]);
  if (B.filed) chips.push(["b:filed", "Filed: " + (FILED.find((x) => x[0] === B.filed)?.[1] ?? B.filed)]);
  chips.push(...sharedChips(S));
  S.lenses.forEach((l) => { const v = BUCKET_VIEWS.find((x) => x.k === l); if (v) chips.push(["lens:" + l, v.t]); });
  const unset = (k: string) => {
    if (k === "all") return write({ size: "", lt: "", pr: "", cn: "", mac: "", sct: "", ind: "", mine: false, q: "", lenses: [], page: 0 }, freshB());
    if (k.startsWith("b:")) return write({ page: 0 }, { [k.slice(2)]: "" });
    const p = unsetShared(k, S); if (p) set(p);
  };
  const sorts = BUCKET_SORTS.filter((x) => !x.gold || c.prismOpen);
  const total = rows.length;
  const moreN = (["lt", "pr", "cn"] as const).filter((k) => S[k]).length + (["named", "tone", "filed"] as const).filter((k) => B[k]).length + S.lenses.length;
  const kws = (r: BRow) => (B.kw && r.keywords.includes(B.kw) ? [B.kw, ...r.keywords.filter((k) => k !== B.kw)] : r.keywords);
  const toggle = (s: string) => setExp((e) => { const n = new Set(e); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  const dates = rows.map((r) => r.document?.date).filter((x): x is string => !!x).sort();

  return <Status q={list}>{() => <>
    <Crumb src={src} here={b!.label} />
    <div className="dsc-dh dw-dh dbx-head"><div className="dbx-ht"><h2>{b!.label}</h2>
      {b!.companies ? <p className="dbx-stats"><span><b>{b!.companies.toLocaleString("en-IN")}</b> {b!.companies === 1 ? "company" : "companies"}</span>
        <span><b>{b!.withEvidence.toLocaleString("en-IN")}</b> quote a figure</span><span><b>{b!.keywords.length}</b> keywords</span>
        {dates.length ? <span>{calls ? "Transcripts" : "Filings"} filed {fmtDate(dates[0])} – {fmtDate(dates[dates.length - 1])}</span> : null}</p>
        : <p>{b!.reason}</p>}</div>
      <div className="dw-ha"><Dd label="What to verify" icon={Ico.list} title="What to verify in this bucket" wide right>{() => <>
        {b!.verify.length ? <ol className="dbx-vl">{b!.verify.map((v) => <li key={v}>{v}</li>)}</ol> : <p className="dbx-pn">The directory gives no check for this bucket.</p>}
        <p className="dbx-pn">A keyword mention by itself is not proof of material business exposure. Check the figures in the filing itself.</p></>}</Dd></div></div>
    {b!.companies > 0 && <Status q={one}>{() => <section className="dw-list dsc-tsec" aria-label={"Companies in " + b!.label}>
      <div className="dbx-bar">
        <Search value={S.q} onChange={(v) => set({ q: v, page: 0 })} />
        <div className="dbx-dds" role="group" aria-label="Filters">
          <Dd label="Keyword" value={B.kw} wide>{(close) => <OptList title="Keyword" items={[{ v: "", t: "Any keyword", c: count({ kw: "" }), sel: !B.kw },
            ...b!.keywords.map((k) => ({ v: k, t: k, c: count({ kw: k }), sel: B.kw === k })).sort((x, y) => y.c - x.c)]} onPick={(v) => { write({ page: 0 }, { kw: v }); close(); }} />}</Dd>
          <Dd label="Sector" value={S.sct || (S.mac ? `All of ${S.mac}` : "")} wide>{(close) => <OptList title="Sector" search items={sectorItems(rows, S, cnt)} onPick={(v) => { set(pickSector(v, rows)); close(); }} />}</Dd>
          <Dd label="Industry" value={S.ind} wide>{(close) => <OptList title="Industry" search items={industryItems(rows, S, cnt)} onPick={(v) => { set(pickIndustry(v, rows)); close(); }} />}</Dd>
          <Dd label="Size" value={S.size ? SIZES[S.size as CompanySize] ?? S.size : ""} wide>{(close) => <OptList title="Size" items={sizeItems(S, cnt)} onPick={(v) => { set({ size: v, page: 0 }); close(); }} />}</Dd>
          <Dd label="More filters" icon={Ico.tune} badge={moreN || null} popCls="dbx-mf">{(close) => <>
            <div className="dbx-mg">
              <div className="dbx-mc"><h4>Quick views</h4>{BUCKET_VIEWS.map((v) => {
                const on = S.lenses.includes(v.k), n = unviewed.filter(v.f).length, gold = !!v.gold && !c.prismOpen;
                return <Sw key={v.k} label={v.t} on={on} n={n} note={gold ? "Gold" : undefined} disabled={!on && (gold || n === 0)}
                  onChange={(x) => set({ lenses: x ? [...S.lenses, v.k] : S.lenses.filter((y) => y !== v.k), page: 0 })} />;
              })}</div>
              <div className="dbx-mc"><h4>{calls ? "In the call" : "In the filing"}</h4>
                <Seg label="Keywords named" value={B.named} opts={[["", "Any"], ...NAMED.map(([k]) => [k, `${k}+`] as [string, string])]} count={(v) => count({ named: v })} onChange={(v) => write({ page: 0 }, { named: v })} />
                <Seg label="Filed" value={B.filed} opts={[["", "Any time"], ["d7", "7 days"], ["d30", "30 days"], ["old", "Older"]]} count={(v) => count({ filed: v })} onChange={(v) => write({ page: 0 }, { filed: v })} />
                <FSel label="Tone of its wording" value={B.tone} any="Any tone" opts={tones.map((t) => [t, t] as [string, string])} count={(v) => count({ tone: v })} onChange={(v) => write({ page: 0 }, { tone: v })} />
              </div>
              <div className="dbx-mc"><h4>About the company</h4><AboutCompany S={S} set={set} cnt={cnt} prismOpen={c.prismOpen} /></div>
            </div>
            <PopFoot n={all.length} clear={() => write({ lt: "", pr: "", cn: "", lenses: [], page: 0 }, { named: "", tone: "", filed: "" })} close={close} /></>}</Dd>
          <MyNames S={S} set={set} mine={mine} />
        </div>
      </div>
      <Chips chips={chips} unset={unset} />
      <div className="dbx-rbar"><span className="dbx-cnt dsc-cnt" aria-live="polite">{all.length === total ? <><b>{total.toLocaleString("en-IN")}</b> {total === 1 ? "company" : "companies"}</>
        : <><b>{all.length.toLocaleString("en-IN")}</b> of {total.toLocaleString("en-IN")} {total === 1 ? "company" : "companies"}</>}</span>
        <div className="dbx-sortd"><span className="dbx-sl">Sort</span><Dd label={(BUCKET_SORTS.find((x) => x.k === S.sort) ?? BUCKET_SORTS[0]).t} title="Sort by" right>{(close) => <OptList title="Sort by"
          items={sorts.map((x) => ({ v: x.k, t: x.t, sel: S.sort === x.k }))} onPick={(v) => { set({ sort: v, page: 0 }); close(); }} />}</Dd></div></div>
      {vis.length ? <div className="dsc-tw dbx-tw"><table className="dbx-t"><thead><tr><th scope="col" className="dbx-c1">Company</th><th scope="col" className="dbx-c2">Keywords</th>
        <th scope="col" className="dbx-c3">{said}</th><th scope="col" className="dbx-c4">Filed</th><th scope="col" className="dbx-c5">Tone</th><th scope="col" className="dbx-c6"><span className="sr-only">Details</span></th></tr></thead>
        <tbody>{vis.map((r) => { const open = exp.has(r.s), k = kws(r); return <Fragment key={r.s}>
          <tr className={"dbx-r" + (open ? " open" : "")} data-src-co={r.s} onClick={(e) => { if (!(e.target as HTMLElement).closest("a, button")) toggle(r.s); }}>
            <td className="dbx-c1"><Link className="dbx-co" to={`/stocks/${encodeURIComponent(r.s)}`}>{short(r.company)}</Link>
              {c.isHeld(r.s) && <span className="dsc-tag pf">Portfolio</span>}{c.isWatched(r.s) && <span className="dsc-tag wl">Watchlist</span>}
              <span className="dbx-sub">{[codeOf(r.s), r.ind ?? r.sct].filter(Boolean).join(" · ")}</span></td>
            <td className="dbx-c2"><span className="dbx-kn" title="Keywords named">{r.distinct ?? r.keywords.length}</span><span className="dbx-kt"><span className={B.kw ? "hit" : undefined}>{k[0] ?? ""}</span>
              {k.length > 1 ? <span className="dbx-more"> +{k.length - 1}</span> : null}</span></td>
            <td className="dbx-c3">{r.evidence.length ? <p className="dbx-quote">“{r.evidence[0]}”</p> : <p className="dbx-quote none">No sentence with a figure</p>}</td>
            <td className="dbx-c4"><time title={fmtDate(r.document?.date) || undefined}>{dshort(r.document?.date)}</time></td>
            <td className="dbx-c5">{r.tone?.label ? <span className="dbx-tone" data-t={toneKey(r.tone.label)}>{r.tone.label}</span> : <span className="dsc-na" title="The document has too few finance words to read its tone">Not read</span>}</td>
            <td className="dbx-c6"><button type="button" className="dbx-exp" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} details for ${short(r.company)}`} onClick={() => toggle(r.s)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></td>
          </tr>
          {open && <tr className="dbx-d"><td colSpan={6}><Details r={r} said={said} doc={S0.doc} kw={B.kw} /></td></tr>}
        </Fragment>; })}</tbody></table></div>
        : <div className="dbx-empty"><p>No company matches these filters. Remove one or two above.</p><button type="button" className="dbx-done" onClick={() => unset("all")}>Clear all filters</button></div>}
      <div className="dsc-pager"><span>{all.length ? `${(page * S.per + 1).toLocaleString("en-IN")}–${Math.min(all.length, (page + 1) * S.per).toLocaleString("en-IN")} of ${all.length.toLocaleString("en-IN")}` : ""}</span>
        <span className="dsc-pgr"><label>Rows <select aria-label="Rows per page" value={S.per} onChange={(e) => set({ per: Number(e.target.value), page: 0 })}>{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label>
          <button type="button" className="dsc-btn" disabled={!page} onClick={() => set({ page: page - 1 })}>← Previous</button>
          <button type="button" className="dsc-btn" disabled={page >= pages - 1} onClick={() => set({ page: page + 1 })}>Next →</button></span></div>
    </section>}</Status>}
  </>}</Status>;
}

/** A row's details: every sentence with a figure, the document and its link, the keywords named, what to verify, and where the company sits. */
function Details({ r, said, doc, kw }: { r: BRow; said: string; doc: string; kw: string }) {
  const c = useDsc();
  return <div className="dbx-dg">
    <div className="dbx-dm"><h4>{said}</h4>
      {r.evidence.length ? <ul className="dbx-ql">{r.evidence.map((e) => <li key={e}>“{e}”</li>)}</ul>
        : <p className="dbx-na">No sentence names one of these keywords with a figure, so there is nothing to quote: the mention alone is not evidence.</p>}
      <div className="dbx-doc"><span>{doc}{r.document?.date ? ` of ${fmtDate(r.document.date)}` : ", date not stated"}{r.document?.pages ? ` · ${r.document.pages} pages` : ""}
        {r.tone?.label ? ` · Tone of its wording: ${r.tone.label}` : ""}</span>
        {r.document?.link ? <a className="dbx-open" href={r.document.link} target="_blank" rel="noopener noreferrer">Open the filing ↗</a> : <span className="dsc-na">the exchange link is not held</span>}</div></div>
    <div className="dbx-ds"><h4>Keywords named <span className="dbx-dn">{r.distinct ?? r.keywords.length} · {r.mentions ?? 0} mentions</span></h4>
      <p className="dbx-kws">{r.keywords.map((k) => <span key={k} className={"dbx-kw" + (k === kw ? " hit" : "")} data-on={k === kw || undefined}>{k}</span>)}</p>
      {r.verify.length > 0 && <><h4>What to verify</h4><ul className="dbx-vf">{r.verify.map((v) => <li key={v}>{v}</li>)}</ul></>}
      <dl className="dbx-facts"><div><dt>Sector</dt><dd>{[r.sct, r.ind].filter(Boolean).join(" › ") || "Not classified"}</dd></div>
        <div><dt>Size</dt><dd>{r.sz ? SIZES[r.sz] : "Not known"}</dd></div>
        <div><dt>Long-term trend</dt><dd>{r.lt ?? (c.prismOpen ? "Not rated" : "Part of Gold")}</dd></div>
        <div><dt>FinLit Prism</dt><dd>{r.pl ? `${r.pl}${r.pr != null ? " · " + r.pr : ""}` : c.prismOpen ? "Not rated" : "Part of Gold"}</dd></div></dl></div>
  </div>;
}

function Crumb({ src, here }: { src: Source; here: string }) {
  return <nav className="dsc-crumb" aria-label="Breadcrumb"><span className="dsc-cr"><Link to={VIEW_PATH[src]}>{SOURCES[src].label}</Link><span aria-hidden="true">›</span></span><span aria-current="page">{here}</span></nav>;
}

