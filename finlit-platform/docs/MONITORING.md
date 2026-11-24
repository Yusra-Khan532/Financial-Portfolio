# Monitoring: knowing at once when the site or an API goes down

Owner's request of 24 Nov 2026: if the website or an API stops working, we must know at once (email), see it on a status page and in the admin
console, and test how the site holds up under load. Four layers do this, each catching what the others cannot.

| Layer | Runs where | How often | Catches | Tells you by |
|---|---|---|---|---|
| **Gatus** (uptime checker) | on the server, next to the site (`gatus` container) | every minute (heavier pages every 5 min) | a page or API that stops answering, answers wrongly, or answers slowly; the jobs going unhealthy; the export lock opening | email on failure and on recovery (Resend); `/status`; Console → Monitoring |
| **Outside check** (GitHub Actions) | GitHub's machines, outside AWS | every 5 minutes | the whole server, Caddy, DNS or Cloudflare being down (Gatus cannot email if the server itself is down) | email (or a GitHub issue "Site down"); Console → Monitoring |
| **Uptime Kuma** (optional) | on the server (`uptime-kuma` container, switched on by choice) | every 1-5 minutes | the same things as Gatus, plus certificate expiry, the team workspace; its own dashboard and many alert channels (email, Telegram, WhatsApp via services, Slack) | its own dashboard and alerts; link in Console → Monitoring |
| **k6 by Grafana** (load test) | GitHub's machines | smoke every night 02:31 IST; fuller test Sunday 23:41 IST | the site getting slow or erroring when several people use it at once | the GitHub run (red when a limit is missed); Console → Monitoring |

The jobs' own health (`/api/jobs/status`) is already watched by the site; Gatus adds an email when it turns unhealthy.

## What each alert means and the first steps

- **"FinLit check failed: Home page / Site health (API)"** (Gatus) or **"FinLit is DOWN (outside check)"**: visitors cannot use the site.
  1. Open https://finlitventures.com/api/health. If it answers `{"ok":true,...}` the site is back (a deploy restart lasts about a minute).
  2. If not, in the server window (prompt `ubuntu@ip-`): `bash /opt/finlit/src/finlit-platform/deploy/aws/deploy.sh compose ps` — every service should say `Up` / `healthy`.
  3. Then `bash /opt/finlit/src/finlit-platform/deploy/aws/deploy.sh compose logs --tail=80 app` and send the last lines.
- **Only the outside check fails, Gatus is fine**: the server works but the path to it does not (Cloudflare, DNS, AWS network). Check Cloudflare's dashboard.
- **"Company report data / Mutual fund page data / News and filings / Stock screener data"**: the site is up but one data area fails. Open the
  same link in a browser; the admin console's Data health tab and `/api/jobs/status` show which job feeds it.
- **"Background jobs"**: a job is failing or overdue. Console → Data health and Console → Monitoring list it by name.
- **"Scores export link locked"**: `/internal/export/scores/dates` answered without a key. That is a security fault: check `EXPORT_KEY` in `.env.aws`.
- **k6 run red**: answers were slower than the limit (95% within 1.5 s from GitHub's US machines; the server is in Sydney, so about 0.4 s is distance)
  or more than 1% failed. Open the run's summary artifact; compare with the previous week.
- **Recovery** emails follow automatically once checks pass again.

## Owner setup (once)

Alert email goes through **Resend's SMTP** (owner's choice, 24 Nov 2026): host `smtp.resend.com`, port `465` (TLS), username `resend`, password
= the site's existing `RESEND_API_KEY`, from **FinLit Alerts <alerts@finlitventures.com>** (finlitventures.com is the verified Resend domain),
replies to alerts@finlitventures.com (the outside check sets Reply-To; Gatus cannot set one). Recipient: `finlit.start@gmail.com`; add more,
comma-separated, in `ALERT_EMAIL_TO`. No new mail secret is needed. Secrets stay in `/opt/finlit/.env.aws` and GitHub's secrets, never in the
repository or chat.

Each step runs where it says: **server window** = the terminal whose prompt starts `ubuntu@ip-`; **browser** = your own browser.

1. **Server window.** Check the Resend key is there (prints only `1`, never the key): `grep -c '^RESEND_API_KEY=.\+' /opt/finlit/.env.aws`
2. **Server window.** Add the recipient: `echo 'ALERT_EMAIL_TO=finlit.start@gmail.com' | sudo tee -a /opt/finlit/.env.aws >/dev/null`
3. **Server window.** Make the console key and add it (prints nothing):
   `echo "MONITOR_INGEST_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" | sudo tee -a /opt/finlit/.env.aws >/dev/null`
4. **Server window.** Show that key once, to copy into GitHub in step 6: `grep -m1 '^MONITOR_INGEST_KEY=' /opt/finlit/.env.aws | cut -d= -f2-`
5. **Server window.** Start the checker and reload the app: `bash /opt/finlit/src/finlit-platform/deploy/aws/deploy.sh compose up -d gatus app`
   (every later deploy starts Gatus by itself).
6. **Browser.** GitHub → Yusra-Khan532/Financial-Portfolio → Settings → Secrets and variables → Actions → New repository secret:
   `MONITOR_INGEST_KEY` = the value from step 4; `RESEND_API_KEY` = the same Resend key as on the server (without it the outside check opens a
   GitHub issue "Site down" instead of emailing).
7. **Browser.** Check: Console → Monitoring lists the checks within two minutes; https://finlitventures.com/status shows them to everyone;
   GitHub → Actions → "Outside uptime check" → Run workflow, and the console then shows "Outside check: the site answered".

### Uptime Kuma (optional, about 150 MB more memory)

Address: **https://uptime.finlitventures.com** (a password in front, then Kuma's own sign-in).

1. **Server window.** Switch it on and set the console link:
   `printf 'COMPOSE_PROFILES=kuma\nKUMA_URL=https://uptime.finlitventures.com\n' | sudo tee -a /opt/finlit/.env.aws >/dev/null`
2. **Browser.** Cloudflare → finlitventures.com → DNS → Add record: type `A`, name `uptime`, the same IPv4 address as the main site.
3. **Server window.** Make the front-door password hash (choose a long password; the command prints only the hash):
   `docker run --rm caddy:2 caddy hash-password --plaintext 'YOUR-LONG-PASSWORD'`
4. **Server window.** Put the Caddy file in place, then open it and paste the hash over `PASTE_THE_HASH_HERE`:
   `sudo cp /opt/finlit/src/finlit-platform/deploy/aws/uptime-kuma/uptime.caddy.example /opt/finlit/caddy-extra/uptime.caddy && sudo nano /opt/finlit/caddy-extra/uptime.caddy`
5. **Server window.** Start Kuma and reload Caddy and the app:
   `bash /opt/finlit/src/finlit-platform/deploy/aws/deploy.sh compose --profile kuma up -d uptime-kuma && bash /opt/finlit/src/finlit-platform/deploy/aws/deploy.sh compose up -d --force-recreate --no-deps caddy app`
6. **Browser.** Open https://uptime.finlitventures.com, sign in with user `admin` and the step-3 password.
7. **Browser.** First visit only: Kuma asks you to create its admin. Choose a user name and a different long password. That is Kuma's own sign-in.
8. **Server window.** Show the Resend key once, to paste into Kuma in the next step (prints only the key):
   `grep -m1 '^RESEND_API_KEY=' /opt/finlit/.env.aws | cut -d= -f2-`
9. **Browser.** Kuma → Settings → Notifications → Setup Notification: Notification Type **SMTP (Email)**; Friendly Name `FinLit alerts (Resend)`;
   Hostname `smtp.resend.com`; Port `465`; Security **TLS (465)**; Username `resend`; Password = the step-8 key; From Email
   `FinLit Alerts <alerts@finlitventures.com>`; To Email `finlit.start@gmail.com`; tick **Default enabled** and **Apply on all existing monitors**;
   press **Test** (an email should arrive), then **Save**.
10. **Browser.** Add the monitors: Kuma → Add New Monitor, one for each entry in `deploy/aws/uptime-kuma/monitors.json` (type, name, URL, interval,
    keyword where given), with the notification ticked. About five minutes for all eight. (Kuma's JSON backup import is deprecated, so they are
    typed in once.)
11. **Browser.** Console → Monitoring now shows "open Uptime Kuma".

Without Kuma everything else works; it is a second opinion with its own dashboard, not a requirement.

## Where things are

- Gatus checks: `deploy/aws/gatus/config.yaml` (add a check there; Gatus reloads the file by itself after a deploy).
- Site side: `backend/finlit/monitoring.py` — `/api/status/public` (names, up/down and recent record only; no addresses, errors or timings; cached
  30 s; 30 requests a minute per visitor), `/api/admin/monitoring` (admins: everything), `/api/monitor/ingest` (GitHub reports with `X-Monitor-Key`;
  only the listed fields are kept, in Redis).
- The public view leaves out every check in Gatus's `security` group (now "Scores export link locked"; `PRIVATE_GROUPS` in monitoring.py) and
  works out "Everything is up" from the shown checks only, so a broken lock is never announced to visitors; admins still see it in Console → Monitoring.
  Its 30-a-minute limit uses the site's shared Redis limiter (IPv6 counted per /64; if Redis is down the page still answers).
- Pages: `/status` (`frontend/src/pages/Status.tsx`, linked in the footer) and Console → Monitoring (`frontend/src/components/admin/Monitoring.tsx`).
- GitHub: `.github/workflows/platform-uptime.yml` (outside check), `.github/workflows/platform-load.yml` (k6), `scripts/monitor_report.py`.
- k6 scripts: `tests/load/smoke.js`, `tests/load/weekly.js` — public, read-only pages only; never sign in, never write. Run by hand:
  `k6 run -e BASE_URL=https://finlitventures.com finlit-platform/tests/load/smoke.js`.

## Next ideas

- Response-time history charts in the console (Gatus keeps them; a small chart per check).
- A Telegram or WhatsApp alert channel through Kuma for phone pings.
- Error tracking for the browser and the API (the site already collects browser errors, backend/finlit/clienterrors.py; a weekly digest).
- Database and disk alerts (free space under 15%, backup older than 26 hours) as extra Gatus checks on a small admin-only health endpoint.
