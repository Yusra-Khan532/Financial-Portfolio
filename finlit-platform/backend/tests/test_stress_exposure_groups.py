"""Stress Lab engine 2.1.1: a level that sets any raw-material share sets the whole mix, so every covered large and mid cap gets valid settings
(before, 19 of them - Reliance, IOC, Titan, MRF... - added up to more than 100% and could not be built), and Asian Paints' answer does not change."""
import csv
from pathlib import Path

from finlit_technicals import stress as S

UNIVERSE = Path(__file__).parent / "stress_launch" / "launch-universe-2026-11-09.csv"


def test_every_company_of_the_launch_universe_gets_valid_settings():
    table, bad, n = S.ExposureTable(), [], 0
    for r in csv.DictReader(open(UNIVERSE, encoding="utf-8")):
        n += 1
        try:
            e = table.lookup(symbol=r["symbol"], basic=r["site_industry"], industry=r["nse_industry"], sector=r["nse_sector"])
        except ValueError as err:
            bad.append(f"{r['symbol']}: {err}")
            continue
        assert e.crude_rm + e.import_rm + e.metal_rm + e.agri_rm <= 1 + 1e-9 and e.export_rev + e.crude_rev <= 1 + 1e-9, r["symbol"]
    assert n == 471 and bad == []


def test_the_nineteen_that_failed_before_now_build_and_asian_paints_is_unchanged():
    t = S.ExposureTable()
    for sym, b, i, s in [("MRF", "Tyres & Rubber Products", "Auto Components", "Automobile and Auto Components"), ("RELIANCE", "Refineries & Marketing", "Petroleum Products", "Oil Gas & Consumable Fuels"),
                         ("TITAN", "Gems, Jewellery And Watches", "Consumer Durables", "Consumer Durables"), ("SUPREMEIND", "Plastic Products - Industrial", "Industrial Products", "Capital Goods")]:
        t.lookup(symbol=sym, basic=b, industry=i, sector=s)
    e = t.lookup(symbol="ASIANPAINT", basic="Paints", industry="Consumer Durables", sector="Consumer Durables")
    assert (e.crude_rm, e.import_rm, e.metal_rm, e.agri_rm) == (0.45, 0.25, 0.03, 0.0)
