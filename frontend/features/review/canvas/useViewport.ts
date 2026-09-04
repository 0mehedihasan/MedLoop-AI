'use client';

/**
 * MedLoop AI — `useViewport`: zoom, pan, fit, and the screen ↔ image conversion.
 *
 * The transform is the one the skill specifies, and it is worth writing out because everything else
 * in the canvas depends on reading it the same way:
 *
 * ```text
 * screen = image_px * scale + t          image_px = norm * natural
 * ```
 *
 * So `scale` is **screen pixels per image pixel** and `tx`/`ty` are the top-left of the rendered
 * bitmap inside the surface. That choice is why the overlay `<svg>` carries no `viewBox`: its user
 * units are CSS pixels, `stroke-width="1"` is one device-independent pixel at every zoom level, and
 * a handle's 6 px grab radius is 6 px whether the image is fitted or at 8×.
 *
 * ## Fit is the initial state of every image, and a resize returns to it
 *
 * `fit = min(frameW / imgW, frameH / imgH)`, centred. The view refits whenever the image or the
 * frame changes size. Preserving a transform across a frame resize is possible but leaves the image
 * partly or wholly outside the new frame, and "my annotation vanished when I opened the inspector"
 * is a worse outcome than losing a zoom level.
 *
 * ## Pan leaves no gutter
 *
 * When the rendered bitmap is larger than the frame in an axis, its edges are clamped so they cannot
 * come inside the frame. When it is smaller — which is every axis at fit — it is centred and cannot
 * be panned at all. This is stricter than the skill's "cannot leave the frame entirely" and simpler
 * to reason about: there is exactly one legal position for a small image.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { clamp01 } from './geometry';
import type { NormTolerance } from './geometry';
import type { Box, NormPoint, PixelSize } from '@/types/domain';

/** `screen = image_px * scale + t`. Never persisted: a viewport is not part of an annotation. */
export interface Viewport {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

export interface FrameSize {
  readonly w: number;
  readonly h: number;
}

/**
 * Absolute upper bound on `scale`: eight screen pixels per image pixel, at which individual pixels
 * of a smartphone photograph are plainly visible and there is nothing further to see.
 *
 * Raised to `fit` when a small image is *already* displayed at more than 8× by fitting, because a
 * clamp whose upper bound is below its lower bound has no legal values at all.
 */
export const MAX_SCALE = 8;

/** One wheel notch or one `+`/`−` press. 1.2 needs ~9 steps to cross fit → 8×, which reads as smooth. */
export const ZOOM_STEP = 1.2;

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Pure conversions — exported for the overlays, which render in screen units
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScreenBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function toScreen(point: NormPoint, viewport: Viewport, size: PixelSize): ScreenPoint {
  return {
    x: point.x * size.w * viewport.scale + viewport.tx,
    y: point.y * size.h * viewport.scale + viewport.ty,
  };
}

/** Clamped to `[0,1]`: a pointer outside the bitmap still produces a legal coordinate (§4.3). */
export function toImage(point: ScreenPoint, viewport: Viewport, size: PixelSize): NormPoint {
  return {
    x: clamp01((point.x - viewport.tx) / (viewport.scale * size.w)),
    y: clamp01((point.y - viewport.ty) / (viewport.scale * size.h)),
  };
}

export function toScreenBox(box: Box, viewport: Viewport, size: PixelSize): ScreenBox {
  const origin = toScreen({ x: box.x, y: box.y }, viewport, size);
  return {
    x: origin.x,
    y: origin.y,
    w: box.w * size.w * viewport.scale,
    h: box.h * size.h * viewport.scale,
  };
}

/**
 * Where the bitmap actually sits in the surface, in CSS pixels. The base image layer and the Grad-CAM
 * layer must agree on this to the pixel — a heat-map half a pixel off its photograph is an attribution
 * error, not a rendering quirk — so both read it from here.
 */
export function renderedRect(viewport: Viewport, size: PixelSize): ScreenBox {
  return {
    x: viewport.tx,
    y: viewport.ty,
    w: size.w * viewport.scale,
    h: size.h * viewport.scale,
  };
}

export function fitScale(frame: FrameSize, size: PixelSize): number {
  if (size.w <= 0 || size.h <= 0) return 1;
  return Math.min(frame.w / size.w, frame.h / size.h);
}

/** Fit, centred. The initial viewport for every image and the target of `0` / reset. */
export function fitViewport(frame: FrameSize, size: PixelSize): Viewport {
  const scale = fitScale(frame, size);
  return {
    scale,
    tx: (frame.w - size.w * scale) / 2,
    ty: (frame.h - size.h * scale) / 2,
  };
}

/**
 * The one place a translation is made legal: no gutter when the bitmap is larger than the frame,
 * centred when it is smaller. Applied after every zoom and every pan, so no other function has to
 * remember to.
 */
function clampTranslation(viewport: Viewport, frame: FrameSize, size: PixelSize): Viewport {
  const rendered = { w: size.w * viewport.scale, h: size.h * viewport.scale };
  const tx =
    rendered.w <= frame.w
      ? (frame.w - rendered.w) / 2
      : Math.min(0, Math.max(frame.w - rendered.w, viewport.tx));
  const ty =
    rendered.h <= frame.h
      ? (frame.h - rendered.h) / 2
      : Math.min(0, Math.max(frame.h - rendered.h, viewport.ty));
  return { scale: viewport.scale, tx, ty };
}

function clampScale(scale: number, frame: FrameSize, size: PixelSize): number {
  const lower = fitScale(frame, size);
  const upper = Math.max(MAX_SCALE, lower);
  return Math.min(Math.max(scale, lower), upper);
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The hook
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface ViewportHandle {
  /** `null` until both the frame and the bitmap have been measured. Overlays render nothing then. */
  readonly viewport: Viewport | null;
  readonly frame: FrameSize | null;
  readonly atFit: boolean;
  /** A pointer event's client coordinates as a normalised image point. */
  readonly fromClient: (clientX: number, clientY: number) => NormPoint | null;
  /** A screen-pixel grab radius in normalised units — divided by `scale`, per axis. */
  readonly tolerance: (pixels: number) => NormTolerance;
  /** Zoom anchored on a client point, so the pixel under the cursor stays under the cursor. */
  readonly zoomAtClient: (factor: number, clientX: number, clientY: number) => void;
  /** Zoom anchored on the centre of the frame — the keyboard path, which has no cursor. */
  readonly zoomByStep: (factor: number) => void;
  readonly panBy: (dx: number, dy: number) => void;
  readonly reset: () => void;
}

export function useViewport(
  surfaceRef: RefObject<SVGSVGElement | null>,
  size: PixelSize | null,
): ViewportHandle {
  const [frame, setFrame] = useState<FrameSize | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);

  // Measured, not read from a prop: the surface is sized by the grid around it, and the inspector
  // column opening is a resize the canvas has to notice.
  useEffect(() => {
    const element = surfaceRef.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      setFrame((current) =>
        current !== null && current.w === width && current.h === height
          ? current
          : { w: width, h: height },
      );
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [surfaceRef]);

  /**
   * Refit when the image or the frame changes size — and only then. Keying on the four numbers
   * rather than on object identity means a re-render that produces an equal `size` object does not
   * throw away the annotator's zoom.
   */
  const refitKey =
    frame === null || size === null ? null : `${frame.w}×${frame.h}|${size.w}×${size.h}`;
  const lastRefit = useRef<string | null>(null);

  useEffect(() => {
    if (refitKey === null || frame === null || size === null) return;
    if (lastRefit.current === refitKey) return;
    lastRefit.current = refitKey;
    setViewport(fitViewport(frame, size));
  }, [refitKey, frame, size]);

  const fromClient = useCallback(
    (clientX: number, clientY: number): NormPoint | null => {
      const element = surfaceRef.current;
      if (element === null || viewport === null || size === null) return null;
      const rect = element.getBoundingClientRect();
      return toImage({ x: clientX - rect.left, y: clientY - rect.top }, viewport, size);
    },
    [surfaceRef, viewport, size],
  );

  const tolerance = useCallback(
    (pixels: number): NormTolerance => {
      if (viewport === null || size === null) return { x: 0, y: 0 };
      return {
        x: pixels / (viewport.scale * size.w),
        y: pixels / (viewport.scale * size.h),
      };
    },
    [viewport, size],
  );

  /** Zoom about a point already in surface coordinates: `t₂ = a − (a − t₁) · s₂/s₁`. */
  const zoomAbout = useCallback(
    (factor: number, anchor: ScreenPoint): void => {
      if (frame === null || size === null) return;
      setViewport((current) => {
        if (current === null) return current;
        const scale = clampScale(current.scale * factor, frame, size);
        if (scale === current.scale) return current;
        const ratio = scale / current.scale;
        return clampTranslation(
          {
            scale,
            tx: anchor.x - (anchor.x - current.tx) * ratio,
            ty: anchor.y - (anchor.y - current.ty) * ratio,
          },
          frame,
          size,
        );
      });
    },
    [frame, size],
  );

  const zoomAtClient = useCallback(
    (factor: number, clientX: number, clientY: number): void => {
      const element = surfaceRef.current;
      if (element === null) return;
      const rect = element.getBoundingClientRect();
      zoomAbout(factor, { x: clientX - rect.left, y: clientY - rect.top });
    },
    [surfaceRef, zoomAbout],
  );

  const zoomByStep = useCallback(
    (factor: number): void => {
      if (frame === null) return;
      zoomAbout(factor, { x: frame.w / 2, y: frame.h / 2 });
    },
    [frame, zoomAbout],
  );

  const panBy = useCallback(
    (dx: number, dy: number): void => {
      if (frame === null || size === null) return;
      setViewport((current) =>
        current === null
          ? current
          : clampTranslation(
              { scale: current.scale, tx: current.tx + dx, ty: current.ty + dy },
              frame,
              size,
            ),
      );
    },
    [frame, size],
  );

  const reset = useCallback((): void => {
    if (frame === null || size === null) return;
    setViewport(fitViewport(frame, size));
  }, [frame, size]);

  // Compared with a tolerance, not with `===`: `fitScale` is a division, and a zoom in followed by a
  // zoom out lands a float's-breadth away from where it started.
  const atFit =
    viewport === null || frame === null || size === null
      ? true
      : Math.abs(viewport.scale - fitScale(frame, size)) < 1e-6;

  return useMemo<ViewportHandle>(
    () => ({
      viewport,
      frame,
      atFit,
      fromClient,
      tolerance,
      zoomAtClient,
      zoomByStep,
      panBy,
      reset,
    }),
    [viewport, frame, atFit, fromClient, tolerance, zoomAtClient, zoomByStep, panBy, reset],
  );
}
