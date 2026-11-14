"""The schedule only matters if it runs. Static checks of the AWS start path: start.sh launches scheduler.sh, which keeps the job supervisor, the on-demand
lane and the commodity loop alive. (All timing rules are tested with a fake clock in test_jobs_*.py.)"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SH = (ROOT / "deploy/scheduler.sh").read_text()


def test_the_aws_container_starts_the_scheduler():
    dockerfile = (ROOT / "Dockerfile").read_text()
    assert "COPY deploy/start.sh deploy/scheduler.sh deploy/jobs.sh ./" in dockerfile and 'CMD ["./start.sh"]' in dockerfile
    compose = (ROOT / "deploy/aws/docker-compose.aws.yml").read_text()
    app = compose.split("\n  app:\n")[1].split("\n  jobs:\n")[0]
    assert "command:" not in app and "entrypoint:" not in app                  # nothing replaces the image's start.sh
    start = (ROOT / "deploy/start.sh").read_text()
    assert 'nohup bash -c "\\"$HERE/scheduler.sh\\"' in start and "/tmp/scheduler.log" in start
    assert start.index("scheduler.sh") < start.index("exec $PY -m uvicorn")       # launched before the web server takes over the shell
    for f in ("deploy/scheduler.sh", "deploy/start.sh"):
        assert subprocess.run(["bash", "-n", str(ROOT / f)]).returncode == 0


def test_the_scheduler_only_keeps_the_supervisor_the_on_demand_lane_and_the_commodity_loop_alive():
    assert "finlit.worker supervise" in SH and "PIPESTATUS[0]" in SH                      # the supervisor, restarted by the loop around it
    assert "delay * 2 > 300 ? 300" in SH and '"$rc" = 3' in SH                            # growing delay capped at 5 minutes; 3 = lock held by another copy
    line = [l for l in SH.splitlines() if "drain-queue --loop" in l and "while true" in l][0]
    assert "sleep 10" in line and "supervise" not in line and "loads_paused" not in line   # the on-demand lane: always on, outside every gate
    assert "refresh-commodities --loop" in SH
    code = "\n".join(l for l in SH.splitlines() if not l.lstrip().startswith("#"))
    for gone in ("due()", "run()", "run_funds", "fund_step", "flock", "loads_paused", "chain_night", "declare -A DONE", "wake heartbeat"):
        assert gone not in code, gone                              # the bash scheduling logic is gone (only mentioned in the comment)


def test_the_supervisor_is_started_by_hand_with_one_flag():
    from finlit.worker import main  # noqa: F401 - the command exists
    import inspect
    from finlit import worker
    src = inspect.getsource(worker)
    assert '"supervise"' in src and "--once" in src and "--dry-run" in src


def test_swap_is_created_only_when_missing_and_jobs_are_the_first_oom_victims():
    boot = (ROOT / "deploy/aws/bootstrap.sh").read_text()
    assert "swapon --show=NAME --noheadings | grep -q ." in boot and "swap already active" in boot            # idempotent: nothing done if swap exists
    assert "vm.swappiness=10" in boot and "SWAP_GB" in boot
    compose = (ROOT / "deploy/aws/docker-compose.aws.yml").read_text()
    assert compose.count("oom_score_adj: -300") == 3                                                          # db, redis, caddy protected
    assert "mem_limit: ${APP_MEM_LIMIT:-500m}" in compose and "mem_limit: ${JOBS_MEM_LIMIT:-800m}" in compose    # the website and the jobs each have their own limit
    runner = (ROOT / "backend/finlit/jobs/runner.py").read_text()
    assert "/proc/self/oom_score_adj" in runner and "oom_adj: int = 500" in runner and "start_new_session=True" in runner


def test_a_deploy_never_shows_visitors_a_502():
    """While deploy.sh replaces the app container, Caddy holds each request and retries until the new app answers; past that, a page that reloads
    itself (and JSON for the API), never the browser's raw "HTTP ERROR 502"."""
    caddy = (ROOT / "deploy/aws/Caddyfile").read_text()
    proxy = caddy[caddy.index("reverse_proxy app:8000 {"):]
    proxy = proxy[:proxy.index("}") + 1]
    assert "lb_try_duration 90s" in proxy and "lb_try_interval 1s" in proxy
    assert "header_up X-Forwarded-For {remote_host}" in proxy                       # the visitor's real address still reaches the app
    errors = caddy[caddy.index("handle_errors 502 503 504 {"):]
    assert "@api path /api/*" in errors and '"status":"updating"' in errors
    assert 'http-equiv="refresh"' in errors and 'Cache-Control "no-store"' in errors
    assert caddy.index("handle_errors") < caddy.index("import /etc/caddy/extra/*.caddy")   # inside the FinLit site, not the extra sites


def test_jobs_run_in_their_own_container_so_a_website_deploy_never_stops_one():
    """Founder, 14 Nov 2026: 77 of 93 failed job runs on 12-13 Nov were killed by website deploys. The jobs now run in the `jobs` service (same image,
    deploy/jobs.sh); the website container does not start them; deploy.sh deploys everything but `jobs`, then moves `jobs` only through `deploy.sh jobs`."""
    import yaml
    compose_text = (ROOT / "deploy/aws/docker-compose.aws.yml").read_text()
    svc = yaml.safe_load(compose_text)["services"]
    app, jobs = svc["app"], svc["jobs"]
    assert app["environment"]["JOBS_IN_APP"] == "0" and app["environment"]["SITE_API_HOST"] == "0.0.0.0"
    assert jobs["image"] == app["image"] == "finlit-app:current" and jobs["env_file"] == app["env_file"] and jobs["volumes"] == app["volumes"]
    assert "./jobs.sh" in " ".join(jobs["command"]) and "sleep infinity" in " ".join(jobs["command"])   # an older image (no jobs.sh) just waits
    assert "ports" not in jobs and "ports" not in app
    start = (ROOT / "deploy/start.sh").read_text()
    assert 'if [ "${JOBS_IN_APP:-1}" != "0" ]; then' in start and "scheduler.sh" in start.split('if [ "${JOBS_IN_APP:-1}" != "0" ]; then')[1].split("\nelse\n")[0]
    jobs_sh = (ROOT / "deploy/jobs.sh").read_text()
    assert "finlit.worker migrate" in jobs_sh and "./scheduler.sh" in jobs_sh and "SITE_API_PEER:-app" in jobs_sh
    assert "deploy/jobs.sh" in (ROOT / "Dockerfile").read_text()
    deploy = (ROOT / "deploy/aws/deploy.sh").read_text()
    assert "dc up -d --remove-orphans db redis app caddy backup" in deploy and "dc up -d --remove-orphans\n" not in deploy
    assert "dc up -d --no-deps --no-build --force-recreate jobs" in deploy and "cmd_jobs ||" in deploy
    assert "dc stop app jobs" in deploy                                    # a restore stops the jobs too: nothing writes while the database is replaced
    auto = (ROOT / "deploy/aws/auto-deploy.sh").read_text()
    assert 'bash "$DEPLOY_SH" jobs' in auto and "deploy-gate check" not in auto   # the website deploy itself never waits for a job
