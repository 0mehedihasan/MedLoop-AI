"""Error types owned by the ML layer.

``ml/`` never imports ``backend/app/**`` (CLAUDE.md §3.1), so it cannot raise the backend's
``MedLoopError`` family. It raises the types below and the backend's single exception handler in
``main.py`` translates them with the ``code`` / ``http_status`` class attributes, which mirror the
error table in ``docs/api_contract.md``.

Mapping of record:

===============================  ==========================  ====
Exception                        ``code``                    HTTP
===============================  ==========================  ====
``MLError``                      ``INTERNAL_ERROR``          500
``DatasetNotAvailableError``     ``DATASET_NOT_AVAILABLE``   501
``ModelUnavailableError``        ``MODEL_UNAVAILABLE``       409
``DeviceUnavailableError``       ``CONFLICT``                409
``InvalidGeometryError``         ``VALIDATION_ERROR``        422
===============================  ==========================  ====

``DeviceUnavailableError`` carries no device-specific code because ``docs/api_contract.md``
declares none; it borrows ``CONFLICT``. Adding a ``DEVICE_UNAVAILABLE`` code means editing that
document first, in the same commit as the code (CLAUDE.md §0 step 6).
"""

from __future__ import annotations

from typing import Any, Mapping

__all__ = [
    "MLError",
    "DatasetNotAvailableError",
    "ModelUnavailableError",
    "DeviceUnavailableError",
    "InvalidGeometryError",
]


class MLError(Exception):
    """Base for everything ``ml/`` raises.

    Args:
        message: Human-readable description; goes into ``error.message`` verbatim.
        details: Optional structured context; goes into ``error.details``. Never put secrets,
            absolute storage paths of medical images, or patient identifiers in here.

    Attributes:
        code: API error code from ``docs/api_contract.md``.
        http_status: The status the backend handler answers with.
    """

    code: str = "INTERNAL_ERROR"
    http_status: int = 500

    def __init__(self, message: str, *, details: Mapping[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details: dict[str, Any] = dict(details) if details is not None else {}

    def to_dict(self) -> dict[str, Any]:
        """Return the payload for the API error envelope.

        Returns:
            ``{"code": ..., "message": ..., "details": {...}}`` — the shape of the ``error``
            object in ``docs/api_contract.md``.
        """
        return {"code": self.code, "message": self.message, "details": dict(self.details)}

    def __repr__(self) -> str:
        return f"{type(self).__name__}(code={self.code!r}, message={self.message!r})"


class DatasetNotAvailableError(MLError):
    """A dataset-dependent capability is deliberately unimplemented (CLAUDE.md §2.2).

    Raised instead of returning zeros, random values or a stub loss curve. Every message names
    the ``TASKS.md`` phase that unblocks the capability and the file to edit.
    """

    code = "DATASET_NOT_AVAILABLE"
    http_status = 501


class ModelUnavailableError(MLError):
    """No usable trained artefact exists, so inference / XAI cannot run (CLAUDE.md §2.3).

    A randomly initialised network still produces a confident-looking softmax and a smooth
    heat-map; refusing is the only honest answer while no weights exist.
    """

    code = "MODEL_UNAVAILABLE"
    http_status = 409


class DeviceUnavailableError(MLError):
    """An explicitly requested compute device cannot be provided.

    Raised only for an *explicit* request (``DeviceKind.MPS`` on a machine without a working MPS
    backend). ``DeviceKind.AUTO`` falls back to CPU instead and reports the fallback, because
    that is what AUTO means. ``details`` carries the ``ResolvedDevice`` payload the caller would
    have got, so a UI that prefers to surface a downgrade rather than fail can do so without
    re-probing.
    """

    code = "CONFLICT"
    http_status = 409


class InvalidGeometryError(MLError):
    """Normalised geometry violated the coordinate convention in CLAUDE.md §4.3.

    Covers out-of-range coordinates, non-finite values, degenerate extents, polygons with fewer
    than three points, an out-of-range corner radius, and undefined IoU (zero-area operand).
    """

    code = "VALIDATION_ERROR"
    http_status = 422
