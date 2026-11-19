"""Task #258: writes frontend/src/lib/nseTree.ts from backend/finlit/data/nse_classification.json (NSE's 12 > 22 > 59). Run from finlit-platform/."""
import json
import sys

src, dst = sys.argv[1], sys.argv[2]
rows = json.load(open(src, encoding="utf-8"))["basic_industries"]
macros, sectors, inds = [], [], []
for r in rows:
    if r["macro_sector"] not in macros:
        macros.append(r["macro_sector"])
    if r["sector"] not in [s[0] for s in sectors]:
        sectors.append((r["sector"], r["macro_sector"]))
    if r["industry"] not in [i[0] for i in inds]:
        inds.append((r["industry"], r["sector"], r["macro_sector"]))
out = [
    "// NSE's industry classification (macro sector 12 > sector 22 > industry 59), copied from backend/finlit/data/nse_classification.json (task #192)",
    "// by scripts/gen_nse_tree.py. Task #258 (20 Nov handoff, SHARED §1): the screener lists every name of each level; a test checks this file against the backend's.",
    "export type NseSector = { name: string; macro: string };",
    "export type NseIndustry = { name: string; sector: string; macro: string };",
    "export const NSE_MACROS: string[] = " + json.dumps(macros, ensure_ascii=False) + ";",
    "export const NSE_SECTORS: NseSector[] = [" + ", ".join(json.dumps({"name": s, "macro": m}, ensure_ascii=False) for s, m in sectors) + "];",
    "export const NSE_INDUSTRIES: NseIndustry[] = [" + ", ".join(json.dumps({"name": i, "sector": s, "macro": m}, ensure_ascii=False) for i, s, m in inds) + "];",
    "",
]
open(dst, "w", encoding="utf-8").write("\n".join(out))
print(len(macros), len(sectors), len(inds))
