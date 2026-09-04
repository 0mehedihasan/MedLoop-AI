/**
 * MedLoop AI — `overlays/AiBoxOverlay.tsx`: layer z4, the model's own localisation.
 *
 * Stroke 1, dashed, **no fill** — the skill's numbers. The absence of a fill is deliberate beyond
 * aesthetics: a filled AI box would tint the lesion the annotator is judging, and the judgement is
 * supposed to be about the photograph, not about the model's guess at it.
 *
 * ## Two independent signals, so it survives colour-vision deficiency
 *
 * Different hue *and* a dash pattern. Either one alone tells the AI box from a human shape; together
 * they still do when the display is monochrome or the reader is deuteranopic.
 *
 * ## When there is no localisation this component is not rendered at all
 *
 * `ai_localization === null` removes the AI-box view from the switcher (§2.3); it does not render an
 * empty box, and it does not fall back to the whole image. Right now no model exists, so this is the
 * normal case rather than the exception — which is precisely why the empty path must not look plausible.
 *
 * ## The geometry is copied, never adopted
 *
 * "Accept the AI box" copies this geometry into a new `HUMAN` annotation (§2.4). This component never
 * mutates what it is given, and the AI row it came from is never touched.
 */

import type { ReactElement } from 'react';

import { ShapeNode } from './ShapeNode';
import type { Viewport } from '../useViewport';
import type { Geometry, PixelSize } from '@/types/domain';

/** 6 on, 4 off, in CSS pixels — visible at fit without reading as a fine texture at 8×. */
export const AI_BOX_DASH = '6 4';

export interface AiBoxOverlayProps {
  readonly geometry: Geometry;
  readonly viewport: Viewport;
  readonly size: PixelSize;
}

export function AiBoxOverlay({ geometry, viewport, size }: AiBoxOverlayProps): ReactElement {
  return (
    <g data-layer="ai-box">
      <ShapeNode
        geometry={geometry}
        viewport={viewport}
        size={size}
        className="stroke-annotation-ai fill-none"
        dash={AI_BOX_DASH}
      />
    </g>
  );
}
