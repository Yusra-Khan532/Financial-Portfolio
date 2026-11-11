"""Stress Lab on the site (docs/STRESS.md): the page payload, the plan rules and the API over finlit_technicals/stress.py. Information only, never advice."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

_ENGINE = None


def engine() -> ModuleType:
    """finlit_technicals/stress.py is plain Python; it is loaded by path because importing the package would pull in numpy and pandas, which the website process never loads."""
    global _ENGINE
    if _ENGINE is None:
        path = Path(__file__).resolve().parents[2] / "finlit_technicals" / "stress.py"
        spec = importlib.util.spec_from_file_location("finlit_stress_engine", path)
        mod = importlib.util.module_from_spec(spec)         # type: ignore[arg-type]
        sys.modules[spec.name] = mod                         # type: ignore[union-attr]  (dataclasses look the module up by name)
        spec.loader.exec_module(mod)                         # type: ignore[union-attr]
        _ENGINE = mod
    return _ENGINE
