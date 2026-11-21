// Task #267: Discover's "Earnings calls" and "Results filings" views (/discover/calls, /discover/results, each bucket at /discover/<view>/<slug>). The
// keyword directory's call buckets (8) and results buckets (7), read from each company's newest call transcript and results filing of the last 400 days,
// drawn as the Themes view: a card per bucket with its company count; a bucket's page lists its companies with the sentences that name a keyword and
// hold a figure, the document's date and its exchange link, and the bucket's "What to verify". Data: GET /api/discovery/sources (model.ts useSources).
// Describes what companies said and filed; never a pick.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { SOURCES, VIEW_PATH, bucketPath, fmtDate, short, useSources, type Source, type SrcBucket, type SrcCompany } from "./model";

const PER = 25;
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

function Evidence({ c, doc }: { c: SrcCompany; doc: string }) {
  return <li className="dsc-kd-co" data-src-co={c.symbol}>
    <div className="dsc-kd-h"><Link to={`/stocks/${encodeURIComponent(c.symbol)}`} className="dsc-kd-n">{short(c.company)}</Link><small>{/^\d{6}$/.test(c.symbol) ? "BSE " + c.symbol : c.symbol}</small></div>
    <p className="dsc-kd-kw"><span className="dsc-lab">Keywords named</span> {c.keywords.map((k) => <span key={k} className="dsc-ev">{k}</span>)}</p>
    {c.evidence.length ? <ul className="dsc-kd-ev">{c.evidence.map((s) => <li key={s}>“{s}”</li>)}</ul>
      : <p className="dsc-na">No sentence names one of these keywords with a figure, so there is nothing to quote: the mention alone is not evidence.</p>}
    <p className="dsc-kd-doc">{doc}{c.document.date ? ` of ${fmtDate(c.document.date)}` : ", date not stated"}
      {c.document.link ? <> · <a href={c.document.link} target="_blank" rel="noopener noreferrer">Open the filing ↗</a></> : <> · <span className="dsc-na">the exchange link is not held</span></>}
      {c.tone.label ? ` · Tone of its wording: ${c.tone.label}` : ""}</p>
    {c.verify.length > 0 && <p className="dsc-kd-vf"><span className="dsc-lab">What to verify</span> {c.verify.join(" ")}</p>}
  </li>;
}

/** One bucket: its companies (highest score first), each with its keywords, up to 2 sentences with figures, the document and what to verify. */
export function BucketPage({ src, slug }: { src: Source; slug: string }) {
  const S = SOURCES[src];
  const list = useSources(src);
  const b = list.data?.buckets.find((x) => bucketPath(src, x.name) === `${VIEW_PATH[src]}/${slug}`);
  const one = useSources(b ? src : null, b?.name);
  const [n, setN] = useState(PER), [q, setQ] = useState("");
  const all = useMemo(() => one.data?.buckets.find((x) => x.name === b?.name)?.list ?? [], [one.data, b]);
  const hits = useMemo(() => { const s = q.trim().toLowerCase(); return s ? all.filter((c) => c.company.toLowerCase().includes(s) || c.symbol.toLowerCase().includes(s)) : all; }, [all, q]);
  if (list.data && !b) return <><Crumb src={src} here="Not found" /><p className="dsc-empty">There is no such bucket. <Link to={VIEW_PATH[src]}>See every {S.label.toLowerCase()} bucket</Link>.</p></>;
  return <Status q={list}>{() => <>
    <Crumb src={src} here={b!.label} />
    <div className="dsc-dh"><div><h2>{b!.label}</h2>
      <p>{b!.companies ? <>{plural(b!.companies, "company’s", "companies’")} newest {list.data!.document} {b!.companies === 1 ? "names" : "name"} this bucket’s keywords; {b!.withEvidence.toLocaleString("en-IN")} with a sentence that holds a figure.</>
        : b!.reason}</p></div></div>
    <div className="dsc-two">
      <div className="dsc-panel"><h3>What to verify</h3>
        {b!.verify.length ? <ul>{b!.verify.map((v) => <li key={v}>{v}</li>)}</ul> : <p className="dsc-na">The directory gives no check for this bucket.</p>}
        <p className="dsc-note">A keyword mention by itself is not proof of material business exposure. Check the figures in the filing itself.</p></div>
      <div className="dsc-panel"><h3>Keywords in this bucket</h3><p className="dsc-kd-kw">{b!.keywords.map((k) => <span key={k} className="dsc-ev">{k}</span>)}</p>
        <p className="dsc-note">Each keyword is searched with its related terms from the directory, as whole words.</p></div>
    </div>
    {b!.companies > 0 && <Status q={one}>{() => <section className="dsc-kd-sec" aria-label={"Companies in " + b!.label}>
      <div className="dsc-kd-bar"><h3>Companies</h3>
        <label className="dsc-kd-find"><span className="dsc-lab">Find</span><input type="search" value={q} placeholder="Name or symbol" onChange={(e) => { setQ(e.target.value); setN(PER); }} /></label></div>
      {hits.length ? <ul className="dsc-kd-ls">{hits.slice(0, n).map((c) => <Evidence key={c.symbol} c={c} doc={S.doc} />)}</ul> : <p className="dsc-na">No company in this bucket matches.</p>}
      {hits.length > n && <button type="button" className="dsc-btn" onClick={() => setN((x) => x + PER)}>Show {Math.min(PER, hits.length - n)} more of {hits.length.toLocaleString("en-IN")}</button>}
    </section>}</Status>}
  </>}</Status>;
}

function Crumb({ src, here }: { src: Source; here: string }) {
  return <nav className="dsc-crumb" aria-label="Breadcrumb"><span className="dsc-cr"><Link to={VIEW_PATH[src]}>{SOURCES[src].label}</Link><span aria-hidden="true">›</span></span><span aria-current="page">{here}</span></nav>;
}

