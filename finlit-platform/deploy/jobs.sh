#!/usr/bin/env bash
# Entrypoint of the JOBS container (the `jobs` service in deploy/aws/docker-compose.aws.yml), the same image as the website.
#
# Why a separate container (founder, 14 Nov 2026): the job supervisor used to run inside the website's container, so every deploy of the website
# restarted it and killed the running job; on 12-13 Nov 2026, 77 of 93 failed job runs were killed by deploys. Now:
#   * the website (`app`) is deployed at once, any time; Caddy holds visitors' requests while it restarts;
#   * this container is only replaced when the job code itself changed (deploy.sh jobs), and then only when no long job is running
#     (the deploy gate, backend/finlit/jobs/deploy_gate.py), so a website change never touches a job.
#
# It runs the same three things deploy/scheduler.sh always kept alive (the supervisor, the on-demand report lane, the commodity loop), nothing else.
set -uo pipefail
cd "${APP_DIR:-/app}"
PY="${PYTHON:-python}"
export APP_DIR="$PWD" PYTHON="$PY" TZ="${TZ:-Asia/Kolkata}"
log() { echo "$(date '+%F %T') [jobs] $*"; }

# 1. The database schema first. The website container migrates too; both are safe to run (each migration is one transaction and recorded once), and a
#    clash on a first start simply retries.
tries=0
until $PY -m finlit.worker migrate >/dev/null; do
  tries=$((tries + 1))
  if [ "$tries" -ge 100 ]; then log "the database is still not ready after $tries attempts: giving up (the container restarts)"; exit 1; fi
  log "waiting for the database (attempt $tries)..."; sleep 3
done

# 2. The jobs' OWN site backend (founder, 16 Nov 2026: "model output for users must be fast"). The nightly Prism job, the real-time score refresh and the
#    ownership and technical-view jobs used to send every calculation to the ONE site-backend worker in the website container, so a member's Prism report or
#    score waited behind them (seen live: that worker at 120% CPU while the jobs container was idle). The jobs now get their own copy here, at a lower CPU
#    priority (nice 10), so members always find the website's copy free and get the CPU first. config.site_api_url_default() applies the SAME rule start.sh
#    uses, so "not configured" stays "not configured" here too. SITE_API_URL set in the env file (a separately hosted site backend) still wins.
if [ -z "${SITE_API_URL:-}" ]; then
  here_url="$($PY -c 'from finlit.config import site_api_url_default; print(site_api_url_default())' 2>/dev/null || true)"
  SITE_DIR="${SITE_API_DIR:-/app/site-api/backend}"; SITE_PY="${SITE_PYTHON:-/opt/site-venv/bin/python}"
  if [ -n "$here_url" ] && [ -d "$SITE_DIR" ]; then
    export SITE_API_URL="http://127.0.0.1:8001" DB_NAME="${DB_NAME:-finlit}"
    ( cd "$SITE_DIR" && while true; do
        MALLOC_ARENA_MAX=2 nice -n "${JOBS_SITE_API_NICE:-10}" "$SITE_PY" -m uvicorn server:app --host 127.0.0.1 --port 8001 --workers 1 --no-server-header 2>&1 \
          | sed -u "s/^/[site-api:jobs] /" >> /tmp/site-api.log
        echo "$(date '+%F %T') [site-api:jobs] stopped; restarting in 3 s" >> /tmp/site-api.log; sleep 3
      done ) &
    for _ in $(seq 1 60); do   # up to a minute: the first Prism job of the day must not meet a backend that is still starting
      $PY -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8001/api/", timeout=2)' >/dev/null 2>&1 && break
      sleep 1
    done
    log "site backend for the jobs: $SITE_API_URL (its own process, nice ${JOBS_SITE_API_NICE:-10}; members use the website's)"
  else
    log "site backend: not configured (Prism and ownership jobs say so)"
  fi
fi

# 3. The scheduler, in the foreground: its lines reach `docker compose logs jobs` and /tmp/scheduler.log; the job logs stay in /tmp/job-<name>.log here.
log "starting the job supervisor, the on-demand report lane and the commodity loop"
export MALLOC_ARENA_MAX="${MALLOC_ARENA_MAX:-2}"
exec bash -c "./scheduler.sh 2>&1 | tee -a /tmp/scheduler.log"
