import { useMemo, useState } from "react";
export default function DetailedShareholding({ rows = [] }) {
  const [expanded, setExpanded] = useState({});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const allPeriods = useMemo(() => {
    const values = new Set();
    const visit = (items) => items.forEach((row) => { row.history.forEach((point) => values.add(point.period)); visit(row.children || []); });
    visit(rows);
    return [...values].sort((a, b) => new Date(`1 ${b}`) - new Date(`1 ${a}`));
  }, [rows]);
  const pages = Math.max(1, Math.ceil(allPeriods.length / 12));
  const current = Math.min(page, pages - 1);
  const periods = allPeriods.slice(current * 12, current * 12 + 12).reverse();
  const needle = query.trim().toLowerCase();
  const matches = (row) => row.label.toLowerCase().includes(needle) || (row.children || []).some(matches);
  const renderRow = (row, depth = 0, parentMatched = false) => {
    if (needle && !parentMatched && !matches(row)) return null;
    const selfMatched = parentMatched || (needle && row.label.toLowerCase().includes(needle));
    const hasChildren = row.children?.length > 0;
    const isOpen = Boolean(needle || expanded[row.category]);
    return [<tr key={row.category} className={`border-t border-[#233650] ${depth === 0 ? "bg-[#0B1D30]" : ""}`}>
      <th scope="row" className="sticky left-0 z-10 min-w-[240px] max-w-[340px] bg-[#06101D] py-3 pr-3 text-left font-normal text-[#CBD5E1]" style={{ paddingLeft: 12 + depth * 20 }}>
        {hasChildren ? <button className="text-left hover:text-[#F5A623]" aria-expanded={isOpen} onClick={() => setExpanded({ ...expanded, [row.category]: !expanded[row.category] })}>{isOpen ? "▾" : "▸"} {row.label} <span className="text-xs text-[#71839A]">({row.children.length})</span></button> : row.label}
      </th>
      {periods.map((period) => { const value = row.history.find((point) => point.period === period)?.value; return <td key={period} className="whitespace-nowrap px-4 py-3 tabular-nums text-[#CBD5E1]">{value == null ? "N/A" : `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`}</td>; })}
    </tr>, ...(hasChildren && isOpen ? row.children.map((child) => renderRow(child, depth + 1, selfMatched)) : [])];
  };
  return <section id="detailed-shareholding" className="border border-white/10 bg-[#050E1D]/45 p-5">
    <h2 className="text-xl font-medium text-white">Detailed Shareholding Pattern</h2>
    <p className="mt-2 text-sm text-[#94A3B8]">Reported quarterly ownership as a percentage of company shares. Expand categories to see named holders. Parent totals already include their holders; missing disclosures appear as N/A.</p>
    {rows.length ? <>
      <div className="my-4 flex flex-wrap items-center justify-between gap-3">
        <label className="text-xs text-[#94A3B8]">Search category or holder<input className="ml-3 rounded border border-white/20 bg-[#06101D] px-3 py-2 text-sm text-white" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Promoter, mutual fund, holder…" /></label>
        <button className="text-sm text-[#F5A623]" onClick={() => { const next = {}; const visit = (items) => items.forEach((row) => { next[row.category] = true; visit(row.children || []); }); visit(rows); setExpanded(next); }}>Expand all holders</button>
        <button className="text-sm text-[#F5A623]" onClick={() => { setExpanded({}); setQuery(""); }}>Collapse all</button>
      </div>
      <p className="mb-3 text-xs text-[#71839A]">Source: FinEdge shareholding pattern · {allPeriods.length} reported quarters · {periods[0]} – {periods[periods.length - 1]}</p>
      <div className="max-h-[600px] overflow-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-[#F5A623]"><tr><th scope="col" className="sticky left-0 bg-[#06101D] p-3">Category / holder</th>{periods.map((period) => <th scope="col" key={period} className="whitespace-nowrap p-3 font-normal">{period}</th>)}</tr></thead><tbody>{rows.map((row) => renderRow(row))}</tbody></table></div>
      {needle && !rows.some(matches) ? <p className="py-4 text-sm text-[#94A3B8]">No categories or holders match your search.</p> : null}
      {pages > 1 ? <div className="mt-4 flex justify-between text-sm text-[#CBD5E1]"><button disabled={!current} onClick={() => setPage(current - 1)}>Newer quarters</button><span>{current + 1} / {pages}</span><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Older quarters</button></div> : null}
    </> : <p className="mt-4 text-sm text-[#94A3B8]">Detailed shareholding disclosures are unavailable for this company.</p>}
  </section>;
}
