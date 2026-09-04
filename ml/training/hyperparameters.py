"""Typed hyperparameter container for a training run.

Every field is a *configuration default*, not a measured value: nothing has been trained
(CLAUDE.md §15). Defaults mirror ``docs/ml_pipeline.md`` and the ``system_settings`` defaults in
CLAUDE.md §8.1 (``batch_size = 32``, ``max_epochs = 30``, ``early_stopping = true``); the worker
overrides them from the settings service, never from a literal in code (CLAUDE.md §2.6, §11.3).

Memory footprint estimate — EfficientNet-B0, 224 px, batch 32, 16 GB unified memory
(CLAUDE.md §2.8, ``docs/ml_pipeline.md``; published/derived figures, **not measured on this
machine**):

======================================  ================  ==================================
Item                                    Estimate          Note
======================================  ================  ==================================
Parameters (B0, ImageNet-1k)            ~5.3 M            ~21 MB at fp32
AdamW state (2 moments) + grads         ~65 MB            3 x parameter bytes
Activations, batch 32 @ 224^2           ~1.5-2.5 GB       scales ~linearly with batch size
Decoded input batch (32x3x224x224)      ~19 MB            fp32, before augmentation copies
Practical ceiling on a 16 GB machine    ~4-5 GB           unified memory is shared with the OS,
                                                          the browser and Postgres
======================================  ================  ==================================

Fallback ladder when a run runs out of memory, in order: ``batch_size`` 32 -> 16 -> 8 (with
gradient accumulation to hold the effective batch size), then ``freeze_backbone_epochs`` > 0 to
cut the backward pass, then ``device = CPU`` as the last resort. ``image_size`` stays 224 because
it defines the input contract shared by training and inference; changing it invalidates every
comparison across model versions (CLAUDE.md §2.5).
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, fields
from typing import Any, Mapping

__all__ = [
    "CLASS_WEIGHTINGS",
    "Hyperparameters",
    "SUPPORTED_ARCHITECTURES",
    "SUPPORTED_OPTIMIZERS",
    "SUPPORTED_SCHEDULERS",
]

SUPPORTED_OPTIMIZERS: tuple[str, ...] = ("adamw", "sgd")
SUPPORTED_SCHEDULERS: tuple[str, ...] = ("cosine", "step", "none")
CLASS_WEIGHTINGS: tuple[str, ...] = ("none", "inverse_frequency")
# Declared here, next to the field that validates against it, and re-exported by
# ``ml.classification.factory`` so the registry has exactly one definition (CLAUDE.md §11.4).
SUPPORTED_ARCHITECTURES: tuple[str, ...] = ("efficientnet_b0", "resnet18")


def _positive(name: str, value: float) -> None:
    """Raise ``ValueError`` unless ``value`` is finite and strictly positive."""
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number, got {value!r}")
    if value <= 0:
        raise ValueError(f"{name} must be > 0, got {value!r}")


def _in_range(name: str, value: float, low: float, high: float) -> None:
    """Raise ``ValueError`` unless ``low <= value <= high`` and the value is finite."""
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number, got {value!r}")
    if not low <= value <= high:
        raise ValueError(f"{name} must be within [{low}, {high}], got {value!r}")


@dataclass(frozen=True)
class Hyperparameters:
    """Everything that defines a training configuration, persisted on the ``models`` row.

    The seed is *not* here: it belongs to :class:`ml.types.TrainingRequest` because it also
    governs the split and the loader order, not just optimisation.
    """

    architecture: str = "efficientnet_b0"
    image_size: int = 224
    batch_size: int = 32
    max_epochs: int = 30
    learning_rate: float = 3e-4
    weight_decay: float = 1e-4
    optimizer: str = "adamw"
    scheduler: str = "cosine"
    early_stopping: bool = True
    early_stopping_patience: int = 5
    label_smoothing: float = 0.0
    freeze_backbone_epochs: int = 0
    class_weighting: str = "none"

    def __post_init__(self) -> None:
        if self.architecture not in SUPPORTED_ARCHITECTURES:
            raise ValueError(
                f"architecture must be one of {SUPPORTED_ARCHITECTURES}, got {self.architecture!r}"
            )
        if not isinstance(self.image_size, int) or isinstance(self.image_size, bool):
            raise ValueError(f"image_size must be an int, got {self.image_size!r}")
        _in_range("image_size", self.image_size, 32, 1024)
        if self.image_size % 32 != 0:
            raise ValueError(f"image_size must be a multiple of 32, got {self.image_size}")
        for name in ("batch_size", "max_epochs", "early_stopping_patience", "freeze_backbone_epochs"):
            value = getattr(self, name)
            if not isinstance(value, int) or isinstance(value, bool):
                raise ValueError(f"{name} must be an int, got {value!r}")
        _in_range("batch_size", self.batch_size, 1, 512)
        _in_range("max_epochs", self.max_epochs, 1, 1000)
        _in_range("early_stopping_patience", self.early_stopping_patience, 1, 1000)
        _in_range("freeze_backbone_epochs", self.freeze_backbone_epochs, 0, self.max_epochs)
        _positive("learning_rate", self.learning_rate)
        _in_range("learning_rate", self.learning_rate, 1e-8, 1.0)
        _in_range("weight_decay", self.weight_decay, 0.0, 1.0)
        _in_range("label_smoothing", self.label_smoothing, 0.0, 0.5)
        if self.optimizer not in SUPPORTED_OPTIMIZERS:
            raise ValueError(f"optimizer must be one of {SUPPORTED_OPTIMIZERS}, got {self.optimizer!r}")
        if self.scheduler not in SUPPORTED_SCHEDULERS:
            raise ValueError(f"scheduler must be one of {SUPPORTED_SCHEDULERS}, got {self.scheduler!r}")
        if self.class_weighting not in CLASS_WEIGHTINGS:
            raise ValueError(
                f"class_weighting must be one of {CLASS_WEIGHTINGS}, got {self.class_weighting!r}"
            )
        if not isinstance(self.early_stopping, bool):
            raise ValueError(f"early_stopping must be a bool, got {self.early_stopping!r}")

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serialisable copy for ``models.hyperparameters``.

        Returns:
            One key per field, in declaration order.
        """
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> "Hyperparameters":
        """Rebuild from a persisted mapping.

        Args:
            data: Mapping produced by :meth:`to_dict`, or a subset of it. Missing keys take the
                declared default.

        Returns:
            A validated :class:`Hyperparameters`.

        Raises:
            ValueError: If ``data`` contains an unknown key or an invalid value. Unknown keys are
                rejected rather than ignored: a typo in a persisted config must not silently
                train with a default.
        """
        known = {field.name for field in fields(cls)}
        unknown = sorted(set(data) - known)
        if unknown:
            raise ValueError(f"unknown hyperparameter keys: {unknown}")
        return cls(**{key: value for key, value in data.items()})  # type: ignore[arg-type]
