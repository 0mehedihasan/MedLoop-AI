/**
 * MedLoop AI — `overlays/HumanShapes.tsx`: layer z5, the annotator's own shapes.
 *
 * Stroke 1, fill 12% — the skill's numbers. The fill is what makes a shape clickable-looking and what
 * makes two overlapping shapes readable; at 12% it still lets the lesion through, which matters because
 * the annotator is judging the thing underneath.
 *
 * ## The selected shape differs by weight, not by colour
 *
 * Selection doubles the stroke instead of recolouring it. A second colour would compete with the AI
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
          className="stroke-annotation-human fill-annotation-human/12"
          strokeWidth={shape.key === selectedKey ? 2 : 1}
        />
      ))}
    </g>
  );
}
