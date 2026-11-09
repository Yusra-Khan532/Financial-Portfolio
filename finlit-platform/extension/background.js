// FinLit browser extension: the background worker. It answers the page script's questions and does all network work, so pages never see FinLit's address.
//
// What it asks the network for, and when:
//   - the public company list (/api/stocks/search-index): once a day at most, and only when a person has selected text and asked for a lookup (a 304 costs almost nothing);
//   - one small card (/api/ext/company/SYMBOL): only when a company was recognised AND its card is opened. The selected words are never sent: only the symbol.
// The glossary is inside the extension: a term lookup makes no request at all.
import { cleanSelection } from "./lib/text.js";
import { makeGlossary } from "./lib/glossary.js";
import { makeCompanies, slimIndex } from "./lib/companies.js";

const SITE = "https://finlitventures.com";
const DAY = 24 * 3600 * 1000;
const CARD_TTL = 10 * 60 * 1000;
const TIMEOUT = 8000;
const MENU = "finlit-lookup";

/** The site's address. A test build may point at a local server by saving apiBase (localhost only); a real install always uses the site. */
async function base() {
  try {
    const { apiBase } = await chrome.storage.local.get("apiBase");
    if (typeof apiBase === "string" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(apiBase)) return apiBase;
  } catch { /* storage unavailable: the site */ }
  return SITE;
}

async function getJson(url, init = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(timer); }
}

// ---- glossary (inside the extension)
let glossary = null;
async function loadGlossary() {
  if (!glossary) {
    const doc = await (await fetch(chrome.runtime.getURL("data/glossary.json"))).json();
    glossary = makeGlossary(doc);
  }
  return glossary;
}

// ---- company list (public, cached a day)
let companies = null, companiesAt = 0;
async function loadCompanies() {
  if (companies && Date.now() - companiesAt < DAY) return companies;      // already in memory and under a day old: nothing to read or fetch
  const got = await chrome.storage.local.get("idx");
  let idx = got.idx;
  if (!idx || Date.now() - idx.at >= DAY) {
    try {
      const res = await getJson(`${await base()}/api/stocks/search-index`, { credentials: "omit", headers: idx && idx.etag ? { "If-None-Match": idx.etag } : {} });
      if (res.status === 304 && idx) { idx = { ...idx, at: Date.now() }; await chrome.storage.local.set({ idx }); }
      else if (res.ok) { idx = { rows: slimIndex(await res.json()), etag: res.headers.get("etag") || "", at: Date.now() }; await chrome.storage.local.set({ idx }); }
    } catch { /* offline or slow: the list on hand, if any, is used */ }
  }
  if (!idx || !idx.rows || !idx.rows.length) return null;
  if (!companies || companiesAt !== idx.at) { companies = makeCompanies(idx.rows); companiesAt = idx.at; }
  return companies;
}

async function lookup(raw) {
  const text = cleanSelection(raw);
  if (!text) return { ok: false, kind: "text", message: "Select a financial term or a company name (up to 8 words) to look it up." };
  const g = await loadGlossary();
  const term = g.exact(text);
  const c = await loadCompanies();
  const hit = c ? c.find(text) : null;
  const related = term ? [] : g.related(text).map((t) => ({ id: t.id, term: t.term, topic: t.topic, meaning: t.meaning, formula: t.formula || "" }));
  return {
    ok: true, text, site: await base(),
    glossary: term ? { id: term.id, term: term.term, topic: term.topic, meaning: term.meaning, formula: term.formula || "" } : null,
    related,
    company: hit ? { symbol: hit.best[0], name: hit.best[1], how: hit.how, others: hit.others.map((r) => ({ symbol: r[0], name: r[1] })) } : null,
    companyListMissing: !c,
  };
}

// ---- the company card (one small request per opened card, kept ten minutes)
const memo = new Map();
const pending = new Map();
async function readCard(symbol) {
  const key = `c:${symbol}`;
  const hot = memo.get(key);
  if (hot && Date.now() - hot.at < CARD_TTL) return hot.v;
  try {
    const s = chrome.storage.session && (await chrome.storage.session.get(key))[key];
    if (s && Date.now() - s.at < CARD_TTL) { memo.set(key, s); return s.v; }
  } catch { /* no session storage */ }
  return null;
}
async function saveCard(symbol, v) {
  const key = `c:${symbol}`, rec = { at: Date.now(), v };
  memo.set(key, rec);
  try { if (chrome.storage.session) await chrome.storage.session.set({ [key]: rec }); } catch { /* memory copy only */ }
}

async function company(symbol) {
  if (typeof symbol !== "string" || !/^[A-Z0-9&_.\-]{1,24}$/.test(symbol)) return { ok: false, kind: "error", message: "That is not a company code." };
  const cached = await readCard(symbol);
  if (cached) return { ok: true, data: cached };
  if (pending.has(symbol)) return pending.get(symbol);
  const job = (async () => {
    try {
      const res = await getJson(`${await base()}/api/ext/company/${encodeURIComponent(symbol)}`, { credentials: "include", headers: { Accept: "application/json" } });
      if (res.status === 404) {
        let j = null;
        try { j = await res.json(); } catch { /* not JSON */ }
        // FinLit's own "no such company" answer says so; any other 404 means the site has not got this feature yet, which is not the company's fault
        return j && j.status === "not_found" ? { ok: false, kind: "notfound", message: "FinLit has no report for this company yet." }
                                             : { ok: false, kind: "error", message: "The company card is not available from FinLit right now." };
      }
      if (res.status === 429) return { ok: false, kind: "busy", message: "FinLit is busy right now. Try again in a minute." };
      if (!res.ok) return { ok: false, kind: "error", message: "FinLit could not answer right now." };
      const data = await res.json();
      await saveCard(symbol, data);
      return { ok: true, data };
    } catch {
      return { ok: false, kind: "offline", message: "Could not reach FinLit. Check your connection." };
    } finally { pending.delete(symbol); }
  })();
  pending.set(symbol, job);
  return job;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== "string") return false;
  if (msg.type === "lookup") lookup(String(msg.text || "").slice(0, 400)).then(reply, () => reply({ ok: false, kind: "error", message: "Something went wrong." }));
  else if (msg.type === "company") company(msg.symbol).then(reply, () => reply({ ok: false, kind: "error", message: "Something went wrong." }));
  else if (msg.type === "site") base().then((b) => reply({ site: b }));
  else return false;
  return true;
});

// ---- right-click menu and keyboard shortcut: both only ever act on text the person has selected
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: MENU, title: "Look up “%s” on FinLit", contexts: ["selection"] }));
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU && tab && tab.id != null) chrome.tabs.sendMessage(tab.id, { type: "show", text: info.selectionText || "" }).catch(() => {});
});
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "lookup-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) chrome.tabs.sendMessage(tab.id, { type: "show", text: "" }).catch(() => {});
});
