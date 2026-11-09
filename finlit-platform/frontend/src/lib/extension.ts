import { useEffect, useState } from "react";

/** The FinLit browser extension (folder `extension/` of the repository). When the extension is published, put its store addresses here: the buttons across the site
 *  then say "Add to Chrome" / "Add to Edge" and open the store listing, where one click installs it. Until then they open /browser-extension, which offers the
 *  download and the four-step install. */
export const EXTENSION = {
  chromeStoreUrl: "",                  // e.g. https://chromewebstore.google.com/detail/finlit-ventures/<id>
  edgeStoreUrl: "",                    // e.g. https://microsoftedge.microsoft.com/addons/detail/<id>
  zipUrl: "/extension/finlit-extension.zip",
  version: "1.2.0",                    // the version inside the zip (a test keeps it equal to extension/manifest.json)
  page: "/browser-extension",
} as const;

/** True in a desktop Chromium browser (Chrome, Edge, Brave, Opera...): the only browsers the extension runs in. Phones cannot install extensions. */
export function canInstallExtension(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return /\b(Chrome|Chromium|Edg|OPR)\//.test(ua) && !/\b(Mobile|Android|iPhone|iPad)\b/.test(ua);
}

/** The installed version, read from the attribute the extension puts on this page (only on the FinLit website), or null. Checked again a moment after the page loads
 *  because the extension adds it at document start but a browser can take a while to wake it. */
export function installedVersion(): string | null {
  return typeof document === "undefined" ? null : document.documentElement.getAttribute("data-finlit-extension");
}

export function useExtensionInstalled(): string | null {
  const [v, setV] = useState<string | null>(installedVersion);
  useEffect(() => {
    const check = () => setV(installedVersion());
    check();
    const ts = [setTimeout(check, 400), setTimeout(check, 1500)];
    document.addEventListener("visibilitychange", check);
    return () => { ts.forEach(clearTimeout); document.removeEventListener("visibilitychange", check); };
  }, []);
  return v;
}

/** Where the main "get it" button goes: the store listing when there is one, else the page that explains the install. */
export function installTarget(ua?: string): { href: string; external: boolean; label: string } {
  const edge = /\bEdg\//.test(ua ?? (typeof navigator === "undefined" ? "" : navigator.userAgent));
  const store = edge && EXTENSION.edgeStoreUrl ? EXTENSION.edgeStoreUrl : EXTENSION.chromeStoreUrl;
  if (store) return { href: store, external: true, label: edge && EXTENSION.edgeStoreUrl ? "Add to Edge" : "Add to Chrome" };
  return { href: EXTENSION.page, external: false, label: "Get the extension" };
}
