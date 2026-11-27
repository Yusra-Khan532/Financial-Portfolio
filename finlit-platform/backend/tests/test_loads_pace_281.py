"""Task #281 (27 Nov): the exit-load step asked only ~62 funds a night (live: asked 62, refused429 6). Each scheme-details call went through _retry, which
on a 429 slept AMFI's Retry-After (capped at 90 s) twice before giving up: ~180 s per refused fund, so six refusals spent ~18 of the step's 25 minutes.
A fake clock and a scripted AMFI that answers 429 with "Retry-After: 90" prove: a refused fund waits once, at most LOAD_429_WAIT_MAX; it is left for the
next run; the pause between calls backs off after a 429 and eases back after answers; and the old path would have used the whole budget."""
import httpx
import pytest

from finlit import portfolios as P
from tests.test_loads_queue_281 import HOUSES, Idx, Store


class Clock:
    """time.monotonic and asyncio.sleep, faked together: a sleep moves the clock and is recorded."""

    def __init__(self):
        self.t = 1000.0
        self.sleeps: list = []

    def monotonic(self):
        return self.t

    async def sleep(self, s):
        self.sleeps.append(s)
        self.t += s


@pytest.fixture
def clock(monkeypatch):
    c = Clock()
    monkeypatch.setattr(P.time, "monotonic", c.monotonic)
    monkeypatch.setattr(P.asyncio, "sleep", c.sleep)
    return c


@pytest.fixture
def store(monkeypatch):
    s = Store([f"h{h}-fund-{i}" for h in HOUSES for i in range(10)])

    async def put(pool, rows):
        s.put(rows)
    monkeypatch.setattr(P, "put_facts", put)
    monkeypatch.setattr(P, "LOAD_PAUSE_S", 1.0)
    monkeypatch.setattr(P, "excluded_amc", lambda name: False)
    monkeypatch.setattr(P, "LOAD_STOP_AFTER_429", 99)
    return s


def amfi(refuse):
    def reply(req):
        p = req.url.path
        if p.endswith("populate-mf"):
            return httpx.Response(200, json=[{"mfId": k, "mfName": v} for k, v in HOUSES.items()])
        if p.endswith("populate-scheme"):
            h = req.url.params.get("MF_ID")
            return httpx.Response(200, json=[{"scheme_name": f"H{h} Fund {i}", "scheme_id": str(int(h) * 100 + i)} for i in range(10)])
        sid = req.url.params.get("scheme_id")
        if sid in refuse:
            return httpx.Response(429, headers={"Retry-After": "90"})
        return httpx.Response(200, json={"data": [{"Scheme_load": "Exit Load: 1% if redeemed within 1 year"}]})
    return reply


async def night(store, refuse):
    async with P.make_client(httpx.MockTransport(amfi(refuse))) as c:
        return await P.step_loads(store, c, Idx(), P._today())


@pytest.mark.asyncio
async def test_a_refusal_waits_once_and_at_most_the_cap(store, clock):
    refuse = {"100", "201", "302"}                                   # three funds refused, spread out
    out = await night(store, refuse)
    assert out["refused429"] == 3
    assert max(clock.sleeps) <= P.LOAD_429_WAIT_MAX                  # never the 90 s AMFI asked for
    assert out["secondsWaiting429"] == 3 * P.LOAD_429_WAIT_MAX       # one capped wait per refusal, no retries
    assert out["asked"] == 40 and out["status"] == "ok"              # every family asked once in the same run
    assert out["avgCallSeconds"] == 0                                # the fake clock only moves on sleeps


@pytest.mark.asyncio
async def test_a_refused_fund_is_asked_again_on_the_next_run(store, clock):
    await night(store, {"100"})
    assert ("h1-fund-0", "exitload") not in store.facts and ("h1-fund-0", P.KIND_TRIED) not in store.facts
    out = await night(store, set())
    assert ("h1-fund-0", "exitload") in store.facts and out["asked"] == 1


@pytest.mark.asyncio
async def test_the_pace_backs_off_after_a_429_and_eases_back_after_answers(store, clock):
    out = await night(store, {"100", "200"})                         # the first two families asked (round-robin) are both refused
    pauses = [s for s in clock.sleeps[len(HOUSES):] if s != P.LOAD_429_WAIT_MAX]   # after the 4 fund-house list calls (1 s each)
    assert pauses[0] == 2.0 and pauses[1] == 4.0                     # doubled after each 429 (1 s -> 2 s -> 4 s)
    assert max(pauses) <= P.LOAD_PAUSE_MAX
    assert out["finalPauseSeconds"] == P.LOAD_PAUSE_S                # eased back to the normal pause after answers in a row
    assert min(pauses) >= P.LOAD_PAUSE_S                             # never faster than the normal pause


@pytest.mark.asyncio
async def test_the_pause_never_exceeds_the_maximum(store, clock):
    refuse = {str(h * 100 + i) for h in (1, 2, 3, 4) for i in range(3)}   # 12 refusals in a row
    out = await night(store, refuse)
    assert max(s for s in clock.sleeps if s != P.LOAD_429_WAIT_MAX) <= P.LOAD_PAUSE_MAX
    assert out["refused429"] == 12


@pytest.mark.asyncio
async def test_the_old_path_spent_the_whole_budget_on_six_refusals(clock):
    """The old call (get_json -> _retry) slept Retry-After 90 s twice per refused fund; the new one does not sleep at all itself."""
    def reply(req):
        return httpx.Response(429, headers={"Retry-After": "90"})
    async with P.make_client(httpx.MockTransport(reply)) as c:
        with pytest.raises(httpx.HTTPStatusError):
            await P.get_json(c, P.URL_DETAILS, params={"MF_ID": "1", "scheme_id": "1"})
        old_per_fund = sum(clock.sleeps)
        clock.sleeps.clear()
        with pytest.raises(httpx.HTTPStatusError) as exc:
            await P.get_json_no_wait_on_429(c, P.URL_DETAILS, params={"MF_ID": "1", "scheme_id": "1"})
        assert exc.value.response.status_code == 429
        assert sum(clock.sleeps) == 0
    assert old_per_fund == 180
    assert 6 * old_per_fund >= 0.7 * P.LOAD_MAX_SECONDS              # 6 refusals: 18 of the 25 minutes, as seen live on 27 Nov
    assert 6 * P.LOAD_429_WAIT_MAX <= 0.1 * P.LOAD_MAX_SECONDS       # now: 2 minutes at most


@pytest.mark.asyncio
async def test_a_5xx_is_still_retried_on_the_new_call(clock):
    n = {"c": 0}

    def reply(req):
        n["c"] += 1
        return httpx.Response(503) if n["c"] < 2 else httpx.Response(200, json={"data": [{}]})
    async with P.make_client(httpx.MockTransport(reply)) as c:
        out = await P.get_json_no_wait_on_429(c, P.URL_DETAILS, params={"MF_ID": "1", "scheme_id": "1"})
    assert out == {"data": [{}]} and n["c"] == 2
