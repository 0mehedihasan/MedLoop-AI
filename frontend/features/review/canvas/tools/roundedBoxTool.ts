/**
 * MedLoop AI — `tools/roundedBoxTool.ts`: a box with rounded corners.
 *
 * Identical to `boxTool` in every respect except the payload, so it shares that tool's clamping and
 * flip behaviour through `finishBoxDraft` rather than restating it.
 *
 * ## Why a rounded box exists at all
 *
 * A lesion is round; a rectangle drawn tightly around one includes four corners of plain skin. A
 * rounded box carries the same four numbers plus one, so it stays cheap to store and cheap to compare,
 * while excluding the corners that were never part of the lesion.
 *
 * ## `r` is a fraction of the shorter side, not of the image
 *
 * `0.08` of `min(w, h)`, per §4.3. That makes the visible radius scale with the shape: a small lesion
 * gets a small radius and a large one a large radius, without the annotator adjusting anything. The
 * inspector can change it per shape afterwards; `commitGeometry` clamps whatever it sets to `[0, 0.5]`.
 *
 * The default was 0.15 and read as a blob rather than as a box — at 15 % of the shorter side a roughly
 * square shape looks round, which defeats the point of having a *box* tool distinct from a polygon. The
 * scale runs to 0.5, where a square becomes a circle, so a sensible default sits nearer the bottom of
 * it than the middle. Dragging the radius handle still reaches every value up to fully round.
 *
 * ## IoU ignores `r`
 *
 * `deriveBoundingBox` returns the full extent for a `ROUNDED_BOX`, corners included — stated in
 * `geometry.ts` and repeated here because this is the file where excluding them would seem obvious.
 */

import { finishBoxDraft, draftBox, isTap, startDraft, withCursor } from './tool';
import type { Draft, DrawingTool, ToolStep } from './tool';
import { AnnotationType } from '@/types/domain';

/** The radius a freshly drawn rounded box gets, as a fraction of its shorter side. */
export const DEFAULT_CORNER_RADIUS = 0.08;

function finish(draft: Draft): ToolStep {
  return finishBoxDraft(draft, (box) => ({
    type: AnnotationType.ROUNDED_BOX,
    ...box,
    r: DEFAULT_CORNER_RADIUS,
  }));
}

export const roundedBoxTool: DrawingTool = {
  id: 'rounded',
  type: AnnotationType.ROUNDED_BOX,
  gesture: 'drag',
  hint: 'Drag across the lesion to draw a box with rounded corners.',

  down: (_draft, point) => ({ kind: 'draft', draft: startDraft('rounded', point) }),
  move: (draft, point) => withCursor(draft, point),
  up: finish,
  close: finish,
  canClose: (draft) => !isTap(draft),

  preview: (draft) => {
    const box = draftBox(draft);
    return box === null
      ? null
      : { type: AnnotationType.ROUNDED_BOX, ...box, r: DEFAULT_CORNER_RADIUS };
  },
};
