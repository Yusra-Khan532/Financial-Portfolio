import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileSpreadsheet, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import AdminShell from "@/components/cms/AdminShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cmsRequest, formatCmsDate } from "@/lib/cms";

const FILTERS = [
  ["ALL", "All"],
  ["PUBLISHED", "Published"],
  ["DRAFT", "Drafts"],
  ["ARTICLE", "Articles"],
  ["PDF", "Reports"],
  ["SPREADSHEET", "Spreadsheets"],
  ["IMAGE", "Visuals"],
];

const TYPE_LABELS = {
  ARTICLE: "Article",
  PDF: "Report",
  SPREADSHEET: "Spreadsheet",
  IMAGE: "Visual",
  FILE: "File",
};

function updatePayload(item, status) {
  return {
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt || "",
    contentType: item.contentType,
    articleBody: item.articleBody || "",
    articleFormat: item.articleFormat || "MARKDOWN",
    coverImageUrl: item.coverImageUrl || null,
    coverImageKey: item.coverImageKey || null,
    inlineImageKeys: item.inlineImageKeys || [],
    fileKey: item.fileKey || null,
    author: item.author || "Nishant Jain",
    status,
  };
}

export default function BlogAdminPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [deleteItem, setDeleteItem] = useState(null);
  const [portfolioReport, setPortfolioReport] = useState(null);
  const [portfolioFile, setPortfolioFile] = useState(null);
  const [portfolioUploading, setPortfolioUploading] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await cmsRequest("/content/admin/items"));
    } catch (requestError) {
      if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
      else setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const loadPortfolioReport = useCallback(async () => {
    try {
      setPortfolioReport(await cmsRequest("/portfolio/admin/report"));
    } catch (requestError) {
      if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
      else setPortfolioReport(null);
    }
  }, [navigate]);

  useEffect(() => { loadPortfolioReport(); }, [loadPortfolioReport]);

  const visibleItems = useMemo(() => {
    const search = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesFilter = filter === "ALL" || item.status === filter || item.contentType === filter;
      const matchesSearch = !search || item.title.toLowerCase().includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [filter, items, query]);

  const toggleStatus = async (item) => {
    const nextStatus = item.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    setBusyId(item.id);
    try {
      await cmsRequest(`/content/admin/items/${item.id}`, {
        method: "PUT",
        body: JSON.stringify(updatePayload(item, nextStatus)),
      });
      toast.success(nextStatus === "PUBLISHED" ? `Published “${item.title}”.` : `Unpublished “${item.title}”.`);
      await load();
    } catch (requestError) {
      if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
      else toast.error(requestError.message);
    } finally {
      setBusyId("");
    }
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;
    setBusyId(deleteItem.id);
    try {
      await cmsRequest(`/content/admin/items/${deleteItem.id}`, { method: "DELETE" });
      toast.success("Content deleted.");
      setDeleteItem(null);
      await load();
    } catch (requestError) {
      if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
      else toast.error(requestError.message);
    } finally {
      setBusyId("");
    }
  };

  const uploadPortfolio = async (event) => {
    event.preventDefault();
    if (!portfolioFile) {
      toast.error("Choose an Upstox P&L PDF first.");
      return;
    }
    const body = new FormData();
    body.append("file", portfolioFile);
    setPortfolioUploading(true);
    try {
      const report = await cmsRequest("/portfolio/admin/upload", { method: "POST", body });
      setPortfolioReport(report);
      setPortfolioFile(null);
      event.target.reset();
      toast.success("Portfolio report published.");
    } catch (requestError) {
      if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
      else toast.error(requestError.message);
    } finally {
      setPortfolioUploading(false);
    }
  };

  return (
    <AdminShell>
      <header className="mt-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-[.22em] text-[#F5A623]">Administrator</div>
          <h1 className="mt-2 font-serif-display text-5xl md:text-6xl text-white">Research publishing</h1>
          <p className="mt-3 text-sm md:text-base text-[#94A3B8]">Manage articles, reports and research resources.</p>
        </div>
        <Link to="/blog/admin/new" className="inline-flex self-start md:self-auto items-center justify-center rounded-full bg-[#F5A623] px-6 py-3 text-sm font-medium text-[#050E1D] hover:bg-[#FFB33B]">+ New Content</Link>
      </header>

      <section className="mt-10 rounded-2xl border border-white/10 bg-[#08172C]/55 p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[.22em] text-[#F5A623]"><FileSpreadsheet size={15} />Portfolio Data</div>
            <h2 className="mt-3 text-2xl font-medium text-white">Upload Upstox P&L PDF</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#94A3B8]">Publishes the latest PDF report totals and trade-derived metrics to the portfolio page.</p>
          </div>
          <form onSubmit={uploadPortfolio} className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <label className="relative flex min-h-12 flex-1 cursor-pointer items-center rounded-lg border border-white/10 bg-[#050E1D]/70 px-4 text-sm text-[#CBD5E1] sm:w-80">
              <input type="file" accept=".pdf" onChange={(event) => setPortfolioFile(event.target.files?.[0] || null)} className="absolute inset-0 opacity-0" />
              <span className="truncate">{portfolioFile?.name || "Choose .pdf file"}</span>
            </label>
            <button disabled={portfolioUploading} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#F5A623] px-5 text-sm font-medium text-[#050E1D] hover:bg-[#FFB33B] disabled:opacity-60"><Upload size={16} />{portfolioUploading ? "Publishing..." : "Publish"}</button>
          </form>
        </div>
        <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 text-xs text-[#94A3B8] sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="block text-[10px] uppercase tracking-[.14em] text-[#71839A]">Current Source</span><span className="mt-1 block truncate text-[#CBD5E1]">{portfolioReport?.sourceFileName || "Fallback portfolio.js"}</span></div>
          <div><span className="block text-[10px] uppercase tracking-[.14em] text-[#71839A]">Report Period</span><span className="mt-1 block text-[#CBD5E1]">{portfolioReport?.profile?.reportPeriod || "Static fallback"}</span></div>
          <div><span className="block text-[10px] uppercase tracking-[.14em] text-[#71839A]">Net P&L</span><span className="mt-1 block text-[#CBD5E1]">{portfolioReport?.headline?.netPnl || "Static fallback"}</span></div>
          <div><span className="block text-[10px] uppercase tracking-[.14em] text-[#71839A]">Trades Parsed</span><span className="mt-1 block text-[#CBD5E1]">{portfolioReport?.summary?.tradeCount ?? "Static fallback"}</span></div>
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-white/10 bg-[#08172C]/55 overflow-hidden">
        <div className="p-4 md:p-5 border-b border-white/10">
          <div className="flex flex-col xl:flex-row xl:items-center gap-4 xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map(([value, label]) => (
                <button key={value} onClick={() => setFilter(value)} className={`rounded-full border px-3.5 py-2 text-xs transition-colors ${filter === value ? "border-[#F5A623] bg-[#F5A623] text-[#050E1D]" : "border-white/10 text-[#94A3B8] hover:border-white/25 hover:text-white"}`}>{label}</button>
              ))}
            </div>
            <label className="relative block w-full xl:w-64">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#71839A]" />
              <span className="sr-only">Search by title</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="cms-input pl-10" placeholder="Search by title" />
            </label>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-[#71839A]">
            <span>{visibleItems.length} {visibleItems.length === 1 ? "item" : "items"}</span>
            <span>Recently updated first</span>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-[#71839A]">Loading content…</div>
        ) : error ? (
          <div className="m-5 rounded-xl border border-[#C98182]/20 bg-[#C98182]/5 p-6">
            <h2 className="text-lg text-white">Content could not be loaded.</h2>
            <p className="mt-2 text-sm text-[#94A3B8]">{error}</p>
            <button onClick={load} className="mt-5 text-sm text-[#E7C56B] hover:text-[#F5A623]">Try again</button>
          </div>
        ) : !items.length ? (
          <div className="py-20 px-6 text-center">
            <h2 className="font-serif-display text-4xl text-white">No content yet.</h2>
            <p className="mt-3 text-sm text-[#94A3B8]">Create your first article, report or research resource.</p>
            <Link to="/blog/admin/new" className="mt-7 inline-flex rounded-full bg-[#F5A623] px-6 py-3 text-sm font-medium text-[#050E1D]">Create Content</Link>
          </div>
        ) : !visibleItems.length ? (
          <div className="py-16 px-6 text-center text-sm text-[#94A3B8]">No content matches this filter or search.</div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-[.16em] text-[#71839A]">
                  <tr><th className="px-5 py-4 font-normal">Title</th><th className="px-4 py-4 font-normal">Type</th><th className="px-4 py-4 font-normal">Status</th><th className="px-4 py-4 font-normal">Updated</th><th className="px-4 py-4 font-normal">Published</th><th className="px-5 py-4 font-normal text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {visibleItems.map((item) => <ContentRow key={item.id} item={item} busy={busyId === item.id} onToggle={() => toggleStatus(item)} onDelete={() => setDeleteItem(item)} />)}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-white/10">
              {visibleItems.map((item) => <ContentCard key={item.id} item={item} busy={busyId === item.id} onToggle={() => toggleStatus(item)} onDelete={() => setDeleteItem(item)} />)}
            </div>
          </>
        )}
      </section>

      <AlertDialog open={Boolean(deleteItem)} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <AlertDialogContent className="border-white/10 bg-[#08172C] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif-display text-3xl font-normal">Delete “{deleteItem?.title}”?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#94A3B8]">This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/15 bg-transparent text-white hover:bg-white/5 hover:text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-[#A9585A] text-white hover:bg-[#BF6668]">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] tracking-[.13em] ${status === "PUBLISHED" ? "border-[#75B89B]/30 bg-[#75B89B]/10 text-[#8CC8AA]" : "border-white/15 text-[#94A3B8]"}`}>{status}</span>;
}

function Actions({ item, busy, onToggle, onDelete, mobile = false }) {
  return (
    <div className={`flex items-center gap-4 text-xs ${mobile ? "flex-wrap" : "justify-end whitespace-nowrap"}`}>
      <Link to={`/blog/admin/preview/${item.id}`} className="text-[#94A3B8] hover:text-white">Preview</Link>
      <Link to={`/blog/admin/edit/${item.id}`} className="text-[#E7C56B] hover:text-[#F5A623]">Edit</Link>
      <button disabled={busy} onClick={onToggle} className="text-[#94A3B8] hover:text-white disabled:opacity-50">{item.status === "PUBLISHED" ? "Unpublish" : "Publish"}</button>
      <button disabled={busy} onClick={onDelete} className="text-[#C98182] hover:text-[#E7A5A6] disabled:opacity-50">Delete</button>
    </div>
  );
}

function ContentRow({ item, busy, onToggle, onDelete }) {
  return (
    <tr className="hover:bg-white/[.025]">
      <td className="px-5 py-5"><div className="max-w-xs font-medium text-white truncate">{item.title}</div><div className="mt-1 max-w-xs truncate text-xs text-[#71839A]">/{item.slug}</div></td>
      <td className="px-4 py-5 text-sm text-[#CBD5E1]">{TYPE_LABELS[item.contentType]}</td>
      <td className="px-4 py-5"><StatusBadge status={item.status} /></td>
      <td className="px-4 py-5 text-xs text-[#94A3B8]">{formatCmsDate(item.updatedAt)}</td>
      <td className="px-4 py-5 text-xs text-[#94A3B8]">{item.status === "PUBLISHED" ? formatCmsDate(item.publishedAt) : "—"}</td>
      <td className="px-5 py-5"><Actions item={item} busy={busy} onToggle={onToggle} onDelete={onDelete} /></td>
    </tr>
  );
}

function ContentCard({ item, busy, onToggle, onDelete }) {
  return (
    <article className="p-5">
      <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[.14em] text-[#E7C56B]">{TYPE_LABELS[item.contentType]}</div><h2 className="mt-2 text-base text-white">{item.title}</h2><p className="mt-1 text-xs text-[#71839A]">/{item.slug}</p></div><StatusBadge status={item.status} /></div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-[#71839A]"><div><span className="block mb-1 uppercase tracking-wider text-[9px]">Updated</span>{formatCmsDate(item.updatedAt)}</div><div><span className="block mb-1 uppercase tracking-wider text-[9px]">Published</span>{item.status === "PUBLISHED" ? formatCmsDate(item.publishedAt) : "—"}</div></div>
      <div className="mt-5 pt-4 border-t border-white/10"><Actions item={item} busy={busy} onToggle={onToggle} onDelete={onDelete} mobile /></div>
    </article>
  );
}
