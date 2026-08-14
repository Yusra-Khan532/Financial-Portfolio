import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole, Search } from "lucide-react";
import CoverImage from "@/components/blog/CoverImage";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
const filters = [
  { value: "ALL", label: "All" }, { value: "ARTICLE", label: "Articles" }, { value: "RESEARCH", label: "Research" },
  { value: "PDF", label: "Reports" }, { value: "DATA", label: "Data & Visuals" },
];
const labels = { ARTICLE: "Article", PDF: "Report", SPREADSHEET: "Data & Visual", IMAGE: "Visual", FILE: "Resource" };
const actions = { ARTICLE: "Read more", PDF: "View report", SPREADSHEET: "Explore data", IMAGE: "View visual", FILE: "View resource" };
const isDataVisual = (item) => ["SPREADSHEET", "IMAGE", "FILE"].includes(item.contentType);
const formatDate = (value) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "";

function matchesFilter(item, filter) {
  if (filter === "ALL" || filter === "RESEARCH") return true;
  if (filter === "DATA") return isDataVisual(item);
  return item.contentType === filter;
}

function ResearchCard({ item }) {
  const type = labels[item.contentType] || "Research";
  const action = actions[item.contentType] || "Explore";
  return <Link to={`/blog/${item.slug}`} className="group flex h-full min-h-[382px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#07182F]/32 transition-colors hover:border-[#D4AF37]/45 hover:bg-[#0A1E3F]/44">
    <div className="relative aspect-[16/10] shrink-0 overflow-hidden border-b border-white/[0.08] bg-[#0A1E3F]">
      {item.coverImageUrl ? <CoverImage src={item.coverImageUrl} alt="" className="h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-90" /> : <div className="flex h-full items-end p-5"><span className="text-[10px] uppercase tracking-[.22em] text-[#D9B64D]">FinLit Research</span></div>}
    </div>
    <div className="flex min-h-[164px] flex-1 flex-col p-5">
      <span className="text-[10px] uppercase tracking-[.18em] text-[#D9B64D]">{type}</span>
      <h2 className="mt-3 line-clamp-2 font-serif-display text-2xl leading-[1.1] text-white transition-colors group-hover:text-[#E7C56B]">{item.title}</h2>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs"><span className="text-[#71839A]">{formatDate(item.publishedAt)}</span><span className="text-[#D9B64D] transition-transform group-hover:translate-x-1">{action} <span aria-hidden="true">→</span></span></div>
    </div>
  </Link>;
}

function SkeletonCard() {
  return <div className="min-h-[382px] animate-pulse overflow-hidden rounded-xl border border-white/[0.08] bg-[#07182F]/28"><div className="aspect-[16/10] bg-white/[0.04]" /><div className="p-5"><div className="h-3 w-20 bg-white/[0.05]" /><div className="mt-4 h-7 w-5/6 bg-white/[0.06]" /><div className="mt-2 h-7 w-3/5 bg-white/[0.06]" /></div></div>;
}

export default function BlogPage() {
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`${API}/content`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { if (!Array.isArray(data)) throw new Error("Unexpected content response"); if (live) { setItems(data); setError(false); } })
      .catch(() => { if (live) { setItems([]); setError(true); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const visibleItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => matchesFilter(item, filter)).filter((item) => !term || [item.title, item.excerpt, item.author, item.contentType].filter(Boolean).some((value) => String(value).toLowerCase().includes(term))).sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  }, [filter, items, query]);

  return <main className="pt-24 md:pt-28">
    <section className="border-b border-white/10 px-6 pb-9 pt-10 md:px-10 md:pb-10 md:pt-12"><div className="mx-auto max-w-7xl"><div className="max-w-3xl"><div className="text-[11px] uppercase tracking-[.3em] text-[#F5A623]">Blog / Research</div><h1 className="mt-4 font-serif-display text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl md:text-6xl">Ideas, research and perspectives.</h1><p className="mt-5 max-w-2xl leading-relaxed text-[#94A3B8]">Research-led perspectives on markets, portfolios and investing — designed to make complex ideas clearer and more useful.</p></div></div></section>
    <section className="px-6 py-8 md:px-10 md:py-10"><div className="mx-auto max-w-7xl">
      <div className="relative max-w-2xl"><Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#71839A]" size={17} strokeWidth={1.5} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search research" placeholder="Search articles, reports and research..." className="w-full rounded-xl border border-white/15 bg-[#07182F] py-3 pl-11 pr-4 text-sm text-white placeholder:text-[#64748B] outline-none transition-colors focus:border-[#F5A623]" /></div>
      <div className="mt-6 flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="Research categories">{filters.map(({ value, label }) => <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap border-b px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:text-[#F5A623] ${filter === value ? "border-[#F5A623] text-[#F5A623]" : "border-transparent text-[#94A3B8] hover:border-white/25 hover:text-[#CBD5E1]"}`}>{label}</button>)}</div><Link to="/blog/admin/login" className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-[#F5A623] px-5 py-2 text-sm font-medium text-[#050E1D] transition-colors hover:bg-[#E19212] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050E1D]"><LockKeyhole size={13} strokeWidth={1.5} />Admin Login</Link></div>
      {loading ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div> : error ? <div className="mt-8 max-w-xl rounded-xl border border-white/10 bg-[#07182F]/35 px-6 py-6"><h2 className="font-serif-display text-2xl text-white">Research is temporarily unavailable</h2><p className="mt-2 text-sm text-[#94A3B8]">Please check back shortly.</p></div> : visibleItems.length ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visibleItems.map((item) => <ResearchCard key={item.id} item={item} />)}</div> : <div className="mt-8 max-w-xl rounded-xl border border-white/10 bg-[#07182F]/35 px-6 py-8"><h2 className="font-serif-display text-3xl text-white">No matching research found.</h2><p className="mt-3 text-sm text-[#94A3B8]">Try another search or select a different category.</p></div>}
    </div></section>
  </main>;
}
