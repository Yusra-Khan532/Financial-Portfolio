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
  deploy) case "\${FAKE_MODE:-ok}" in
            ok) echo imgB > "$T/image"; exit 0 ;;
            unhealthy) echo imgC > "$T/image"; exit 1 ;;
            early) exit 1 ;;
          esac ;;
esac
FAKE
export DEPLOY_SH="$FINLIT_HOME/src/sub/deploy/aws/deploy.sh" IMAGE_ID_CMD="cat $T/image" DISK_PCT_CMD="echo 40"
# the deploy gate (jobs first): GATE says what the running app answers; every call is recorded in $T/gate
echo "go: no long job is running" > "$T/gate_answer"; : > "$T/gate"
export DEPLOY_GATE_CMD="sh -c 'echo \"\$*\" >> $T/gate; cat $T/gate_answer' gate"
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
# 8. jobs first: while a long job runs the new commit waits (no deploy, logged once), then goes when the job is done; force deploys at once
printf 'REPO_URL=%s\nREPO_BRANCH=main\nREPO_SUBDIR=sub\n' "$ORIGIN" > "$FINLIT_HOME/auto-deploy.conf"
date +%s > "$FINLIT_HOME/state/last_daily_clean"; rm -f "$FINLIT_HOME/state/last_clean"
commit six; reset; : > "$T/gate"
echo "wait: waiting for ingest to finish (held 3 of 150 min; no new long job starts meanwhile)" > "$T/gate_answer"
FAKE_MODE=ok bash "$A" >/dev/null 2>&1;            ok "a long job runs: the new commit is held, nothing deployed" "" "$(calls)"
ok "the gate was asked about that commit" "check $(git -C "$W" rev-parse HEAD)" "$(head -n 1 "$T/gate")"
echo "wait: waiting for ingest to finish (held 8 of 150 min; no new long job starts meanwhile)" > "$T/gate_answer"
n1="$(grep -c 'held:' "$FINLIT_HOME/logs/auto-deploy.log")"; FAKE_MODE=ok bash "$A" >/dev/null 2>&1; n2="$(grep -c 'held:' "$FINLIT_HOME/logs/auto-deploy.log")"
ok "the same wait is logged once, not every check" "$n1" "$n2"
commit seven; reset; FAKE_MODE=ok bash "$A" >/dev/null 2>&1
ok "a second commit while held: still nothing deployed (they go out together)" "" "$(calls)"
echo "go: no long job is running" > "$T/gate_answer"; : > "$T/gate"
FAKE_MODE=ok bash "$A" >/dev/null 2>&1;            ok "the long job is done: one deploy carries both commits" "backup deploy" "$(calls)"
ok "the newest commit is recorded" "$(git -C "$W" rev-parse HEAD)" "$(cat "$FINLIT_HOME/state/auto_deployed_sha")"
ok "after the deploy the hold is released" "release" "$(tail -n 1 "$T/gate")"
commit eight; reset; echo "wait: waiting for score to finish (held 1 of 150 min)" > "$T/gate_answer"
FAKE_MODE=ok bash "$A" force >/dev/null 2>&1;      ok "force: deployed at once, even while a long job runs" "backup deploy" "$(calls)"
commit nine; reset; echo "gibberish" > "$T/gate_answer"
FAKE_MODE=ok bash "$A" >/dev/null 2>&1;            ok "a gate that cannot answer (older build, app down): deploy goes on" "backup deploy" "$(calls)"
exit $fail
