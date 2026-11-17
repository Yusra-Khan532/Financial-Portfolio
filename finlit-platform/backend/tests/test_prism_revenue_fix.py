"""Insurers and companies without consolidated statements (17 November 2026). The production audit put 114 companies in "insufficient history"
(ICICIGI, NIACL, STARHEALTH, CANHLIFE among them) and SBI Life showed "Not rated" with every part blank: the model did not read general insurers'
revenue (`premiumEarned`) and rated companies with no consolidated statements on those empty statements. The model fix marks every new report with
inputMeta.revenueVersion = 2. The model version is NOT bumped (a bump hides every stored report until it is recalculated, which made each page wait
for a live calculation); instead only the reports the fix can change are treated as out of date: rebuilt by the nightly job first, rebuilt in the
background when opened, and never reused for a new calculation."""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from finlit import prism
from test_integration import store  # noqa: F401


def rep(group="MFG", status="RATED", basis="consolidated", version=None):
    meta = {"statementType": basis}
    if version is not None:
        meta["revenueVersion"] = version
    return {"statementType": basis, "inputMeta": meta, "rating": {"group": group, "status": status, "modelVersion": prism.REQUIRED_MODEL_VERSION}}


def test_the_version_mirrors_the_model():
    site = (Path(__file__).resolve().parents[2] / "site-api/backend/premium_model_config.py").read_text()
    assert int(re.search(r"^REVENUE_VERSION = (\d+)", site, re.M).group(1)) == prism.REVENUE_VERSION == 2


def test_which_stored_reports_the_fix_can_change():
    assert prism.stale_revenue(rep("INSURANCE", "NOT RATED", "consolidated"))            # SBI Life as shown on 17 Nov
    assert prism.stale_revenue(rep("INSURANCE", "PROVISIONAL", "standalone"))            # a general insurer rated without its sales
    assert prism.stale_revenue(rep("INSURANCE", "RATED"))
    assert prism.stale_revenue(json.dumps(rep("MFG", "NOT RATED", "consolidated")))      # rated on empty consolidated statements
    assert not prism.stale_revenue(rep("MFG", "NOT RATED", "standalone"))                # already on standalone: the fix changes nothing
    assert not prism.stale_revenue(rep("MFG", "RATED"))                                  # every other company keeps its report
    assert not prism.stale_revenue(rep("BANK", "PROVISIONAL"))
    assert not prism.stale_revenue(rep("INSURANCE", "NOT RATED", version=2))             # calculated by the fixed model
    assert not prism.stale_revenue("not json") and not prism.stale_revenue(None)


def test_an_affected_report_is_not_reused_for_a_calculation_but_others_are():
    now = datetime.now(timezone.utc)
    assert not prism._fresh({"report": json.dumps(rep("INSURANCE", "NOT RATED")), "generated_at": now})
    assert prism._fresh({"report": json.dumps(rep("INSURANCE", "NOT RATED", version=2)), "generated_at": now})
    assert prism._fresh({"report": json.dumps(rep("MFG", "RATED")), "generated_at": now})


async def test_the_nightly_job_rebuilds_the_affected_reports_first_and_leaves_the_others(store):  # noqa: F811
    rows = {"SBILIFE": rep("INSURANCE", "NOT RATED"), "ICICIGI": rep("INSURANCE", "NOT RATED"), "NOCONSO": rep("MFG", "NOT RATED"),
            "TCS": rep("MFG", "RATED"), "STANDALONE": rep("MFG", "NOT RATED", "standalone"), "DONE": rep("INSURANCE", "RATED", version=2)}
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM prism_reports")
        await conn.execute("DELETE FROM snapshots WHERE section = 'summary'")
        for sym, body in rows.items():
            await conn.execute("INSERT INTO snapshots (symbol, statement, section, body, etag, generated_at) VALUES ($1, 'consolidated', 'summary', '{}', 'x', now())", sym)
            await conn.execute("INSERT INTO prism_reports (symbol, statement, id, report, model_version, final, label, status) VALUES ($1,'consolidated',$2,$3::jsonb,$4,NULL,$5,$6)",
                               sym, sym.lower().ljust(32, "0")[:32], json.dumps(body), prism.REQUIRED_MODEL_VERSION, body["rating"]["status"], body["rating"]["status"])
    queue = await prism._pending(store, "consolidated", 7, 50, [])
    assert set(queue) == {"SBILIFE", "ICICIGI", "NOCONSO"}                     # fresh, current reports (TCS, STANDALONE, DONE) are not touched
    assert set(await prism._pending(store, "consolidated", 7, 50, [], stale_only=True)) == {"SBILIFE", "ICICIGI", "NOCONSO"}
