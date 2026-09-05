"""Pytest configuration for the MedLoop AI backend.

The most important thing this file does is a side effect of existing. Pytest imports every
`conftest.py` with the same `prepend` import mode it uses for test modules, which puts the directory
holding it — `backend/` — on `sys.path`. Without that, `from app.core.enums import Role` fails inside
`tests/`, because the path pytest would otherwise insert is `backend/tests`, and `app` does not live
there.

Done this way rather than with `[tool.pytest.ini_options] pythonpath = ["."]` because it works on
every pytest version and does not require a `pyproject.toml` to exist yet — the dependency policy in
CLAUDE.md §11.5 is that a file earns its place, and a packaging manifest has not yet earned one.

The fixtures below hand out paths instead of letting each test recompute `parent.parent`, which is
the kind of expression that silently points at the wrong directory after a file moves.
"""

from __future__ import annotations

from pathlib import Path

import pytest

#: `backend/`. Module-level so `sys.path` reasoning above is checkable by reading, not by running.
BACKEND_ROOT = Path(__file__).resolve().parent

#: The repository root — the only place from which `frontend/` and `docs/` are reachable.
REPO_ROOT = BACKEND_ROOT.parent


@pytest.fixture(scope="session")
def repo_root() -> Path:
    """The repository root, for the tests that read a file outside `backend/`."""
    return REPO_ROOT


@pytest.fixture(scope="session")
def enums_py_source() -> str:
    """`backend/app/core/enums.py` as text.

    Read rather than imported on purpose: the parity check has to compare what the *file says* with
    what `domain.ts` says. A member added to the class object at runtime — by a decorator, a mixin,
    or `Enum` machinery — would satisfy an import-based check while leaving the two source files in
    disagreement, and the source files are what a reader trusts.
    """
    return (BACKEND_ROOT / "app" / "core" / "enums.py").read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def domain_ts_source() -> str:
    """`frontend/types/domain.ts` as text. There is no TypeScript runtime here, so text it is."""
    return (REPO_ROOT / "frontend" / "types" / "domain.ts").read_text(encoding="utf-8")
