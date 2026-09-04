/**
 * MedLoop AI — `overlays/SelectionHandles.tsx`: layer z6, the grab points of the selected shape.
 *
 * Eight handles on a box, one per vertex on a polygon. Nothing is drawn when nothing is selected, so the
 * presence of handles is the whole selection indicator besides the doubled stroke in `HumanShapes`.
 *
 * ## The visual handle is smaller than the grab area, on purpose
 *
 * 4 px drawn, 6 px to hit. A handle large enough to be comfortable to grab would cover the lesion edge
 * the annotator is trying to place it against; a hit area as small as the drawing would make fine
 * adjustment a test of aim. The two numbers live here together so they cannot drift apart, and the
 * canvas asks `viewport.tolerance(HANDLE_GRAB_PX)` for the normalised equivalent at the current zoom.
 *
 * ## White fill, coloured ring
 *
 * A handle has to be visible on a pale forearm and on a dark mole, in the same image. A filled ring in
 * the annotation colour on a white core survives both, and costs no extra hue.
 *
 * ## The radius handle is a diamond, and it is the only handle that is not round
 *
 * A `ROUNDED_BOX` is resized by its extent, which is what `deriveBoundingBox` returns — putting the
 * eight handles on the arc instead would move a corner handle when only the radius changed. The
 * radius gets its own grab point on the top edge, inset from `nw` by the arc it controls
 * ({@link radiusHandlePoint}), drawn as a diamond so it cannot be mistaken for a resize handle in a
 * screenshot or by someone who cannot see the colour difference. Its drawn position saturates short
 * of both `nw` and `n` so neither is ever shadowed.
 */

import type { ReactElement } from 'react';

import {
  boxHandlePoints,
  deriveBoundingBox,
  geometryPoints,
  radiusHandlePoint,
} from '../geometry';
import { toScreen } from '../useViewport';
import type { Viewport } from '../useViewport';
import { AnnotationType } from '@/types/domain';
import type { Geometry, NormPoint, PixelSize } from '@/types/domain';

/** Drawn radius, CSS pixels. */
export const HANDLE_RADIUS_PX = 4;

/** Grab radius, CSS pixels. Converted to normalised units per axis by `viewport.tolerance`. */
export const HANDLE_GRAB_PX = 6;

/** The radius handle's half-diagonal, CSS pixels. A touch larger so the diamond reads as a diamond. */
export const RADIUS_HANDLE_PX = 5;

export interface SelectionHandlesProps {
  readonly geometry: Geometry;
  readonly viewport: Viewport;
  readonly size: PixelSize;
}

interface Handle {
  readonly key: string;
  readonly point: NormPoint;
}

function handlesOf(geometry: Geometry): readonly Handle[] {
  if (geometry.type === AnnotationType.POLYGON) {
    return geometryPoints(geometry).map((point, index) => ({ key: `v${String(index)}`, point }));
  }
  return boxHandlePoints(deriveBoundingBox(geometry)).map((handle) => ({
    key: handle.kind,
    point: handle.point,
  }));
}

export function SelectionHandles({
  geometry,
  viewport,
  size,
}: SelectionHandlesProps): ReactElement {
  const radius = radiusHandlePoint(geometry, size);
  const radiusScreen = radius === null ? null : toScreen(radius, viewport, size);
  return (
    <g data-layer="handles">
      {handlesOf(geometry).map((handle) => {
        const screen = toScreen(handle.point, viewport, size);
        return (
          <circle
            key={handle.key}
            cx={screen.x}
            cy={screen.y}
            r={HANDLE_RADIUS_PX}
            className="fill-surface-raised stroke-annotation-human"
            strokeWidth={1.5}
            pointerEvents="none"
          />
        );
      })}
      {radiusScreen === null ? null : (
        <rect
          data-handle="radius"
          x={radiusScreen.x - RADIUS_HANDLE_PX}
          y={radiusScreen.y - RADIUS_HANDLE_PX}
          width={RADIUS_HANDLE_PX * 2}
          height={RADIUS_HANDLE_PX * 2}
          transform={`rotate(45 ${String(radiusScreen.x)} ${String(radiusScreen.y)})`}
          className="fill-surface-raised stroke-annotation-human"
          strokeWidth={1.5}
          pointerEvents="none"
        />
      )}
    </g>
  );
}
