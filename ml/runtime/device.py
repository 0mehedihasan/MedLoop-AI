"""Device resolution: report what the forward pass will actually use.

``ResolvedDevice.actual`` — never the requested value — is what gets persisted on the prediction
row, the job row and the log line. A run that fell back to CPU while the UI says "MPS" makes every
timing and reproducibility claim wrong (CLAUDE.md §2.3, §2.8).

torch is imported lazily inside :func:`_probe_torch`, so this module — and therefore the whole
``ml`` package — imports cleanly on a machine without torch.

=============  ==============  ============  =========================================
Requested      MPS available   ``actual``    Behaviour
=============  ==============  ============  =========================================
``AUTO``       yes             ``mps``       selected
``AUTO``       no              ``cpu``       fallback; ``reason`` names the cause
``MPS``        yes             ``mps``       selected
``MPS``        no              —             raises :class:`DeviceUnavailableError`
``CPU``        —               ``cpu``       selected
=============  ==============  ============  =========================================

The fourth row is a deliberate divergence from the table in ``.claude/skills/medloop-ml.md``,
which downgrades an explicit ``MPS`` request to CPU and surfaces ``fallback_reason``. Both rules
exist to stop a *silent* downgrade; this one refuses rather than reports, because an explicit
device request is a statement about the experiment, not a preference. The payload the skill's
version would have returned is attached to the exception as ``details["resolved"]``, so a caller
that prefers downgrade-and-surface can catch the error and read it without re-probing.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any

from ml.errors import DeviceUnavailableError

logger = logging.getLogger(__name__)

__all__ = ["DeviceKind", "ResolvedDevice", "describe_runtime", "resolve_device"]


class DeviceKind(str, Enum):
    """Requested device. Values are byte-identical to ``TrainingDevice`` (CLAUDE.md §4)."""

    AUTO = "AUTO"
    MPS = "MPS"
    CPU = "CPU"

@dataclass(frozen=True)
class ResolvedDevice:
    """What a forward pass would actually run on, and why.

    Attributes:
        requested: What the caller asked for.
        actual: ``"mps"`` or ``"cpu"`` — the torch device string a forward pass would use.
        mps_available: Result of the MPS probe.
        torch_available: ``False`` when torch is not installed at all.
        reason: Human-readable cause, always populated.
    """

    requested: DeviceKind
    actual: str
    mps_available: bool
    torch_available: bool
    reason: str

    @property
    def fallback_reason(self) -> str | None:
        """``"MPS_UNAVAILABLE"`` when a non-CPU request ended up on CPU, else ``None``.

        The coarse token from ``.claude/skills/medloop-ml.md``; :attr:`reason` carries the
        specific cause (torch missing, backend not built, probe raised).
        """
        if self.requested is not DeviceKind.CPU and self.actual == "cpu":
            return "MPS_UNAVAILABLE"
        return None

    def to_dict(self) -> dict[str, Any]:
        """Return the payload persisted on job, prediction and evaluation rows."""
        return {
            "requested": self.requested.value,
            "actual": self.actual,
            "mps_available": self.mps_available,
            "torch_available": self.torch_available,
            "reason": self.reason,
            "fallback_reason": self.fallback_reason,
        }


def _numpy_version() -> str | None:
    """Return the installed numpy version, or ``None`` when numpy is missing."""
    try:
        import numpy
    except ImportError:
        return None
    return str(numpy.__version__)

def _probe_torch() -> tuple[bool, str | None, bool, str]:
    """Probe the local torch installation without importing torch at module scope.

    Returns:
        ``(torch_available, torch_version, mps_available, note)``. ``note`` describes what the
        probe actually found, including the exception text when the MPS probe itself failed.
    """
    try:
        # Lazy on purpose: ``ml`` must import on a machine without torch (module docstring).
        import torch
    except ImportError as exc:
        return False, None, False, f"torch is not installed ({exc})"
    version = str(getattr(torch, "__version__", "unknown"))
    try:
        available = bool(torch.backends.mps.is_available())
        built = bool(torch.backends.mps.is_built())
    except Exception as exc:  # a hardware probe must never take the caller down
        return True, version, False, f"torch {version}; MPS probe raised {type(exc).__name__}: {exc}"
    if available:
        return True, version, True, f"torch {version}; MPS backend available"
    detail = (
        "MPS backend is built but unavailable on this machine"
        if built
        else "this torch build has no MPS backend"
    )
    return True, version, False, f"torch {version}; {detail}"


def resolve_device(requested: DeviceKind = DeviceKind.AUTO) -> ResolvedDevice:
    """Resolve a requested device into the one a forward pass would actually use.

    Args:
        requested: A :class:`DeviceKind` or its string value (``"AUTO"``, ``"MPS"``, ``"CPU"``),
            as read from ``system_settings.training_device``.

    Returns:
        A :class:`ResolvedDevice` whose ``actual`` is ``"mps"`` or ``"cpu"``.

    Raises:
        ValueError: If ``requested`` is not a member of :class:`DeviceKind`.
        DeviceUnavailableError: If ``MPS`` was requested explicitly and is unavailable. The
            ``ResolvedDevice`` that a downgrade would have produced is in
            ``details["resolved"]``.
    """
    kind = DeviceKind(requested)
    torch_available, _, mps_available, note = _probe_torch()
    if kind is DeviceKind.CPU:
        return ResolvedDevice(
            kind, "cpu", mps_available, torch_available, f"cpu requested explicitly; {note}"
        )
    if mps_available:
        return ResolvedDevice(
            kind, "mps", True, torch_available, f"{kind.value} resolved to mps; {note}"
        )
    resolved = ResolvedDevice(kind, "cpu", False, torch_available, f"{note}; falling back to cpu")
    if kind is DeviceKind.MPS:
        logger.warning("explicit MPS request refused: %s", resolved.reason)
        raise DeviceUnavailableError(
            f"MPS was requested explicitly but is unavailable: {note}",
            details={"resolved": resolved.to_dict()},
        )
    logger.info("AUTO resolved to cpu: %s", resolved.reason)
    return resolved

def describe_runtime(requested: DeviceKind = DeviceKind.AUTO) -> dict[str, Any]:
    """Describe the ML runtime for the ``GET /health`` ``ml_engine`` probe.

    Never raises: an explicit ``MPS`` request that cannot be honoured is reported as a reason
    string with ``device = None``, because a health probe has to answer.

    Args:
        requested: The configured device, so the probe reports the configuration *and* what a
            forward pass would actually get.

    Returns:
        ``torch_available``, ``torch_version`` (``None`` when torch is absent), ``mps_available``,
        ``requested``, ``device`` (``None`` when the request cannot be honoured), ``reason`` and
        ``numpy_version``. The backend maps this onto ``ServiceState`` (CLAUDE.md §4). Nothing
        about *model* availability is claimed here — that is the model registry's answer.
    """
    torch_available, torch_version, mps_available, note = _probe_torch()
    payload: dict[str, Any] = {
        "torch_available": torch_available,
        "torch_version": torch_version,
        "mps_available": mps_available,
        "requested": DeviceKind(requested).value,
        "numpy_version": _numpy_version(),
    }
    try:
        resolved = resolve_device(requested)
    except DeviceUnavailableError as exc:
        payload.update({"device": None, "reason": exc.message})
        return payload
    payload.update({"device": resolved.actual, "reason": resolved.reason})
    return payload
