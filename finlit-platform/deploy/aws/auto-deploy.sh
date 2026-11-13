#!/usr/bin/env bash
# Automatic deploys: every few minutes (a systemd timer, see install-auto-deploy.sh) this checks whether the branch the server follows has a new commit
# and, if so, deploys it with deploy.sh: backup first, rebuild, restart, health check. If the new version is not healthy it goes back to the previous
# build by itself and does NOT try that commit again (it waits for the next new commit). Nothing is ever deployed from anywhere but the repository and
# branch in the configuration file.
#
#   auto-deploy.sh            one check (what the timer runs)
#   auto-deploy.sh now        the same, immediately, printing what it does
#   auto-deploy.sh status     what is deployed, what failed last, the timer, the last log lines
#   auto-deploy.sh pause      stop deploying (nothing else changes);  auto-deploy.sh resume
#   auto-deploy.sh force      deploy the new commit now even while a long job runs (an urgent fix; the job resumes after the restart)
#
# Jobs come first (founder, 13 Nov 2026): a deploy restarts the app and every job in it, so while a long job (ingest, score, prism, ...) is running a new
# commit WAITS. The running app is asked first (python -m finlit.worker deploy-gate check SHA, see backend/finlit/jobs/deploy_gate.py): while a long job
# runs it answers "wait" and no new long job starts, so the running one finishes, the deploy goes in the gap, and every commit merged meanwhile goes out in
# that one deploy. A deploy waits at most DEPLOY_HOLD_MAX_MIN (150 minutes by default, longer than any job's own time cap). To deploy at once: force.
#
# Configuration: $FINLIT_HOME/auto-deploy.conf, lines NAME=value (read, never executed): REPO_URL, REPO_BRANCH, REPO_SUBDIR.
# A private repository: put a read-only token alone in $FINLIT_HOME/git-token (chmod 600); it is handed to git for this run only, never printed.
set -uo pipefail

FINLIT_HOME="${FINLIT_HOME:-/opt/finlit}"
CONF="$FINLIT_HOME/auto-deploy.conf"
STATE="$FINLIT_HOME/state"
LOGDIR="$FINLIT_HOME/logs"
LOG="$LOGDIR/auto-deploy.log"
mkdir -p "$STATE" "$LOGDIR"
log() { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }

conf() {  # conf NAME DEFAULT: a value from the configuration file (the last one wins), or the default
  local v; v="$(grep -E "^[[:space:]]*$1=" "$CONF" 2>/dev/null | tail -n 1 | sed -E "s/^[[:space:]]*$1=//; s/[[:space:]]+$//")" || true
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "${v:-$2}"
}
REPO_URL="$(conf REPO_URL https://github.com/Yusra-Khan532/Financial-Portfolio.git)"
REPO_BRANCH="$(conf REPO_BRANCH main)"
REPO_SUBDIR="$(conf REPO_SUBDIR finlit-platform)"
DEPLOY_SH="${DEPLOY_SH:-$FINLIT_HOME/src/$REPO_SUBDIR/deploy/aws/deploy.sh}"
image_id() { if [ -n "${IMAGE_ID_CMD:-}" ]; then sh -c "$IMAGE_ID_CMD" 2>/dev/null; else docker image inspect -f '{{.Id}}' finlit-app:current 2>/dev/null; fi; }

case "${1:-check}" in
  pause)  : > "$STATE/auto_paused"; log "auto-deploy paused (resume with: auto-deploy.sh resume)"; exit 0 ;;
  resume) rm -f "$STATE/auto_paused"; log "auto-deploy resumed"; exit 0 ;;
  status)
    echo "follows:        $REPO_URL  branch $REPO_BRANCH  folder $REPO_SUBDIR"
    echo "paused:         $([ -e "$STATE/auto_paused" ] && echo yes || echo no)"
    echo "deployed sha:   $(cat "$STATE/auto_deployed_sha" 2>/dev/null || echo none)   (the running image: $(cat "$STATE/current_commit" 2>/dev/null || echo unknown))"
    echo "failed sha:     $(cat "$STATE/auto_failed_sha" 2>/dev/null || echo none)"
    echo "held:           $(cat "$STATE/deploy_wait_note" 2>/dev/null || echo no)"
    command -v systemctl >/dev/null && systemctl list-timers finlit-auto-deploy.timer --no-pager 2>/dev/null | head -3
    echo "--- last log lines"; tail -n 12 "$LOG" 2>/dev/null
    exit 0 ;;
  check|now|force) ;;
  *) echo "usage: auto-deploy.sh [now|force|status|pause|resume]" >&2; exit 2 ;;
esac

exec 8>"$STATE/auto_deploy.lock"
flock -n 8 || exit 0                                    # a check is already running

# Housekeeping: when the disk is DISK_CLEAN_PCT full (default 78) or more, free build cache and unused images, at most once every 30 minutes. This runs on the
# server itself, before anything else, so it also works while deploys are paused or nothing new has been committed.
disk_pct() { if [ -n "${DISK_PCT_CMD:-}" ]; then sh -c "$DISK_PCT_CMD" 2>/dev/null; else df --output=pcent / 2>/dev/null | tail -n 1 | tr -dc '0-9'; fi; }
housekeeping() {
  local pct last now dlast
  pct="$(disk_pct)"; [ -n "$pct" ] || return 0
  now="$(date +%s)"
  # every day, whatever the disk says: clear the waste (build cache, unused images, stopped containers, old logs) before it can pile up
  dlast="$(cat "$STATE/last_daily_clean" 2>/dev/null || echo 0)"
  if [ $((now - dlast)) -ge "$(conf DAILY_CLEAN_SECONDS 86400)" ]; then
    echo "$now" > "$STATE/last_daily_clean"
    log "daily cleaning of waste (disk ${pct}% full)"
    bash "$DEPLOY_SH" clean >> "$LOG" 2>&1 || log "the daily cleaning did not finish (see above)"
    return 0
  fi
  [ "$pct" -ge "$(conf DISK_CLEAN_PCT 78)" ] || return 0
  last="$(cat "$STATE/last_clean" 2>/dev/null || echo 0)"
  [ $((now - last)) -ge 1800 ] || return 0
  echo "$now" > "$STATE/last_clean"
  log "the disk is ${pct}% full: cleaning build cache and unused images"
  bash "$DEPLOY_SH" clean >> "$LOG" 2>&1 || log "the cleaning did not finish (see above)"
}
housekeeping
[ ! -e "$STATE/auto_paused" ] || exit 0
GIT_TOKEN_FILE="$FINLIT_HOME/git-token"
if [ -r "$GIT_TOKEN_FILE" ]; then
  GIT_TOKEN="$(tr -d '[:space:]' < "$GIT_TOKEN_FILE")"; export GIT_TOKEN
  ASKPASS="$(mktemp)"; chmod 700 "$ASKPASS"
  printf '#!/bin/sh\ncase "$1" in\n  Username*) echo x-access-token ;;\n  *) printf "%%s\\n" "$GIT_TOKEN" ;;\nesac\n' > "$ASKPASS"
  export GIT_ASKPASS="$ASKPASS"; trap 'rm -f "$ASKPASS"' EXIT
fi
export GIT_TERMINAL_PROMPT=0

remote="$(git ls-remote "$REPO_URL" "refs/heads/$REPO_BRANCH" 2>/dev/null | cut -f1 | head -n 1)"
if ! printf '%s' "$remote" | grep -Eq '^[0-9a-f]{40}$'; then
  [ "${1:-check}" = now ] && echo "could not read $REPO_BRANCH of $REPO_URL (network, wrong branch, or a private repository without $FINLIT_HOME/git-token)"
  exit 0                                                 # not reachable right now: try again at the next tick
fi
deployed="$(cat "$STATE/auto_deployed_sha" 2>/dev/null || true)"
failed="$(cat "$STATE/auto_failed_sha" 2>/dev/null || true)"
if [ -z "$deployed" ] && [ -d "$FINLIT_HOME/src/.git" ] && [ "$(git -C "$FINLIT_HOME/src" rev-parse HEAD 2>/dev/null)" = "$remote" ]; then
  echo "$remote" > "$STATE/auto_deployed_sha"; deployed="$remote"      # the server already runs exactly this commit
fi
if [ "$remote" = "$deployed" ] || [ "$remote" = "$failed" ]; then
  if [ "${1:-check}" = now ]; then
    if [ "$remote" = "$deployed" ]; then echo "nothing to do: $remote is already deployed"; else echo "nothing to do: $remote failed before; it waits for a new commit"; fi
  fi
  exit 0
fi
[ -x "$DEPLOY_SH" ] || [ -f "$DEPLOY_SH" ] || { log "cannot deploy $remote: $DEPLOY_SH not found (a first deploy by hand is needed)"; exit 0; }

# --- jobs first: ask the running app whether a long job is running (see the header); an app that cannot answer (down, or an older build) means go
gate() { if [ -n "${DEPLOY_GATE_CMD:-}" ]; then sh -c "$DEPLOY_GATE_CMD $*" 2>/dev/null; else timeout 90 bash "$DEPLOY_SH" compose exec -T app python -m finlit.worker deploy-gate "$@" 2>/dev/null; fi; }   # a hung app counts as no answer
same_note() { [ "$(printf '%s' "$1" | tr -d '0-9')" = "$(tr -d '0-9' < "$STATE/deploy_wait_note" 2>/dev/null)" ]; }   # the same wait, whatever the minutes say
forced=""
[ "${1:-check}" = force ] && forced="auto-deploy.sh force"
[ -e "$STATE/deploy_now" ] && forced="$STATE/deploy_now"
if [ -z "$forced" ]; then
  verdict="$(gate check "$remote" | tail -n 1)"
  case "$verdict" in
    wait:*)
      same_note "$verdict" || log "new commit $remote held: ${verdict#wait: }"
      printf '%s\n' "$verdict" > "$STATE/deploy_wait_note"
      [ "${1:-check}" = now ] && echo "held: ${verdict#wait: }  (to deploy at once: auto-deploy.sh force)"
      exit 0 ;;
    go:*) [ -s "$STATE/deploy_wait_note" ] && log "the hold ends: ${verdict#go: }" ;;
    *) log "the deploy gate did not answer (${verdict:-no reply}): deploying" ;;
  esac
else
  log "deploying at once, whatever runs ($forced)"
fi
rm -f "$STATE/deploy_wait_note" "$STATE/deploy_now"

log "new commit $remote on $REPO_BRANCH (deployed: ${deployed:-none}): deploying"
export REPO_URL REPO_BRANCH REPO_SUBDIR FINLIT_HOME
log "backup before the deploy"
bash "$DEPLOY_SH" backup >> "$LOG" 2>&1 || log "WARNING: the backup before the deploy failed (the deploy goes on: a nightly backup exists)"
before="$(image_id)"
bash "$DEPLOY_SH" deploy >> "$LOG" 2>&1
rc=$?
after="$(image_id)"
if [ "$rc" = 0 ]; then
  echo "$remote" > "$STATE/auto_deployed_sha"; rm -f "$STATE/auto_failed_sha"
  # keep the installed copy of this script current (replaced atomically: the running copy is never edited in place)
  new="$FINLIT_HOME/src/$REPO_SUBDIR/deploy/aws/auto-deploy.sh"
  if [ -f "$new" ] && [ -d "$FINLIT_HOME/bin" ] && ! cmp -s "$new" "$FINLIT_HOME/bin/auto-deploy.sh"; then
    cp "$new" "$FINLIT_HOME/bin/auto-deploy.sh.new" && chmod 755 "$FINLIT_HOME/bin/auto-deploy.sh.new" && mv -f "$FINLIT_HOME/bin/auto-deploy.sh.new" "$FINLIT_HOME/bin/auto-deploy.sh"
  fi
  gate release >/dev/null 2>&1 || true                 # the new app: long jobs may start again (the flag also expires by itself)
  log "DEPLOYED $remote"
  exit 0
fi
echo "$remote" > "$STATE/auto_failed_sha"
log "FAILED: deploying $remote did not succeed (rc=$rc)"
if [ -n "$after" ] && [ "$after" != "$before" ]; then
  log "the new build is not healthy: going back to the previous build"
  if bash "$DEPLOY_SH" rollback >> "$LOG" 2>&1; then log "ROLLED BACK: the previous version is running again"; else log "ROLLBACK FAILED: look at the site by hand (deploy.sh status, deploy.sh logs app)"; fi
else
  log "the running build was not touched (the deploy stopped before replacing it)"
fi
gate release >/dev/null 2>&1 || true                   # whatever runs now, long jobs may start again
log "$remote will not be tried again; the next new commit will be"
exit 1
