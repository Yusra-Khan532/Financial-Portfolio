#!/usr/bin/env python3
"""Builds the extension's own copy of the FinLit glossary from the site's glossary, and (with --zip) packs the extension for the Chrome Web Store.

    python extension/build.py          # data/glossary.json from frontend/src/content/glossary.json
    python extension/build.py --zip    # also dist/finlit-extension-<version>.zip (only the files the extension needs)

The extension keeps only what a lookup shows: id, term, topic, meaning, formula, aliases. Run it whenever the site glossary changes (a test fails until you do).
"""
import json
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "frontend" / "src" / "content" / "glossary.json"
OUT = HERE / "data" / "glossary.json"
SHIP = ["manifest.json", "background.js", "content.js", "popup.html", "popup.css", "popup.js", "data/glossary.json", "lib/text.js", "lib/glossary.js", "lib/companies.js",
        "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png"]


def slim() -> dict:
    g = json.loads(SRC.read_text(encoding="utf-8"))
    terms = [{"id": t["id"], "term": t["term"], "topic": t.get("topic", ""), "meaning": t["meaning"], "formula": t.get("formula", ""), "aliases": t.get("aliases", [])} for t in g["terms"]]
    return {"version": g["version"], "source": g.get("source", ""), "terms": terms}


def main() -> None:
    doc = slim()
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"glossary: {len(doc['terms'])} terms, version {doc['version']}, {OUT.stat().st_size // 1024} KB")
    if "--zip" in sys.argv:
        ver = json.loads((HERE / "manifest.json").read_text())["version"]
        dist = HERE / "dist"
        dist.mkdir(exist_ok=True)
        z = dist / f"finlit-extension-{ver}.zip"
        with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as f:
            for rel in SHIP:
                f.write(HERE / rel, rel)
        print(f"packed {z.name}: {z.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
