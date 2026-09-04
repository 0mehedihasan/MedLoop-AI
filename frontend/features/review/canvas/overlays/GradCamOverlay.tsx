/**
 * MedLoop AI — `overlays/GradCamOverlay.tsx`: layer z3, the model's attribution map.
 *
 * The most dangerous component in the canvas, so it is the most constrained one.
 *
 * ## It renders only when an artefact exists
 *
 * No `gradcam_url` means the view is removed from the switcher, not rendered empty (§2.3). This is not
 * a defensive nicety: an all-zero gradient upsampled to the frame draws a smooth, plausible, entirely
 * meaningless blob, and a reviewer cannot tell it from a real attribution. There is no trained model in
 * MedLoop AI today, so "no artefact" is the *normal* state and the empty path must not be reachable.
 *
 * ## Opacity is clamped and never persisted
 *
 * `0.45` by default, `0.2 … 0.8` by slider — the skill's numbers. Clamped here as well as at the
 * control, because a value outside the range either hides the photograph or hides the heat-map, and
 * both make the overlay lie about what the annotator is looking at. Opacity is a render property: it is
 * never stored with a geometry and never enters a metric.
 *
 * ## Drawn without smoothing
 *
 * A CAM is computed on a coarse feature map. Letting the browser interpolate it to 8× invents spatial
 * precision the model never had, so the artefact is painted at its own resolution. If the backend
 * upsamples before saving the PNG, this setting changes nothing — which is the right failure mode.
 *
 * ## Same rectangle as the photograph, to the pixel
 *
 * Both layers read {@link renderedRect}. A heat-map offset from its image is an attribution error.
 */

import type { ReactElement } from 'react';

import { renderedRect } from '../useViewport';
import type { Viewport } from '../useViewport';
import { clamp } from '../geometry';
import type { PixelSize } from '@/types/domain';

export const GRADCAM_DEFAULT_OPACITY = 0.45;
export const GRADCAM_MIN_OPACITY = 0.2;
export const GRADCAM_MAX_OPACITY = 0.8;

export interface GradCamOverlayProps {
  /** Blob URL from `useBitmap`. The component is not rendered at all when there is no artefact. */
  readonly href: string;
  readonly viewport: Viewport;
  readonly size: PixelSize;
  readonly opacity: number;
}

export function GradCamOverlay({
  href,
  viewport,
  size,
  opacity,
}: GradCamOverlayProps): ReactElement {
  const rect = renderedRect(viewport, size);
  return (
    <g data-layer="gradcam">
      <image
        href={href}
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        opacity={clamp(opacity, GRADCAM_MIN_OPACITY, GRADCAM_MAX_OPACITY)}
        // `none` because the rectangle is already the image's own aspect ratio; letting SVG letterbox
        // it a second time would shift the map off the photograph.
        preserveAspectRatio="none"
        imageRendering="pixelated"
        pointerEvents="none"
      />
    </g>
  );
}
