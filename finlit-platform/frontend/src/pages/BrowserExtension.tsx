import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { EXTENSION, canInstallExtension, installTarget, useExtensionInstalled } from "../lib/extension";
import "../styles/extension.css";

const TERMS = ["EBITDA", "Return on equity", "Debt to equity", "Reliance Industries", "HDFC Bank"];

/** What the card looks like, with example figures (it is a picture of the extension, not live data). */
function Preview() {
  return (
    <div className="ext-demo" role="img" aria-label="Example of the FinLit card: Reliance Industries, FinLit IQ score 82 out of 100, Strong, with Growth and Profitability and Technical scores and key figures">
      <div className="eh"><Icon name="bars" />FinLit Ventures</div>
      <div className="eb">
        <h4>Reliance Industries Ltd</h4><small>RELIANCE · Oil &amp; Gas · example</small>
        <div className="es">
          <div className="eg"><small>FinLit IQ score</small><div><b>82</b> <small>/100</small></div><i>Strong</i></div>
          <div className="eb2"><div><span>Growth &amp; Profitability 84/100</span><i><u style={{ width: "84%" }} /></i></div><div><span>Technical score 76/100</span><i><u style={{ width: "76%" }} /></i></div></div>
        </div>
        <div className="ef"><div><small>MCap</small><b>₹19.6 L Cr</b></div><div><small>PE</small><b>26.4</b></div><div><small>ROE</small><b>9.8%</b></div><div><small>Debt/Equity</small><b>0.41</b></div></div>
        <span className="eo">Open full analysis on FinLit</span>
      </div>
      <div className="ex">Describes; not a recommendation. Information only, not investment advice.</div>
    </div>
  );
}

function Steps() {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText("chrome://extensions"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the address is shown to type */ } };
  return (
    <ol className="ext-steps">
      <li><span><b>Download and unzip</b>Press the download button, then open the file and choose Extract All (Windows) or double-click it (Mac). Keep the folder; Chrome reads the extension from it.</span></li>
      <li><span><b>Open the extensions page</b>In Chrome, Edge or Brave, type <span className="ext-code">chrome://extensions<button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button></span> in the address bar (in Edge it is <span className="ext-code">edge://extensions</span>) and press Enter.</span></li>
      <li><span><b>Turn on Developer mode</b>It is the switch at the top right of that page.</span></li>
      <li><span><b>Load the folder</b>Press <b>Load unpacked</b>, choose the unzipped folder (the one that holds <span className="ext-code">manifest.json</span>) and press Select Folder. Done: the FinLit button appears next to any text you select.<small>Browsers allow one-click install only from their store. Until the store listing is live, this takes about a minute, once.</small></span></li>
    </ol>
  );
}

export function BrowserExtensionPage() {
  useDocTitle("Browser extension", "Select any financial term or listed company on any web page and see its FinLit meaning or FinLit IQ score in a small card, without leaving the page. Free.");
  const installed = useExtensionInstalled();
  const can = canInstallExtension();
  const target = installTarget();
  const store = target.external;
  const Get = target.external
    ? <a className="btn primary lg" href={target.href} target="_blank" rel="noopener noreferrer"><Icon name="arrow" /> {target.label}</a>
    : <a className="btn primary lg" href={EXTENSION.zipUrl} download><Icon name="arrow" /> Download the extension</a>;

  return (
    <>
      <PageHeader wrap title="Browser extension" art="report" learn={false} links={["/glossary", "/mcp"]}
        description={<>Select any <b>financial term</b> or <b>listed company</b> on any web page and a small FinLit card opens beside it: the meaning, or the company's <b>FinLit IQ score</b>. Free, and it reads only the words you select.</>} />
      <div className="wrap ext">
        <div className="ext-hero">
          <section className="ext-card" aria-labelledby="ext-get">
            {installed ? (
              <>
                <span className="ext-badge ok"><Icon name="check" /> Installed · version {installed}</span>
                <h2 id="ext-get">You're all set</h2>
                <p>Select a word or a company name below, or on any page you read, then press the small green FinLit button that appears beside your selection. You can also right-click and choose <b>Look up on FinLit</b>, or press <b>Alt+Shift+F</b>.</p>
              </>
            ) : !can ? (
              <>
                <span className="ext-badge">Chrome, Edge, Brave and other Chromium browsers</span>
                <h2 id="ext-get">Open this page in Chrome or Edge on a computer</h2>
                <p>The FinLit extension runs in desktop Chromium browsers. Phones and Firefox or Safari cannot install it yet.</p>
              </>
            ) : (
              <>
                <span className="ext-badge">{store ? "Free · one click" : "Free · store listing coming soon"}</span>
                <h2 id="ext-get">Add FinLit to your browser</h2>
                <p>Understand any term and score any company wherever you read: news sites, research notes, blogs. No copying and pasting, no switching tabs.</p>
                <div className="ext-btns">{Get}</div>
                {!store && <><h3 style={{ marginTop: 16 }}>Install it in four steps</h3><Steps /></>}
                {store && <p className="ext-fine">Prefer a file? <a href={EXTENSION.zipUrl} download>Download the ZIP</a>.</p>}
              </>
            )}
          </section>
          <Preview />
        </div>

        <section className="ext-card" aria-labelledby="ext-try">
          <h2 id="ext-try">Try it here</h2>
          <p>With the extension installed, drag across any highlighted word below and press the green button.</p>
          <p className="ext-try">Analysts compare <mark>{TERMS[0]}</mark> and <mark>{TERMS[1]}</mark> before they look at <mark>{TERMS[2]}</mark>. Headlines about <mark>{TERMS[3]}</mark> or <mark>{TERMS[4]}</mark> are where the company card helps most.</p>
        </section>

        <div className="ext-three">
          <section className="ext-card"><h3>Terms in plain words</h3><p>Select any of 443 investing terms and see what it means, the formula and why it matters, from the FinLit glossary. No internet request is made for this.</p></section>
          <section className="ext-card"><h3>A company's score at a glance</h3><p>Select a listed company's name or ticker to see its FinLit IQ score, Growth &amp; Profitability and Technical scores, market value, PE, ROE and debt to equity, then open the full analysis on FinLit.</p></section>
          <section className="ext-card"><h3>Private by design</h3><p>It acts only on text you select. It never reads the page or what is around your selection, and the words you select stay in your browser.</p></section>
        </div>

        <section className="ext-card ext-faq" aria-labelledby="ext-faq">
          <h2 id="ext-faq">Questions</h2>
          <details><summary>Is it free?</summary><p>Yes. Company scores follow your FinLit plan, exactly as on the website: sign in to see them. Terms are free for everyone.</p></details>
          <details><summary>Why does it ask to run on all websites?</summary><p>So the green button can appear beside text you select on any site. It does nothing until you select something, and it never reads the rest of the page. You can turn it off for one site or everywhere from the toolbar icon.</p></details>
          <details><summary>What does it send to FinLit?</summary><p>Your selected words are never sent. When it recognises a listed company and you open its card, it asks FinLit for that one company by its stock symbol. If you are signed in to FinLit in the same browser, the request carries your session so the card shows what your plan allows.</p></details>
          <details><summary>How do I remove it?</summary><p>Open <span className="ext-code">chrome://extensions</span>, find FinLit Ventures and press Remove.</p></details>
          <details><summary>Is this advice?</summary><p>No. The card describes a company's financial health from its filings and prices. Information only, not investment advice.</p></details>
        </section>
        <section className="ext-card" id="privacy" aria-labelledby="ext-priv">
          <h2 id="ext-priv">Privacy of the FinLit browser extension</h2>
          <p><b>What it reads.</b> Only the words you select on a page, at the moment you select them. It does not read the page, the article around your selection, images, forms, passwords, other sites' cookies or your browsing history. Selections inside text boxes are ignored.</p>
          <p><b>What it sends.</b> Your selected words are never sent anywhere: they are looked up on lists kept inside the extension (the FinLit glossary and the public list of company names). When a listed company is recognised and you open its card, the extension asks finlitventures.com for that one company by its stock symbol. If you are signed in to FinLit in the same browser, that request carries your FinLit session so the card shows what your plan allows; if not, you see the free view.</p>
          <p><b>What it stores.</b> On your device only: your two switches (on or off, and the sites you turned it off on), the public company list (refreshed at most once a day) and, for ten minutes, the cards you opened.</p>
          <p><b>What it does not do.</b> No tracking, no analytics, no advertising, no data sold or shared, and no remote code: everything it runs ships inside the extension. Turn it off for everything or for one site from the toolbar icon, or remove it at any time.</p>
        </section>
        <p className="ext-fine">Describes the company's financial health from its filings and prices; not a recommendation. Information only, not investment advice.</p>
      </div>
    </>
  );
}
