import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Icon } from "../lib/icons";
import { EXTENSION, canInstallExtension, installTarget, useExtensionInstalled } from "../lib/extension";
import "../styles/extension.css";

const KEY = "finlit.extensionBanner";
const SHOW_ON = new Set(["/", "/dashboard", "/glossary"]);
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

/** A thin, dismissible strip under the header on the home page, dashboard and glossary: only in a desktop Chromium browser that does not have the extension yet. Dismissing is remembered in this browser. */
export function ExtensionBanner() {
  const { pathname } = useLocation();
  const installed = useExtensionInstalled();
  const [gone, setGone] = useState(read);
  if (gone || installed || !SHOW_ON.has(pathname) || !canInstallExtension()) return null;
  const t = installTarget();
  const close = () => { setGone(true); try { localStorage.setItem(KEY, "1"); } catch { /* not remembered */ } };
  return (
    <aside className="ext-banner" aria-label="FinLit browser extension">
      <div className="wrap">
        <span className="ext-b-ic" aria-hidden="true"><Icon name="bars" /></span>
        <p><b>New: the FinLit browser extension.</b> Select any financial term or company on any web page to see what it means, or see the company's FinLit score.</p>
        {t.external
          ? <a className="btn primary" href={t.href} target="_blank" rel="noopener noreferrer">{t.label}</a>
          : <Link className="btn primary" to={EXTENSION.page}>{t.label}</Link>}
        <button type="button" className="ext-b-x" aria-label="Dismiss" onClick={close}>&times;</button>
      </div>
    </aside>
  );
}
