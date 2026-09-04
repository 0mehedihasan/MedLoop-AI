/**
 * MedLoop AI — `tools/tool.ts`: the contract the three drawing tools implement.
 *
 * `AnnotationCanvas` owns pointer capture, the viewport and the history; it does **not** know how a
 * polygon differs from a box. Everything shape-specific lives behind this interface, which is why
 * adding a fourth annotation type means adding one file rather than editing a switch in four places.
 *
 * ## A tool is a reducer, not a component
 *
 * Every method is pure: draft in, draft out. Nothing here touches React state, the DOM, or the
 * server. The canvas holds the current {@link Draft} in `useState` and replaces it with whatever the
 * tool returns — so a gesture can be reasoned about, and tested, without a pointer.
 *
 * ## A click is not a failed drag
 *
 * `up()` returns `cancel` when the pointer never really moved (`POINT_EPSILON`), and `commit` when it
 * did. That distinction is the whole reason `POINT_EPSILON` sits below `MIN_EXTENT`: a stray click on
 * empty canvas is not an attempt to draw and must not raise "this box is too small", while a genuine
 * two-pixel drag *is* an attempt and deserves the explanation.
 *
 * ## Validation is not here
 *
 * A tool decides when a gesture is *over*. Whether the resulting shape is *legal* is decided once, by
 * `geometryProblem` in `geometry.ts`, at the canvas's commit site. Two validation sites would
 * eventually disagree.
 */

import { boxFromCorners, samePoint } from '../geometry';
import type { NormTolerance } from '../geometry';
import type { ShortcutAction } from '../shortcuts';
import type { AnnotationType, Box, Geometry, NormPoint } from '@/types/domain';

/** The three tools that produce geometry. `select` edits what already exists and draws nothing. */
export type DrawingToolId = 'box' | 'rounded' | 'polygon';

export type ToolId = 'select' | DrawingToolId;

/**
 * `drag` — press, move, release makes one shape; the canvas feeds `move` only while captured.
 * `click` — each press adds a corner and the canvas feeds `move` continuously for the rubber band.
 */
export type ToolGesture = 'drag' | 'click';

/**
 * A gesture in progress. Immutable, replaced wholesale on every step.
 *
 * `points` are the corners the annotator has committed with a press; `cursor` is where the pointer is
 * now. A box keeps one point and moves the cursor; a polygon accumulates points. Nothing in here is
 * ever persisted — a draft that is not committed leaves no trace.
 */
export interface Draft {
  readonly toolId: DrawingToolId;
  readonly points: readonly NormPoint[];
  readonly cursor: NormPoint;
}

/** What a tool step does to the gesture. */
export type ToolStep =
  /** Keep drawing with this draft. */
  | { readonly kind: 'draft'; readonly draft: Draft }
  /** The gesture is finished; hand the geometry to the canvas for validation and commit. */
  | { readonly kind: 'commit'; readonly geometry: Geometry }
  /** Nothing worth keeping — drop the draft silently, with no message. */
  | { readonly kind: 'cancel' };

export interface DrawingTool {
  readonly id: DrawingToolId;
  readonly type: AnnotationType;
  readonly gesture: ToolGesture;
  /** One line for the canvas status bar while this tool is active. */
  readonly hint: string;

  /** `pointerdown`. `draft` is `null` for the first press of a gesture. */
  readonly down: (
    draft: Draft | null,
    point: NormPoint,
    tolerance: NormTolerance,
  ) => ToolStep;
  /** `pointermove`. Always returns a draft: a move can never finish or abandon a gesture. */
  readonly move: (draft: Draft, point: NormPoint) => Draft;
  /** `pointerup`. */
  readonly up: (draft: Draft) => ToolStep;
  /** `Enter`, a double-click, or the explicit "close shape" control. */
  readonly close: (draft: Draft) => ToolStep;
  /** Whether {@link DrawingTool.close} would commit — drives the control's `disabled` state. */
  readonly canClose: (draft: Draft) => boolean;
  /**
   * What to draw right now. **Display only** — it may be a two-point "polygon" mid-gesture, which is
   * a correct rubber band and an illegal annotation. Never pass this to `commitGeometry`.
   */
  readonly preview: (draft: Draft) => Geometry | null;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The toolbar's view of a tool — no implementation, so this module stays importable from the
 * review feature without pulling three reducers into the bundle it renders.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface ToolDescriptor {
  readonly id: ToolId;
  readonly label: string;
  /** The row in `shortcuts.ts` that activates it. The button renders that key, never its own copy. */
  readonly action: ShortcutAction;
}

/** Declared in the order the skill's keyboard table lists them, so the chips read `1 2 3 V`. */
export const TOOL_DESCRIPTORS: readonly ToolDescriptor[] = [
  { id: 'box', label: 'Bounding box', action: 'tool-box' },
  { id: 'polygon', label: 'Polygon', action: 'tool-polygon' },
  { id: 'rounded', label: 'Rounded box', action: 'tool-rounded' },
  { id: 'select', label: 'Select', action: 'tool-select' },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Shared steps — each used by at least two tools
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export function startDraft(toolId: DrawingToolId, point: NormPoint): Draft {
  return { toolId, points: [point], cursor: point };
}

export function withCursor(draft: Draft, point: NormPoint): Draft {
  return { toolId: draft.toolId, points: draft.points, cursor: point };
}

export function withPoint(draft: Draft, point: NormPoint): Draft {
  return { toolId: draft.toolId, points: [...draft.points, point], cursor: point };
}

/**
 * True when the pointer never left the press — the gesture was a click. Both box-like tools use it to
 * cancel instead of committing a degenerate shape; see the header.
 */
export function isTap(draft: Draft): boolean {
  const anchor = draft.points[0];
  return anchor === undefined || samePoint(anchor, draft.cursor);
}

/** The box a two-corner drag describes, or `null` before the first point exists. */
export function draftBox(draft: Draft): Box | null {
  const anchor = draft.points[0];
  return anchor === undefined ? null : boxFromCorners(anchor, draft.cursor);
}

/**
 * The shared tail of both box-like tools: a tap cancels, anything else commits whatever `build`
 * makes of the two corners. The two tools differ only in that function.
 */
export function finishBoxDraft(draft: Draft, build: (box: Box) => Geometry): ToolStep {
  if (isTap(draft)) return { kind: 'cancel' };
  const box = draftBox(draft);
  if (box === null) return { kind: 'cancel' };
  return { kind: 'commit', geometry: build(box) };
}

