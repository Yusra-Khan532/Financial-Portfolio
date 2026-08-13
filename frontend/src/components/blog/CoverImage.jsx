import { useEffect, useState } from "react";
import { resolveContentAssetUrl } from "@/components/cms/ArticleContent";

export default function CoverImage({ src, alt = "", className = "", fallback }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return fallback || null;
  return <img src={resolveContentAssetUrl(src)} alt={alt} className={className} onError={() => setFailed(true)} />;
}
