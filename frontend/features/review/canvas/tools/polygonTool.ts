/**
 * MedLoop AI — `tools/polygonTool.ts`: the free outline.
 *
 * The only click-driven tool. Each press fixes a corner, the cursor trails a rubber band to the next
 * one, and the outline closes either by pressing near the first corner or with `Enter`. Closure is
 * *implicit* (§4.3), so the first vertex is never repeated at the end — `dedupePoints` removes it if a
 * press lands there.
 *
 * ## `Enter` on an unfinished outline does nothing, deliberately
 *
 * With fewer than three distinct corners `close` returns the draft unchanged rather than cancelling.
 * Discarding two careful clicks because the third had not arrived yet would be the more destructive
 * reading of the same keystroke. The canvas checks {@link polygonTool.canClose} first and, when it is
 * false, renders `geometryProblem`'s own prose — "A polygon needs at least three distinct corners." —
 * so the message the annotator sees is the same one the validator would have produced.
 *
 * ## A press on the last corner is not a new corner
 *
 * A double-click lands two presses on one pixel. The second is absorbed, so the outline does not gain a
 * duplicate vertex that `dedupePoints` would have to remove later — and the canvas is free to treat the
 * `dblclick` as "close", the convention every other polygon editor uses.
 *
 * ## `tolerance` is how close counts as "the first corner"
 *
 * Supplied by the canvas in normalised units, already divided by `scale`, so the closing target is the
 * same number of *screen* pixels whether the image is fitted or at 8×.
 */

import { dedupePoints, nearPoint, samePoint, toPointPairs, MIN_POLYGON_POINTS } from '../geometry';
import type { NormTolerance } from '../geometry';
import { startDraft, withCursor, withPoint } from './tool';
import type { Draft, DrawingTool, ToolStep } from './tool';
import { AnnotationType } from '@/types/domain';
import type { NormPoint } from '@/types/domain';

function corners(draft: Draft): readonly NormPoint[] {
  return dedupePoints(draft.points);
}

function canClose(draft: Draft): boolean {
  return corners(draft).length >= MIN_POLYGON_POINTS;
}

function close(draft: Draft): ToolStep {
  const points = corners(draft);
  if (points.length < MIN_POLYGON_POINTS) return { kind: 'draft', draft };
  return {
    kind: 'commit',
    geometry: { type: AnnotationType.POLYGON, points: toPointPairs(points) },
  };
}

function down(draft: Draft | null, point: NormPoint, tolerance: NormTolerance): ToolStep {
  if (draft === null) return { kind: 'draft', draft: startDraft('polygon', point) };

  const first = draft.points[0];
  if (first !== undefined && nearPoint(point, first, tolerance)) {
    // On the opening vertex: close if there is an outline to close, otherwise absorb the press so the
    // first corner is never stored twice.
    return canClose(draft) ? close(draft) : { kind: 'draft', draft: withCursor(draft, point) };
  }

  const last = draft.points[draft.points.length - 1];
  if (last !== undefined && samePoint(last, point)) {
    return { kind: 'draft', draft: withCursor(draft, point) };
  }
  return { kind: 'draft', draft: withPoint(draft, point) };
}

export const polygonTool: DrawingTool = {
  id: 'polygon',
  type: AnnotationType.POLYGON,
  gesture: 'click',
  hint: 'Click each corner of the lesion. Press Enter, or click the first corner, to close it.',

  down,
  move: (draft, point) => withCursor(draft, point),
  // A release never ends an outline — that is the difference between this tool and the other two.
  up: (draft) => ({ kind: 'draft', draft }),
  close,
  canClose,

  preview: (draft) => {
    // The cursor is part of the *preview* only; it becomes a vertex when it is pressed, never before.
    const points = dedupePoints([...draft.points, draft.cursor]);
    return points.length === 0
      ? null
      : { type: AnnotationType.POLYGON, points: toPointPairs(points) };
  },
};
