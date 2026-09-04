/**
 * MedLoop AI — `tools/boxTool.ts`: the axis-aligned bounding box, and the default tool.
 *
 * One press, one drag, one release, one shape. `boxFromCorners` clamps both corners before measuring
 * the extent, so dragging past the edge of the image clips the box rather than pushing it back inside —
 * the annotator's intent was "as far as the edge", not "shift the whole box left".
 *
 * A drag through the anchor flips the box instead of collapsing it, for the same reason: the corner
 * under the pointer is the corner the annotator is moving.
 */

import {
  draftBox,
  finishBoxDraft,
  isTap,
  startDraft,
  withCursor,
  type Draft,
  type DrawingTool,
  type ToolStep,
} from './tool';
import { AnnotationType } from '@/types/domain';

function finish(draft: Draft): ToolStep {
  // A click is not a failed drag (see `tool.ts`): `finishBoxDraft` drops it with no message at all.
  return finishBoxDraft(draft, (box) => ({ type: AnnotationType.BOUNDING_BOX, ...box }));
}

export const boxTool: DrawingTool = {
  id: 'box',
  type: AnnotationType.BOUNDING_BOX,
  gesture: 'drag',
  hint: 'Drag across the lesion to draw a box.',

  // A press always starts a fresh gesture. A drag tool never holds a draft between gestures, so the
  // `draft` argument is only ever non-null after an interrupted drag, and restarting is the right
  // recovery.
  down: (_draft, point) => ({ kind: 'draft', draft: startDraft('box', point) }),
  move: (draft, point) => withCursor(draft, point),
  up: finish,
  close: finish,
  canClose: (draft) => !isTap(draft),

  preview: (draft) => {
    const box = draftBox(draft);
    return box === null ? null : { type: AnnotationType.BOUNDING_BOX, ...box };
  },
};
