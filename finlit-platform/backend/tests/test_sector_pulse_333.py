"""Task #333 (developer file 30, Sector Pulse): the address is looked up in the chosen view first (Capital Goods had no sector page), and the Sectors view lists
every NSE industry under its sector so the 22 sectors hold all 59 industries."""
from finlit import sector_data as sd
from finlit.sector_api import with_every_industry
from finlit import taxonomy


def test_capital_goods_is_the_sector_in_the_sectors_view():
    sectors_view = {"capital-goods", "power", "realty"}
    assert sd.resolve_slug("capital-goods", sectors_view) == "capital-goods"
    # the Industries view has no "capital-goods", so the old address still goes to the renamed industry
    assert sd.resolve_slug("capital-goods", {"agricultural-commercial-construction-vehicles"}) == "agricultural-commercial-construction-vehicles"
    assert sd.resolve_slug("capital-goods") == "agricultural-commercial-construction-vehicles"
    assert sd.resolve_slug("power", sectors_view) == "power"


def test_sectors_view_lists_every_industry_of_each_sector_once():
    tree = taxonomy.tree()["by"]["industry"].values()
    by_sector = {}
    for ind in tree:
        by_sector.setdefault(ind["sector"], []).append(ind["industry"])
    assert sum(len(v) for v in by_sector.values()) == 59 and len(by_sector) == 22
    rows = [{"name": "Capital Goods", "slug": "capital-goods", "kind": "sector", "industries": ["Agricultural Commercial & Construction Vehicles"]},
            {"name": "Services", "slug": "services", "kind": "sector", "industries": ["Engineering Services"]}]
    out = with_every_industry({"rows": rows, "date": "2026-11-20"})
    cg = next(r for r in out["rows"] if r["slug"] == "capital-goods")["industries"]
    keys = [taxonomy.key(x) for x in cg]
    assert len(keys) == len(set(keys)), "an industry is listed once, whatever its spelling"
    assert len(cg) == len(by_sector["Capital Goods"])
    sv = next(r for r in out["rows"] if r["slug"] == "services")["industries"]
    assert len(sv) == len(by_sector["Services"]) and sv[0] == "Engineering Services"
    assert rows[0]["industries"] == ["Agricultural Commercial & Construction Vehicles"], "the board itself is not changed"
