"""NSE's archive refused this server for 4 days of files (sector job, 22 Nov 2026), after five waits of up to 3 minutes each. The jobs already hold
FinLit's relay (deploy/amfi-relay, GET /fetch for *.nseindia.com): a refused NSE request now goes through it at once, for the rest of the run."""
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlsplit

import pytest

from finlit_technicals import fetch as F

ARCH = "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_20261120_F_0000.csv.zip"


@pytest.fixture
def relay(monkeypatch):
    """A local stand-in for the Worker: /fetch?u=... answers 200 'zipdata' for NSE addresses, a relay error for anything else."""
    seen = []

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            q = parse_qs(urlsplit(self.path).query)
            u = q.get("u", [""])[0]
            seen.append((u, self.headers.get("X-Relay-Key"), self.headers.get("X-Fwd-Referer")))
            if self.headers.get("X-Relay-Key") != "k":
                self.send_response(403); self.send_header("X-Relay-Error", "bad key"); self.end_headers(); return
            if "missing" in u:
                self.send_response(404); self.end_headers(); return            # NSE's own 404 (no file that day), passed through
            if "nseindia.com" not in u:
                self.send_response(404); self.send_header("X-Relay-Error", "host not allowed"); self.end_headers(); return
            self.send_response(200); self.end_headers(); self.wfile.write(b"zipdata")

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    monkeypatch.setenv("AMFI_RELAY_URL", f"http://127.0.0.1:{srv.server_port}")
    monkeypatch.setenv("AMFI_RELAY_KEY", "k")
    monkeypatch.delenv("EXCHANGE_RELAY_URL", raising=False)
    monkeypatch.delenv("EXCHANGE_RELAY_KEY", raising=False)
    monkeypatch.setattr(F.time, "sleep", lambda s: None)
    monkeypatch.setattr(F, "log", lambda *a, **k: None)
    yield seen
    srv.shutdown()


def refusing(monkeypatch, f):
    direct = []
    def _urllib(url, referer):
        direct.append(url)
        return 403, b""
    monkeypatch.setattr(f, "_urllib", _urllib)
    return direct


def test_a_refused_nse_file_comes_through_the_relay_at_once_and_the_rest_of_the_run_follows(monkeypatch, relay):
    f = F.Fetcher(delay=0)
    direct = refusing(monkeypatch, f)
    assert f.get(ARCH) == (200, b"zipdata")
    assert direct == [ARCH]                                                   # one refused direct try, then the relay, with no wait in between
    assert f.get(ARCH.replace("20261120", "20261119")) == (200, b"zipdata")
    assert direct == [ARCH]                                                   # later NSE files go straight through the relay
    assert [u for u, k, _ in relay] == [ARCH, ARCH.replace("20261120", "20261119")] and all(k == "k" for _, k, _ in relay)


def test_nse_s_own_404_still_means_no_file_that_day_but_a_relay_refusal_does_not(monkeypatch, relay):
    f = F.Fetcher(delay=0)
    refusing(monkeypatch, f)
    assert f.get(ARCH.replace("BhavCopy", "missing")) == (404, b"")          # a holiday: no file, as before
    code, body = f._relay("https://www.amfiindia.com/x", "https://www.nseindia.com/")
    assert code == -1 and b"host not allowed" in body                        # never read as "no file"


def test_other_sites_are_never_sent_to_the_relay(monkeypatch, relay):
    f = F.Fetcher(delay=0)
    direct = refusing(monkeypatch, f)
    assert f.get("https://www.amfiindia.com/spages/x.xlsx")[0] == 403        # retried directly, as before
    assert relay == [] and len(direct) == 6


def test_without_the_relay_settings_nothing_changes(monkeypatch):
    for k in ("AMFI_RELAY_URL", "AMFI_RELAY_KEY", "EXCHANGE_RELAY_URL", "EXCHANGE_RELAY_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(F.time, "sleep", lambda s: None)
    monkeypatch.setattr(F, "log", lambda *a, **k: None)
    f = F.Fetcher(delay=0)
    direct = refusing(monkeypatch, f)
    assert f.get(ARCH)[0] == 403 and len(direct) == 6 and not f.via_relay
