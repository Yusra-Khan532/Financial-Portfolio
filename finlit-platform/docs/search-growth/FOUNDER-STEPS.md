# Search growth: steps only the founder can do

*Written 27 Nov 2026. Do them in this order, one at a time. Each step says where it runs. Send a screenshot after each step so the next one can be checked.*

Nothing here touches the server or the code. FinLit's DNS is on **Cloudflare** (see `docs/MAINTAINER-MAP.md` section 5), so the DNS step is done in the Cloudflare dashboard.

---

## Step 1. Google Search Console (domain property, DNS TXT method)

**Why:** it shows which FinLit pages Google has indexed or refused (and why), which searches show FinLit, the clicks, and Core Web Vitals from real Chrome users. Every other step is blind without it.

**Where:** your browser on your PC.

1. Open https://search.google.com/search-console and sign in with the Google account that should own FinLit's search data (preferably a company account, not a personal one).
2. Click **Add property** (top-left drop-down). Choose the left box, **Domain**.
3. Type `finlitventures.com` (no `https://`, no `www`). Click **Continue**.
4. Google shows a **TXT record** that starts with `google-site-verification=`. Click **Copy**. Leave this tab open.
5. In a new tab, open https://dash.cloudflare.com, then the `finlitventures.com` site, then **DNS → Records**.
6. Click **Add record**:
   - **Type:** `TXT`
   - **Name:** `@` (this means the root domain)
   - **Content:** paste the whole `google-site-verification=…` text
   - **TTL:** Auto
   - Click **Save**.
   
   Don't change or delete any other record.
7. Go back to the Search Console tab and click **Verify**. If it says "not found", wait 5–10 minutes and click Verify again (DNS takes a little time).
8. When it says **Ownership verified**, open the new property and go to **Sitemaps** (left menu). In "Add a new sitemap", type `sitemap.xml` and click **Submit**. It should show **Success** and about 8,800 discovered pages within a day.
9. Go to **Settings → Users and permissions → Add user** and add the team members who should see the data (role: **Full**).

**Screenshot to send:** the Sitemaps page showing `sitemap.xml` with status Success.

> The Domain property covers `finlitventures.com`, `www.` and `app.` together, plus http and https, so nothing else needs verifying.

---

## Step 2. Bing Webmaster Tools (import from Search Console)

**Why:** Bing feeds Microsoft Copilot and several AI tools. Its **AI Performance** report shows when FinLit is cited in AI answers, and it accepts **IndexNow** pings, so new results pages get found within minutes.

**Where:** your browser, after Step 1 is verified.

1. Open https://www.bing.com/webmasters and sign in. A Microsoft, Google or Facebook account all work; using the same Google account as Step 1 is simplest.
2. On the welcome screen choose **Import your sites from GSC** (Google Search Console). Click **Import**, allow access, tick `finlitventures.com` and click **Import** again. The site is verified automatically, and the sitemap comes across with it.
3. Open the site, then **Sitemaps**. Check that `https://finlitventures.com/sitemap.xml` is listed. If it isn't, click **Submit sitemap** and paste that address.
4. Open **AI Performance** (left menu; it may sit under "Search performance"). If it asks to be switched on, switch it on. It fills over the next weeks.
5. Open **IndexNow** (left menu) and just look. FinLit will add its own key file and pings in a later change (Phase 0, item 3), so there's nothing to do there now.

**Screenshot to send:** the site's home in Bing Webmaster showing it as verified.

---

## Step 3. Choose how FinLit counts visitors (analytics)

**Why:** Search Console shows searches and clicks *before* a visitor arrives. Analytics shows what they do *after*: which pages they read, whether they use the tools, and whether they sign up. FinLit's security policy blocks every outside script on purpose, so this needs your decision.

| | **Option A: Google Analytics 4 (GA4)** | **Option B: FinLit's own private counter** (recommended) |
|---|---|---|
| What it is | Google's free analytics script, allowed narrowly in the security policy | A small counter built into FinLit's own server: page views, the page a visitor came from, the search engine they came from, tool use and sign-ups; no outside script |
| Data goes to | Google | Stays on FinLit's server |
| Cookie banner | **Needed** (GA4 sets cookies; India's DPDP Act 2023 and visitors from the EU expect consent) | **Not needed** (no cookies, no personal data; IP addresses aren't stored) |
| Privacy notice | Must name Google Analytics | One line: "we count page visits without cookies" |
| Speed | Adds a script of about 50–100 KB to every page | Adds nothing measurable |
| Security policy | Opened for Google's script and data addresses | Stays as strict as today |
| What you get | Very detailed reports, audiences, links to Google Ads | Simple daily reports on an admin page: views by page, by source and by search engine, tool use and sign-ups |
| Cost | Free | Free (runs on the existing server) |

**Recommendation: Option B.** It keeps the site's strict security policy and needs no cookie banner. It costs no speed, and Search Console (Step 1) already gives the search queries, which GA4 wouldn't show anyway. GA4 can still be added later if you ever run Google Ads.

**Meanwhile:** Cloudflare already counts visits at its edge with no script at all (Cloudflare dashboard → `finlitventures.com` → **Analytics & Logs → Traffic**). The numbers are rough (they include bots), but they're there today.

**What to send back:** one line, "Option A" or "Option B".

---

## Step 4 (later, not now)
These come in later phases. They're listed here so nothing is forgotten:
- **Company identity for the trust pages:**
  - the registered company name and CIN;
  - the address and contact email;
  - the founders and team, with their roles and finance credentials;
  - social profile links (LinkedIn, X, YouTube, Crunchbase);
  - any SEBI registration.
- **A lawyer's read** of the wording for the "open this company in the DCF calculator" link, before it ships.
- **`app.finlitventures.com`:** is anything still using it? If not, it can redirect (301) to `finlitventures.com`.
- **The server region:** whether to plan the move from Sydney to Mumbai.
- **People for outreach:** who posts on Reddit, YouTube and LinkedIn for FinLit, and who pitches the data stories.
