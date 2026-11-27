# Relay (free Cloudflare Worker): AMFI files and exchange pages

**Why:** `www.amfiindia.com` does not answer from the AWS server's address, so the nightly `facts` job cannot read each fund's expense ratio and fund size
(the Data health banner shows "ConnectTimeout"). A Cloudflare Worker fetches the same three public AMFI files from a place AMFI does answer, and the server reads them from it.

**What the relay does:** answers GET requests for exactly three paths (`/api/populate-ter-month`, `/api/populate-te-rdata-revised`, `/api/average-aum-schemewise`) by fetching the same path on
`www.amfiindia.com`. It rejects every other path, every other method and any request without the shared key. It stores nothing.

## Set-up (founder, once, about 10 minutes, free plan)
1. Create a free account at https://dash.cloudflare.com/sign-up (no card needed).
2. Workers & Pages > Create > Create Worker > name it `finlit-amfi-relay` > Deploy, then Edit code: replace everything with the contents of `worker.js` in this folder > Deploy.
3. Worker > Settings > Variables and Secrets > Add: type **Secret**, name `RELAY_KEY`, value = a long random string you make up (30+ characters). Do not share it in chat.
4. Note the worker address (looks like `https://finlit-amfi-relay.<your-name>.workers.dev`).
5. On the FinLit server, in `/opt/finlit/.env.aws` add two lines (never in chat or in the repo):
   `AMFI_RELAY_URL=https://finlit-amfi-relay.<your-name>.workers.dev`
   `AMFI_RELAY_KEY=<the same long random string>`
   then restart the app (the auto-deploy does it with the next deploy, or `docker compose ... up -d`).
6. Run the facts job once and check `/api/jobs/status` > `facts`: it should no longer say ConnectTimeout, and fund pages show the expense ratio and fund size.

If `facts` still times out after this, AMFI also blocks Cloudflare's addresses: then use the admin upload in Console > Data health (download AMFI's two files in a browser and upload them).

## The exchange route (company brief, earnings calls), added 7 Nov 2026
NSE and BSE answer the AWS server's address with HTTP 403 (verified live: `www.nseindia.com refused the request (403)`), so the company brief could never find an annual report.
The same worker now also answers `GET /fetch?u=<https address>` for hosts ending in `nseindia.com` or `bseindia.com` only (https, port 443), with the same `X-Relay-Key`.
For NSE's `/api/` addresses it first fetches NSE's home page and sends the cookie it sets (NSE's API refuses a request without it). Redirects are passed back to the server, which asks again.
The server needs nothing new: it uses `AMFI_RELAY_URL` and `AMFI_RELAY_KEY` (or `EXCHANGE_RELAY_URL` / `EXCHANGE_RELAY_KEY` if you want a separate worker). To update: paste the new `worker.js` over the old code in Cloudflare and Deploy.
Answers written by the worker carry `X-Relay: 1`; an error of its own also carries `X-Relay-Error`. An answer without `X-Relay` (a wrong key, a Cloudflare error page) is never mistaken for the exchange refusing.
**Not guaranteed:** an exchange may refuse Cloudflare's addresses too. Then the brief job says `report_blocked` as before and the administrator's annual-report URL override is the way.

## Fund performance, scheme details and Baroda BNP Paribas (task #281, 20 Nov 2026)
**Why:** the nightly `portfolios` job called AMFI and Baroda BNP Paribas's site directly; both time out from the AWS server's address, so its parts
`performance`, `loads` and `barodabnp` ended in `ConnectTimeout` every night (`/api/mf/status` > `run:refresh-portfolios`). No fund showed an exit load,
a benchmark or a risk-o-meter, and Baroda BNP Paribas's holdings were never read.

**What the worker now also answers** (same key, same worker):
- `GET /api/populate-mf`, `/api/populate-scheme`, `/api/scheme-details` on AMFI: fund houses, their schemes, and each scheme's details (exit load, launch date).
- `POST /gateway/pollingsebi/api/amfi/fundperformance` and `/gateway/pollingsebi/api/amfi/getsubcategory` on AMFI, with a small JSON body (at most 4 KB),
  never cached: benchmark, risk-o-meter and daily AUM of every scheme. Any other POST is refused.
- `GET /fetch?u=` for `barodabnpparibasmf.in` (its monthly portfolio page and files), beside NSE and BSE.

The server sends these through the relay by itself whenever `AMFI_RELAY_URL` is set (`portfolios.make_client`); no server change is needed.

**Founder step (once):** Cloudflare > Workers & Pages > `finlit-amfi-relay` > Edit code > replace everything with the new `worker.js` > Deploy.
Until then the three parts keep timing out exactly as before; nothing else changes. After it, the next `portfolios` run (or a manual run) fills them:
`/api/mf/151130/facts` then shows benchmark "Nifty Smallcap 250 TRI", risk-o-meter "Very High" and an exit load.

## 27 Nov 2026: NSE moved its API to www.nseindia.in (flows-nse failing since 25 Nov)

NSE now answers `www.nseindia.com/api/...` with a redirect to `www.nseindia.in/api/...`. The old worker did not allow `nseindia.in` and handed the
302 back; the server followed it from its own AWS address, and NSE refused it (`flows-nse`: 40 failed runs, then held). Now:
- **The worker** allows `nseindia.in`, and follows up to 3 redirects itself, to allowed hosts only, each with that host's own cookie. Its answer
  carries `X-Relay-Final` (the host and path it ended on).
- **The server** (`flows.py`, `deals.py`) never follows a redirect the relay hands back. That counts as the relay not reaching NSE.

**Founder step (once):** Cloudflare > Workers & Pages > `finlit-amfi-relay` > Edit code > replace everything with the new `worker.js` > Deploy.
The held job tries again by itself. Run it at once on the server:

```bash
docker exec finlit-jobs-1 python -m finlit.worker refresh-flows --only nse
```
