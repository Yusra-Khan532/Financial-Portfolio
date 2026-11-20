// FinLit relay: a free Cloudflare Worker that fetches public files for the FinLit server from places that refuse the server's own address (AWS).
//   1. AMFI, GET /api/<name>: expense ratio, fund size (facts job); fund houses, their schemes and each scheme's details incl. exit load (portfolio job).
//   2. AMFI, POST (JSON body) /gateway/pollingsebi/api/amfi/fundperformance and /getsubcategory: benchmark, risk-o-meter, daily AUM (portfolio job).
//   3. GET /fetch?u=<https address> for nseindia.com and bseindia.com (company brief) and barodabnpparibasmf.in (that fund house's monthly portfolios).
// What it never does: forward any other host or path, any other method, or any request without the shared key (X-Relay-Key). No data is stored here.
const AMFI = [
  /^\/api\/populate-ter-month$/,
  /^\/api\/populate-te-rdata-revised$/,
  /^\/api\/average-aum-schemewise$/,
  /^\/api\/populate-mf$/,
  /^\/api\/populate-scheme$/,
  /^\/api\/scheme-details$/,
];
const AMFI_POST = [
  /^\/gateway\/pollingsebi\/api\/amfi\/fundperformance$/,
  /^\/gateway\/pollingsebi\/api\/amfi\/getsubcategory$/,
];
const EXCHANGE_HOST = /^(?:[a-z0-9-]+\.)*(?:nseindia\.com|bseindia\.com|barodabnpparibasmf\.in)$/;
const POST_MAX_BYTES = 4096;   // the two AMFI POSTs carry a few fields of JSON
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// NSE's API answers only with the cookie its home page sets: fetch the home page first, then ask with that cookie.
async function nseCookie(ua) {
  const home = await fetch("https://www.nseindia.com/", { headers: { "User-Agent": ua, "Accept": "text/html,application/xhtml+xml" }, redirect: "manual" });
  const list = typeof home.headers.getSetCookie === "function" ? home.headers.getSetCookie() : [];
  return list.map((c) => c.split(";")[0]).join("; ");
}

function relayError(status, text) {
  return new Response(text, { status, headers: { "X-Relay": "1", "X-Relay-Error": text } });
}

async function exchangeFetch(request, u) {
  let target;
  try { target = new URL(u.searchParams.get("u") || ""); } catch (e) { return relayError(400, "bad address"); }
  if (target.protocol !== "https:" || target.port !== "" || !EXCHANGE_HOST.test(target.hostname)) return relayError(404, "host not allowed");
  const ua = request.headers.get("X-Fwd-User-Agent") || BROWSER_UA;
  const headers = { "User-Agent": ua, "Accept": request.headers.get("X-Fwd-Accept") || "*/*" };
  const ref = request.headers.get("X-Fwd-Referer");
  if (ref) headers["Referer"] = ref;
  try {
    if (target.hostname === "www.nseindia.com" && target.pathname.startsWith("/api/")) headers["Cookie"] = await nseCookie(ua);
    const upstream = await fetch(target.toString(), { headers, redirect: "manual" });
    const out = { "X-Relay": "1", "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream" };
    const loc = upstream.headers.get("Location");
    if (loc) out["Location"] = loc;
    const noBody = upstream.status === 204 || upstream.status === 205 || upstream.status === 304;
    return new Response(noBody ? null : upstream.body, { status: upstream.status, headers: out });
  } catch (e) {
    return relayError(502, "could not reach the exchange");
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "POST") return new Response("method not allowed", { status: 405 });
    if (!env.RELAY_KEY || request.headers.get("X-Relay-Key") !== env.RELAY_KEY) return new Response("forbidden", { status: 403 });
    const u = new URL(request.url);
    if (request.method === "POST") {
      if (!AMFI_POST.some((rule) => rule.test(u.pathname))) return new Response("method not allowed", { status: 405 });
      const body = await request.text();
      if (body.length > POST_MAX_BYTES) return new Response("body too large", { status: 413 });
      const upstream = await fetch("https://www.amfiindia.com" + u.pathname, {
        method: "POST", body,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FinLitRelay/1.0)", "Content-Type": "application/json", "Accept": "application/json" },
      });
      return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" } });
    }
    if (u.pathname === "/fetch") return exchangeFetch(request, u);
    if (!AMFI.some((rule) => rule.test(u.pathname))) return new Response("not found", { status: 404 });
    const upstream = await fetch("https://www.amfiindia.com" + u.pathname + u.search, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FinLitRelay/1.0)", "Accept": request.headers.get("Accept") || "*/*" },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream", "Cache-Control": "public, max-age=300" },
    });
  },
};
