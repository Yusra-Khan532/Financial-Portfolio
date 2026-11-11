// FinLit browser extension: the page script.
//
// What it does: when a person selects a short phrase (2 to 80 characters, up to 8 words) it shows a small FinLit button beside the selection. Pressing the button (or the
// right-click menu item, or Alt+Shift+F) opens the FinLit card: the meaning of a financial term, or a listed company's FinLit score.
// What it never does: read the page, the article around the selection, images, forms or anything else; send the selected words anywhere (the background worker looks the
// words up on the extension's own lists, and only a recognised company's symbol is ever requested); run inside text boxes; touch the host page's own elements. It adds one
// element to the page, with its look kept inside a shadow root.
(() => {
  if (window.top !== window || window.__finlitExtension) return;
  window.__finlitExtension = true;

  const MAX = 80, WORDS = 8;
  const SITE_DEFAULT = "https://finlitventures.com";
  let prefs = { enabled: true, disabledHosts: [] };
  let host = null, root = null, bubble = null, panel = null, panelState = null, pinned = false, timer = 0;

  const allowed = () => prefs.enabled !== false && !(prefs.disabledHosts || []).includes(location.hostname);
  try {
    chrome.storage.local.get({ enabled: true, disabledHosts: [] }).then((p) => { prefs = p; }).catch(() => {});
    chrome.storage.onChanged.addListener((c, area) => {
      if (area !== "local") return;
      if (c.enabled) prefs.enabled = c.enabled.newValue !== false;
      if (c.disabledHosts) prefs.disabledHosts = c.disabledHosts.newValue || [];
      if (!allowed()) { hideBubble(); closePanel(); }
    });
  } catch { /* extension reloaded: this page script is stale and does nothing */ }

  /** Same rule as lib/text.js cleanSelection (the background worker applies it again). */
  function clean(raw) {
    let t = String(raw || "").replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
    t = t.replace(/^[\s"'“”‘’(\[{<]+|[\s"'“”‘’)\]}>.,;:!?]+$/g, "");
    if (t.length < 2 || t.length > MAX || t.split(" ").length > WORDS) return null;
    if (!/[A-Za-z]{2}/.test(t) || /@|:\/\/|^www\./i.test(t)) return null;
    return t;
  }

  const inBox = (n) => !!(n && n.closest && n.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"]'));
  function selection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return null;
    const n = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    if (inBox(n) || (host && (n === host || host.contains(n)))) return null;
    const text = clean(sel.toString());
    const r = text && sel.getRangeAt(0).getBoundingClientRect();
    return text && r && (r.width || r.height) ? { text, rect: r } : null;
  }

  // ---- the one element this script adds, with everything inside a closed shadow root
  const CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{position:fixed;inset:0;pointer-events:none;z-index:2147483647;color:var(--ink);--bg:#fff;--ink:#10231a;--mut:#56685e;--line:#dce8e0;--g:#0f6b45;--gd:#0b4d33;--tint:#eaf5ee;--tint2:#f4f9f6;--bar:#dbe8e0;--warn:#8a5a00;--warnbg:#fff4dc}
@media (prefers-color-scheme:dark){.wrap{--bg:#10201a;--ink:#e8f3ec;--mut:#9db3a7;--line:#25382f;--g:#3fbf85;--gd:#1d7a52;--tint:#173125;--tint2:#13271e;--bar:#27402f;--warn:#f0c36a;--warnbg:#3a2f12}}
.bubble{position:fixed;pointer-events:auto;width:30px;height:30px;border-radius:50%;border:0;background:var(--g);color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.28);cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;animation:pop .14s ease-out}
.bubble.on{display:flex}.bubble:hover{background:var(--gd)}.bubble:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--g);outline-offset:2px}
.panel{position:fixed;pointer-events:auto;width:380px;max-width:calc(100vw - 24px);max-height:min(88vh,660px);overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.28);display:none;animation:pop .16s ease-out;font-size:14px;line-height:1.45}
.panel.on{display:block}
@keyframes pop{from{opacity:0;transform:translateY(4px) scale(.98)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.bubble,.panel{animation:none}}
.hd{display:flex;align-items:center;gap:8px;padding:12px 14px 10px}
.hd .t{flex:1;font:700 16px/1.2 Georgia,"Times New Roman",serif}
.ib{width:28px;height:28px;border:0;border-radius:8px;background:none;color:var(--mut);cursor:pointer;display:grid;place-items:center;padding:0;font-size:16px}
.ib:hover{background:var(--tint)}.ib[aria-pressed=true]{color:var(--g);background:var(--tint)}
.tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 14px 10px}
.tab{border:1px solid var(--line);background:var(--tint2);color:var(--mut);border-radius:10px;padding:8px;font-weight:600;font-size:13px;cursor:pointer}
.tab[aria-selected=true]{background:var(--tint);color:var(--g);border-color:var(--g)}
.body{padding:0 14px 12px}
.co{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}
.co h2{margin:0;font:700 17px/1.25 Georgia,"Times New Roman",serif}.co small{display:block;color:var(--mut);font-size:12px;margin-top:2px}
.co a{margin-left:auto;color:var(--mut);display:grid;place-items:center;width:28px;height:28px;border-radius:8px}.co a:hover{background:var(--tint);color:var(--g)}
.sc{display:grid;grid-template-columns:150px 1fr;gap:10px;margin-bottom:10px}
@media (max-width:420px){.sc{grid-template-columns:1fr}}
.big{background:var(--tint);border-radius:12px;padding:10px 12px}
.big .l{font-size:12px;font-weight:600;color:var(--mut);display:flex;align-items:center;gap:6px}
.big .n{font:700 34px/1.1 Georgia,"Times New Roman",serif}.big .n span{font:500 14px system-ui;color:var(--mut)}
.chip{display:inline-block;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;background:var(--g);color:#fff}
.chip.mid{background:#b9770e}.chip.low{background:#b5413b}.chip.soft{background:var(--tint);color:var(--g);border:1px solid var(--line)}
.bars{display:grid;gap:10px;align-content:center}.bar .r{display:flex;justify-content:space-between;font-size:12px;font-weight:600}.bar i{display:block;height:6px;border-radius:3px;background:var(--bar);margin-top:4px;overflow:hidden}.bar u{display:block;height:100%;background:var(--g);border-radius:3px}
.fig{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:0 0 10px}
.fig div{padding:8px 4px;text-align:center;border-left:1px solid var(--line)}.fig div:first-child{border-left:0}.fig small{display:block;font-size:11px;color:var(--mut);font-weight:600}.fig b{font-size:13px}
.take{background:var(--tint2);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:10px}.take b{display:block;font-size:13px;margin-bottom:2px}
.what{font-size:12px;color:var(--mut);margin:0 0 10px}
.btn{display:flex;gap:8px;align-items:center;justify-content:center;width:100%;border:0;border-radius:12px;background:var(--gd);color:#fff;font-weight:700;font-size:14px;padding:11px;text-decoration:none;cursor:pointer}.btn:hover{background:var(--g)}
.btn.ghost{background:var(--tint);color:var(--g);border:1px solid var(--line);margin-bottom:8px}
.term h2{margin:0;font:700 22px/1.2 Georgia,"Times New Roman",serif}.term .row{display:flex;gap:8px;align-items:center;margin-bottom:8px}.term .row .chip{margin-left:auto}
.term p{margin:0 0 10px}.fx{display:flex;gap:8px;background:var(--tint2);border:1px solid var(--line);border-radius:10px;padding:9px 11px;margin-bottom:10px;font-size:13px}
.hint{color:var(--mut);margin:0 0 10px}.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.chips button{border:1px solid var(--line);background:var(--tint2);color:var(--ink);border-radius:999px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer}.chips button:hover{border-color:var(--g)}
.lock{display:flex;gap:8px;align-items:flex-start;background:var(--warnbg);color:var(--warn);border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:13px}
.sk{height:14px;border-radius:7px;background:var(--bar);margin:10px 0;animation:sk 1.1s ease-in-out infinite alternate}@keyframes sk{from{opacity:.5}to{opacity:1}}
.ft{border-top:1px solid var(--line);padding:8px 14px 10px;font-size:11px;color:var(--mut)}
.err{background:var(--warnbg);color:var(--warn);border-radius:12px;padding:10px 12px;margin-bottom:10px}
`;

  const NS = "http://www.w3.org/2000/svg";
  function icon(kind, size = 16) {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", size); s.setAttribute("height", size); s.setAttribute("aria-hidden", "true");
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    const p = (d) => { const e = document.createElementNS(NS, "path"); e.setAttribute("d", d); s.appendChild(e); };
    if (kind === "logo") { s.setAttribute("stroke-width", "3.2"); p("M5 20v-5"); p("M12 20V10"); p("M19 20V4"); }
    else if (kind === "open") { p("M14 4h6v6"); p("M20 4l-9 9"); p("M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"); }
    else if (kind === "close") { p("M6 6l12 12"); p("M18 6L6 18"); }
    else if (kind === "pin") { p("M12 17v5"); p("M9 3h6l-1 6 3 3v2H7v-2l3-3z"); }
    else if (kind === "sound") { p("M4 9v6h4l5 4V5L8 9z"); p("M16.5 8.5a5 5 0 0 1 0 7"); }
    else if (kind === "info") { p("M12 8h.01"); p("M11 12h1v5h1"); const c = document.createElementNS(NS, "circle"); c.setAttribute("cx", 12); c.setAttribute("cy", 12); c.setAttribute("r", 9); s.appendChild(c); }
    else if (kind === "lock") { p("M7 11V8a5 5 0 0 1 10 0v3"); p("M5 11h14v9H5z"); }
    return s;
  }
  function el(tag, cls, text, attrs) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    return e;
  }

  function ensureHost() {
    if (host) return;
    host = document.createElement("finlit-extension");
    host.setAttribute("style", "all:initial");
    root = host.attachShadow({ mode: "closed" });
    try { const sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); root.adoptedStyleSheets = [sheet]; }
    catch { const st = document.createElement("style"); st.textContent = CSS; root.appendChild(st); }
    const wrap = el("div", "wrap");
    bubble = el("button", "bubble", null, { type: "button", "aria-label": "Look up on FinLit", title: "Look up on FinLit" });
    bubble.appendChild(icon("logo", 17));
    bubble.addEventListener("mousedown", (e) => e.preventDefault());       // keep the person's selection
    bubble.addEventListener("click", () => { if (bubble._sel) openPanel(bubble._sel.text, bubble._sel.rect); });
    panel = el("div", "panel", null, { role: "dialog", "aria-label": "FinLit Ventures" });
    wrap.append(bubble, panel);
    root.appendChild(wrap);
    document.documentElement.appendChild(host);
  }

  function hideBubble() { if (bubble) bubble.classList.remove("on"); }
  function showBubble(sel) {
    ensureHost();
    bubble._sel = sel;
    const r = sel.rect, vw = window.innerWidth, vh = window.innerHeight;
    bubble.style.left = `${Math.max(6, Math.min(r.right + 4, vw - 38))}px`;
    bubble.style.top = `${r.bottom + 36 > vh ? Math.max(6, r.top - 36) : r.bottom + 6}px`;
    bubble.classList.add("on");
  }
  function closePanel() { if (panel) panel.classList.remove("on"); panelState = null; pinned = false; }
  function place(rect) {
    const vw = window.innerWidth, vh = window.innerHeight, w = Math.min(380, vw - 24);
    const left = Math.max(12, Math.min(rect ? rect.left : vw - w - 12, vw - w - 12));
    const top = Math.max(12, Math.min(rect ? rect.bottom + 10 : 12, vh - 420));
    panel.style.left = `${left}px`; panel.style.top = `${top}px`;
  }

  const send = (m) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(m, (r) => resolve(chrome.runtime.lastError ? { ok: false, kind: "offline", message: "The FinLit extension was updated. Reload this page." } : r)); }
    catch { resolve({ ok: false, kind: "offline", message: "The FinLit extension was updated. Reload this page." }); }
  });
  const link = (site, path, cls, label) => { const a = el("a", cls, null, { href: site + path, target: "_blank", rel: "noopener noreferrer" }); if (label) { a.append(icon("open", 15), document.createTextNode(label)); } return a; };

  // ---- the panel
  function frame(title) {
    panel.replaceChildren();
    const hd = el("div", "hd");
    const lg = el("span", null, null); lg.style.color = "var(--g)"; lg.appendChild(icon("logo", 20));
    const pin = el("button", "ib", null, { type: "button", "aria-label": "Keep this card open", "aria-pressed": String(pinned), title: "Keep open" });
    pin.appendChild(icon("pin", 16));
    pin.addEventListener("click", () => { pinned = !pinned; pin.setAttribute("aria-pressed", String(pinned)); });
    const x = el("button", "ib", null, { type: "button", "aria-label": "Close", title: "Close (Esc)" });
    x.appendChild(icon("close", 16));
    x.addEventListener("click", closePanel);
    hd.append(lg, el("span", "t", title || "FinLit Ventures"), pin, x);
    const body = el("div", "body");
    const ft = el("div", "ft", "Describes; not a recommendation. Information only, not investment advice.");
    panel.append(hd, body, ft);
    return { hd, body };
  }

  function skeleton(body) { body.replaceChildren(el("div", "sk"), el("div", "sk"), el("div", "sk")); body.firstChild.style.width = "60%"; }

  function glossaryView(body, g, site) {
    const box = el("div", "term");
    const row = el("div", "row");
    row.appendChild(el("h2", null, g.term));
    if ("speechSynthesis" in window) {
      const sp = el("button", "ib", null, { type: "button", "aria-label": `Listen to “${g.term}”`, title: "Listen" });
      sp.appendChild(icon("sound", 16));
      sp.addEventListener("click", () => { try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(g.term)); } catch { /* no voice */ } });
      row.appendChild(sp);
    }
    row.appendChild(el("span", "chip soft", g.topic || "Financial term"));
    box.append(row, el("p", null, g.meaning));
    if (g.formula) { const f = el("div", "fx"); f.appendChild(icon("info", 16)); f.appendChild(el("span", null, `Formula: ${g.formula}`)); box.appendChild(f); }
    box.appendChild(link(site, `/glossary#${encodeURIComponent(g.id)}`, "btn ghost", "Read more in the FinLit glossary"));
    body.replaceChildren(box);
  }

  const bandClass = (w) => (w === "Strong" || w === "Healthy" ? "" : w === "Mixed" ? "mid" : "low");
  function companyView(body, d, site, others, swap) {
    const frag = document.createDocumentFragment();
    const co = el("div", "co"), who = el("div");
    who.append(el("h2", null, d.name || d.symbol), el("small", null, [d.symbol, d.sector].filter(Boolean).join(" · ")));
    co.append(who, link(site, d.url || `/stocks/${d.symbol}`, "", null));
    co.lastChild.setAttribute("aria-label", "Open on FinLit"); co.lastChild.appendChild(icon("open", 16));
    frag.appendChild(co);
    if (d.locked) {
      const l = el("div", "lock"); l.append(icon("lock", 16), el("span", null, d.signedIn
        ? "The FinLit score is part of the Silver plan."
        : "Sign in to FinLit in this browser to see the FinLit score."));
      frag.appendChild(l);
      const parts = [d.price != null ? `Price ₹${d.price.toLocaleString("en-IN")}` : null, d.marketCapCr ? `Market value ${fmtCr(d.marketCapCr)}` : null].filter(Boolean);
      if (parts.length) frag.appendChild(el("p", "hint", parts.join(" · ")));
      frag.appendChild(link(site, d.signedIn ? "/plans" : "/login", "btn ghost", d.signedIn ? "See plans" : "Sign in to FinLit"));
    } else if (d.score != null) {
      const sc = el("div", "sc"), big = el("div", "big");
      const lab = el("div", "l", "FinLit score");
      const n = el("div", "n", String(d.score)); n.appendChild(el("span", null, " /100"));
      big.append(lab, n, el("span", "chip " + bandClass(d.band), d.band || ""));
      const bars = el("div", "bars");
      for (const [label, v] of [["Growth & Profitability", d.fundamental], ["Technical", d.technical]]) {
        const b = el("div", "bar"), r = el("div", "r"); r.append(el("span", null, label), el("span", null, v == null ? "–" : `${v}/100`));
        const i = el("i"); const u = el("u"); u.style.width = `${v == null ? 0 : Math.max(0, Math.min(100, v))}%`; i.appendChild(u); b.append(r, i); bars.appendChild(b);
      }
      sc.append(big, bars); frag.appendChild(sc);
      const f = d.figures || {}, fig = el("div", "fig");
      for (const [k, v] of [["MCap", d.marketCapCr ? fmtCr(d.marketCapCr) : "–"], ["PE", f.pe == null ? "–" : f.pe.toFixed(1)], ["ROE", f.roe == null ? "–" : `${f.roe.toFixed(1)}%`], ["Debt/Equity", f.debtToEquity == null ? "–" : f.debtToEquity.toFixed(2)]]) {
        const c = el("div"); c.append(el("small", null, k), el("b", null, v)); fig.appendChild(c);
      }
      frag.appendChild(fig);
      if (d.take) { const t = el("div", "take"); t.append(el("b", null, "Quick take"), el("span", null, d.take)); frag.appendChild(t); }
      if (d.what) frag.appendChild(el("p", "what", d.what));
    } else if (d.why) frag.appendChild(el("p", "hint", d.why));
    if (others && others.length) {
      frag.appendChild(el("p", "hint", "Not this one?"));
      const chips = el("div", "chips");
      for (const o of others) { const b = el("button", null, o.name, { type: "button" }); b.addEventListener("click", () => swap(o.symbol, o.name)); chips.appendChild(b); }
      frag.appendChild(chips);
    }
    frag.appendChild(link(site, d.url || `/stocks/${d.symbol}`, "btn", "Open full analysis on FinLit"));
    body.replaceChildren(frag);
  }
  const fmtCr = (v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)} L Cr` : `₹${Math.round(v).toLocaleString("en-IN")} Cr`);

  /** The card could not be loaded: the company is still named, with a note and the button that opens it on FinLit, so a lookup never ends in a dead end. */
  function companyFallback(body, symbol, name, r, site) {
    const frag = document.createDocumentFragment();
    const co = el("div", "co"), who = el("div");
    who.append(el("h2", null, name || symbol), el("small", null, symbol));
    co.appendChild(who);
    frag.append(co, el("p", "hint", r.message || "The card could not be loaded."), link(site, `/stocks/${encodeURIComponent(symbol)}`, "btn", "Open on FinLit"));
    body.replaceChildren(frag);
  }

  function errView(body, r, site) {
    const e = el("div", "err", r.message || "Something went wrong.");
    body.replaceChildren(e);
    if (r.kind === "text" || r.kind === "notfound") body.appendChild(link(site, "/glossary", "btn ghost", "Open the FinLit glossary"));
  }

  async function openPanel(text, rect) {
    ensureHost(); hideBubble();
    const mine = (panelState = { text });
    const { body } = frame("FinLit Ventures");
    skeleton(body);
    place(rect); panel.classList.add("on");
    const r = await send({ type: "lookup", text });
    if (panelState !== mine) return;                                        // closed, or another lookup was opened meanwhile
    const site = (r && r.site) || SITE_DEFAULT;
    if (!r || !r.ok) { errView(body, r || { message: "Something went wrong." }, site); return; }
    const hasG = !!r.glossary, hasC = !!r.company;
    if (!hasG && !hasC) {
      const nf = el("div", "term");
      nf.append(el("h2", null, r.text), el("p", "hint", r.companyListMissing ? "FinLit has no glossary term for this, and the company list could not be loaded. Check your connection and try again." : "FinLit has no glossary term or listed company with this name yet."));
      if (r.related && r.related.length) {
        nf.appendChild(el("p", "hint", "Did you mean"));
        const chips = el("div", "chips");
        for (const t of r.related) { const b = el("button", null, t.term, { type: "button" }); b.addEventListener("click", () => glossaryView(body, t, site)); chips.appendChild(b); }
        nf.appendChild(chips);
      }
      nf.appendChild(link(site, "/glossary", "btn ghost", "Open the FinLit glossary"));
      body.replaceChildren(nf);
      return;
    }
    const gBody = el("div"), cBody = el("div");
    let loadedC = false;
    const show = async (which) => {
      body.replaceChildren(which === "g" ? gBody : cBody);
      if (which === "c" && !loadedC) { loadedC = true; await loadCompany(r.company.symbol); }
    };
    const loadCompany = async (symbol, name) => {
      skeleton(cBody);
      const c = await send({ type: "company", symbol });
      if (panelState !== mine) return;
      if (!c || !c.ok) { companyFallback(cBody, symbol, name || (symbol === r.company.symbol ? r.company.name : symbol), c || { message: "Something went wrong." }, site); return; }
      companyView(cBody, c.data, site, symbol === r.company.symbol ? r.company.others : [], (s, n) => loadCompany(s, n));
    };
    if (hasG) glossaryView(gBody, r.glossary, site);
    if (hasG && hasC) {
      const tabs = el("div", "tabs", null, { role: "tablist" });
      const tc = el("button", "tab", "Company", { type: "button", role: "tab" }), tg = el("button", "tab", "Glossary", { type: "button", role: "tab" });
      const pick = (w) => { tc.setAttribute("aria-selected", String(w === "c")); tg.setAttribute("aria-selected", String(w === "g")); show(w); };
      tc.addEventListener("click", () => pick("c")); tg.addEventListener("click", () => pick("g"));
      tabs.append(tc, tg);
      panel.insertBefore(tabs, panel.querySelector(".body"));
      pick("g");                                                          // an exact glossary term wins; the company is one tap away
    } else show(hasG ? "g" : "c");
  }

  // ---- when to offer the button: only after a person has finished selecting
  function onSelect(e) {
    if (!allowed()) return;
    if (e && e.composedPath && host && e.composedPath().includes(host)) return;
    clearTimeout(timer);
    timer = setTimeout(() => { const s = selection(); if (s) showBubble(s); else hideBubble(); }, 140);
  }
  document.addEventListener("mouseup", onSelect, true);
  document.addEventListener("keyup", (e) => { if (e.key === "Shift" || e.key.startsWith("Arrow")) onSelect(e); }, true);
  document.addEventListener("mousedown", (e) => {
    if (host && e.composedPath().includes(host)) return;
    hideBubble();
    if (panel && panel.classList.contains("on") && !pinned) closePanel();
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel && panel.classList.contains("on")) closePanel(); }, true);

  // the right-click menu and the keyboard shortcut ask for the person's current selection (or the menu's text)
  try {
    chrome.runtime.onMessage.addListener((m) => {
      if (!m || m.type !== "show" || !allowed()) return;
      const s = selection();
      const text = clean(m.text) || (s && s.text);
      if (text) openPanel(text, s ? s.rect : null);
    });
  } catch { /* stale script */ }
})();
