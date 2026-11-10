import { useEffect } from "react";

/** Per-page title and description (the old site had one static title for every page). */
let siteDescription: string | null = null;   // the description the page loaded with: pages that set none go back to it, so a stale one never lingers

export function useDocTitle(title: string, description?: string) {
  useEffect(() => {
    document.title = `${title} · FinLit`;
    let m = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (siteDescription === null) siteDescription = m?.content ?? "";
    const text = description || siteDescription;
    if (!m && text) { m = document.createElement("meta"); m.name = "description"; document.head.appendChild(m); }
    if (m && text) m.content = text;
    // the canonical address follows client-side navigation (the server sets it for the first page): this page's own address on the site's own host
    const c = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (c) c.href = new URL(location.pathname.replace(/\/+$/, "") || "/", c.href).href;
  }, [title, description]);
}
