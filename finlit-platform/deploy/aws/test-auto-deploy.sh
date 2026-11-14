#!/usr/bin/env bash
# Tests auto-deploy.sh with a fake repository and a fake deploy.sh (no docker, no network). Run:  bash deploy/aws/test-auto-deploy.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export FINLIT_HOME="$T/home"; mkdir -p "$FINLIT_HOME/src/sub/deploy/aws"
ORIGIN="$T/origin.git"; git init -q --bare "$ORIGIN"
W="$T/work"; git clone -q "$ORIGIN" "$W" 2>/dev/null; git -C "$W" checkout -q -b main
commit() { echo "$1" > "$W/f.txt"; git -C "$W" add f.txt; git -C "$W" -c user.name=t -c user.email=t@t commit -q -m "$1"; git -C "$W" push -q origin main 2>/dev/null; }
commit one
printf 'REPO_URL=%s\nREPO_BRANCH=main\nREPO_SUBDIR=sub\n' "$ORIGIN" > "$FINLIT_HOME/auto-deploy.conf"
# a fake deploy.sh: records what it was asked, and acts as FAKE_MODE says
echo imgA > "$T/image"; : > "$T/calls"
cat > "$FINLIT_HOME/src/sub/deploy/aws/deploy.sh" <<FAKE
#!/usr/bin/env bash
echo "\$1" >> "$T/calls"
case "\$1" in
  backup) exit 0 ;;
  clean) exit 0 ;;
  rollback) echo imgA > "$T/image"; exit 0 ;;
  jobs) case "\${FAKE_JOBS:-moved}" in
          pending) echo "    the jobs container moves to the new code when the running long job is done: waiting for ingest (held \$RANDOM min)"; exit 0 ;;
          *) rm -f "$FINLIT_HOME/state/jobs_pending"; echo "    the jobs container runs the new code"; exit 0 ;;
        esac ;;
  deploy) [ "\${FAKE_JOBS:-}" = pending ] && echo jobcodeX > "$FINLIT_HOME/state/jobs_pending"   # deploy.sh deploy: the jobs move had to wait
          case "\${FAKE_MODE:-ok}" in
            ok) echo imgB > "$T/image"; exit 0 ;;
            unhealthy) echo imgC > "$T/image"; exit 1 ;;
            early) exit 1 ;;
          esac ;;
esac
FAKE
export DEPLOY_SH="$FINLIT_HOME/src/sub/deploy/aws/deploy.sh" IMAGE_ID_CMD="cat $T/image" DISK_PCT_CMD="echo 40"
A="$HERE/auto-deploy.sh"
mkdir -p "$FINLIT_HOME/state"; date +%s > "$FINLIT_HOME/state/last_daily_clean"   # today's daily cleaning is done, so the tests below only see what they ask for
fail=0; ok() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (wanted '$2', got '$3')"; fail=1; fi; }
calls() { tr '\n' ' ' < "$T/calls" | sed 's/ $//'; }
reset() { : > "$T/calls"; }

# 1. nothing deployed yet and the checkout is not at the remote commit: the first run deploys
FAKE_MODE=ok bash "$A" >/dev/null 2>&1;            ok "first new commit is deployed (backup, then deploy)" "backup deploy" "$(calls)"
ok "the deployed commit is recorded" "$(git -C "$W" rev-parse HEAD)" "$(cat "$FINLIT_HOME/state/auto_deployed_sha")"
reset; bash "$A" >/dev/null 2>&1;                  ok "no change: nothing runs" "" "$(calls)"
# 2. a new commit that fails before replacing the build: no rollback, never retried
commit two; reset; FAKE_MODE=early bash "$A" >/dev/null 2>&1; rc=$?
ok "early failure: backup and deploy, no rollback" "backup deploy" "$(calls)"
ok "early failure exits non-zero" "1" "$rc"
reset; FAKE_MODE=ok bash "$A" >/dev/null 2>&1;     ok "the failed commit is not tried again" "" "$(calls)"
# 3. a newer commit is tried; this one starts and is unhealthy: rolled back
commit three; reset; echo imgA > "$T/image"; FAKE_MODE=unhealthy bash "$A" >/dev/null 2>&1
ok "unhealthy new build is rolled back" "backup deploy rollback" "$(calls)"
ok "the image is the old one again" "imgA" "$(cat "$T/image")"
reset; FAKE_MODE=ok bash "$A" >/dev/null 2>&1;     ok "a rolled-back commit is not retried" "" "$(calls)"
# 4. pause stops everything, resume continues
commit four; reset; bash "$A" pause >/dev/null 2>&1; FAKE_MODE=ok bash "$A" >/dev/null 2>&1
ok "paused: nothing deployed" "" "$(calls)"
bash "$A" resume >/dev/null 2>&1; FAKE_MODE=ok bash "$A" >/dev/null 2>&1
ok "resumed: the waiting commit is deployed" "backup deploy" "$(calls)"
ok "failed marker cleared after a success" "none" "$(cat "$FINLIT_HOME/state/auto_failed_sha" 2>/dev/null || echo none)"
# 5. an unreachable repository does nothing and does not fail
printf 'REPO_URL=%s\nREPO_BRANCH=main\nREPO_SUBDIR=sub\n' "$T/missing.git" > "$FINLIT_HOME/auto-deploy.conf"
commit five; reset; bash "$A" >/dev/null 2>&1; rc=$?
ok "unreachable repository: no deploy, exit 0" "0 " "$rc $(calls)"
# 6. two checks at once: the second one leaves quietly
printf 'REPO_URL=%s\nREPO_BRANCH=main\nREPO_SUBDIR=sub\n' "$ORIGIN" > "$FINLIT_HOME/auto-deploy.conf"
exec 8>"$FINLIT_HOME/state/auto_deploy.lock"; flock -n 8; reset; bash "$A" >/dev/null 2>&1
ok "a check is already running: nothing runs" "" "$(calls)"
exec 8>&-   # release the lock the previous test held
# 7. housekeeping: a disk at 90% is cleaned (once in 30 minutes); a disk at 40% is not
reset; DISK_PCT_CMD="echo 90" bash "$A" >/dev/null 2>&1; ok "a full disk is cleaned first" "clean" "$(calls | cut -d" " -f1)"
reset; DISK_PCT_CMD="echo 90" bash "$A" >/dev/null 2>&1; ok "...but not again within 30 minutes" "" "$(calls)"
reset; rm -f "$FINLIT_HOME/state/last_clean"; DISK_PCT_CMD="echo 40" bash "$A" >/dev/null 2>&1; ok "a disk with room is left alone (already cleaned today)" "" "$(calls)"
reset; rm -f "$FINLIT_HOME/state/last_daily_clean"; DISK_PCT_CMD="echo 40" bash "$A" >/dev/null 2>&1; ok "a day without cleaning: waste is cleared even with room" "clean" "$(calls | cut -d" " -f1)"
reset; DISK_PCT_CMD="echo 40" bash "$A" >/dev/null 2>&1; ok "...and only once a day" "" "$(calls)"
# 8. a website deploy never waits for a job (founder, 14 Nov 2026): the jobs container moves separately (deploy.sh jobs), and a move that has to wait for a
#    long job is asked again at every check, also when nothing new was committed or GitHub cannot be reached; force moves it at once
printf 'REPO_URL=%s\nREPO_BRANCH=main\nREPO_SUBDIR=sub\n' "$ORIGIN" > "$FINLIT_HOME/auto-deploy.conf"
date +%s > "$FINLIT_HOME/state/last_daily_clean"; rm -f "$FINLIT_HOME/state/last_clean"
commit six; reset
FAKE_JOBS=pending FAKE_MODE=ok bash "$A" >/dev/null 2>&1;  ok "a long job runs: the website is deployed at once all the same" "backup deploy" "$(calls)"
ok "...and the jobs move is left waiting" "jobcodeX" "$(cat "$FINLIT_HOME/state/jobs_pending" 2>/dev/null)"
reset; FAKE_JOBS=pending bash "$A" >/dev/null 2>&1;         ok "next check, nothing new: the waiting jobs move is asked again" "jobs" "$(calls)"
n1="$(grep -c 'jobs container:' "$FINLIT_HOME/logs/auto-deploy.log")"; FAKE_JOBS=pending bash "$A" >/dev/null 2>&1; n2="$(grep -c 'jobs container:' "$FINLIT_HOME/logs/auto-deploy.log")"
ok "the same wait is logged once, not every check" "$n1" "$n2"
commit seven; reset; FAKE_JOBS=pending FAKE_MODE=ok bash "$A" >/dev/null 2>&1
ok "a second commit while the jobs move waits: deployed to the website at once" "backup deploy" "$(calls)"
reset; FAKE_JOBS=moved bash "$A" >/dev/null 2>&1;           ok "the long job is done: the jobs container moves" "jobs" "$(calls)"
ok "...and nothing is waiting any more" "none" "$(cat "$FINLIT_HOME/state/jobs_pending" 2>/dev/null || echo none)"
reset; bash "$A" >/dev/null 2>&1;                           ok "nothing waiting, nothing new: nothing runs" "" "$(calls)"
ok "the newest commit is recorded" "$(git -C "$W" rev-parse HEAD)" "$(cat "$FINLIT_HOME/state/auto_deployed_sha")"
commit eight; reset; FAKE_MODE=ok bash "$A" force >/dev/null 2>&1; ok "force: deployed and the jobs container moved at once" "backup deploy jobs" "$(calls)"
reset; bash "$A" force >/dev/null 2>&1;                     ok "force with nothing new: the jobs container is moved at once" "jobs" "$(calls)"
echo jobcodeY > "$FINLIT_HOME/state/jobs_pending"
printf 'REPO_URL=%s\nREPO_BRANCH=main\nREPO_SUBDIR=sub\n' "$T/missing.git" > "$FINLIT_HOME/auto-deploy.conf"
reset; FAKE_JOBS=moved bash "$A" >/dev/null 2>&1;           ok "GitHub unreachable: a waiting jobs move still goes" "jobs" "$(calls)"
exit $fail
