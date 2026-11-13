"""Deploys that wait for the jobs (founder, 13 Nov 2026: "jobs should never be affected by anything, whatever is going on").

Every deploy restarts the app container, and with it the job supervisor and the job it is running. On 12 and 13 Nov 2026 a run of merges restarted the
container again and again, so `ingest` (one capped run is up to 90 minutes) was killed every time and did not complete for 42 hours, and everything
behind it (score, prism, stress) waited too. The cure is not to make jobs survive a restart (a process cannot outlive its container) but to stop
restarting the container under a long job:

  1. auto-deploy.sh finds a new commit and asks this gate first (`python -m finlit.worker deploy-gate check SHA`, run inside the app container).
  2. While a long job (bulk or audit class) is running, the answer is "wait": the deploy is held, and a HOLD flag is written to Redis.
  3. While the flag is there the supervisor starts no NEW long job, so the running one finishes and a gap opens. Light jobs (results, quotes, calendars,
     alerts) keep running as normal: they are short, and they are retried a minute after any restart.
  4. At the next check (every few minutes) nothing long is running: "go", the deploy runs, and every commit merged meanwhile goes out in that one deploy.
  5. On "go" the flag stays, marked `deploying`, while the new version builds and starts (13 Nov 2026: the flag used to be removed at "go", the build
     took minutes, the supervisor started prism in that gap and the restart killed it). After the deploy, `deploy-gate release` removes it.

Two safety valves keep the rule "jobs never stop" true even if something goes wrong here:
  * the flag lives only HOLD_TTL_S (15 minutes) unless auto-deploy refreshes it on its next check, so a stopped auto-deploy can never hold the jobs;
  * a deploy is held at most DEPLOY_HOLD_MAX_MIN (default 150, longer than any job's own time cap), so a code fix always ships; the job that is
    stopped then resumes where it left off (every long job is resumable).
`auto-deploy.sh force` deploys at once, for an urgent fix.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional

HOLD_KEY = "jobs:deploy_hold"
HOLD_TTL_S = 15 * 60
DEPLOYING_TTL_S = 30 * 60   # while the new version builds and starts (a build takes minutes): no new long job may start in that gap
LONG_CLASSES = ("bulk", "audit")


def hold_max_min(env: Optional[Mapping[str, str]] = None) -> float:
    try:
        return max(30.0, float((env or os.environ).get("DEPLOY_HOLD_MAX_MIN", "150") or 150))
    except ValueError:
        return 150.0


@dataclass
class Decision:
    go: bool
    reason: str
    hold: Optional[Dict[str, Any]]      # the flag to keep in Redis, None = remove it


def decide(long_running: Iterable[str], held: Optional[Dict[str, Any]], sha: str, now: float, max_min: float, supervisor_alive: bool = True) -> Decision:
    """Pure: whether a deploy of `sha` may go now, given the long jobs running and the flag already held (its `since` is when the wait began)."""
    names = [n for n in long_running if n]
    going = {"sha": sha, "since": now, "deploying": True, "waitingFor": [], "maxMinutes": max_min}   # kept until release: no long job starts during the build
    if not supervisor_alive:
        return Decision(True, "the job supervisor is not answering: deploying (the deploy restarts it)", None)
    if not names:
        return Decision(True, "no long job is running", going)
    since = float(held.get("since")) if held and held.get("since") and not held.get("deploying") else now
    waited = (now - since) / 60.0
    if waited >= max_min:
        return Decision(True, f"held {waited:.0f} min, the most a deploy waits: deploying now; {', '.join(names)} resumes where it left off after the restart", going)
    hold = {"sha": sha, "since": since, "waitingFor": names, "maxMinutes": max_min}
    return Decision(False, f"waiting for {', '.join(names)} to finish (held {waited:.0f} of {max_min:.0f} min; no new long job starts meanwhile)", hold)


async def read_hold(redis: Any) -> Optional[Dict[str, Any]]:
    try:
        raw = await redis.get(HOLD_KEY)
        return json.loads(raw) if raw else None
    except Exception:   # nosec B110 - an unreadable flag means no hold: the jobs never wait on it
        return None


async def check(store: Any, sha: str, env: Optional[Mapping[str, str]] = None, now: Optional[float] = None) -> Decision:
    """What auto-deploy asks before a deploy. Reads which jobs run from the supervisor's own heartbeat, writes or removes the flag."""
    from .alerts import HEARTBEAT_STALE_S
    from .registry import build_jobs
    from .signals import BEAT_KEY
    redis = store.redis
    now = now if now is not None else datetime.now(timezone.utc).timestamp()
    try:
        raw = await redis.get(BEAT_KEY)
        beat = json.loads(raw) if raw else {}
    except Exception:
        beat = {}
    alive = bool(beat.get("at")) and now - float(beat["at"]) <= HEARTBEAT_STALE_S
    cls = {j.name: j.cls for j in build_jobs(env)}
    long_running = [n for n in (beat.get("running") or []) if cls.get(n) in LONG_CLASSES]
    d = decide(long_running, await read_hold(redis), sha, now, hold_max_min(env), alive)
    try:
        if d.hold:
            await redis.set(HOLD_KEY, json.dumps(d.hold), ex=DEPLOYING_TTL_S if d.hold.get("deploying") else HOLD_TTL_S)
        else:
            await redis.delete(HOLD_KEY)
    except Exception:   # nosec B110 - without Redis there is no hold, and the deploy decision above still stands
        pass
    return d


async def release(store: Any) -> None:
    try:
        await store.redis.delete(HOLD_KEY)
    except Exception:   # nosec B110 - the flag expires by itself within HOLD_TTL_S
        pass


def hold_reason(hold: Optional[Dict[str, Any]], now: float) -> Optional[str]:
    """The supervisor's reason for not starting a new long job while a deploy waits (None when there is no hold)."""
    if not hold:
        return None
    if hold.get("deploying"):
        return "waiting for a deploy: a new version is going out now; the queue carries on as soon as it is running"
    waiting: List[str] = hold.get("waitingFor") or []
    mins = (now - float(hold.get("since") or now)) / 60.0
    return (f"waiting for a deploy: a new version waits for {', '.join(waiting) or 'the running job'} to finish, so no new long job starts "
            f"(held {mins:.0f} min, at most {float(hold.get('maxMinutes') or 150):.0f})")
