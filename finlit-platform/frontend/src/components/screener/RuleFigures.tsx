// The figures in the Stock screener's side panel (task #64, file 04 §6): "Your rules first". Each rule's figure carries ✓ or ✗, then this company's value,
// the middle (median) of all companies, and a bar from the lowest 10% to the highest 10% with the better side green. Then the key figures.
import { useQuery } from "@tanstack/react-query";
import { apiSend } from "../../lib/api";
import { fmtMetric, type MetricInfo, type Range, type Result } from "../../lib/proscreen";

export const KEY_FIGURES = ["pe", "roe", "roce", "sales_cagr_3y", "profit_cagr_3y", "debt_to_equity", "dividend_yield", "ret_1y", "pct_from_high"];

const passes = (v: number, r: Range) => (r.min == null || v >= r.min) && (r.max == null || v <= r.max);

export function RuleFigures({ symbol, ranges, byKey }: { symbol: string; ranges: Record<string, Range>; byKey: Map<string, MetricInfo> }) {
  const rules = Object.keys(ranges).filter((k) => byKey.has(k) && byKey.get(k)!.unit !== "flag");
  const keys = [...rules, ...KEY_FIGURES.filter((k) => !rules.includes(k))].filter((k) => byKey.has(k) && !byKey.get(k)!.locked);
  const q = useQuery<Result>({
    queryKey: ["screener-figures", symbol, keys], staleTime: 60_000, retry: 1, enabled: keys.length > 0,
    queryFn: () => apiSend<Result>("POST", "/api/screener/query", { filters: {}, cats: {}, q: symbol, sort: { key: "market_cap", dir: "desc" }, columns: keys, offset: 0, limit: 25 }),
  });
  if (!keys.length) return null;
  const row = q.data?.rows.find((r) => r.symbol === symbol);
  return (
    <div className="ssf" aria-label="This company's figures">
      <table className="ssf-t">
        <thead><tr><th scope="col">{rules.length ? "Your rules first" : "Key figures"}</th><th scope="col">This company</th><th scope="col">Middle</th><th scope="col"><span className="sr">Where it sits </span>Among all companies</th></tr></thead>
        <tbody>{keys.map((k) => {
          const m = byKey.get(k)!, v = row?.v[k] ?? null, st = m.stats, r = ranges[k];
          const ok = r && v != null ? passes(v, r) : null;
          const pos = st && v != null && st.p90 > st.p10 ? Math.max(0, Math.min(100, ((v - st.p10) / (st.p90 - st.p10)) * 100)) : null;
          return (
            <tr key={k} className={r ? "is-rule" : ""}>
              <th scope="row">{m.label}{ok != null && <span className={ok ? "ssf-ok" : "ssf-no"} aria-label={ok ? "meets your rule" : "outside your rule"}>{ok ? " ✓" : " ✗"}</span>}</th>
              <td>{q.isLoading ? "…" : fmtMetric(m, v)}</td>
              <td className="ssf-mid">{st ? fmtMetric(m, st.p50) : "–"}</td>
              <td><span className={"ssf-bar " + (m.better === "higher" ? "up" : m.better === "lower" ? "dn" : "flat")} aria-hidden="true">{pos != null && <i style={{ left: `${pos}%` }} />}</span></td>
            </tr>);
        })}</tbody>
      </table>
      <p className="ssf-note">Middle: the median of all listed companies that report the figure. The bar runs from the lowest 10% to the highest 10%; green is the better side.</p>
    </div>
  );
}
