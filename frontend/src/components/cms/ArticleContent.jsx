const backendBase = process.env.REACT_APP_BACKEND_URL || "";

export function resolveContentAssetUrl(url) {
  if (!url) return "";
  return url.startsWith("/api/") ? `${backendBase}${url}` : url;
}

export function resolveArticleAssetUrls(html = "", assetUrls = {}) {
  let rendered = html.replaceAll('src="/api/', `src="${backendBase}/api/`);
  Object.entries(assetUrls).forEach(([key, url]) => {
    rendered = rendered.replaceAll(`${backendBase}/api/content/assets/${key}`, url);
    rendered = rendered.replaceAll(`/api/content/assets/${key}`, url);
  });
  return rendered;
}

export default function ArticleContent({ html, assetUrls }) {
  return <div className="article-body mt-10 text-[#D6DEE8]" dangerouslySetInnerHTML={{ __html: resolveArticleAssetUrls(html, assetUrls) }} />;
}
