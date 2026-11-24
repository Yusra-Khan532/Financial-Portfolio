"""Task #281 (24 Nov): the exit-load step stalled at about 18% of funds. The queue followed AMFI's alphabetical fund-house list, and a family whose answer
had no exit-load text stored nothing, so it was asked again at the front every night; the later fund houses were never reached. These tests replay
two nights against a stateful fake store: blank families are remembered, never-tried families go first, the queue is spread across fund houses,
house lists are kept for a week, and a 429 is not remembered."""
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from finlit import portfolios as P


class Idx:
    def resolve(self, names):
        return (names[0].lower().replace(" ", "-"), "name")


class Store:
    """disclosure_facts in memory: {(fkey, kind): (value, updated_at)}; mf_schemes: every family active."""

    def __init__(self, families):
        self.families = families
        self.facts = {}

    def acquire(self):
        return Conn(self)

    def put(self, rows):
        now = datetime.now(timezone.utc)
        for f, k, _d, v, _s, _u in rows:
            self.facts[(f, k)] = (v, now)

    def age(self, kind, days):
        for key, (v, t) in list(self.facts.items()):
            if key[1] == kind:
                self.facts[key] = (v, t - timedelta(days=days))


class Conn:
    def __init__(self, s):
        self.s = s

    async def fetch(self, sql, *a):
        now = datetime.now(timezone.utc)
        if "FROM mf_schemes" in sql:
            return [{"family": f} for f in self.s.families]
        if "kind = 'exitload'" in sql:
            return [{"fkey": f} for (f, k), (v, t) in self.s.facts.items() if k == "exitload" and (now - t).days < a[0]]
        if "updated_at > now()" in sql:      # cached house lists
            return [{"fkey": f, "value": v} for (f, k), (v, t) in self.s.facts.items() if k == a[0] and (now - t).days < a[1]]
        return [{"fkey": f, "updated_at": t} for (f, k), (v, t) in self.s.facts.items() if k == a[0]]

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


HOUSES = {"1": "Aditya Birla Sun Life Mutual Fund", "2": "Axis Mutual Fund", "3": "HDFC Mutual Fund", "4": "SBI Mutual Fund"}


def amfi(calls, blank_house="1", refuse=None):
    """Four houses of 10 schemes each. House `blank_house` answers every scheme with no exit-load text (the stall's cause); `refuse` = a set of
    scheme ids answered 429."""
    def reply(req):
        p = req.url.path
        calls.append(p)
        if p.endswith("populate-mf"):
            return httpx.Response(200, json=[{"mfId": k, "mfName": v} for k, v in HOUSES.items()])
        if p.endswith("populate-scheme"):
            h = req.url.params.get("MF_ID")
            return httpx.Response(200, json=[{"scheme_name": f"H{h} Fund {i}", "scheme_id": str(int(h) * 100 + i)} for i in range(10)])
        sid = req.url.params.get("scheme_id")
        if refuse and sid in refuse:
            return httpx.Response(429)
        load = "" if sid.startswith(blank_house) else "Exit Load: 1% if redeemed within 1 year"
        return httpx.Response(200, json={"data": [{"Scheme_load": load}]})
    return reply


@pytest.fixture
def store(monkeypatch):
    s = Store([f"h{h}-fund-{i}" for h in HOUSES for i in range(10)])

    async def put(pool, rows):
        s.put(rows)
    monkeypatch.setattr(P, "put_facts", put)
    monkeypatch.setattr(P, "LOAD_PAUSE_S", 0)
    monkeypatch.setattr(P, "excluded_amc", lambda name: False)
    return s


async def night(store, calls, **kw):
    async with P.make_client(httpx.MockTransport(amfi(calls, **kw))) as c:
        return await P.step_loads(store, c, Idx(), P._today())


def asked_houses(calls_before, calls):
    return calls[len(calls_before):]


@pytest.mark.asyncio
async def test_two_nights_reach_new_houses_and_blank_families_are_not_asked_again(store, monkeypatch):
    monkeypatch.setattr(P, "LOAD_MAX_CALLS", 12)                  # a small night: 12 calls of the 40 families
    calls: list = []
    first = await night(store, calls)
    assert first["status"] == "partial" and first["asked"] == 12
    assert first["housesReached"] == 4                             # round-robin: every house gets calls on night one, not only the first house
    blank_tried = {f for (f, k) in store.facts if k == P.KIND_TRIED}
    assert blank_tried and all(f.startswith("h1-") for f in blank_tried)
    second = await night(store, calls)
    assert second["asked"] == 12 and second["familiesLeft"] < first["familiesLeft"]
    stored = {f for (f, k) in store.facts if k == "exitload"}
    tried = {f for (f, k) in store.facts if k == P.KIND_TRIED}
    assert len(stored) + len(tried) == 24                          # 24 different families over two nights: nothing asked twice
    assert second["triedRecently"] == len(blank_tried)


@pytest.mark.asyncio
async def test_old_queue_order_stalled_new_queue_spreads_and_puts_never_tried_first():
    t0 = datetime(2026, 11, 1, tzinfo=timezone.utc)
    by_house = {"1": [("a1", []), ("a2", []), ("a3", [])], "2": [("b1", []), ("b2", [])], "3": [("c1", [])]}
    q = [f for _h, f, _c in P.loads_queue(by_house, {})]
    assert q[:3] == ["a1", "b1", "c1"]                             # one per house in turn
    q2 = [f for _h, f, _c in P.loads_queue(by_house, {"a1": t0 + timedelta(days=3), "a2": t0})]
    assert q2.index("a3") < q2.index("a2") < q2.index("a1")      # never tried first, then the one tried longest ago


@pytest.mark.asyncio
async def test_house_lists_are_kept_for_a_week(store):
    calls: list = []
    await night(store, calls)
    assert calls.count("/api/populate-scheme") == 4
    calls.clear()
    out = await night(store, calls)
    assert calls.count("/api/populate-scheme") == 0 and out["houseListsCached"] == 4
    store.age(P.KIND_LIST, P.LIST_CACHE_DAYS + 1)
    calls.clear()
    await night(store, calls)
    assert calls.count("/api/populate-scheme") == 4


@pytest.mark.asyncio
async def test_a_429_is_not_remembered_and_a_blank_is_asked_again_after_the_retry_days(store, monkeypatch):
    calls: list = []
    refuse = {"300"}                                               # HDFC's first scheme: 429
    monkeypatch.setattr(P, "LOAD_STOP_AFTER_429", 99)
    await night(store, calls, refuse=refuse)
    assert ("h3-fund-0", P.KIND_TRIED) not in store.facts and ("h3-fund-0", "exitload") not in store.facts
    out = await night(store, calls)                                # next night AMFI answers it
    assert ("h3-fund-0", "exitload") in store.facts
    store.age(P.KIND_TRIED, P.LOAD_RETRY_DAYS + 1)
    out = await night(store, calls)
    assert out["triedRecently"] == 0 and out["asked"] >= 10        # the ten blank Aditya Birla families are asked again after 14 days
