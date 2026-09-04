/**
 * MedLoop AI — annotation geometry.
 *
 * Every coordinate decision in the canvas lives here: clamping, negative-extent drags, the derived
 * axis-aligned box, IoU, validation, translation, resizing and hit testing. Pure functions only —
 * no React, no DOM, no viewport — so the rules in `.claude/skills/medloop-annotation.md` can be
 * exercised without mounting anything.
 *
 * ## Everything is normalised, always
 *
 * `[0,1]` against the *original* image width and height, origin top-left, `x` right, `y` down
 * (CLAUDE.md §4.3). Pixels never enter this file. The canvas converts to screen space at render
 * time and straight back on commit, which is why a shape drawn at 8× zoom on a laptop and the same
 * shape reopened on an external display are byte-identical.
 *
 * ## `deriveBoundingBox` has one definition, and it is this one
 *
 * `ml/evaluation/localization_metrics.py` mirrors {@link deriveBoundingBox} and {@link iou}. The
 * skill asks for a table-driven test over shared fixtures because two implementations of an IoU are
 * two different metrics the moment one of them treats a rounded corner as area — which is exactly
 * why `ROUNDED_BOX` ignores `r` here, deliberately and identically on both sides.
 *
 * ## Tolerance is a pair, not a scalar
 *
 * Hit tolerance arrives already converted into normalised units, and as separate `x`/`y`
 * components. A single scalar would make a handle on a 3:4 portrait easier to grab horizontally
 * than vertically, because 6 screen px is a different fraction of the width than of the height. See
 * {@link NormTolerance}.
 */

import { AnnotationType } from '@/types/domain';
import type { Box, Geometry, NormPoint } from '@/types/domain';

/** Decimals kept on commit. Six is ~0.5 µm on a 5 cm lesion photograph: below any real precision. */
export const COORD_PRECISION = 6;

/** Smallest committable extent, from the skill's validation table. Rejects click-shapes. */
export const MIN_EXTENT = 0.005;

/**
 * Vertices a polygon needs after de-duplication (§4.3). Read by `geometryProblem` and by the polygon
 * tool, which uses it to decide whether `Enter` can close the outline — one rule, one home.
 */
export const MIN_POLYGON_POINTS = 3;

/**
 * Two polygon vertices closer than this in both components are the same vertex.
 *
 * Deliberately below {@link MIN_EXTENT}: de-duplication exists to drop the double-click that
 * lands twice on one pixel, not to simplify a deliberately fine outline.
 */
export const POINT_EPSILON = 0.001;

/** Corner radius bound, expressed against `min(w, h)` (§4.3). */
export const MAX_RADIUS = 0.5;

export function clamp(value: number, lower: number, upper: number): number {
  if (Number.isNaN(value)) return lower;
  return Math.min(Math.max(value, lower), upper);
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Rounds to {@link COORD_PRECISION}. Called once, on commit — never during a drag. */
export function roundCoord(value: number): number {
  const factor = 10 ** COORD_PRECISION;
  return Math.round(value * factor) / factor;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The wire ↔ in-memory boundary for polygon points
 *
 * `PolygonGeometry.points` is `[[x, y], …]` because that is the payload §4.3 specifies and the
 * body posted to `POST /review/{id}/submit` verbatim. `NormPoint` is the shape the hit tests and
 * the viewport conversion read better with. These two functions are the entire boundary between
 * them; nothing else in the canvas converts by hand.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export type PointPair = readonly [number, number];

export function toNormPoint(pair: PointPair): NormPoint {
  return { x: pair[0], y: pair[1] };
}

export function toPointPair(point: NormPoint): PointPair {
  return [point.x, point.y];
}

export function toNormPoints(pairs: readonly PointPair[]): readonly NormPoint[] {
  return pairs.map(toNormPoint);
}

export function toPointPairs(points: readonly NormPoint[]): readonly PointPair[] {
  return points.map(toPointPair);
}

/** The vertices of a polygon geometry, or `[]` for any other type. */
export function geometryPoints(geometry: Geometry): readonly NormPoint[] {
  return geometry.type === AnnotationType.POLYGON ? toNormPoints(geometry.points) : [];
}

/**
 * Drops vertices within {@link POINT_EPSILON} of the one before them, and the last vertex when it
 * has landed back on the first.
 *
 * The closing case matters: closure is *implicit* (§4.3), so a first-equals-last polygon is one
 * vertex too long and its IoU is off by the sliver between the duplicate and its neighbour. This
 * removes the duplicate rather than accepting it — and it never appends one.
 */
export function dedupePoints(points: readonly NormPoint[]): readonly NormPoint[] {
  const kept: NormPoint[] = [];
  for (const point of points) {
    const previous = kept[kept.length - 1];
    if (previous !== undefined && samePoint(previous, point)) continue;
    kept.push(point);
  }
  const first = kept[0];
  const last = kept[kept.length - 1];
  if (kept.length > 1 && first !== undefined && last !== undefined && samePoint(first, last)) {
    kept.pop();
  }
  return kept;
}

export function samePoint(a: NormPoint, b: NormPoint): boolean {
  return Math.abs(a.x - b.x) <= POINT_EPSILON && Math.abs(a.y - b.y) <= POINT_EPSILON;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Boxes
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * A box from the two corners of a drag, whichever order they were made in.
 *
 * Both corners are clamped *before* the extent is measured, which is the difference between "a drag
 * past the edge clips" and "a drag past the edge extends the image" — the skill requires the first.
 * A right-to-left or bottom-to-top drag comes back with positive `w`/`h`; the sign of a drag is a
 * property of the gesture, never of the stored shape.
 */
export function boxFromCorners(a: NormPoint, b: NormPoint): Box {
  const x1 = clamp01(a.x);
  const y1 = clamp01(a.y);
  const x2 = clamp01(b.x);
  const y2 = clamp01(b.y);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

/** The tightest box containing every point. `{0,0,0,0}` for an empty list — never `NaN`. */
export function boxFromExtent(points: readonly NormPoint[]): Box {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * The one derived axis-aligned box. Mirrored by `derive_bounding_box()` in
 * `ml/evaluation/localization_metrics.py`.
 *
 * `ROUNDED_BOX` returns its full extent and **ignores `r`** — stated in the skill, repeated here
 * because "obviously the corners should be excluded" is a tempting one-line change that would
 * silently make the two languages compute different IoUs.
 */
export function deriveBoundingBox(geometry: Geometry): Box {
  switch (geometry.type) {
    case AnnotationType.BOUNDING_BOX:
    case AnnotationType.ROUNDED_BOX:
      return { x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h };
    case AnnotationType.POLYGON:
      return boxFromExtent(toNormPoints(geometry.points));
  }
}

export function boxArea(box: Box): number {
  return Math.max(0, box.w) * Math.max(0, box.h);
}

/**
 * Intersection-over-union of two derived boxes. `0` when either box has no area, which is the
 * honest answer for a degenerate shape rather than a division by zero dressed up as agreement.
 */
export function iou(a: Box, b: Box): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = boxArea(a) + boxArea(b) - overlap;
  return union <= 0 ? 0 : overlap / union;
}

/** IoU straight from two geometries, so a caller never has to remember to derive first. */
export function geometryIou(a: Geometry, b: Geometry): number {
  return iou(deriveBoundingBox(a), deriveBoundingBox(b));
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Commit: clamp, round, validate
 *
 * The client runs these so the user is told immediately; the server runs its own copy and is
 * authoritative (skill, validation table). Neither substitutes for the other.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** `r` is a fraction of `min(w, h)`, so its bound does not depend on the image's aspect ratio. */
export function clampRadius(r: number): number {
  return clamp(r, 0, MAX_RADIUS);
}

/**
 * Clamps into `[0,1]` and rounds to {@link COORD_PRECISION}. Idempotent, and the only place a
 * geometry acquires its final precision.
 */
export function commitGeometry(geometry: Geometry): Geometry {
  switch (geometry.type) {
    case AnnotationType.BOUNDING_BOX:
      return { type: geometry.type, ...commitBox(geometry) };
    case AnnotationType.ROUNDED_BOX:
      return {
        type: geometry.type,
        ...commitBox(geometry),
        r: roundCoord(clampRadius(geometry.r)),
      };
    case AnnotationType.POLYGON:
      return {
        type: geometry.type,
        points: dedupePoints(toNormPoints(geometry.points)).map((point) => [
          roundCoord(clamp01(point.x)),
          roundCoord(clamp01(point.y)),
        ]),
      };
  }
}

/**
 * Clamps a box's origin *and* keeps its far edge inside the image, then rounds.
 *
 * The far edge is clipped rather than the box being pushed back inside, because a shape whose
 * position moves on save is a shape the annotator did not draw.
 */
function commitBox(box: Box): Box {
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  return {
    x: roundCoord(x),
    y: roundCoord(y),
    w: roundCoord(clamp(box.w, 0, 1 - x)),
    h: roundCoord(clamp(box.h, 0, 1 - y)),
  };
}

/**
 * Why this geometry cannot be committed, in words meant for the annotator — or `null` when it can.
 *
 * A string rather than a boolean: "too small" and "a polygon needs three corners" send someone to
 * two different gestures, and a canvas that simply refuses to finish a shape without saying why
 * reads as a broken pointer.
 */
export function geometryProblem(geometry: Geometry): string | null {
  if (geometry.type === AnnotationType.POLYGON) {
    const points = dedupePoints(toNormPoints(geometry.points));
    if (points.length < MIN_POLYGON_POINTS) {
      return 'A polygon needs at least three distinct corners.';
    }
    const extent = boxFromExtent(points);
    if (extent.w < MIN_EXTENT && extent.h < MIN_EXTENT) {
      return 'This outline is too small to be a lesion boundary. Draw it larger, or zoom in first.';
    }
    return null;
  }
  if (geometry.w < MIN_EXTENT || geometry.h < MIN_EXTENT) {
    return 'This box is too small. Drag across the lesion, or zoom in and draw again.';
  }
  if (geometry.x < 0 || geometry.y < 0 || geometry.x + geometry.w > 1 || geometry.y + geometry.h > 1) {
    return 'This box extends past the edge of the image.';
  }
  if (geometry.type === AnnotationType.ROUNDED_BOX && (geometry.r < 0 || geometry.r > MAX_RADIUS)) {
    return 'The corner radius must be between 0 and half the shorter side.';
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Move and resize
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Moves a whole shape, stopping at the edge of the image instead of deforming or leaving it.
 *
 * The delta is clamped against the shape's derived extent *once*, so a polygon keeps its exact
 * outline: every vertex receives the same, already-legal delta. Clamping each vertex separately is
 * the bug that quietly flattens one side of a shape dragged into a corner.
 */
export function translateGeometry(geometry: Geometry, dx: number, dy: number): Geometry {
  const extent = deriveBoundingBox(geometry);
  const moveX = clamp(dx, -extent.x, 1 - (extent.x + extent.w));
  const moveY = clamp(dy, -extent.y, 1 - (extent.y + extent.h));
  if (geometry.type === AnnotationType.POLYGON) {
    return {
      type: geometry.type,
      points: geometry.points.map(([x, y]) => [x + moveX, y + moveY] as PointPair),
    };
  }
  const moved = { ...geometry, x: geometry.x + moveX, y: geometry.y + moveY };
  return moved;
}

/** The eight box handles, in the order {@link boxHandlePoints} returns them. */
export const BOX_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

export type BoxHandle = (typeof BOX_HANDLES)[number];

export interface HandlePoint {
  readonly kind: BoxHandle;
  readonly point: NormPoint;
}

export function boxHandlePoints(box: Box): readonly HandlePoint[] {
  const midX = box.x + box.w / 2;
  const midY = box.y + box.h / 2;
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  return [
    { kind: 'nw', point: { x: box.x, y: box.y } },
    { kind: 'n', point: { x: midX, y: box.y } },
    { kind: 'ne', point: { x: right, y: box.y } },
    { kind: 'e', point: { x: right, y: midY } },
    { kind: 'se', point: { x: right, y: bottom } },
    { kind: 's', point: { x: midX, y: bottom } },
    { kind: 'sw', point: { x: box.x, y: bottom } },
    { kind: 'w', point: { x: box.x, y: midY } },
  ];
}

/**
 * Drags one handle. Edges the handle does not touch stay exactly where they are.
 *
 * A drag through the opposite edge flips the box rather than collapsing it to zero — the same
 * behaviour as any selection rectangle, and the reason {@link boxFromCorners} is reused here rather
 * than the extents being adjusted in place.
 */
export function resizeBox(box: Box, handle: BoxHandle, to: NormPoint): Box {
  const left = box.x;
  const top = box.y;
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  const x = clamp01(to.x);
  const y = clamp01(to.y);

  const movesLeft = handle === 'nw' || handle === 'w' || handle === 'sw';
  const movesRight = handle === 'ne' || handle === 'e' || handle === 'se';
  const movesTop = handle === 'nw' || handle === 'n' || handle === 'ne';
  const movesBottom = handle === 'sw' || handle === 's' || handle === 'se';

  return boxFromCorners(
    { x: movesLeft ? x : left, y: movesTop ? y : top },
    { x: movesRight ? x : right, y: movesBottom ? y : bottom },
  );
}

/** Resizes any geometry by its handle. A polygon is scaled into the new extent, keeping its shape. */
export function resizeGeometry(geometry: Geometry, handle: BoxHandle, to: NormPoint): Geometry {
  const before = deriveBoundingBox(geometry);
  const after = resizeBox(before, handle, to);
  if (geometry.type !== AnnotationType.POLYGON) {
    return { ...geometry, ...after };
  }
  // A zero-extent side cannot be scaled — the factor is undefined, not 1 — so a polygon squashed
  // flat in one axis is left alone in that axis rather than being sent to NaN.
  const scaleX = before.w === 0 ? 1 : after.w / before.w;
  const scaleY = before.h === 0 ? 1 : after.h / before.h;
  return {
    type: geometry.type,
    points: geometry.points.map(
      ([x, y]) =>
        [
          clamp01(after.x + (x - before.x) * scaleX),
          clamp01(after.y + (y - before.y) * scaleY),
        ] as PointPair,
    ),
  };
}

/** Moves one polygon vertex. Out-of-range indices return the geometry untouched, never a hole. */
export function movePolygonVertex(
  geometry: Geometry,
  index: number,
  to: NormPoint,
): Geometry {
  if (geometry.type !== AnnotationType.POLYGON) return geometry;
  if (index < 0 || index >= geometry.points.length) return geometry;
  const next: PointPair = [clamp01(to.x), clamp01(to.y)];
  return {
    type: geometry.type,
    points: geometry.points.map((pair, at) => (at === index ? next : pair)),
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Hit testing
 *
 * All of it in normalised space, which is why the tolerance has to be converted *before* it gets
 * here: see the header note on {@link NormTolerance}. `useViewport` does that conversion.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * A screen-pixel grab radius, already divided by `scale` and by the image's natural size — so `x`
 * and `y` differ on any image that is not square. One scalar would make handles on a portrait
 * photograph measurably easier to grab horizontally than vertically.
 */
export interface NormTolerance {
  readonly x: number;
  readonly y: number;
}

export function nearPoint(a: NormPoint, b: NormPoint, tolerance: NormTolerance): boolean {
  return Math.abs(a.x - b.x) <= tolerance.x && Math.abs(a.y - b.y) <= tolerance.y;
}

/** Inside, or within `tolerance` of the edge — so a box drawn thin is still selectable. */
export function pointInBox(point: NormPoint, box: Box, tolerance: NormTolerance): boolean {
  return (
    point.x >= box.x - tolerance.x &&
    point.x <= box.x + box.w + tolerance.x &&
    point.y >= box.y - tolerance.y &&
    point.y <= box.y + box.h + tolerance.y
  );
}

/**
 * Even-odd ray casting. Vertices are treated as belonging to the edge below them, which is the
 * standard way to keep a point that lands exactly on a shared vertex from counting twice.
 */
export function pointInPolygon(point: NormPoint, points: readonly NormPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    if (a === undefined || b === undefined) continue;
    const straddles = a.y > point.y !== b.y > point.y;
    if (!straddles) continue;
    const crossing = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x);
    if (point.x < crossing) inside = !inside;
  }
  return inside;
}

/**
 * Does this point hit the shape's body?
 *
 * A polygon uses its true outline, not its derived box — selecting a crescent-shaped lesion by
 * clicking the empty corner of its bounding box would pick the wrong shape whenever two annotations
 * overlap. `ROUNDED_BOX` uses its full extent, consistently with {@link deriveBoundingBox}: the
 * clipped corner is a few pixels and treating it as outside would make the shape feel unreliable.
 */
export function hitGeometry(
  geometry: Geometry,
  point: NormPoint,
  tolerance: NormTolerance,
): boolean {
  if (geometry.type === AnnotationType.POLYGON) {
    const points = toNormPoints(geometry.points);
    if (pointInPolygon(point, points)) return true;
    // A hollow click inside a very thin outline still selects it, via the vertices and the extent.
    return (
      hitVertex(points, point, tolerance) !== null &&
      pointInBox(point, boxFromExtent(points), tolerance)
    );
  }
  return pointInBox(point, deriveBoundingBox(geometry), tolerance);
}

/** The handle under the pointer, or `null`. Corners are tested before edges: they overlap. */
export function hitHandle(
  box: Box,
  point: NormPoint,
  tolerance: NormTolerance,
): BoxHandle | null {
  const handles = boxHandlePoints(box);
  const corners = handles.filter((handle) => handle.kind.length === 2);
  const edges = handles.filter((handle) => handle.kind.length === 1);
  for (const handle of [...corners, ...edges]) {
    if (nearPoint(point, handle.point, tolerance)) return handle.kind;
  }
  return null;
}

/** The index of the vertex under the pointer, or `null`. */
export function hitVertex(
  points: readonly NormPoint[],
  point: NormPoint,
  tolerance: NormTolerance,
): number | null {
  for (let index = 0; index < points.length; index += 1) {
    const vertex = points[index];
    if (vertex !== undefined && nearPoint(point, vertex, tolerance)) return index;
  }
  return null;
}
