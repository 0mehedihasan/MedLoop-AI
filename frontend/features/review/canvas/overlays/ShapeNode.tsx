/**
 * MedLoop AI — `overlays/ShapeNode.tsx`: one geometry, drawn in screen pixels.
 *
 * Three consumers — the saved human shapes, the AI localisation box, and the live tool preview — draw
 * the same three geometry types with different strokes. Without this file each of them would carry its
 * own `switch (geometry.type)`, and the day a fourth type arrives two of the three would be forgotten.
 *
 * ## No `viewBox`, so SVG user units are CSS pixels
 *
 * The parent `<svg>` deliberately has no `viewBox` (see `useViewport.ts`). Coordinates therefore arrive
 * here already converted by `toScreen`, and `strokeWidth={1}` is one device-independent pixel at fit and
 * at 8× alike. The alternative — a `viewBox` in normalised space plus a transform — makes every stroke
 * width and handle radius a function of the zoom level, which is how hairlines end up 8 px thick.
 *
 * ## `pointer-events: none`, always
 *
 * Hit testing happens in `geometry.ts`, in normalised space, against the model — not against the DOM.
 * That is what lets a shape underneath another shape still be reachable, lets `Tab` select without a
 * pointer, and keeps the pointer maths identical for every input. A shape that accepted its own events
 * would quietly become a second, disagreeing hit-test.
 *
 * ## `rx` is derived, never stored
 *
 * `r` is normalised against `min(w, h)` of the *box* (§4.3), so the pixel radius is
 * `r · min(screenW, screenH)`. Storing a pixel radius would rot the moment the viewer zoomed.
 *
 * ## The fill opacity is an SVG attribute, never a Tailwind alpha modifier
 *
 * `fill-annotation-human/12` looks like it asks for a 12 % fill. It does not: Tailwind's opacity scale
 * has no `12` step, so the class is never generated, the `<rect>` inherits SVG's initial `fill: black`
 * — and an opaque black rectangle lands on top of the lesion the annotator is judging. That shipped,
 * and it is the worst possible failure mode for this file, so the alpha is now a real presentation
 * attribute that no build step can drop. {@link ShapeNodeProps.fillOpacity} defaults to `0`, which
 * makes a forgotten fill *invisible* rather than *opaque*: if this is ever wrong again, it must fail
 * towards showing the photograph.
 */

import type { ReactElement } from 'react';

import { toScreen, toScreenBox } from '../useViewport';
import type { Viewport } from '../useViewport';
import { toNormPoints } from '../geometry';
import { AnnotationType } from '@/types/domain';
import type { Geometry, PixelSize } from '@/types/domain';

export interface ShapeNodeProps {
  readonly geometry: Geometry;
  readonly viewport: Viewport;
  readonly size: PixelSize;
  /** Tailwind `stroke-*` / `fill-*` classes. Raw colour literals are a defect (§11.2). */
  readonly className: string;
  readonly strokeWidth?: number;
  /**
   * Fill alpha, `0 … 1`. See the header: this is an attribute rather than a `/12` class because the
   * class silently does not exist and the SVG fallback is opaque black. `0` — no fill — is the
   * default, because the annotator has to see the skin under the shape.
   */
  readonly fillOpacity?: number;
  /** `stroke-dasharray`, in CSS pixels. The AI box is dashed; a human shape never is. */
  readonly dash?: string;
}

export function ShapeNode({
  geometry,
  viewport,
  size,
  className,
  strokeWidth = 1,
  fillOpacity = 0,
  dash,
}: ShapeNodeProps): ReactElement | null {
  const shared = {
    className,
    strokeWidth,
    fillOpacity,
    strokeDasharray: dash,
    // See the header: the model is the hit-test, not the DOM.
    pointerEvents: 'none' as const,
    // A shape drawn one pixel wide reads as a hairline only if its ends and joins are square-free.
    strokeLinejoin: 'round' as const,
  };

  switch (geometry.type) {
    case AnnotationType.BOUNDING_BOX: {
      const box = toScreenBox(geometry, viewport, size);
      return <rect {...shared} x={box.x} y={box.y} width={box.w} height={box.h} />;
    }

    case AnnotationType.ROUNDED_BOX: {
      const box = toScreenBox(geometry, viewport, size);
      const radius = geometry.r * Math.min(box.w, box.h);
      return (
        <rect
          {...shared}
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          rx={radius}
          ry={radius}
        />
      );
    }

    case AnnotationType.POLYGON: {
      const points = toNormPoints(geometry.points)
        .map((point) => toScreen(point, viewport, size))
        .map((point) => `${String(point.x)},${String(point.y)}`)
        .join(' ');
      // Two points render as a line, which is the correct rubber band while a polygon is being drawn.
      return points === '' ? null : <polygon {...shared} points={points} />;
    }
  }
}
