// The top of Sector Pulse and Sector Rotation as the "FinLit final pages" pack draws it (13 Nov 2026): the eyebrow, the title, the line under it, the date line, a right-hand card
// (Market backdrop / The yardstick), the two page tabs, Simple / Full table, and Find (an industry or a stock). Styles: styles/sectors-pack.css.
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useSearchIndex } from "../../../lib/api";
import { short } from "../../../lib/pulsePack";
import { Tip } from "./Common";

export type View = "simple" | "full";

export function PackHead({ page, title, desc, meta, side, view, onView, industries, findHint }: {
  page: "pulse" | "rotation"; title: string; desc: string; meta: ReactNode; side: ReactNode; view: View; onView: (v: View) => void;
  industries: { name: string; slug: string }[]; findHint?: string;
}) {
  return (
    <header className="sp-head">
      <div className="sp-head-top">
        <div>
          <p className="sp-eyebrow">Markets · Sectors</p>
          <h1>{title}</h1>
          <p className="sp-desc">{desc}</p>
          <p className="sp-meta">{meta}</p>
        </div>
        {side}
      </div>
      <div className="sp-head-bar">
        <nav className="sp-tabs" aria-label="Sector pages">
          <Link to="/sectors" className={"sp-tab" + (page === "pulse" ? " on" : "")} aria-current={page === "pulse" ? "page" : undefined}>Sector Pulse</Link>
          <Link to="/sectors/rotation" className={"sp-tab" + (page === "rotation" ? " on" : "")} aria-current={page === "rotation" ? "page" : undefined}>Sector Rotation</Link>
        </nav>
        <div className="sp-view" role="group" aria-label="View"><span>View</span>
          {(["simple", "full"] as const).map((v) => <button key={v} type="button" className={"sp-vbtn" + (view === v ? " on" : "")} aria-pressed={view === v} onClick={() => onView(v)}>{v === "simple" ? "Simple" : "Full table"}</button>)}
        </div>
        <Find industries={industries} hint={findHint} />
      </div>
    </header>
  );
}

/** Find: type an industry or a stock; Enter (or picking a suggestion) opens it. */
function Find({ industries, hint = "An industry or a stock, e.g. INFY" }: { industries: { name: string; slug: string }[]; hint?: string }) {
  const [q, setQ] = useState(""), [open, setOpen] = useState(false);
  const nav = useNavigate();
  const idx = useSearchIndex(q.trim().length >= 2);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const inds = industries.filter((i) => i.name.toLowerCase().includes(t) || short(i.name).toLowerCase().includes(t)).slice(0, 5).map((i) => ({ key: "i:" + i.slug, label: short(i.name), note: "Industry", to: `/sectors/${i.slug}` }));
    const rows = (idx.data?.rows ?? []) as unknown[][];
    const stocks = rows.filter((r) => String(r[0]).toLowerCase().startsWith(t) || String(r[1] ?? "").toLowerCase().includes(t)).slice(0, 6).map((r) => ({ key: "s:" + r[0], label: String(r[0]), note: String(r[1] ?? ""), to: `/stocks/${encodeURIComponent(String(r[0]))}` }));
    return [...inds, ...stocks];
  }, [q, industries, idx.data]);
  const go = (to: string) => { setQ(""); setOpen(false); nav(to); };
  return (
    <div className="sp-find">
      <label htmlFor="sp-find-in">Find</label>
      <div className="sp-find-box">
        <input id="sp-find-in" type="search" value={q} placeholder={hint} autoComplete="off" role="combobox" aria-expanded={open && hits.length > 0} aria-controls="sp-find-list"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { e.preventDefault(); go(hits[0].to); } if (e.key === "Escape") setOpen(false); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)} />
        {open && hits.length > 0 && <ul id="sp-find-list" role="listbox" className="sp-find-list">{hits.map((h) => <li key={h.key} role="option" aria-selected={false}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(h.to)}><b>{h.label}</b><small>{h.note}</small></button></li>)}</ul>}
      </div>
    </div>
  );
}

/** The Market backdrop card (Sector Pulse). */
export function Backdrop({ pct, above }: { pct: number | null; above: boolean | null }) {
  if (pct == null) return <aside className="sp-side"><p className="sp-side-k">Market backdrop</p><p className="sp-side-x">The Nifty 50 reading is not in this data set yet.</p></aside>;
  return (
    <aside className={"sp-side" + (above === false ? " dn" : "")} aria-label="Market backdrop">
      <p className="sp-side-k">Market backdrop<Tip text="Market backdrop. Whether the Nifty 50 is above or below its long-term average price. Above it, the market as a whole is in an uptrend." /></p>
      <p className="sp-side-v"><b>{pct > 0 ? "+" : pct < 0 ? "−" : ""}{Math.abs(pct).toFixed(1)}%</b> Nifty 50 {pct >= 0 ? "above" : "below"} its long-term average</p>
      <p className="sp-side-x">{above === false ? "The market as a whole is in a downtrend. Read each industry against it." : "The market as a whole is in an uptrend. Read each industry against it."}</p>
    </aside>
  );
}
