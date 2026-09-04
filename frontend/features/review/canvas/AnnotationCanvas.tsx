'use client';

/**
 * MedLoop AI — `AnnotationCanvas`: the six layers, the pointer and the keyboard, in one component.
 *
 * Everything else under `canvas/` is a pure function or a hook. This is the only file with state,
 * listeners and a DOM, so it is where the layers, the gestures and the shortcut map meet — and
 * deliberately the *only* such file, because a second component that also hit-tested or also
 * committed to history would be a second, disagreeing answer to the same question.
 *
 * ## Controlled, not self-governing
 *
 * Shapes, selection, active tool and layer visibility arrive as props and leave as callbacks. The
 * skill requires layer visibility to live in the review feature "so the keyboard map, the switcher
 * and the URL can all drive it", and the same argument covers the rest: the inspector's shape list
 * selects, the toolbar switches tools, and the queue owns history because history must die with the
 * image. The canvas contributes gestures, not authority.
 *
 * ## One history entry per completed gesture
 *
 * A drag mutates a local `live` copy of the shape array and renders that; `onShapesChange` fires
 * once, on release. A 300-event drag is one undo step. The same rule makes a keyboard nudge one
 * entry — a keypress *is* a completed gesture.
 *
 * ## No `viewBox`, and no `z-index`
 *
 * SVG user units are CSS pixels (see `useViewport`), so `strokeWidth={1}` is one pixel at fit and at
 * 8× and a 6 px grab radius is 6 px everywhere. Layer order is *document* order, because SVG has no
 * working `z-index`: the `z-*` scale in `tailwind.config.ts` names this order but cannot enforce it,
 * and the `data-layer` attributes are the part a test can read.
 *
 * ## Hit testing never touches the DOM
 *
 * Every overlay is `pointer-events: none` and every hit test runs in `geometry.ts`, in normalised
 * space, against the model. That is what lets an occluded shape stay selectable, lets `Tab` select
 * with no pointer at all, and stops the browser producing a second answer that disagrees with ours.
 *
 * ## Keys are bound to the document, not to the surface
 *
 * An annotator draws, types a note, then submits; hunting for canvas focus in between is not work.
 * So the shortcut listener sits on `document`, guarded by `isTypingTarget` so it never eats a
 * character, and each action reports whether it did anything — only then is the default prevented,
 * which is what keeps plain `Enter` working on a focused button when no outline is open.
 *
 * `Tab` is the one action that requires surface focus: it cycles shapes, and falls through to the
 * browser at either end of the list, because a canvas that swallows `Tab` is a keyboard trap.
 *
 * ## Destructive keys leave here immediately
 *
 * `clear-all`, `skip`, and a delete that would archive an already-saved annotation are routed to the
 * feature unchanged. The canvas renders no dialog: a confirmation belongs where the request is made.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';

import {
  boxHandlePoints,
  clamp01,
  commitGeometry,
  dedupePoints,
  deriveBoundingBox,
  geometryPoints,
  geometryProblem,
  hitGeometry,
  hitHandle,
  hitVertex,
  movePolygonVertex,
  nearPoint,
  radiusFromPoint,
  radiusHandlePoint,
  resizeGeometry,
  toPointPairs,
  translateGeometry,
} from './geometry';
import type { BoxHandle, NormTolerance } from './geometry';
import { isTypingTarget, matchShortcut } from './shortcuts';
import type { ShortcutAction, ShortcutMatch } from './shortcuts';
import { boxTool } from './tools/boxTool';
import { polygonTool } from './tools/polygonTool';
import { roundedBoxTool } from './tools/roundedBoxTool';
import type { Draft, DrawingTool, DrawingToolId, ToolId, ToolStep } from './tools/tool';
import { newShapeKey } from './useAnnotationHistory';
import type { CanvasShape, Snapshot } from './useAnnotationHistory';
import { useBitmap } from './useBitmap';
import { renderedRect, useViewport, ZOOM_STEP } from './useViewport';
import type { ScreenPoint } from './useViewport';
import { AiBoxOverlay } from './overlays/AiBoxOverlay';
import { GradCamOverlay } from './overlays/GradCamOverlay';
import { HumanShapes } from './overlays/HumanShapes';
import { HANDLE_GRAB_PX, SelectionHandles } from './overlays/SelectionHandles';
import { ShapeNode } from './overlays/ShapeNode';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { cx } from '@/components/ui/cx';
import { Unavailable } from '@/components/ui/states';
import { AnnotationType } from '@/types/domain';
import type { Geometry, NormPoint, PixelSize } from '@/types/domain';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Interaction constants
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** Arrow-key nudge as a fraction of the image — the skill's 0.5 %, and 5 % with Shift. */
export const NUDGE_STEP = 0.005;
export const NUDGE_STEP_LARGE = 0.05;

/**
 * Arrow-key pan with nothing selected, in CSS pixels. Screen pixels rather than a fraction of the
 * image, because a pan is a movement of the *view*: at 8× a fraction of the image would throw the
 * lesion off the frame in two presses.
 */
const PAN_STEP_PX = 32;
const PAN_STEP_MULTIPLIER = 5;

/** The in-progress shape is dashed in the human colour: same annotation, not yet a record. */
const DRAFT_DASH = '4 3';

const DRAWING_TOOLS: Readonly<Record<DrawingToolId, DrawingTool>> = {
  box: boxTool,
  polygon: polygonTool,
  rounded: roundedBoxTool,
};

function drawingTool(tool: ToolId): DrawingTool | null {
  return tool === 'select' ? null : DRAWING_TOOLS[tool];
}

/** Arrow directions in image space: `y` grows downward (§4.3). */
const DIRECTIONS: Partial<Record<ShortcutAction, NormPoint>> = {
  'move-left': { x: -1, y: 0 },
  'move-right': { x: 1, y: 0 },
  'move-up': { x: 0, y: -1 },
  'move-down': { x: 0, y: 1 },
};

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Props
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Which layers are drawn. Owned by the review feature so the switcher, the keyboard map and the URL
 * can all set it; the canvas only reads it. `gradcam` and `aiBox` being *true* is not enough to draw
 * them — the artefact has to exist (§2.3).
 */
export interface LayerVisibility {
  readonly gradcam: boolean;
  readonly aiBox: boolean;
  readonly human: boolean;
}

/** Everything the canvas can ask the feature to do. Grouped so the props list stays readable. */
export interface CanvasActions {
  readonly undo: () => void;
  readonly redo: () => void;
  readonly submit: () => void;
  readonly skip: () => void;
  readonly clearAll: () => void;
  readonly toggleLayer: (layer: keyof LayerVisibility) => void;
  /**
   * Unsaved shape → discard it, undoably. Saved shape → the feature confirms and archives the
   * `annotations` row server-side. The canvas does not know which, and must not decide.
   */
  readonly remove: (shape: CanvasShape) => void;
}

export interface AnnotationCanvasProps {
  /** Byte endpoint for the photograph. Fetched with the session token by `useBitmap`. */
  readonly imageUrl: string;
  /** Byte endpoint for the attribution map, or `null` when no artefact exists (§2.3). */
  readonly gradcamUrl: string | null;
  /** The model's own localisation, or `null` — which is the normal case while no model exists. */
  readonly aiGeometry: Geometry | null;
  readonly shapes: Snapshot;
  /** Called once per completed gesture, never per `pointermove`. */
  readonly onShapesChange: (shapes: Snapshot) => void;
  readonly tool: ToolId;
  readonly onToolChange: (tool: ToolId) => void;
  readonly selectedKey: string | null;
  readonly onSelect: (key: string | null) => void;
  readonly layers: LayerVisibility;
  readonly gradcamOpacity: number;
  readonly actions: CanvasActions;
  /** A gesture produced an illegal shape. The message is the validator's own, never a paraphrase. */
  readonly onProblem: (message: string) => void;
  /** Blocks every gesture — while a submit is in flight, or the queue is between images. */
  readonly disabled?: boolean;
  readonly className?: string;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Gestures — a pointer press decides which one, and it does not change until release
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Each editing gesture carries the geometry as it was at press time, so every `pointermove` is an
 * *absolute* function of the pointer position. Applying a delta to the live geometry instead makes a
 * resize compound its own rounding, and makes a drag through the opposite edge flip repeatedly.
 */
type Gesture =
  | { readonly kind: 'pan' }
  | {
      readonly kind: 'move';
      readonly key: string;
      readonly start: Geometry;
      readonly origin: NormPoint;
    }
  | { readonly kind: 'resize'; readonly key: string; readonly start: Geometry; readonly handle: BoxHandle }
  | { readonly kind: 'vertex'; readonly key: string; readonly start: Geometry; readonly index: number }
  | { readonly kind: 'radius'; readonly key: string; readonly start: Geometry };

type EditGesture = Exclude<Gesture, { readonly kind: 'pan' }>;

function editedGeometry(gesture: EditGesture, point: NormPoint, size: PixelSize): Geometry {
  switch (gesture.kind) {
    case 'move':
      return translateGeometry(
        gesture.start,
        point.x - gesture.origin.x,
        point.y - gesture.origin.y,
      );
    case 'resize':
      return resizeGeometry(gesture.start, gesture.handle, point);
    case 'vertex':
      return movePolygonVertex(gesture.start, gesture.index, point);
    case 'radius':
      return gesture.start.type === AnnotationType.ROUNDED_BOX
        ? { ...gesture.start, r: radiusFromPoint(gesture.start, point, size) }
        : gesture.start;
  }
}

/* PLACEHOLDER_TAIL */

/**
 * Which gesture a press on the surface begins, with the select tool active.
 *
 * Order matters and is the order of *intent*: the radius grab point first because it is the smallest
 * target and sits inside the selected shape; then that shape's own handles or vertices; then any
 * shape's body, searched from the top of the document order down, so the shape drawn last — the one
 * visually on top — wins an overlap. `null` means empty space, which pans.
 */
function pickGesture(
  point: NormPoint,
  shapes: Snapshot,
  selected: CanvasShape | null,
  tolerance: NormTolerance,
  size: PixelSize,
): Gesture | null {
  if (selected !== null) {
    const start = selected.geometry;
    const radius = radiusHandlePoint(start, size);
    if (radius !== null && nearPoint(point, radius, tolerance)) {
      return { kind: 'radius', key: selected.key, start };
    }
    if (start.type === AnnotationType.POLYGON) {
      const index = hitVertex(geometryPoints(start), point, tolerance);
      if (index !== null) return { kind: 'vertex', key: selected.key, start, index };
    } else {
      const handle = hitHandle(deriveBoundingBox(start), point, tolerance);
      if (handle !== null) return { kind: 'resize', key: selected.key, start, handle };
    }
  }
  for (let index = shapes.length - 1; index >= 0; index -= 1) {
    const shape = shapes[index];
    if (shape !== undefined && hitGeometry(shape.geometry, point, tolerance)) {
      return { kind: 'move', key: shape.key, start: shape.geometry, origin: point };
    }
  }
  return null;
}

/**
 * The next selection for `Tab`, or `undefined` to let the browser move focus instead.
 *
 * Falling through at both ends is what keeps the canvas from being a keyboard trap: tab in, walk the
 * shapes, tab out. `Shift+Tab` with nothing selected leaves immediately, because the annotator is on
 * their way back to the toolbar.
 */
function cycleSelection(
  shapes: Snapshot,
  selectedKey: string | null,
  backwards: boolean,
): string | undefined {
  if (shapes.length === 0) return undefined;
  const index = shapes.findIndex((shape) => shape.key === selectedKey);
  if (index === -1) return backwards ? undefined : shapes[0]?.key;
  const next = backwards ? index - 1 : index + 1;
  if (next < 0 || next >= shapes.length) return undefined;
  return shapes[next]?.key;
}

/** The validator's own words for an outline that cannot be closed yet — never a second copy. */
function draftProblem(draft: Draft): string | null {
  const points = dedupePoints(draft.points);
  if (points.length === 0) return null;
  return geometryProblem(
    commitGeometry({ type: AnnotationType.POLYGON, points: toPointPairs(points) }),
  );
}

/* PLACEHOLDER_TAIL */
