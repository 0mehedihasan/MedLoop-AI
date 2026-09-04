"""Normalised geometry: the dataclasses of CLAUDE.md §4.3 plus the pure maths over them.

One module owns both the coordinate convention and the IoU definition, so the localisation
metric, the annotation validator and the AI box all agree by construction (CLAUDE.md §4.3,
§11.4). Everything here is stdlib + numpy: no torch, no dataset assumption, fully testable.

``ml.types`` re-exports :class:`NormalizedBox`, :class:`NormalizedPolygon` and
:class:`NormalizedRoundedBox` so callers keep one import surface for payloads; they are declared
here, beside the maths that consumes them.

Pixel-footprint convention for mask-derived boxes: pixel ``k`` of ``n`` covers
``[k / n, (k + 1) / n)``, so a single lit pixel in a 4x4 map becomes ``(0, 0, 0.25, 0.25)`` — a
region with real extent, never a zero-area box.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from ml.errors import InvalidGeometryError

__all__ = [
    "NormalizedBox",
    "NormalizedPolygon",
    "NormalizedRoundedBox",
    "UNIT_TOLERANCE",
    "boxes_from_mask",
    "clamp_box",
    "connected_components",
    "intersection_area",
    "iou",
    "mask_iou",
    "polygon_to_box",
    "rounded_box_to_box",
    "union_area",
]

UNIT_TOLERANCE = 1e-6
"""Slack allowed when checking unit-square containment of float coordinates."""


def _finite(value: Any) -> bool:
    """Return ``True`` when ``value`` is a real finite number (``bool`` excluded)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _check(condition: bool, message: str, **details: Any) -> None:
    """Raise :class:`~ml.errors.InvalidGeometryError` when ``condition`` is false."""
    if not condition:
        raise InvalidGeometryError(message, details=details or None)


@dataclass(frozen=True)
class NormalizedBox:
    """Axis-aligned box normalised to ``[0, 1]`` — CLAUDE.md §4.3 ``BOUNDING_BOX``."""

    x: float
    y: float
    w: float
    h: float

    def __post_init__(self) -> None:
        for name in ("x", "y", "w", "h"):
            value = getattr(self, name)
            _check(_finite(value), f"{name} must be a finite number, got {value!r}", field=name)
            object.__setattr__(self, name, float(value))
        _check(self.x >= 0.0 and self.y >= 0.0, f"origin must be >= 0, got ({self.x}, {self.y})")
        _check(self.w > 0.0 and self.h > 0.0, f"extent must be > 0, got ({self.w}, {self.h})")
        _check(self.right <= 1.0 + UNIT_TOLERANCE, f"x + w must be <= 1, got {self.right}")
        _check(self.bottom <= 1.0 + UNIT_TOLERANCE, f"y + h must be <= 1, got {self.bottom}")

    @property
    def right(self) -> float:
        """Right edge, ``x + w``."""
        return self.x + self.w

    @property
    def bottom(self) -> float:
        """Bottom edge, ``y + h``."""
        return self.y + self.h

    @property
    def area(self) -> float:
        """Normalised area ``w * h`` — the fraction of the image covered."""
        return self.w * self.h

    def as_tuple(self) -> tuple[float, float, float, float]:
        """Return ``(x, y, w, h)``."""
        return (self.x, self.y, self.w, self.h)

    def clamped(self) -> "NormalizedBox":
        """Return a copy clipped into the unit square.

        A validated box is already inside ``[0, 1]``; this matters for boxes derived by padding a
        hull, where the padding can leave the image.

        Returns:
            A box whose edges lie within ``[0, 1]``.

        Raises:
            InvalidGeometryError: If clipping would leave a zero-extent box.
        """
        x0 = min(max(self.x, 0.0), 1.0)
        y0 = min(max(self.y, 0.0), 1.0)
        x1 = min(max(self.right, 0.0), 1.0)
        y1 = min(max(self.bottom, 0.0), 1.0)
        _check(x1 > x0 and y1 > y0, "clamping left a zero-area box", box=self.as_tuple())
        return NormalizedBox(x0, y0, x1 - x0, y1 - y0)


@dataclass(frozen=True)
class NormalizedPolygon:
    """Implicitly closed polygon of >= 3 normalised points — §4.3 ``POLYGON``."""

    points: tuple[tuple[float, float], ...]

    def __post_init__(self) -> None:
        try:
            points = tuple((float(px), float(py)) for px, py in self.points)
        except (TypeError, ValueError) as exc:
            raise InvalidGeometryError(f"points must be (x, y) number pairs: {exc}") from exc
        _check(len(points) >= 3, f"a polygon needs >= 3 points, got {len(points)}")
        for px, py in points:
            _check(_finite(px) and _finite(py), f"point ({px}, {py}) must be finite")
            _check(
                -UNIT_TOLERANCE <= px <= 1.0 + UNIT_TOLERANCE
                and -UNIT_TOLERANCE <= py <= 1.0 + UNIT_TOLERANCE,
                f"point ({px}, {py}) is outside [0, 1]",
            )
        object.__setattr__(self, "points", points)

    def bounding_box(self) -> NormalizedBox:
        """Return the axis-aligned bounding box IoU is measured on (§4.3).

        Raises:
            InvalidGeometryError: If the polygon has zero width or height, which has no box and
                therefore no IoU.
        """
        xs = [point[0] for point in self.points]
        ys = [point[1] for point in self.points]
        x0, y0 = max(min(xs), 0.0), max(min(ys), 0.0)
        x1, y1 = min(max(xs), 1.0), min(max(ys), 1.0)
        _check(x1 > x0 and y1 > y0, "polygon has zero extent and no bounding box")
        return NormalizedBox(x0, y0, x1 - x0, y1 - y0)


@dataclass(frozen=True)
class NormalizedRoundedBox:
    """Rounded box; ``r`` is normalised against ``min(w, h)`` — §4.3 ``ROUNDED_BOX``."""

    x: float
    y: float
    w: float
    h: float
    r: float

    def __post_init__(self) -> None:
        rect = NormalizedBox(self.x, self.y, self.w, self.h)
        for name, value in zip(("x", "y", "w", "h"), rect.as_tuple()):
            object.__setattr__(self, name, value)
        _check(_finite(self.r), f"r must be a finite number, got {self.r!r}")
        object.__setattr__(self, "r", float(self.r))
        _check(0.0 <= self.r <= 0.5, f"r must be within [0, 0.5], got {self.r}")

    def bounding_box(self) -> NormalizedBox:
        """Return the axis-aligned box; the corner radius does not change the extent."""
        return NormalizedBox(self.x, self.y, self.w, self.h)


def intersection_area(box_a: NormalizedBox, box_b: NormalizedBox) -> float:
    """Return the normalised area shared by two boxes.

    Args:
        box_a: First box.
        box_b: Second box.

    Returns:
        The overlap area, ``0.0`` when the boxes are disjoint or touch on an edge.
    """
    width = min(box_a.right, box_b.right) - max(box_a.x, box_b.x)
    height = min(box_a.bottom, box_b.bottom) - max(box_a.y, box_b.y)
    if width <= 0.0 or height <= 0.0:
        return 0.0
    return width * height


def union_area(box_a: NormalizedBox, box_b: NormalizedBox) -> float:
    """Return the normalised area covered by either box."""
    return box_a.area + box_b.area - intersection_area(box_a, box_b)


def iou(box_a: NormalizedBox, box_b: NormalizedBox) -> float:
    """Intersection-over-union of two axis-aligned normalised boxes.

    Args:
        box_a: Usually the prediction.
        box_b: Usually the human annotation.

    Returns:
        ``0.0`` for disjoint boxes, ``1.0`` for identical ones.

    Raises:
        InvalidGeometryError: If either box has zero area, which leaves IoU undefined. Only
            reachable for boxes built without validation; it is reported rather than silently
            returned as ``0.0``, because "no overlap" and "no box" are different findings.
    """
    for name, box in (("box_a", box_a), ("box_b", box_b)):
        _check(box.area > 0.0, f"{name} has zero area; IoU is undefined", box=box.as_tuple())
    union = union_area(box_a, box_b)
    _check(union > 0.0, "union area is zero; IoU is undefined")
    return intersection_area(box_a, box_b) / union


def polygon_to_box(polygon: NormalizedPolygon) -> NormalizedBox:
    """Return the axis-aligned bounding box of a polygon (§4.3 IoU definition)."""
    return polygon.bounding_box()


def rounded_box_to_box(rounded_box: NormalizedRoundedBox) -> NormalizedBox:
    """Return the axis-aligned bounding box of a rounded box (§4.3 IoU definition)."""
    return rounded_box.bounding_box()


def clamp_box(box: NormalizedBox) -> NormalizedBox:
    """Return ``box`` clipped into the unit square."""
    return box.clamped()


def connected_components(mask: np.ndarray) -> tuple[np.ndarray, int]:
    """Label the 4-connected components of a boolean mask.

    Numpy edge extraction plus union-find, deliberately without scipy: the project adds no
    dependency for something it can express in twenty lines (CLAUDE.md §11.4, §11.5).
    4-connectivity means diagonal neighbours are *separate* components, which keeps speckle from
    being merged into one implausibly large region.

    Args:
        mask: 2-D array; anything truthy counts as foreground.

    Returns:
        ``(labels, count)`` — ``labels`` is an ``int32`` array of the same shape holding ``0`` for
        background and ``1..count`` for components, in raster order of first appearance.

    Raises:
        InvalidGeometryError: If ``mask`` is not 2-D, or is empty.
    """
    binary = np.asarray(mask).astype(bool)
    _check(binary.ndim == 2, f"mask must be 2-D, got shape {binary.shape}")
    _check(binary.size > 0, "mask must not be empty")
    labels = np.zeros(binary.shape, dtype=np.int32)
    total = int(binary.sum())
    if total == 0:
        return labels, 0
    ids = np.full(binary.shape, -1, dtype=np.int64)
    ids[binary] = np.arange(total, dtype=np.int64)
    parent = list(range(total))

    def find(node: int) -> int:
        root = node
        while parent[root] != root:
            root = parent[root]
        while parent[node] != root:
            parent[node], node = root, parent[node]
        return root

    vertical = binary[:-1, :] & binary[1:, :]
    horizontal = binary[:, :-1] & binary[:, 1:]
    for first, second in (
        (ids[:-1, :][vertical], ids[1:, :][vertical]),
        (ids[:, :-1][horizontal], ids[:, 1:][horizontal]),
    ):
        for left, right in zip(first.tolist(), second.tolist()):
            root_left, root_right = find(left), find(right)
            if root_left != root_right:
                parent[max(root_left, root_right)] = min(root_left, root_right)
    roots = np.array([find(node) for node in range(total)], dtype=np.int64)
    unique_roots, compact = np.unique(roots, return_inverse=True)
    labels[binary] = (compact.reshape(-1) + 1).astype(np.int32)
    return labels, int(unique_roots.size)


def boxes_from_mask(mask: np.ndarray, min_area_fraction: float = 0.0) -> tuple[NormalizedBox, ...]:
    """Return one normalised box per 4-connected component, largest component first.

    Args:
        mask: 2-D boolean mask, typically a thresholded saliency map.
        min_area_fraction: Components covering less than this fraction of the mask are dropped;
            ``0.0`` keeps every component, including single pixels.

    Returns:
        Boxes ordered by component pixel count, descending, ties in raster order. Empty when
        nothing survives the filter — the caller renders that as *no region*, never as a
        full-image box (CLAUDE.md §2.3).

    Raises:
        InvalidGeometryError: If ``mask`` is not 2-D, or is empty.
        ValueError: If ``min_area_fraction`` is outside ``[0, 1]``.
    """
    if not _finite(min_area_fraction) or not 0.0 <= float(min_area_fraction) <= 1.0:
        raise ValueError(f"min_area_fraction must be within [0, 1], got {min_area_fraction!r}")
    labels, count = connected_components(mask)
    if count == 0:
        return ()
    height, width = labels.shape
    total = float(labels.size)
    found: list[tuple[int, NormalizedBox]] = []
    for label in range(1, count + 1):
        rows, columns = np.nonzero(labels == label)
        pixels = int(rows.size)
        if pixels / total < float(min_area_fraction):
            continue
        y0, y1 = int(rows.min()), int(rows.max())
        x0, x1 = int(columns.min()), int(columns.max())
        found.append(
            (
                pixels,
                NormalizedBox(
                    x0 / width, y0 / height, (x1 - x0 + 1) / width, (y1 - y0 + 1) / height
                ),
            )
        )
    found.sort(key=lambda item: item[0], reverse=True)
    return tuple(box for _, box in found)

def mask_iou(mask_a: np.ndarray, mask_b: np.ndarray) -> float:
    """IoU of two boolean masks of identical shape.

    Used for the Grad-CAM / human-ROI overlap of RQ3, where both operands live on the same grid
    and a box-level IoU would throw away the shape of the attribution.

    Args:
        mask_a: First mask; anything truthy is foreground.
        mask_b: Second mask, same shape.

    Returns:
        ``intersection / union``; ``0.0`` when exactly one of the masks is empty.

    Raises:
        InvalidGeometryError: If the shapes differ, or both masks are empty (``0 / 0``).
    """
    first = np.asarray(mask_a).astype(bool)
    second = np.asarray(mask_b).astype(bool)
    _check(
        first.shape == second.shape,
        f"masks must have the same shape, got {first.shape} and {second.shape}",
    )
    union = int(np.count_nonzero(first | second))
    _check(union > 0, "both masks are empty; IoU is undefined")
    return int(np.count_nonzero(first & second)) / union
