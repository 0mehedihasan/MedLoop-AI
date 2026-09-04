"""Determinism helpers.

The seed is a hyperparameter: it is recorded in ``TrainingResult``, persisted on the model row and
printed in the job log. A run you cannot re-seed is not an experiment
(``.claude/skills/medloop-ml.md``).

What is deliberately *not* claimed: bit-wise reproducibility. MPS kernels are not guaranteed
identical across devices or torch versions, so the honest artefact is the recorded procedure —
seed, torch version, resolved device — not a promise of identical floats
(``docs/ml_pipeline.md``).

torch is imported lazily inside :func:`_import_torch`, so seeding works, and reports what it could
not do, on a machine without torch.
"""

from __future__ import annotations

import logging
import os
import random
from typing import Any

logger = logging.getLogger(__name__)

__all__ = ["MAX_SEED", "WORKER_SEED_STRIDE", "derive_worker_seed", "seed_everything"]

MAX_SEED = 2**32 - 1
"""Largest accepted seed; the numpy legacy generator rejects anything wider."""

WORKER_SEED_STRIDE = 2654435761
"""Knuth's 32-bit multiplicative constant, used to spread per-worker seeds deterministically."""


def _validate_seed(seed: int) -> int:
    """Return ``seed`` after checking it is an ``int`` within ``[0, MAX_SEED]``.

    Raises:
        ValueError: If it is a ``bool``, not an ``int``, or out of range.
    """
    if not isinstance(seed, int) or isinstance(seed, bool):
        raise ValueError(f"seed must be an int, got {seed!r}")
    if not 0 <= seed <= MAX_SEED:
        raise ValueError(f"seed must be within [0, {MAX_SEED}], got {seed}")
    return seed

def _import_torch() -> Any | None:
    """Return the torch module, or ``None`` when torch is not installed.

    Lazy on purpose: importing torch at module scope would make the whole ``ml`` package
    un-importable on a machine without it.
    """
    try:
        import torch
    except ImportError:
        return None
    return torch


def _seed_numpy(seed: int, record: dict[str, Any], notes: list[str]) -> None:
    """Seed numpy's legacy global generator, recording the outcome in ``record``/``notes``."""
    try:
        import numpy
    except ImportError:
        notes.append("numpy is not installed; its global generator was not seeded")
        return
    numpy.random.seed(seed)
    record["numpy"] = True
    notes.append(
        "numpy legacy global generator seeded; pass an explicit numpy Generator where a "
        "component's determinism must not depend on global state"
    )

def _seed_torch(torch: Any, seed: int, record: dict[str, Any], notes: list[str]) -> None:
    """Seed torch's CPU and MPS generators and request deterministic kernels.

    Every probe is guarded: a torch build without ``torch.mps`` or without
    ``use_deterministic_algorithms`` must degrade to a recorded ``False``, not an exception in the
    middle of a training job.
    """
    torch.manual_seed(seed)
    record["torch"] = True
    mps = getattr(torch, "mps", None)
    if mps is None or not hasattr(mps, "manual_seed"):
        notes.append("this torch build exposes no torch.mps.manual_seed")
    else:
        try:
            mps.manual_seed(seed)
            record["torch_mps"] = True
        except Exception as exc:  # a seeding probe must not take the run down
            notes.append(f"torch.mps.manual_seed raised {type(exc).__name__}: {exc}")
    try:
        torch.use_deterministic_algorithms(True, warn_only=True)
    except Exception as exc:
        record["deterministic_algorithms"] = False
        notes.append(f"use_deterministic_algorithms unavailable: {type(exc).__name__}: {exc}")
    else:
        record["deterministic_algorithms"] = True
        notes.append(
            "deterministic algorithms requested with warn_only=True: an op without a "
            "deterministic implementation warns instead of aborting the run"
        )

def seed_everything(seed: int) -> dict[str, Any]:
    """Seed every random source that is actually present, and report what was seeded.

    Args:
        seed: Run seed within ``[0, MAX_SEED]``, taken from
            ``Hyperparameters.seed``.

    Returns:
        A record for the job log and ``TrainingResult.seeding``: ``seed``, ``python_random``,
        ``numpy``, ``torch``, ``torch_mps``, ``deterministic_algorithms`` (``None`` when torch is
        absent), ``pythonhashseed`` and ``notes``. A ``False`` or ``None`` entry means *not done*
        and always has a matching line in ``notes`` — the caller can therefore state what
        determinism it does and does not have, instead of assuming full coverage.

    Raises:
        ValueError: If ``seed`` is not an ``int`` within ``[0, MAX_SEED]``.
    """
    value = _validate_seed(seed)
    notes: list[str] = []
    record: dict[str, Any] = {
        "seed": value,
        "python_random": False,
        "numpy": False,
        "torch": False,
        "torch_mps": False,
        "deterministic_algorithms": None,
        "pythonhashseed": str(value),
        "notes": notes,
    }
    os.environ["PYTHONHASHSEED"] = str(value)
    notes.append(
        "PYTHONHASHSEED affects child processes only; this interpreter's hash seed was fixed "
        "before import and cannot be changed now"
    )
    random.seed(value)
    record["python_random"] = True
    _seed_numpy(value, record, notes)
    torch = _import_torch()
    if torch is None:
        notes.append("torch is not installed; no tensor generator was seeded")
    else:
        _seed_torch(torch, value, record, notes)
    logger.info(
        "seeded run: seed=%s numpy=%s torch=%s mps=%s",
        value,
        record["numpy"],
        record["torch"],
        record["torch_mps"],
    )
    return record


def derive_worker_seed(seed: int, worker_id: int) -> int:
    """Derive a stable per-worker seed for a DataLoader ``worker_init_fn``.

    Args:
        seed: The run seed.
        worker_id: Zero-based worker index.

    Returns:
        ``(seed + worker_id * WORKER_SEED_STRIDE) % (MAX_SEED + 1)``. Distinct per worker so
        workers do not draw identical augmentations, and derived rather than drawn so the entire
        loader's randomness is describable from the one number recorded on the model row.

    Raises:
        ValueError: If ``seed`` is out of range, or ``worker_id`` is not a non-negative ``int``.
    """
    value = _validate_seed(seed)
    if not isinstance(worker_id, int) or isinstance(worker_id, bool) or worker_id < 0:
        raise ValueError(f"worker_id must be a non-negative int, got {worker_id!r}")
    return (value + worker_id * WORKER_SEED_STRIDE) % (MAX_SEED + 1)
