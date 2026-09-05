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

import { useCallback, useEffect, useId, useRef, useState } from 'react';
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
import type { ScreenPoint, Viewport } from './useViewport';
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

/** The select tool draws nothing, so it has no `DrawingTool.hint` of its own to render. */
const SELECT_HINT =
  'Drag a shape to move it, or a handle to resize. Space-drag or middle-drag pans; the wheel zooms.';

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

/**
 * Which gesture a press on the surface begins, with the select tool active.
 *
 * Order matters and is the order of *intent*: the radius grab point first because it is the smallest
 * target and sits inside the selected shape; then that shape's own handles or vertices; then any
 * shape's body, searched from the top of the document order down, so the shape drawn last — the one
 * visually on top — wins an overlap. `null` means empty space, which pans.
 *
 * The return type excludes `pan` deliberately: a press that hits nothing returns `null` and the
 * caller decides that empty space pans. Widening it to `Gesture` would only make every reader of the
 * result re-prove that a picked gesture has a `key`.
 */
function pickGesture(
  point: NormPoint,
  shapes: Snapshot,
  selected: CanvasShape | null,
  tolerance: NormTolerance,
  size: PixelSize,
): EditGesture | null {
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

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The component
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export function AnnotationCanvas({
  imageUrl,
  gradcamUrl,
  aiGeometry,
  shapes,
  onShapesChange,
  tool,
  onToolChange,
  selectedKey,
  onSelect,
  layers,
  gradcamOpacity,
  actions,
  onProblem,
  disabled = false,
  className,
}: AnnotationCanvasProps): ReactElement {
  const surfaceRef = useRef<SVGSVGElement | null>(null);
  const hintId = useId();
  const base = useBitmap(imageUrl);
  // Fetched whenever an artefact is claimed, even while the layer is hidden, so toggling it is
  // instant: one request for a layer the annotator may not open beats a wait when they do.
  const cam = useBitmap(gradcamUrl);
  // Destructured, because every callback below depends on one or two of these and not on the handle:
  // `useViewport` memoises each one, so a pan re-creates `panBy` and leaves `tolerance` alone.
  const {
    viewport,
    atFit,
    fromClient,
    tolerance,
    panBy,
    zoomAtClient,
    zoomByStep,
    reset: resetView,
  } = useViewport(surfaceRef, base.size);

  const [draft, setDraft] = useState<Draft | null>(null);
  /** The shape array as it looks mid-drag. It goes nowhere: on release it becomes one commit. */
  const [live, setLive] = useState<Snapshot | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const panRef = useRef<ScreenPoint | null>(null);
  const spaceRef = useRef(false);
  /** Which handle `Alt`+arrows resize from. The last one dragged, `se` until one has been. */
  const lastHandleRef = useRef<BoxHandle>('se');

  const rendered = live ?? shapes;
  const selected = rendered.find((shape) => shape.key === selectedKey) ?? null;
  const active = drawingTool(tool);

  // A tool switch, or a new image, abandons an unfinished outline. Keeping it would let a polygon
  // begun on the previous photograph be closed on this one.
  useEffect(() => {
    setDraft(null);
  }, [tool, imageUrl]);

  /* ── Commit sites. Every path into `onShapesChange` runs the validator first ───────────── */

  /**
   * Replaces one shape's geometry, or reports why it cannot be replaced.
   *
   * `commitGeometry` normalises (a negative-width drag becomes a positive box, a polygon loses its
   * duplicate points); `geometryProblem` then decides. A rejected edit is simply not committed, and
   * because `live` has already been dropped by the caller the shape snaps back to where it was —
   * with the validator's own sentence on screen, so the annotator knows why.
   */
  const applyGeometry = useCallback(
    (key: string, geometry: Geometry): void => {
      const clean = commitGeometry(geometry);
      const problem = geometryProblem(clean);
      if (problem !== null) {
        onProblem(problem);
        return;
      }
      onShapesChange(
        shapes.map((shape) => (shape.key === key ? { ...shape, geometry: clean } : shape)),
      );
    },
    [shapes, onProblem, onShapesChange],
  );

  /** Appends a newly drawn shape and selects it, so the handles are immediately grabbable. */
  const applyDrawn = useCallback(
    (geometry: Geometry): void => {
      const clean = commitGeometry(geometry);
      const problem = geometryProblem(clean);
      if (problem !== null) {
        onProblem(problem);
        return;
      }
      const shape: CanvasShape = {
        key: newShapeKey(),
        type: clean.type,
        geometry: clean,
        labelCode: null,
        savedId: null,
        origin: 'DRAWN',
      };
      onShapesChange([...shapes, shape]);
      onSelect(shape.key);
    },
    [shapes, onProblem, onShapesChange, onSelect],
  );

  /** Advances a drawing gesture: keep the draft, drop it, or drop it and commit. */
  const runStep = useCallback(
    (step: ToolStep): void => {
      if (step.kind === 'draft') {
        setDraft(step.draft);
        return;
      }
      setDraft(null);
      if (step.kind === 'commit') applyDrawn(step.geometry);
    },
    [applyDrawn],
  );

  /**
   * Ends an editing gesture — the single place a drag becomes history.
   *
   * `live` is dropped before the commit is attempted, so a rejected edit leaves the shape exactly
   * where it was rather than stranding the illegal preview on screen.
   */
  const endGesture = useCallback((): void => {
    const gesture = gestureRef.current;
    const edited = live;
    gestureRef.current = null;
    panRef.current = null;
    setLive(null);
    if (gesture === null || gesture.kind === 'pan' || edited === null) return;
    const shape = edited.find((candidate) => candidate.key === gesture.key);
    if (shape === undefined) return;
    applyGeometry(gesture.key, shape.geometry);
  }, [live, applyGeometry]);

  /* ── Pointer. One press decides the gesture; nothing re-decides it until release ────────── */

  const beginPan = (clientX: number, clientY: number): void => {
    gestureRef.current = { kind: 'pan' };
    panRef.current = { x: clientX, y: clientY };
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const size = base.size;
    if (disabled || size === null || viewport === null) return;
    // Right, back and forward buttons are the browser's. Left draws and edits; middle pans.
    if (event.button !== 0 && event.button !== 1) return;
    const point = fromClient(event.clientX, event.clientY);
    if (point === null) return;
    // Suppresses the native drag-image and text selection — and the default focus with them, which
    // is why focus is then moved explicitly. `setPointerCapture` keeps a drag that leaves the SVG.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();

    if (event.button === 1 || spaceRef.current) {
      beginPan(event.clientX, event.clientY);
      return;
    }
    if (active !== null) {
      runStep(active.down(draft, point, tolerance(HANDLE_GRAB_PX)));
      return;
    }
    const gesture = pickGesture(point, shapes, selected, tolerance(HANDLE_GRAB_PX), size);
    if (gesture === null) {
      if (selectedKey !== null) onSelect(null);
      beginPan(event.clientX, event.clientY);
      return;
    }
    // Remembered for `Alt`+arrows, so the keyboard resizes from the corner the pointer last used.
    if (gesture.kind === 'resize') lastHandleRef.current = gesture.handle;
    gestureRef.current = gesture;
    if (gesture.key !== selectedKey) onSelect(gesture.key);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const size = base.size;
    if (disabled || size === null) return;
    const gesture = gestureRef.current;

    if (gesture !== null && gesture.kind === 'pan') {
      const last = panRef.current;
      if (last === null) return;
      panRef.current = { x: event.clientX, y: event.clientY };
      // Client delta rather than image delta: a pan moves the view by the distance the finger moved,
      // whatever the zoom.
      panBy(event.clientX - last.x, event.clientY - last.y);
      return;
    }

    const point = fromClient(event.clientX, event.clientY);
    if (point === null) return;
    if (gesture !== null) {
      const geometry = editedGeometry(gesture, point, size);
      setLive(
        shapes.map((shape) => (shape.key === gesture.key ? { ...shape, geometry } : shape)),
      );
      return;
    }
    if (draft !== null && active !== null) setDraft(active.move(draft, point));
  };

  const releaseCapture = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    releaseCapture(event);
    if (gestureRef.current !== null) {
      endGesture();
      return;
    }
    // A click tool keeps its draft across the release; `up` is what decides that.
    if (draft !== null && active !== null) runStep(active.up(draft));
  };

  /** The pointer was taken away — by a system gesture, not by the annotator. Nothing is committed. */
  const handlePointerCancel = (event: ReactPointerEvent<SVGSVGElement>): void => {
    releaseCapture(event);
    gestureRef.current = null;
    panRef.current = null;
    setLive(null);
  };

  /** Closes a polygon. The tool's own `down` absorbs a second press on the last corner, so this
   * cannot also add a duplicate vertex. */
  const handleDoubleClick = (): void => {
    if (disabled || draft === null || active === null) return;
    runStep(active.close(draft));
  };

  /* ── Wheel. Native, because React's `onWheel` cannot preventDefault ─────────────────────── */

  useEffect(() => {
    const element = surfaceRef.current;
    if (element === null) return undefined;
    // React attaches `onWheel` at the root as a *passive* listener, so calling `preventDefault` from
    // it is ignored and warns — the page would scroll while the image zoomed. A native listener with
    // `passive: false` is the only way to own the gesture.
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      zoomAtClient(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event.clientX, event.clientY);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, [zoomAtClient]);

  /* ── Keyboard ───────────────────────────────────────────────────────────────────────────── */

  /**
   * An arrow key. Three behaviours, decided by the selection and by `Alt` — which is why the map
   * reports the modifiers instead of declaring eight more rows.
   *
   * With nothing selected the arrow pans, and it pans *against* itself: pressing `→` moves the image
   * left, because the annotator is asking to look further right.
   */
  const nudge = useCallback(
    (match: ShortcutMatch): boolean => {
      const direction = DIRECTIONS[match.action];
      if (direction === undefined) return false;
      if (selected === null) {
        const step = PAN_STEP_PX * (match.shift ? PAN_STEP_MULTIPLIER : 1);
        panBy(-direction.x * step, -direction.y * step);
        return true;
      }
      const step = match.shift ? NUDGE_STEP_LARGE : NUDGE_STEP;
      if (!match.alt) {
        applyGeometry(
          selected.key,
          translateGeometry(selected.geometry, direction.x * step, direction.y * step),
        );
        return true;
      }
      // Alt resizes. The handle is moved from where it currently is, so the gesture is the keyboard
      // equivalent of dragging it — including which edges stay put.
      const handle = lastHandleRef.current;
      const anchor = boxHandlePoints(deriveBoundingBox(selected.geometry)).find(
        (candidate) => candidate.kind === handle,
      );
      if (anchor === undefined) return false;
      applyGeometry(
        selected.key,
        resizeGeometry(selected.geometry, handle, {
          x: clamp01(anchor.point.x + direction.x * step),
          y: clamp01(anchor.point.y + direction.y * step),
        }),
      );
      return true;
    },
    [selected, panBy, applyGeometry],
  );

  /**
   * Runs one matched shortcut and reports whether it did anything.
   *
   * The boolean is the whole point: the caller prevents the default **only** on `true`, so `Enter`
   * still activates a focused button while no outline is open, `Escape` still reaches a dialog with
   * nothing selected, and `G` still types into a field the map has already declined to handle.
   */
  const runAction = useCallback(
    (match: ShortcutMatch): boolean => {
      switch (match.action) {
        case 'tool-box':
          onToolChange('box');
          return true;
        case 'tool-polygon':
          onToolChange('polygon');
          return true;
        case 'tool-rounded':
          onToolChange('rounded');
          return true;
        case 'tool-select':
          onToolChange('select');
          return true;

        case 'cancel':
          if (draft !== null) {
            setDraft(null);
            return true;
          }
          if (selectedKey !== null) {
            onSelect(null);
            return true;
          }
          return false;

        case 'close-polygon': {
          if (draft === null || active === null) return false;
          const step = active.close(draft);
          if (step.kind === 'cancel') {
            // Not closable yet. The draft stays open — the annotator's next click adds the point the
            // validator is asking for — and the message is the validator's own sentence.
            const problem = draftProblem(draft);
            if (problem !== null) onProblem(problem);
            return true;
          }
          runStep(step);
          return true;
        }

        case 'cycle-shape': {
          // The one action that requires the surface to be focused, and the one that reports `false`
          // at the ends of the list so focus can leave the canvas.
          if (document.activeElement !== surfaceRef.current) return false;
          const next = cycleSelection(shapes, selectedKey, match.shift);
          if (next === undefined) return false;
          onSelect(next);
          return true;
        }

        case 'delete-selected':
          if (selected === null) return false;
          // Saved or not is the feature's question — it may have to confirm and call the API.
          actions.remove(selected);
          return true;

        case 'clear-all':
          if (shapes.length === 0) return false;
          actions.clearAll();
          return true;

        case 'undo':
          actions.undo();
          return true;
        case 'redo':
          actions.redo();
          return true;

        case 'zoom-in':
          zoomByStep(ZOOM_STEP);
          return true;
        case 'zoom-out':
          zoomByStep(1 / ZOOM_STEP);
          return true;
        case 'fit':
          resetView();
          return true;
        case 'reset':
          // Fit *and* clear the selection, exactly as the map's own row says. Not the shapes.
          resetView();
          if (draft !== null) setDraft(null);
          if (selectedKey !== null) onSelect(null);
          return true;

        // A layer with no artefact is not hidden — it does not exist (§2.3). The key does nothing and
        // says so by returning `false`, rather than toggling a flag that cannot change the picture.
        case 'toggle-gradcam':
          if (gradcamUrl === null) return false;
          actions.toggleLayer('gradcam');
          return true;
        case 'toggle-ai-box':
          if (aiGeometry === null) return false;
          actions.toggleLayer('aiBox');
          return true;

        case 'submit':
          actions.submit();
          return true;
        case 'skip':
          actions.skip();
          return true;

        case 'move-left':
        case 'move-right':
        case 'move-up':
        case 'move-down':
          return nudge(match);

        default: {
          // Adding a `ShortcutAction` without handling it here is a compile error, which is the only
          // reliable way to keep the map and the behaviour in step.
          const exhaustive: never = match.action;
          return exhaustive;
        }
      }
    },
    [
      active,
      actions,
      aiGeometry,
      draft,
      gradcamUrl,
      nudge,
      onProblem,
      onSelect,
      onToolChange,
      resetView,
      runStep,
      selected,
      selectedKey,
      shapes,
      zoomByStep,
    ],
  );

  /**
   * The listener sits on `document`, not on the surface — see the header. `isTypingTarget` is what
   * makes that safe, and `runAction`'s boolean is what keeps `preventDefault` from over-reaching.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (disabled || isTypingTarget(event.target)) return;
      // Space is *held* to pan, so it is a modifier rather than a shortcut and is not in the map.
      // The default is prevented every time, because the alternative is the page scrolling under the
      // annotator's drag.
      if (event.key === ' ') {
        spaceRef.current = true;
        event.preventDefault();
        return;
      }
      const match = matchShortcut(event);
      if (match === null) return;
      if (runAction(match)) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === ' ') spaceRef.current = false;
    };
    // Leaving the window with Space held would otherwise arm a pan that outlives the keypress.
    const onBlur = (): void => {
      spaceRef.current = false;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [disabled, runAction]);

  /* ── Render. Document order *is* layer order (z1 … z6) ──────────────────────────────────── */

  const size = base.size;
  const ready = viewport !== null && size !== null;
  // Display only: mid-gesture this may be a two-point "polygon", which is a correct rubber band and
  // an illegal annotation. It never reaches `commitGeometry`.
  const preview = draft === null || active === null ? null : active.preview(draft);
  const zoom =
    viewport === null || atFit ? 'Fit' : `${String(Math.round(viewport.scale * 100))}%`;

  /**
   * The six layers, in document order — which *is* z-order inside an `<svg>`, because SVG has no
   * working `z-index`. Called rather than mounted: it is a fragment of this component, not a
   * component of its own, and it exists so `renderedRect` is computed once per render.
   */
  function renderLayers(view: Viewport, natural: PixelSize): ReactElement {
    const rect = renderedRect(view, natural);
    return (
      <>
        {/* z2 — the photograph. z1 is the frame's own dark backdrop, drawn by the wrapper div. */}
        {base.href === null ? null : (
          <image
            data-layer="image"
            href={base.href}
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            preserveAspectRatio="none"
            pointerEvents="none"
          />
        )}
        {/* z3 — attribution. Rendered only when an artefact really exists (§2.3). */}
        {layers.gradcam && cam.status === 'ready' && cam.href !== null ? (
          <GradCamOverlay href={cam.href} viewport={view} size={natural} opacity={gradcamOpacity} />
        ) : null}
        {/* z4 — the model's localisation, dashed and unfilled. */}
        {layers.aiBox && aiGeometry !== null ? (
          <AiBoxOverlay geometry={aiGeometry} viewport={view} size={natural} />
        ) : null}
        {/* z5 — the annotator's shapes, live copy while a drag is in flight. */}
        {layers.human ? (
          <HumanShapes
            shapes={rendered}
            viewport={view}
            size={natural}
            selectedKey={selectedKey}
          />
        ) : null}
        {/* z6 — handles, and the in-progress shape: dashed, human colour, not yet a record. */}
        {layers.human && selected !== null ? (
          <SelectionHandles geometry={selected.geometry} viewport={view} size={natural} />
        ) : null}
        {preview === null ? null : (
          <ShapeNode
            geometry={preview}
            viewport={view}
            size={natural}
            className="stroke-annotation-human fill-annotation-human/8"
            dash={DRAFT_DASH}
          />
        )}
      </>
    );
  }

  function cursorClass(): string {
    if (disabled) return 'cursor-not-allowed';
    if (spaceRef.current) return 'cursor-grab';
    return active === null ? 'cursor-default' : 'cursor-crosshair';
  }

  return (
    <div
      className={cx(
        'relative h-full w-full overflow-hidden rounded-md border border-edge bg-surface-canvas',
        className,
      )}
    >
      <svg
        ref={surfaceRef}
        // `application`, not `img`: the arrow keys mean something here, and a screen reader in browse
        // mode would otherwise consume them. The inspector's shape list is the accessible
        // representation of the shapes themselves.
        role="application"
        aria-label="Annotation canvas"
        aria-describedby={hintId}
        tabIndex={0}
        // No `viewBox`: user units are CSS pixels (see `useViewport`). `touch-none` hands every
        // pointer to us. The negative offset keeps the global focus ring inside a full-bleed surface
        // instead of clipped by it — the ring itself is `globals.css`'s and is never removed.
        className={cx(
          'h-full w-full touch-none select-none focus-visible:outline-offset-[-2px]',
          cursorClass(),
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onDoubleClick={handleDoubleClick}
      >
        {viewport === null || size === null ? null : renderLayers(viewport, size)}
      </svg>

      {/*
        The four states, in HTML rather than SVG text: they are prose, and prose belongs in elements a
        screen reader, a translator and a focus ring already understand. `missing` and `error` are kept
        apart on purpose — one means the file was never there, the other that we could not read it.
      */}
      {base.status === 'loading' || (base.status === 'ready' && !ready) ? (
        <div className="absolute inset-0 grid place-items-center">
          <Spinner label="Loading image" showLabel />
        </div>
      ) : null}

      {base.status === 'missing' ? (
        <div className="absolute inset-0 grid place-items-center p-6">
          <Unavailable
            variant="block"
            reason="This image is not in local storage. It may have been archived."
          />
        </div>
      ) : null}

      {base.status === 'error' ? (
        <div className="absolute inset-0 grid place-items-center p-6">
          <Alert
            tone="danger"
            title="The image could not be loaded"
            actions={
              <Button variant="secondary" size="sm" onClick={base.retry}>
                Try again
              </Button>
            }
          >
            {base.problem}
          </Alert>
        </div>
      ) : null}

      {/* A failed attribution map is a warning, not a blocker: the photograph is still reviewable. */}
      {layers.gradcam && cam.status === 'error' ? (
        <div className="absolute inset-x-3 top-3">
          <Alert tone="warn" title="The attribution map could not be loaded" live>
            {cam.problem}
          </Alert>
        </div>
      ) : null}

      {/*
        One line, always present, `pointer-events-none` so it can never intercept a gesture that
        reaches the bottom of the image. It is the surface's `aria-describedby`, so the same sentence
        a sighted annotator reads is the one a screen reader announces on focus.
      */}
      <p
        id={hintId}
        className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 border-t border-edge-subtle bg-surface-raised/85 px-3 py-1.5 text-xs text-content-muted"
      >
        <span>{active === null ? SELECT_HINT : active.hint}</span>
        <span className="tabular-nums">{zoom}</span>
      </p>
    </div>
  );
}
