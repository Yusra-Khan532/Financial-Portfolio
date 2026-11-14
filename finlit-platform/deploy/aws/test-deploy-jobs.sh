#!/usr/bin/env bash
# Tests `deploy.sh jobs` (moving the jobs container to new code) with a fake `docker` and a real git checkout (no docker, no network).
# Run:  bash deploy/aws/test-deploy-jobs.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export FINLIT_HOME="$T/home" REPO_SUBDIR=fp ENV_FILE="$T/env"
SRC="$FINLIT_HOME/src"; P="$SRC/fp"
mkdir -p "$P/deploy/aws" "$P/backend/finlit" "$P/backend/finlit_technicals" "$P/frontend" "$FINLIT_HOME/state" "$T/bin"
: > "$ENV_FILE"; cp "$HERE/docker-compose.aws.yml" "$P/deploy/aws/"
echo one > "$P/backend/finlit/worker.py"; echo t > "$P/backend/finlit_technicals/x.py"; echo r > "$P/backend/requirements.txt"
echo d > "$P/Dockerfile"; echo s > "$P/deploy/scheduler.sh"; echo j > "$P/deploy/jobs.sh"; echo w > "$P/frontend/page.tsx"
git -C "$SRC" init -q; git -C "$SRC" add -A; git -C "$SRC" -c user.name=t -c user.email=t@t commit -q -m one
change() { echo "$2" > "$P/$1"; git -C "$SRC" add -A; git -C "$SRC" -c user.name=t -c user.email=t@t commit -q -m "$2"; }

# A fake docker: `compose ps -q --status running jobs` prints an id when $T/running exists; `compose exec ... deploy-gate check|release` answers from
# $T/gate_answer; every other compose call is recorded in $T/calls.
cat > "$T/bin/docker" <<FAKE
#!/usr/bin/env bash
args="\$*"
case "\$args" in
  *" ps -q --status running jobs"*) [ -e "$T/running" ] && echo abc123; exit 0 ;;
  *"deploy-gate check"*) echo "gate check" >> "$T/calls"; cat "$T/gate_answer"; exit 0 ;;
  *"deploy-gate release"*) echo "gate release" >> "$T/calls"; exit 0 ;;
  *" up "*) echo "up \${args##* up }" >> "$T/calls"; touch "$T/running"; exit 0 ;;
esac
exit 0
FAKE
chmod +x "$T/bin/docker"; export PATH="$T/bin:$PATH"
D="$HERE/deploy.sh"
fail=0; ok() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (wanted '$2', got '$3')"; fail=1; fi; }
calls() { tr '\n' '|' < "$T/calls" | sed 's/|$//'; }
reset() { : > "$T/calls"; }
code() { cat "$FINLIT_HOME/state/jobs_code" 2>/dev/null; }
pending() { cat "$FINLIT_HOME/state/jobs_pending" 2>/dev/null || echo none; }
echo "go: no long job is running" > "$T/gate_answer"

# 1. no jobs container yet (the first deploy of the new layout): it is started at once, the gate is not asked
reset; bash "$D" jobs >/dev/null 2>&1
ok "no jobs container: started at once" "up -d --no-deps --no-build --force-recreate jobs|gate release" "$(calls)"
first="$(code)"; ok "its job code is recorded" "16" "${#first}"
# 2. the same job code: left alone (a website-only merge never restarts a job)
reset; bash "$D" jobs >/dev/null 2>&1;             ok "same job code: the container is left alone" "" "$(calls)"
change frontend/page.tsx two; reset; bash "$D" jobs >/dev/null 2>&1
ok "a website-only change: left alone, no gate asked" "" "$(calls)"
ok "...and the job code is unchanged" "$first" "$(code)"
# 3. the job code changed while a long job runs: it waits, nothing restarted, the move is pending
change backend/finlit/worker.py three
echo "wait: waiting for ingest to finish (held 3 of 150 min; no new long job starts meanwhile)" > "$T/gate_answer"
reset; bash "$D" jobs >/dev/null 2>&1
ok "job code changed while a long job runs: only the gate is asked" "gate check" "$(calls)"
ok "...the container keeps its old code" "$first" "$(code)"
[ "$(pending)" != none ]; ok "...and the move is pending" "0" "$?"
# 4. the long job is done: moved, the hold released, nothing pending
echo "go: no long job is running" > "$T/gate_answer"
reset; bash "$D" jobs >/dev/null 2>&1
ok "the long job is done: moved and the hold released" "gate check|up -d --no-deps --no-build --force-recreate jobs|gate release" "$(calls)"
[ "$(code)" != "$first" ]; ok "...the new job code is recorded" "0" "$?"
ok "...and nothing is pending" "none" "$(pending)"
# 5. each path that the jobs run counts as job code
for f in backend/finlit_technicals/x.py backend/requirements.txt Dockerfile deploy/scheduler.sh deploy/jobs.sh; do
  before="$(code)"; change "$f" "x$RANDOM"; reset; bash "$D" jobs >/dev/null 2>&1
  [ "$(code)" != "$before" ]; ok "a change in $f moves the jobs container" "0" "$?"
done
# 6. force moves at once, even while a long job runs, and a gate that cannot answer does not block
change backend/finlit/worker.py four
echo "wait: waiting for score to finish (held 1 of 150 min)" > "$T/gate_answer"
reset; bash "$D" jobs force >/dev/null 2>&1
ok "force: moved at once, the gate not asked" "up -d --no-deps --no-build --force-recreate jobs|gate release" "$(calls)"
change backend/finlit/worker.py five; echo "gibberish" > "$T/gate_answer"
reset; bash "$D" jobs >/dev/null 2>&1
ok "a gate that cannot answer: the move goes on" "gate check|up -d --no-deps --no-build --force-recreate jobs|gate release" "$(calls)"
# 7. the jobs container stopped (crashed, or stopped by hand) with the same code: started again
rm -f "$T/running"; reset; bash "$D" jobs >/dev/null 2>&1
ok "a stopped jobs container is started again" "up -d --no-deps --no-build --force-recreate jobs|gate release" "$(calls)"
exit $fail
