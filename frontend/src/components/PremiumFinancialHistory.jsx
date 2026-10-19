const panel = "rounded-xl border border-[#26374D] bg-[#0A1626] p-5 sm:p-6";
const fmt = (v, n = 3) => v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: n });

function HistoryTable({ title, rows, fields }) {
  return <section className={panel}><h3 className="text-lg text-white">{title}</h3><p className="mt-2 text-xs text-[#93A4B9]">Oldest to newest · financial amounts in ₹ crore · EPS in ₹ per share · missing values shown as —.</p>{rows.length ? <div className="mt-4 overflow-x-auto"><table className="w-full whitespace-nowrap text-right text-xs"><thead><tr className="bg-[#172A43] text-[#D6AE62]"><th className="p-3 text-left">Measure</th>{rows.map((r) => <th key={r.period} className="p-3 font-medium">{r.period}</th>)}</tr></thead><tbody>{fields.map(([key, label]) => <tr key={key} className="border-t border-[#26374D]"><th className="p-3 text-left font-normal text-[#D0D9E5]">{label}</th>{rows.map((r) => <td key={r.period} className="p-3 tabular-nums text-[#B6C5D8]">{fmt(r[key],2)}</td>)}</tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-[#93A4B9]">No reported history available for this statement basis.</p>}</section>;
}

export default function PremiumFinancialHistory({ report }) {
  const trace = report.calculationTrace;
  if (!trace) return null;
  const salesLabel = ["BANK","NBFC"].includes(report.rating.group) ? "Net interest income" : report.rating.group === "INSURANCE" ? "Net premium income" : "Sales";
  return <section aria-label="Financial history" className="space-y-5">
    <HistoryTable title="Quarterly results" rows={trace.quarterly} fields={[["sales",salesLabel],["profit","Owner-attributable net profit"],["ebitda","EBITDA"],["eps","EPS (₹)"]]} />
    <HistoryTable title="Annual results" rows={trace.annual} fields={[["sales",salesLabel],["profit","Owner-attributable net profit"],["cashFlow","Operating cash flow"],["netWorth","Book equity"]]} />
    <section className={panel}><h3 className="text-lg text-white">Key financial ratios</h3><div className="mt-4 grid gap-x-7 sm:grid-cols-2 xl:grid-cols-3">{trace.latest.map((r) => <div key={r.key} className="flex justify-between gap-3 border-b border-[#26374D] py-3 text-xs"><span className="text-[#93A4B9]">{r.key === "shares" ? "Shares outstanding" : r.label}</span><span className="whitespace-nowrap tabular-nums text-[#D0D9E5]">{fmt(r.value)} {r.value != null ? r.unit : ""}</span></div>)}</div></section>
  </section>;
}
