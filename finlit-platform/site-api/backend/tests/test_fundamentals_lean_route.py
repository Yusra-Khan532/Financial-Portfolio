"""The Stress Lab asks the admin fundamentals route for the lean view (statements, ratios, quote, prices; no dashboard extras): the route takes `lean` and passes it on."""
import ast
from pathlib import Path

SRC = (Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8")


def _route():
    tree = ast.parse(SRC)
    return next(n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef) and n.name == "admin_stock_fundamentals")


def test_the_route_takes_lean_defaulting_to_the_full_dashboard_view():
    fn = _route()
    args = {a.arg: d for a, d in zip(fn.args.args[-len(fn.args.defaults):], fn.args.defaults)}
    assert "lean" in args and isinstance(args["lean"], ast.Constant) and args["lean"].value is False


def test_lean_is_handed_to_the_fetch_and_a_missing_lean_keeps_the_old_choice():
    body = ast.get_source_segment(SRC, _route())
    assert "_fetch_stock_fundamentals, query, statement_type, period, None, True if lean else None" in body
