import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import AdminShell from "@/components/cms/AdminShell";
import ArticleContent, { resolveContentAssetUrl } from "@/components/cms/ArticleContent";
import CoverImage from "@/components/blog/CoverImage";
import { cmsRequest, formatCmsDate, getCmsToken } from "@/lib/cms";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

function publishPayload(item) {
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
    status: "PUBLISHED",
  };
}

export default function BlogAdminPreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [assetUrls, setAssetUrls] = useState({});
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    const objectUrls = [];
    let active = true;
    const load = async () => {
      try {
        const content = await cmsRequest(`/content/admin/items/${id}`);
        if (!active) return;
        setItem(content);
        const keys = [...new Set([content.fileKey, content.coverImageKey, ...(content.inlineImageKeys || [])].filter(Boolean))];
        const resolved = {};
        await Promise.all(keys.map(async (key) => {
          const response = await fetch(`${API}/content/admin/assets/${key}`, { headers: { Authorization: `Bearer ${getCmsToken()}` } });
          if (!response.ok) throw new Error("An attached image or resource could not be loaded.");
          const objectUrl = URL.createObjectURL(await response.blob());
          objectUrls.push(objectUrl);
          resolved[key] = objectUrl;
        }));
        if (active) setAssetUrls(resolved);
      } catch (requestError) {
        if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
        else if (active) setError(requestError.message);
      }
    };
    load();
    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [id, navigate]);

  const publish = async () => {
    setPublishing(true);
    try {
      const updated = await cmsRequest(`/content/admin/items/${id}`, {
        method: "PUT",
        body: JSON.stringify(publishPayload(item)),
      });
      setItem((current) => ({ ...current, ...updated, status: "PUBLISHED" }));
      toast.success("Content published.");
    } catch (requestError) {
      if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
      else toast.error(requestError.message);
    } finally {
      setPublishing(false);
    }
  };

  if (error) return <AdminShell compact><div className="py-24 text-center"><h1 className="font-serif-display text-4xl text-white">Preview unavailable.</h1><p className="mt-3 text-sm text-[#94A3B8]">{error}</p><Link className="mt-6 inline-block text-sm text-[#E7C56B]" to="/blog/admin">Back to dashboard</Link></div></AdminShell>;
  if (!item) return <AdminShell compact><div className="py-24 text-center text-sm text-[#71839A]">Preparing preview…</div></AdminShell>;

  return (
    <AdminShell compact>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#E7C56B]/20 bg-[#E7C56B]/5 px-4 py-3">
        <div className="flex items-center gap-3"><span className="text-[10px] uppercase tracking-[.18em] text-[#E7C56B]">Private preview</span><span className="text-xs text-[#71839A]">{item.status === "DRAFT" ? "Not visible publicly" : "Currently published"}</span></div>
        <div className="flex items-center gap-4 text-sm"><Link to={`/blog/admin/edit/${id}`} className="text-[#D6DEE8] hover:text-white">Back to editor</Link>{item.status === "DRAFT" && <button onClick={publish} disabled={publishing} className="rounded-full bg-[#F5A623] px-5 py-2 text-xs font-medium text-[#050E1D] disabled:opacity-50">{publishing ? "Publishing…" : "Publish"}</button>}</div>
      </div>

      <article className="py-12 md:py-16 max-w-4xl mx-auto">
        <div className="text-[11px] uppercase tracking-[.2em] text-[#E7C56B]">{item.contentType} · {item.status === "PUBLISHED" ? formatCmsDate(item.publishedAt) : "Draft"}</div>
        <h1 className="mt-4 font-serif-display text-5xl md:text-6xl text-white">{item.title}</h1>
        <p className="mt-5 text-lg text-[#94A3B8]">{item.excerpt}</p>
        <p className="mt-4 text-sm text-[#71839A]">By {item.author}</p>
        {(item.coverImageKey || item.coverImageUrl) && <CoverImage src={assetUrls[item.coverImageKey] || resolveContentAssetUrl(item.coverImageUrl)} alt="" className="mt-9 max-h-[420px] w-full rounded-xl object-cover" />}
        {item.contentType === "ARTICLE"
          ? <ArticleContent html={item.articleHtml} assetUrls={assetUrls} />
          : <PreviewResource item={item} assetUrl={assetUrls[item.fileKey]} />}
      </article>
    </AdminShell>
  );
}

function PreviewResource({ item, assetUrl }) {
  return (
    <div className="mt-10 rounded-xl border border-white/10 bg-[#0A1E3F]/35 p-6">
      {!assetUrl && <p className="text-sm text-[#71839A]">Loading attached resource…</p>}
      {item.contentType === "PDF" && assetUrl && <iframe title={item.title} src={assetUrl} className="mb-6 h-[520px] w-full border border-white/10" />}
      {item.contentType === "IMAGE" && assetUrl && <img src={assetUrl} alt={item.title} className="mb-6 max-w-full rounded-lg" />}
      <p className="text-[#94A3B8]">{item.originalFileName}{item.fileSize ? ` · ${(item.fileSize / 1024).toFixed(1)} KB` : ""}</p>
      {assetUrl && <a href={assetUrl} download={item.originalFileName} className="mt-5 inline-block rounded-full bg-[#F5A623] px-5 py-3 text-sm font-medium text-[#050E1D]">Open resource</a>}
    </div>
  );
}
