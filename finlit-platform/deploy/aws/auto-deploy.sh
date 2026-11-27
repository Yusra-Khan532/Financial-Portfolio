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
#   auto-deploy.sh force      deploy the new commit now AND move the jobs container at once, even while a long job runs (an urgent job fix)
#   auto-deploy.sh skip-ci    deploy the branch's newest commit now WITHOUT waiting for its checks (an emergency only; it is logged)
#
# A commit is deployed only once its checks on GitHub are green (25 Nov 2026). Before deploying, this asks GitHub for the workflow runs that the push of a
# commit started (`event=push`, so the scheduled uptime and smoke checks, which fail while the site is down, never block the fix that brings it back) and:
#   every run finished and passed (success, skipped, neutral)  -> green: may be deployed;
#   a run still queued or running, or a required one (CI_REQUIRE) not started yet -> pending: not yet;
#   a run failed, was cancelled or timed out                   -> red: never deployed while red (a re-run that turns green is deployed);
#   GitHub cannot be asked                                    -> unknown: not deployed.
# The NEWEST GREEN commit is deployed, not only the branch's newest commit (27 Nov 2026). The backend checks take 70-90 minutes and merges arrive faster than
# that, so the newest commit was almost never green and nothing was deployed for hours. Now each check looks at the branch's last AUTO_DEPLOY_LOOKBACK commits
# (default 20, first-parent order, newest first) that are newer than the deployed one, and deploys the first green one; a pending or red commit is passed over
# (it never blocks an older green one) and the next check looks again, so the newest commit is deployed as soon as it turns green. Never backwards: nothing at
# or before the deployed commit is considered, and a commit whose deploy failed is never tried again. A green verdict is final and kept in $STATE/ci_verdicts
# (a red one is asked again: a re-run can turn it green); GitHub is asked at most CI_ASK_MAX (default 6) times per check, within its limit of 60 an hour.
# The image build (CI_IGNORE, default platform-image) is not part of the verdict: deploy.sh waits for the image, or builds it here when it fails.
# Each change of verdict is logged once (not every tick); a wait longer than CI_WAIT_WARN_MIN minutes (default 90) is logged once as a warning.
#
# Jobs are never stopped by a website deploy (founder, 14 Nov 2026). The jobs run in their own container (the `jobs` service, deploy/jobs.sh), so a new
# commit is deployed to the website at once, and `deploy.sh deploy` then moves the jobs container (deploy.sh jobs) only when the job code itself changed and
# only when no long job is running (the deploy gate, backend/finlit/jobs/deploy_gate.py, at most DEPLOY_HOLD_MAX_MIN = 150 minutes). While that move waits,
# $STATE/jobs_pending is there and every check here asks again; nothing else waits for it.
#
# Configuration: $FINLIT_HOME/auto-deploy.conf, lines NAME=value (read, never executed): REPO_URL, REPO_BRANCH, REPO_SUBDIR; for the checks: CI_GATE (on/off,
# default on), CI_REPO (owner/name, default read from a github.com REPO_URL), CI_REQUIRE (comma-separated workflow names that must have run, default
# "Platform CI,Security"), CI_IGNORE (default "platform-image"), CI_WAIT_WARN_MIN, AUTO_DEPLOY_LOOKBACK (default 20), CI_ASK_MAX (default 6).
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
CI_REPO="$(conf CI_REPO "$(printf '%s' "$REPO_URL" | sed -nE 's#^https://github\.com/([^/]+/[^/]+)$#\1#p' | sed -E 's#\.git$##; s#/$##')")"
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
    echo "checks gate:    $(conf CI_GATE on) (asks ${CI_REPO:-no GitHub repository}); last verdict: $(cat "$STATE/ci_note" 2>/dev/null || echo none)"
    echo "jobs container: $([ -s "$STATE/jobs_pending" ] && echo "waiting to move to the new job code: $(cat "$STATE/jobs_note" 2>/dev/null)" || echo "up to date")"
    command -v systemctl >/dev/null && systemctl list-timers finlit-auto-deploy.timer --no-pager 2>/dev/null | head -3
    echo "--- last log lines"; tail -n 12 "$LOG" 2>/dev/null
    exit 0 ;;
  check|now|force|skip-ci) ;;
  *) echo "usage: auto-deploy.sh [now|force|skip-ci|status|pause|resume]" >&2; exit 2 ;;
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

# A jobs container still waiting to move to the code that is already deployed (see the header): ask again at every check.
jobs_pending() {
  [ -s "$STATE/jobs_pending" ] || return 0
  [ -f "$DEPLOY_SH" ] || return 0
  local out
  out="$(bash "$DEPLOY_SH" jobs 2>&1 | tail -n 1)"
  same_note "$out" || log "jobs container: ${out#    }"
  printf '%s\n' "$out" > "$STATE/jobs_note"
}
same_note() { [ "$(printf '%s' "$1" | tr -d '0-9')" = "$(tr -d '0-9' < "$STATE/jobs_note" 2>/dev/null)" ]; }   # the same wait, whatever the minutes say

# The checks gate (see the header). ci_runs SHA prints GitHub's JSON list of the workflow runs a push of SHA started (CI_RUNS_CMD replaces the call in tests).
ci_runs() {
  if [ -n "${CI_RUNS_CMD:-}" ]; then CI_SHA="$1" sh -c "$CI_RUNS_CMD" 2>/dev/null; return; fi
  [ -n "$CI_REPO" ] || return 1
  local url="https://api.github.com/repos/$CI_REPO/actions/runs?head_sha=$1&event=push&per_page=100" hdr out
  if [ -n "${GIT_TOKEN:-}" ]; then                     # the token goes in a header file, never on the command line
    hdr="$(mktemp)"; chmod 600 "$hdr"; printf 'Authorization: Bearer %s\n' "$GIT_TOKEN" > "$hdr"
    out="$(curl -fsS -m 20 -H 'Accept: application/vnd.github+json' -H @"$hdr" "$url" 2>/dev/null)"; rm -f "$hdr"
    [ -n "$out" ] && { printf '%s' "$out"; return 0; }   # a token without access to the checks: ask as a visitor (a public repository answers)
  fi
  curl -fsS -m 20 -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null
}
# ci_verdict SHA prints one line: green|pending|red|unknown, then the detail
ci_verdict() {
  local json; json="$(ci_runs "$1")" || json=""
  [ -n "$json" ] || { echo "unknown: GitHub could not be asked about the checks${CI_REPO:+ of $CI_REPO}"; return; }
  command -v python3 >/dev/null || { echo "unknown: python3 is needed to read the checks"; return; }
  CI_REQUIRE="$(conf CI_REQUIRE 'Platform CI,Security')" CI_IGNORE="$(conf CI_IGNORE platform-image)" python3 -c '
import json, os, sys
try:
    runs = json.loads(sys.stdin.read())["workflow_runs"]
except Exception:
    print("unknown: GitHub answered something that is not a list of runs"); sys.exit(0)
names = lambda v: [x.strip() for x in os.environ.get(v, "").split(",") if x.strip()]
ignore = set(names("CI_IGNORE"))
latest = {}
for r in runs:                                          # the newest run of each workflow (a re-run replaces the run it repeats)
    k = (r.get("run_attempt") or 1, r.get("created_at") or "", r.get("id") or 0)
    if r.get("name") not in ignore and (r.get("name") not in latest or k > latest[r["name"]][0]):
        latest[r.get("name")] = (k, r)
missing = [n for n in names("CI_REQUIRE") if n not in latest]
red = sorted("%s %s" % (n, r[1].get("conclusion")) for n, r in latest.items()
             if r[1].get("status") == "completed" and r[1].get("conclusion") not in ("success", "skipped", "neutral"))
running = sorted(n for n, r in latest.items() if r[1].get("status") != "completed")
if red:
    print("red: " + ", ".join(red))
elif missing or running:
    print("pending: waiting for " + ", ".join(running + [m + " (not started)" for m in missing]))
else:
    print("green: " + ", ".join(sorted(latest)) + " passed")
' <<<"$json"
}
ci_note() {   # log a verdict for a commit once, when it changes; returns 1 when it was the same as last time (nothing logged)
  local line="${1:0:12} $2"
  [ "$line" != "$(cat "$STATE/ci_note" 2>/dev/null)" ] || return 1
  printf '%s\n' "$line" > "$STATE/ci_note"; log "checks of $1: $2"
}

remote="$(git ls-remote "$REPO_URL" "refs/heads/$REPO_BRANCH" 2>/dev/null | cut -f1 | head -n 1)"
if ! printf '%s' "$remote" | grep -Eq '^[0-9a-f]{40}$'; then
  [ "${1:-check}" = now ] && echo "could not read $REPO_BRANCH of $REPO_URL (network, wrong branch, or a private repository without $FINLIT_HOME/git-token)"
  jobs_pending                                           # a waiting jobs move needs nothing from the network
  exit 0                                                 # not reachable right now: try again at the next tick
fi
deployed="$(cat "$STATE/auto_deployed_sha" 2>/dev/null || true)"
failed="$(cat "$STATE/auto_failed_sha" 2>/dev/null || true)"
if [ -z "$deployed" ] && [ -d "$FINLIT_HOME/src/.git" ] && [ "$(git -C "$FINLIT_HOME/src" rev-parse HEAD 2>/dev/null)" = "$remote" ]; then
  echo "$remote" > "$STATE/auto_deployed_sha"; deployed="$remote"      # the server already runs exactly this commit
fi
failed_before() { [ -n "$1" ] && { [ "$1" = "$failed" ] || grep -qx "$1" "$STATE/auto_failed_list" 2>/dev/null; }; }
if [ "$remote" = "$deployed" ]; then
  [ "${1:-check}" = now ] && echo "nothing to do: $remote is already deployed"
  if [ "${1:-check}" = force ] && [ -f "$DEPLOY_SH" ]; then
    log "force: moving the jobs container to the deployed code at once"; bash "$DEPLOY_SH" jobs force >> "$LOG" 2>&1
  else
    jobs_pending
  fi
  exit 0
fi
[ -x "$DEPLOY_SH" ] || [ -f "$DEPLOY_SH" ] || { log "cannot deploy $remote: $DEPLOY_SH not found (a first deploy by hand is needed)"; exit 0; }

# The commits newer than the deployed one, newest first (first-parent: the merges on the branch), at most AUTO_DEPLOY_LOOKBACK of them. A small bare copy of
# the branch's recent history is kept in $STATE/git-cache; it never touches the checkout that runs the site.
candidates() {
  local cache="$STATE/git-cache" n; n="$(conf AUTO_DEPLOY_LOOKBACK 20)"
  [ -d "$cache" ] || git init -q --bare "$cache" 2>/dev/null || return 1
  git -C "$cache" fetch -q --depth "$n" "$REPO_URL" "refs/heads/$REPO_BRANCH" 2>/dev/null || return 1
  git -C "$cache" rev-list --first-parent -n "$n" FETCH_HEAD 2>/dev/null | while read -r c; do
    [ "$c" = "$deployed" ] && break                  # never backwards: stop at the deployed commit
    printf '%s\n' "$c"
  done
}
# ci_cached SHA: a green verdict seen before, else ask GitHub (at most CI_ASK_MAX times per check) and keep a final answer
asked=0
ci_cached() {
  local v; v="$(grep -m1 "^$1 " "$STATE/ci_verdicts" 2>/dev/null | cut -d' ' -f2-)"
  if [ -n "$v" ]; then printf '%s\n' "$v"; return; fi
  if [ "$asked" -ge "$(conf CI_ASK_MAX 6)" ]; then echo "pending: not asked in this check (CI_ASK_MAX)"; return; fi
  asked=$((asked + 1))
  v="$(ci_verdict "$1")"
  if [ "${v%%:*}" = green ]; then                 # only green is final: a red commit can still turn green on a re-run, so it is asked again
    printf '%s %s\n' "$1" "$v" >> "$STATE/ci_verdicts"
    tail -n 200 "$STATE/ci_verdicts" > "$STATE/ci_verdicts.tmp" && mv -f "$STATE/ci_verdicts.tmp" "$STATE/ci_verdicts"
  fi
  printf '%s\n' "$v"
}

# The checks gate: deploy the newest commit whose checks are green (see the header)
target="$remote"
if [ "${1:-check}" = skip-ci ]; then
  if failed_before "$remote"; then log "skip-ci: $remote failed before; it waits for a new commit"; jobs_pending; exit 0; fi
  log "skip-ci: deploying $remote WITHOUT waiting for its checks (asked by hand)"
elif [ "$(conf CI_GATE on)" != off ]; then
  list="$(candidates)" || list=""
  [ -n "$list" ] || list="$remote"                   # the history could not be read: decide on the newest commit alone, as before
  target=""; head_verdict=""
  while read -r c; do
    [ -n "$c" ] || continue
    failed_before "$c" && continue                   # a commit whose deploy failed is never tried again
    v="$(ci_cached "$c")"
    [ "$c" = "$remote" ] && head_verdict="$v"
    if [ "${v%%:*}" = green ]; then target="$c"; break; fi
  done <<<"$list"
  if [ -z "$head_verdict" ]; then
    if failed_before "$remote"; then head_verdict="failed: its deploy failed before; it waits for a new commit"; else head_verdict="$(ci_cached "$remote")"; fi
  fi
  ci_note "$remote" "$head_verdict" || { [ "${1:-check}" = now ] && echo "checks of $remote: $head_verdict"; }   # a new verdict of the newest commit is logged (and shown)
  if [ "${head_verdict%%:*}" = pending ]; then         # a wait that runs long is said once
    since="$(sed -n "s/^$remote //p" "$STATE/ci_wait_since" 2>/dev/null)"
    [ -n "$since" ] || { since="$(date +%s)"; echo "$remote $since" > "$STATE/ci_wait_since"; }
    if [ $(( $(date +%s) - since )) -ge $(( $(conf CI_WAIT_WARN_MIN 90) * 60 )) ] && [ "$(cat "$STATE/ci_wait_warned" 2>/dev/null)" != "$remote" ]; then
      echo "$remote" > "$STATE/ci_wait_warned"; log "WARNING: the checks of $remote have not finished after $(conf CI_WAIT_WARN_MIN 90) minutes; still waiting (skip-ci deploys it anyway)"
    fi
  fi
  if [ -z "$target" ]; then
    [ "${1:-check}" = now ] && echo "nothing to do: no commit newer than ${deployed:-none} has green checks yet"
    jobs_pending
    exit 0
  fi
  [ "$target" = "$remote" ] || log "the newest green commit is $target (the newest, $remote, is ${head_verdict%%:*}): deploying it"
elif failed_before "$remote"; then
  [ "${1:-check}" = now ] && echo "nothing to do: $remote failed before; it waits for a new commit"
  jobs_pending; exit 0
fi
if [ "$target" = "$remote" ]; then rm -f "$STATE/ci_wait_since" "$STATE/ci_wait_warned"; fi
rm -f "$STATE/deploy_wait_note" "$STATE/deploy_now" "$STATE/jobs_note"   # deploy_* are notes of the old whole-deploy hold; nothing writes them now

log "new commit $target on $REPO_BRANCH (deployed: ${deployed:-none}): deploying"
DEPLOY_SHA="$target"
export REPO_URL REPO_BRANCH REPO_SUBDIR FINLIT_HOME DEPLOY_SHA
log "backup before the deploy"
bash "$DEPLOY_SH" backup >> "$LOG" 2>&1 || log "WARNING: the backup before the deploy failed (the deploy goes on: a nightly backup exists)"
before="$(image_id)"
bash "$DEPLOY_SH" deploy >> "$LOG" 2>&1
rc=$?
after="$(image_id)"
if [ "$rc" = 0 ]; then
  echo "$target" > "$STATE/auto_deployed_sha"; rm -f "$STATE/auto_failed_sha"
  # keep the installed copy of this script current (replaced atomically: the running copy is never edited in place)
  new="$FINLIT_HOME/src/$REPO_SUBDIR/deploy/aws/auto-deploy.sh"
  if [ -f "$new" ] && [ -d "$FINLIT_HOME/bin" ] && ! cmp -s "$new" "$FINLIT_HOME/bin/auto-deploy.sh"; then
    cp "$new" "$FINLIT_HOME/bin/auto-deploy.sh.new" && chmod 755 "$FINLIT_HOME/bin/auto-deploy.sh.new" && mv -f "$FINLIT_HOME/bin/auto-deploy.sh.new" "$FINLIT_HOME/bin/auto-deploy.sh"
  fi
  if [ "${1:-check}" = force ]; then log "force: moving the jobs container at once"; bash "$DEPLOY_SH" jobs force >> "$LOG" 2>&1; fi
  [ -s "$STATE/jobs_pending" ] && log "the jobs container moves to this code when the running long job is done"
  log "DEPLOYED $target"
  exit 0
fi
echo "$target" > "$STATE/auto_failed_sha"; echo "$target" >> "$STATE/auto_failed_list"
log "FAILED: deploying $target did not succeed (rc=$rc)"
if [ -n "$after" ] && [ "$after" != "$before" ]; then
  log "the new build is not healthy: going back to the previous build"
  if bash "$DEPLOY_SH" rollback >> "$LOG" 2>&1; then log "ROLLED BACK: the previous version is running again"; else log "ROLLBACK FAILED: look at the site by hand (deploy.sh status, deploy.sh logs app)"; fi
else
  log "the running build was not touched (the deploy stopped before replacing it)"
fi
log "$target will not be tried again; the next new green commit will be"
exit 1
