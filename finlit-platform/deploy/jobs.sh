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

# 2. The site backend (FinLit Prism, ownership insights, the technical view writes) runs in the website container. The jobs reach it at app:8001 when it is
#    switched on there; config.site_api_url_default() applies the SAME rule start.sh uses, so "not configured" stays "not configured" here too.
if [ -z "${SITE_API_URL:-}" ]; then
  here_url="$($PY -c 'from finlit.config import site_api_url_default; print(site_api_url_default())' 2>/dev/null || true)"
  if [ -n "$here_url" ]; then
    export SITE_API_URL="http://${SITE_API_PEER:-app}:8001"
    log "site backend: $SITE_API_URL"
  else
    log "site backend: not configured (Prism and ownership jobs say so)"
  fi
fi

# 3. The scheduler, in the foreground: its lines reach `docker compose logs jobs` and /tmp/scheduler.log; the job logs stay in /tmp/job-<name>.log here.
log "starting the job supervisor, the on-demand report lane and the commodity loop"
export MALLOC_ARENA_MAX="${MALLOC_ARENA_MAX:-2}"
exec bash -c "./scheduler.sh 2>&1 | tee -a /tmp/scheduler.log"
