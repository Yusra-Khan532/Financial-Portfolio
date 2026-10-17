import { useRef, useState } from "react";
import { cmsRequest } from "@/lib/cms";
import suggestions from "@/data/companyClassifications.json";

const PAGE_SIZE = 20;

export function filterCompanies(items, filter) {
  const needle = filter.trim().toLowerCase();
  return items.filter((item) => `${item.name || ""} ${item.symbol || ""}`.toLowerCase().includes(needle));
}

export default function CompanyBrowser({ profile, onOpen, onAuthError }) {
  const [expanded, setExpanded] = useState(true);
  const [group, setGroup] = useState("industry");
  const [value, setValue] = useState("");
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const options = [...new Set([...(suggestions[group] || []), profile?.[group]].filter(Boolean))].sort();
  const filtered = filterCompanies(result?.items || [], filter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);

  const reset = () => {
    sequence.current += 1;
    setResult(null);
    setError("");
    setLoading(false);
    setFilter("");
    setPage(0);
  };

  const search = async (searchGroup = group, searchValue = value) => {
    const category = searchValue.trim();
    if (!category) return;
    const requestId = ++sequence.current;
    setExpanded(true);
    setGroup(searchGroup);
    setValue(category);
    setLoading(true);
    setError("");
    setResult(null);
    setFilter("");
    setPage(0);
    try {
      const params = new URLSearchParams({ group: searchGroup, value: category });
      const response = await cmsRequest(`/stocks/admin/fundamentals/browse?${params}`);
      if (requestId === sequence.current) setResult(response);
    } catch (requestError) {
      if (requestId !== sequence.current) return;
      if (requestError.status === 401) onAuthError();
      else setError(requestError.message || "Companies could not be loaded. Please try again.");
    } finally {
      if (requestId === sequence.current) setLoading(false);
    }
  };

  return (
    <section className="mt-3 border border-[#233650] bg-[#030914] p-3" aria-label="Company discovery">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" aria-expanded={expanded} aria-controls="company-browser" onClick={() => setExpanded(!expanded)} className="border border-[#40546E] px-4 py-2 font-mono text-xs uppercase tracking-[.1em] text-[#F5A623] hover:border-[#F5A623]">
          {expanded ? "Close company browser" : "Browse companies"}
        </button>
        {profile?.sector || profile?.industry ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
            <span>Explore this company’s:</span>
            {["sector", "industry"].filter((key) => profile?.[key]).map((key) => (
              <button type="button" key={key} onClick={() => search(key, profile[key])} className="border border-[#233650] px-2 py-1 text-[#CBD5E1] hover:border-[#F5A623]" aria-label={`Browse ${key}: ${profile[key]}`}>
                {key === "sector" ? "Sector" : "Industry"}: {profile[key]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {expanded ? (
        <div id="company-browser" className="mt-4 space-y-4">
          <div>
            <h2 className="font-mono text-sm uppercase tracking-[.12em] text-white">Discover companies</h2>
            <p className="mt-1 text-xs text-[#94A3B8]">Find companies by sector or industry, then open their fundamentals.</p>
          </div>
          <div className="flex gap-2" aria-label="Classification type">
            {["sector", "industry"].map((key) => (
              <button type="button" key={key} aria-pressed={group === key} onClick={() => { reset(); setGroup(key); setValue(""); }} className={`border px-4 py-2 text-xs ${group === key ? "border-[#F5A623] bg-[#F5A623]/10 text-[#F5A623]" : "border-[#233650] text-[#CBD5E1]"}`}>
                {key === "sector" ? "Sector" : "Industry"}
              </button>
            ))}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); search(); }} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-end">
            <label>
              <span className="mb-2 block text-[10px] uppercase tracking-[.14em] text-[#71839A]">{group === "sector" ? "Sector name" : "Industry name"}</span>
              <input list={`company-categories-${group}`} value={value} onChange={(event) => { reset(); setValue(event.target.value); }} className="cms-input h-11" placeholder={group === "sector" ? "e.g. Private Sector Bank" : "e.g. Petroleum Products"} required maxLength={120} />
              <datalist id={`company-categories-${group}`}>{options.map((option) => <option key={option} value={option} />)}</datalist>
            </label>
            <button disabled={loading || !value.trim()} className="h-11 bg-[#F5A623] px-4 text-xs font-semibold uppercase tracking-[.1em] text-[#050E1D] disabled:opacity-50">{loading ? "Searching…" : "Find companies"}</button>
          </form>
          <p className="text-xs text-[#71839A]">Choose a suggestion or enter an exact classification name.</p>
          {error ? <p role="alert" className="text-sm text-[#C98182]">{error}</p> : null}
          {loading ? <p role="status" className="text-sm text-[#94A3B8]">Finding companies…</p> : null}
          {result ? (
            <div className="space-y-3" aria-live="polite">
              <p className="text-sm text-[#CBD5E1]">{result.total} {result.total === 1 ? "company" : "companies"} in {result.value}</p>
              {result.items.length ? (
                <>
                  <label className="block">
                    <span className="mb-2 block text-[10px] uppercase tracking-[.14em] text-[#71839A]">Search within results</span>
                    <input value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0); }} className="cms-input h-10" placeholder="Company name or symbol" />
                  </label>
                  {filtered.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] text-left text-sm">
                        <thead className="border-b border-[#233650] text-xs uppercase tracking-wider text-[#71839A]"><tr><th scope="col" className="p-3 font-normal">Company</th><th scope="col" className="p-3 font-normal">Symbol</th><th scope="col" className="p-3 font-normal">Action</th></tr></thead>
                        <tbody className="divide-y divide-[#233650]">{filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((item) => (
                          <tr key={item.symbol}>
                            <td className="p-3 text-white">{item.name || item.symbol}</td>
                            <td className="p-3 font-mono text-[#94A3B8]">{item.symbol}</td>
                            <td className="p-3"><button type="button" aria-label={`Open ${item.name || item.symbol}`} onClick={() => { setExpanded(false); onOpen(item); }} className="border border-[#40546E] px-3 py-1 text-xs text-[#F5A623] hover:border-[#F5A623]">Open</button></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ) : <p className="text-sm text-[#94A3B8]">No companies match your filter.</p>}
                  {filtered.length > PAGE_SIZE ? <div className="flex items-center justify-between gap-3 text-xs text-[#94A3B8]"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="border border-[#40546E] px-3 py-2 disabled:opacity-40">Previous</button><span>Page {currentPage + 1} of {pageCount} · {filtered.length} companies</span><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} className="border border-[#40546E] px-3 py-2 disabled:opacity-40">Next</button></div> : null}
                </>
              ) : <p className="text-sm text-[#94A3B8]">No companies were found. Check the category spelling or choose a suggested classification.</p>}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
