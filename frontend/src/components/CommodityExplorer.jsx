import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cmsRequest } from "@/lib/cms";

const field = "rounded-lg border border-[var(--border-subtle)] bg-[var(--app-bg)] p-3 text-sm";
const fmt = (value) => value == null ? "N/A" : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function CommodityExplorer() {
  const navigate = useNavigate();
  const [category, setCategory] = useState("monthly_index");
  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [reload, setReload] = useState(0);
  const [retryDetail, setRetryDetail] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null); setError("");
    cmsRequest(`/commodities?category=${category}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setCatalog(data); })
      .catch((err) => { if (!controller.signal.aborted) { if (err.status === 401) navigate("/blog/admin/login", { replace: true }); else setError(err.message); } });
    return () => controller.abort();
  }, [category, reload, navigate]);
  useEffect(() => {
    setDetail(null); setDetailError(""); setHistoryPage(0);
    if (!selected) return undefined;
    const controller = new AbortController();
    cmsRequest(`/commodities/${selected.code}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setDetail(data); })
      .catch((err) => { if (!controller.signal.aborted) { if (err.status === 401) navigate("/blog/admin/login", { replace: true }); else setDetailError(err.message); } });
    return () => controller.abort();
  }, [selected, retryDetail, navigate]);
  const matches = useMemo(() => (catalog?.items || []).filter((row) => `${row.name} ${row.code}`.toLowerCase().includes(query.trim().toLowerCase())), [catalog, query]);
  const pages = Math.max(1, Math.ceil(matches.length / 20));
  const current = Math.min(page, pages - 1);
  const historyPages = Math.max(1, Math.ceil((detail?.history.length || 0) / 24));
  return <section aria-label="Commodity prices" className="rounded-xl border border-[var(--border-subtle)] p-4 md:p-6">
    <h2 className="text-2xl font-medium">Commodity prices &amp; trends</h2>
    <p className="mt-2 text-sm text-[var(--home-support)]">Monthly commodity price indices and core industry indices reported by FinEdge. Values are index levels, not ₹ spot prices. Each series shows its latest reported month.</p>
    <div className="my-5 flex flex-wrap gap-3">
      <label className="flex flex-col gap-2 text-xs">Category<select className={field} value={category} onChange={(e) => { setCategory(e.target.value); setSelected(null); setQuery(""); setPage(0); }}><option value="monthly_index">Monthly commodity indices</option><option value="core_infra">Eight core industries</option></select></label>
      <label className="flex flex-1 flex-col gap-2 text-xs">Find a commodity<input className={field} value={query} placeholder="Gold, silver, crude oil, steel…" onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
      <button className={field} onClick={() => { setReload(reload + 1); setRetryDetail(retryDetail + 1); }}>Refresh</button>
    </div>
    {error ? <p role="alert">{error} <button className="underline" onClick={() => setReload(reload + 1)}>Retry</button></p> : !catalog ? <p role="status">Loading commodities…</p> : <>
      <p className="mb-3 text-xs text-[var(--home-support)]">{matches.length} commodities · Source: FinEdge · Fetched {new Date(catalog.fetchedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
      <div className="max-h-80 overflow-auto rounded-lg border border-[var(--border-subtle)]"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Commodity</th><th className="p-3">Code</th><th className="p-3">Price history</th></tr></thead><tbody>{matches.slice(current * 20, current * 20 + 20).map((row) => <tr key={row.code} className="border-t border-[var(--border-subtle)]"><td className="p-3">{row.name}</td><td className="p-3">{row.code}</td><td className="p-3"><button aria-label={`View trends for ${row.name}`} className="text-[var(--home-gold)] underline" onClick={() => setSelected(row)}>{selected?.code === row.code ? "Selected" : "View trends"}</button></td></tr>)}</tbody></table>{!matches.length ? <p className="p-4">No commodities match your search.</p> : null}</div>
      {pages > 1 ? <div className="my-3 flex justify-between text-sm"><button disabled={!current} onClick={() => setPage(current - 1)}>Previous commodities</button><span>{current + 1} / {pages}</span><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next commodities</button></div> : null}
    </>}
    {selected ? <div className="mt-7 border-t border-[var(--border-subtle)] pt-5">
      <h3 className="text-xl">{selected.name}</h3>
      {detailError ? <p role="alert">{detailError} <button className="underline" onClick={() => setRetryDetail(retryDetail + 1)}>Retry history</button></p> : !detail ? <p role="status">Loading commodity history…</p> : <>
        <p className="my-3 text-sm">Latest index: <strong>{fmt(detail.history[0]?.value)}</strong> · {detail.history[0]?.label || "No reported month"} · Source: FinEdge</p>
        <div className="my-4 flex flex-wrap gap-3">{detail.changes.map((row) => <div key={row.period} className={`${field} min-w-24`}><div className="text-xs text-[var(--home-support)]">{row.period}</div><div className={row.value < 0 ? "text-[#C98182]" : row.value > 0 ? "text-[#75B89B]" : ""}>{fmt(row.value)}{row.value == null ? "" : "%"}</div></div>)}</div>
        {detail.changesUnavailable ? <p className="mb-3 text-sm">Percentage changes are temporarily unavailable. The reported history is shown below.</p> : null}
        <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Month</th><th className="p-3">Index level</th></tr></thead><tbody>{detail.history.slice(historyPage * 24, historyPage * 24 + 24).map((row) => <tr key={row.period} className="border-t border-[var(--border-subtle)]"><td className="p-3">{row.label}</td><td className="p-3 tabular-nums">{fmt(row.value)}</td></tr>)}</tbody></table></div>
        {!detail.history.length ? <p>No history reported for this commodity.</p> : null}
        {historyPages > 1 ? <div className="mt-3 flex justify-between text-sm"><button disabled={!historyPage} onClick={() => setHistoryPage(historyPage - 1)}>Newer months</button><span>{historyPage + 1} / {historyPages}</span><button disabled={historyPage + 1 >= historyPages} onClick={() => setHistoryPage(historyPage + 1)}>Older months</button></div> : null}
      </>}
    </div> : <p className="mt-5 text-sm text-[var(--home-support)]">Select a commodity to view its monthly index history and reported percentage changes.</p>}
  </section>;
}
