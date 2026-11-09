"""The browser extension package (extension/): a minimal manifest, the glossary in step with the site, and the privacy rules written into the code."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXT = ROOT / "extension"
SITE_GLOSSARY = ROOT / "frontend" / "src" / "content" / "glossary.json"


def manifest():
    return json.loads((EXT / "manifest.json").read_text())


def test_manifest_asks_for_the_least_it_needs():
    m = manifest()
    assert m["manifest_version"] == 3
    assert sorted(m["permissions"]) == ["activeTab", "contextMenus", "storage"]
    assert m["host_permissions"] == ["https://finlitventures.com/*"]
    assert len(m["content_scripts"]) == 1 and m["content_scripts"][0]["js"] == ["content.js"] and m["content_scripts"][0]["all_frames"] is False
    assert "web_accessible_resources" not in m and "externally_connectable" not in m       # pages cannot reach into the extension
    assert "unsafe" not in json.dumps(m.get("content_security_policy", {}))
    for size, rel in m["icons"].items():
        assert (EXT / rel).is_file() and int(size) in (16, 32, 48, 128)
    for rel in ("background.js", "popup.html", "popup.js", "popup.css", "data/glossary.json", "lib/text.js", "lib/glossary.js", "lib/companies.js", "lib/format.js"):
        assert (EXT / rel).is_file(), rel


def test_the_extension_glossary_is_the_site_glossary():
    site, ext = json.loads(SITE_GLOSSARY.read_text()), json.loads((EXT / "data" / "glossary.json").read_text())
    assert ext["version"] == site["version"], "run: python extension/build.py"
    assert [t["id"] for t in ext["terms"]] == [t["id"] for t in site["terms"]], "run: python extension/build.py"
    assert all(e["meaning"] == s["meaning"] and e["term"] == s["term"] for e, s in zip(ext["terms"], site["terms"])), "run: python extension/build.py"


def test_the_page_script_reads_only_the_selection_and_never_uses_the_network_or_html_injection():
    js = (EXT / "content.js").read_text()
    for banned in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "document.body.innerText",
                   "document.body.textContent", "document.documentElement.innerText", "querySelectorAll", "document.cookie", "localStorage", "navigator.clipboard"):
        assert banned not in js, banned
    assert "getSelection" in js and "textContent" in js


def test_background_sends_only_a_symbol_and_the_public_list_and_uses_no_remote_code():
    js = "\n".join(re.sub(r"(^|\s)//.*$", "", ln) for ln in (EXT / "background.js").read_text().splitlines())   # code only, not comments
    assert "eval(" not in js and "importScripts" not in js and not re.search(r"import\(\s*['\"]https?:", js)
    urls = set(re.findall(r"/api/[A-Za-z0-9/_\-]+", js))
    assert urls == {"/api/stocks/search-index", "/api/ext/company/"}, urls
    assert 'credentials: "omit"' in js                      # the public list is fetched without the session cookie
    assert "text" not in re.search(r"company/\$\{[^}]*\}", js).group(0)   # the selected words are not part of the company request
