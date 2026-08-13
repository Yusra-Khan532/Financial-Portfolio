import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ArticleContent, { resolveContentAssetUrl } from "@/components/cms/ArticleContent";
import CoverImage from "@/components/blog/CoverImage";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export default function BlogDetailPage() {
  const { slug } = useParams();
  const [item, setItem] = useState();
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(`${API}/content/${slug}`).then((response) => response.ok ? response.json() : Promise.reject()).then(setItem).catch(() => setError(true));
  }, [slug]);
  if (error) return <main className="pt-32 px-6 text-white">Content not found.</main>;
  if (!item) return <main className="pt-32 px-6 text-[#94A3B8]">Loading research…</main>;
  const asset = resolveContentAssetUrl(item.fileUrl);
  return <main className="pt-24 md:pt-28 px-6 md:px-10 py-16"><article className="max-w-4xl mx-auto"><Link to="/blog" className="text-sm text-[#F5A623]">← Blog</Link><div className="mt-8 text-[11px] uppercase tracking-[.2em] text-[#E7C56B]">{item.contentType} · {item.publishedAt?.slice(0, 10)}</div><h1 className="mt-4 font-serif-display text-5xl md:text-6xl text-white">{item.title}</h1><p className="mt-5 text-lg text-[#94A3B8]">{item.excerpt}</p><p className="mt-4 text-sm text-[#71839A]">By {item.author}</p><CoverImage src={item.coverImageUrl} alt="" className="mt-9 max-h-[460px] w-full rounded-xl object-cover" />{item.contentType === "ARTICLE" ? <ArticleContent html={item.articleHtml} /> : <Resource item={item} asset={asset} />}</article></main>;
}

function Resource({ item, asset }) {
  const action = item.contentType === "PDF" ? "Download PDF" : item.contentType === "SPREADSHEET" ? "Download Spreadsheet" : item.contentType === "IMAGE" ? "Open Image" : "Open Resource";
  return <div className="mt-10 rounded-xl border border-white/10 bg-[#0A1E3F]/35 p-6">{item.contentType === "PDF" && <iframe title={item.title} src={asset} className="w-full h-[520px] border border-white/10 mb-6" />}{item.contentType === "IMAGE" && <img src={asset} alt={item.title} className="max-w-full rounded-lg mb-6" />}<p className="text-[#94A3B8]">{item.originalFileName} {item.fileSize ? `· ${(item.fileSize / 1024).toFixed(1)} KB` : ""}</p><p className="mt-1 text-xs text-[#71839A]">{item.mimeType}</p><a href={asset} target="_blank" rel="noopener noreferrer" download={item.originalFileName} className="inline-block mt-5 px-5 py-3 rounded-full bg-[#F5A623] text-[#050E1D] text-sm font-medium">{action}</a></div>;
}
