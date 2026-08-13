import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CoverImage from "@/components/blog/CoverImage";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
const filters = [["ALL", "All"], ["ARTICLE", "Articles"], ["PDF", "Reports"], ["SPREADSHEET", "Spreadsheets"], ["IMAGE", "Visuals"]];
const labels = { ARTICLE: "Article", PDF: "Report", SPREADSHEET: "Spreadsheet", IMAGE: "Visual", FILE: "Resource" };
const actions = { ARTICLE: "Read article →", PDF: "View report →", SPREADSHEET: "View resource →", IMAGE: "View visual →", FILE: "View resource →" };

export default function BlogPage() {
  const [filter, setFilter] = useState("ALL");
  const [items, setItems] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    const url = `${API}/content${filter === "ALL" ? "" : `?content_type=${filter}`}`;
    fetch(url)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Content API returned ${response.status}`)))
      .then((data) => {
        if (!Array.isArray(data)) throw new Error("Content API returned an unexpected response");
        if (live) { setItems(data); setError(false); }
      })
      .catch(() => { if (live) { setItems([]); setError(true); } });
    return () => { live = false; };
  }, [filter]);

  return <main className="pt-24 md:pt-28">
    <section className="px-6 md:px-10 pt-10 md:pt-12 pb-8 md:pb-9 border-b border-white/10">
      <div className="max-w-7xl mx-auto">
        <div className="uppercase tracking-[.3em] text-[11px] text-[#F5A623]">Blog / Research</div>
        <h1 className="mt-4 font-serif-display text-5xl md:text-6xl text-white">Ideas, research and resources.</h1>
        <p className="mt-4 max-w-xl text-[#94A3B8]">Published notes, reports and resources from Nishant Jain.</p>
      </div>
    </section>
    <section className="px-6 md:px-10 py-8 md:py-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-5">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {filters.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap border ${filter === value ? "bg-[#F5A623] text-[#050E1D] border-[#F5A623]" : "border-white/15 text-[#94A3B8] hover:text-white"}`}>{label}</button>)}
          </div>
          <Link to="/blog/admin/login" className="hidden md:block shrink-0 text-xs text-[#71839A] hover:text-[#F5A623] transition-colors">Admin Login</Link>
        </div>
        <Link to="/blog/admin/login" className="md:hidden inline-block mt-4 text-xs text-[#71839A] hover:text-[#F5A623]">Admin Login</Link>
        {error ? <div className="mt-12 rounded-xl border border-[#C98182]/20 bg-[#C98182]/5 px-6 py-8"><h2 className="font-serif-display text-3xl text-white">Research is temporarily unavailable.</h2><p className="mt-2 text-sm text-[#94A3B8]">Please try again shortly.</p></div> : items.length ? <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{items.map((item) => <Link key={item.id} to={`/blog/${item.slug}`} className="group flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0A1E3F]/35 transition-colors hover:border-[#F5A623]/50"><div className="relative h-[190px] md:h-[200px] shrink-0 overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(28,67,112,.38),transparent_58%),linear-gradient(145deg,#0A1E3F,#061326)]"><CoverImage src={item.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" fallback={<div className="absolute inset-0 flex items-end p-5"><span className="rounded-full border border-[#E7C56B]/20 bg-[#050E1D]/30 px-3 py-1.5 text-[10px] uppercase tracking-[.2em] text-[#E7C56B]">{labels[item.contentType]}</span></div>} /></div><div className="flex flex-1 flex-col p-5"><div className="text-[10px] uppercase tracking-[.16em] text-[#E7C56B]">{labels[item.contentType]} · {item.publishedAt?.slice(0, 10)}</div><h2 className="mt-3 font-serif-display text-3xl text-white group-hover:text-[#F5A623]">{item.title}</h2><p className="mt-3 text-sm leading-relaxed text-[#94A3B8]">{item.excerpt}</p><span className="mt-auto pt-5 inline-block text-sm text-white">{actions[item.contentType]}</span></div></Link>)}</div> : <div className="mt-14 py-10 border-y border-white/10 text-center"><h2 className="font-serif-display text-4xl text-white">No published research yet.</h2><p className="mt-3 text-sm text-[#94A3B8]">New articles, reports and resources will appear here once they are published.</p></div>}
      </div>
    </section>
  </main>;
}
