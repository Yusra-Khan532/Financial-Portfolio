"""Task #375: GET /api/mf/rows, the list rows of the schemes a member keeps, for the Mutual Funds page's Wishlist tab."""
from test_mf import LARGE, LIQUID, api, loaded, store  # noqa: F401  (fixtures)


async def test_the_rows_route_gives_list_rows_in_the_kept_order(api):  # noqa: F811
    r = await api.get(f"/api/mf/rows?codes={LIQUID},{LARGE},999999,{LIQUID}")
    assert r.status_code == 200
    body = r.json()
    assert [i["code"] for i in body["items"]] == [LIQUID, LARGE]                   # the kept order; an unknown code is left out; each once
    assert set(body["items"][0]) >= {"code", "name", "amc", "category", "nav", "r1y", "checklist"} and "peers" in body and body["source"].startswith("AMFI")
    assert (await api.get("/api/mf/rows?codes=")).json()["items"] == []
    assert (await api.get("/api/mf/rows?codes=abc")).status_code == 400
    many = ",".join(str(LARGE + i) for i in range(120))
    assert (await api.get(f"/api/mf/rows?codes={many}")).status_code == 200        # more than 100 are cut to the first 100, never an error
