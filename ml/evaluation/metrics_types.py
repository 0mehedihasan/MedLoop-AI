"""Frozen metric payloads.

Declared once here and re-exported by ``ml.types`` so the backend, the worker and the metric
implementations share field names. Stdlib only: no numpy, no torch, no dataset assumption.

A metric that could not be computed is ``None`` (``auroc_macro``) or an absent payload
(``EvaluationResult.localization``) — never ``0.0`` (CLAUDE.md §2.3, ``docs/ml_pipeline.md``).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Mapping

__all__ = ["ClassificationMetrics", "LocalizationMetrics", "PerClassMetrics"]


def _rate(name: str, value: Any) -> float:
    """Validate ``value`` is a finite number within ``[0, 1]``.

    Args:
        name: Field name, used in the error message.
        value: Candidate value.

    Returns:
        ``value`` as a ``float``.

    Raises:
        ValueError: If it is not finite or falls outside ``[0, 1]``.
    """
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number, got {value!r}")
    if not 0.0 <= float(value) <= 1.0:
        raise ValueError(f"{name} must be within [0, 1], got {value!r}")
    return float(value)


def _count(name: str, value: Any) -> int:
    """Validate ``value`` is a non-negative ``int`` and return it.

    Raises:
        ValueError: If it is not an ``int``, or is negative.
    """
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"{name} must be a non-negative int, got {value!r}")
    return value

@dataclass(frozen=True)
class PerClassMetrics:
    """Precision, recall, F1 and support for one label code."""

    code: str
    precision: float
    recall: float
    f1: float
    support: int

    def __post_init__(self) -> None:
        if not isinstance(self.code, str) or self.code.strip() == "":
            raise ValueError(f"code must be a non-empty string, got {self.code!r}")
        for name in ("precision", "recall", "f1"):
            object.__setattr__(self, name, _rate(name, getattr(self, name)))
        object.__setattr__(self, "support", _count("support", self.support))

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serialisable copy."""
        return {
            "code": self.code,
            "precision": self.precision,
            "recall": self.recall,
            "f1": self.f1,
            "support": self.support,
        }


@dataclass(frozen=True)
class ClassificationMetrics:
    """Classification metrics for one model version on one dataset version.

    ``auroc_macro`` is ``None`` when it was not computable — no probability vectors, or a class
    without both a positive and a negative example. Macro averages run over every code in
    ``label_codes``, including zero-support ones, so the denominator cannot change between model
    versions evaluated on the same locked test set (CLAUDE.md §2.5, §14).
    """

    accuracy: float
    macro_precision: float
    macro_recall: float
    macro_f1: float
    weighted_f1: float
    auroc_macro: float | None
    per_class: Mapping[str, PerClassMetrics]
    confusion_matrix: tuple[tuple[int, ...], ...]
    label_codes: tuple[str, ...]
    support: int
    def __post_init__(self) -> None:
        for name in ("accuracy", "macro_precision", "macro_recall", "macro_f1", "weighted_f1"):
            object.__setattr__(self, name, _rate(name, getattr(self, name)))
        if self.auroc_macro is not None:
            object.__setattr__(self, "auroc_macro", _rate("auroc_macro", self.auroc_macro))
        object.__setattr__(self, "label_codes", tuple(self.label_codes))
        object.__setattr__(self, "support", _count("support", self.support))
        if not self.label_codes or len(set(self.label_codes)) != len(self.label_codes):
            raise ValueError(f"label_codes must be non-empty and unique, got {self.label_codes}")
        per_class = dict(self.per_class)
        if set(per_class) != set(self.label_codes):
            raise ValueError(
                f"per_class must cover exactly {list(self.label_codes)}, got {sorted(per_class)}"
            )
        if not all(isinstance(value, PerClassMetrics) for value in per_class.values()):
            raise ValueError("per_class values must be PerClassMetrics instances")
        object.__setattr__(self, "per_class", MappingProxyType(per_class))
        matrix = tuple(
            tuple(_count("confusion_matrix cell", cell) for cell in row)
            for row in self.confusion_matrix
        )
        size = len(self.label_codes)
        if len(matrix) != size or any(len(row) != size for row in matrix):
            raise ValueError(f"confusion_matrix must be {size}x{size}, got {len(matrix)} rows")
        total = sum(sum(row) for row in matrix)
        if total != self.support:
            raise ValueError(f"confusion_matrix totals {total} but support is {self.support}")
        object.__setattr__(self, "confusion_matrix", matrix)

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serialisable copy for ``model_evaluations.metrics``.

        Returns:
            Every computed metric, with ``auroc_macro`` left as ``None`` when it was not
            computable. Values are never rounded here; formatting is the frontend's job.
        """
        return {
            "accuracy": self.accuracy,
            "macro_precision": self.macro_precision,
            "macro_recall": self.macro_recall,
            "macro_f1": self.macro_f1,
            "weighted_f1": self.weighted_f1,
            "auroc_macro": self.auroc_macro,
            "per_class": {code: metrics.to_dict() for code, metrics in self.per_class.items()},
            "confusion_matrix": [list(row) for row in self.confusion_matrix],
            "label_codes": list(self.label_codes),
            "support": self.support,
        }

@dataclass(frozen=True)
class LocalizationMetrics:
    """IoU-based localisation metrics.

    ``iou_threshold`` travels with ``localization_accuracy`` because a fraction-above-a-cut-off is
    uninterpretable without the cut-off (CLAUDE.md §2.3).
    """

    mean_iou: float
    median_iou: float
    localization_accuracy: float
    iou_threshold: float
    support: int

    def __post_init__(self) -> None:
        for name in ("mean_iou", "median_iou", "localization_accuracy", "iou_threshold"):
            object.__setattr__(self, name, _rate(name, getattr(self, name)))
        object.__setattr__(self, "support", _count("support", self.support))
        if self.support == 0:
            raise ValueError("support must be > 0; an empty evaluation has no metrics to report")

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serialisable copy, threshold included."""
        return {
            "mean_iou": self.mean_iou,
            "median_iou": self.median_iou,
            "localization_accuracy": self.localization_accuracy,
            "iou_threshold": self.iou_threshold,
            "support": self.support,
        }
