/**
 * MedLoop AI — `overlays/HumanShapes.tsx`: layer z5, the annotator's own shapes.
 *
 * Fill 12 %, the skill's number, carried as an SVG `fill-opacity` attribute — see `ShapeNode`'s header
 * for why it is not the `/12` class it used to be. The fill is what makes a shape clickable-looking and
 * what makes two overlapping shapes readable; at 12 % it still lets the lesion through, which matters
 * because the annotator is judging the thing underneath.
 *
 * ## Stroke 1.5, above the skill's 1
 *
 * A 1 px hairline in a single hue is legible on a chart and marginal on a photograph of skin, where it
 * competes with hair, texture and specular highlights. 1.5 px resting and 2.5 px selected keeps the
 * outline readable without thickening it enough to cover the lesion border the annotator is placing it
 * against. Recorded as a deliberate departure from `medloop-annotation.md`'s "stroke 1" so it is not
 * mistaken for drift.
 *
 * ## The selected shape differs by weight, not by colour
 *
 * Selection thickens the stroke instead of recolouring it. A second colour would compete with the AI
 * box's colour, and on a photograph of skin every additional hue is one more thing to mistake for a
 * clinical feature.
 *
 * ## `origin` is not drawn
 *
 * A shape copied from the AI box is a `HUMAN` annotation (§2.4) and must look like one; saying so with a
 * different stroke would invite reading it as a third kind of record. The distinction is text in the
 * inspector's shape list, where a screen reader can reach it.
 */

import type { ReactElement } from 'react';

import { ShapeNode } from './ShapeNode';
import type { CanvasShape } from '../useAnnotationHistory';
import type { Viewport } from '../useViewport';
import type { PixelSize } from '@/types/domain';

/** The skill's z5 fill (`stroke 1, fill 0.12`), as an attribute rather than a class. */
export const HUMAN_FILL_OPACITY = 0.12;

export interface HumanShapesProps {
  readonly shapes: readonly CanvasShape[];
  readonly viewport: Viewport;
  readonly size: PixelSize;
  readonly selectedKey: string | null;
}

export function HumanShapes({
  shapes,
  viewport,
  size,
  selectedKey,
}: HumanShapesProps): ReactElement {
  return (
    <g data-layer="human">
      {shapes.map((shape) => (
        <ShapeNode
          key={shape.key}
          geometry={shape.geometry}
          viewport={viewport}
          size={size}
          className="stroke-annotation-human fill-annotation-human"
          fillOpacity={HUMAN_FILL_OPACITY}
          strokeWidth={shape.key === selectedKey ? 2.5 : 1.5}
        />
      ))}
    </g>
  );
}
