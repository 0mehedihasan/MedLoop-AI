# Annotation workflow

Scope: the review canvas — the three annotation tools, the normalised coordinate contract, the
interaction and keyboard model, and exactly what is sent to the API.

See also: [hitl_workflow](./hitl_workflow.md) · [frontend](./frontend.md) · [database](./database.md) · [ml_pipeline](./ml_pipeline.md) · [api_contract](./api_contract.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §4.3 (coordinates), §6.1 (submit), §11.2 (frontend), §11.5 (SVG, no Konva).

The canvas is **SVG + pointer events** — no Konva, no drawing library. Exact normalised-coordinate
control and a keyboard path for every action are hard requirements, and both are easier to guarantee
in one file of our own than through a wrapper (CLAUDE.md §11.5).

## The three tools

| Tool | `AnnotationType` | Gesture | Use |
| --- | --- | --- | --- |
| Box | `BOUNDING_BOX` | press → drag → release | the default; axis-aligned extent of a lesion |
| Rounded box | `ROUNDED_BOX` | same, then drag the corner-radius handle | round lesions whose square hull would include a lot of skin |
| Polygon | `POLYGON` | click each vertex, `Enter` or click the first point to close | irregular borders |

There is no free-hand brush and no segmentation mask in v1 — the model is a classifier and the AI
region is a coarse box, so a pixel mask would suggest a precision nothing downstream can use.

## Coordinate contract

All geometry is normalised to `[0, 1]` against the **original** image width and height, origin
top-left, `x` to the right, `y` down. Human shapes and AI localisation use the same convention, which
is what makes IoU between them meaningful (CLAUDE.md §4.3).

```jsonc
// annotations.geometry — the stored payload, one shape per row
{ "x": 0.312, "y": 0.208, "w": 0.245, "h": 0.180 }                    // BOUNDING_BOX
{ "x": 0.312, "y": 0.208, "w": 0.245, "h": 0.180, "r": 0.25 }         // ROUNDED_BOX
{ "points": [[0.31, 0.21], [0.55, 0.24], [0.49, 0.41]] }              // POLYGON
```

| Rule | Detail |
| --- | --- |
| Never pixels | the viewer zooms, pans and re-fits on resize; a pixel value would silently rot |
| Denominator | `images.original_width` / `original_height`, not the rendered element size |
| `r` | normalised against `min(w, h)`, `0 ≤ r ≤ 0.5` — so `r = 0.5` is a stadium, not a 1000 px radius |
| Polygon | `≥ 3` points, implicitly closed; no duplicate closing point |
| Derived box | `ROUNDED_BOX` and `POLYGON` both expose an axis-aligned hull so the localisation metric has a single definition |

Nothing in the payload records zoom, pan or display size. Those are view state and are deliberately
not persisted.

## Viewer transform

One transform, computed once per render in `lib/geometry.ts`, used by every shape and every hit test.

```ts
export interface Size   { w: number; h: number }
export interface View   { scale: number; originX: number; originY: number }   // container px
export function fitView(image: Size, container: Size, zoom: number, pan: Point): View;
export function toNorm(p: Point, v: View, image: Size): Point;   // screen → [0,1], clamped
export function toScreen(n: Point, v: View, image: Size): Point;  // [0,1] → screen
export function hull(g: Geometry): BoxNorm;                       // derived AABB, for IoU
```

```text
fit    = min(container.w / image.w, container.h / image.h)      # contain, never crop
scale  = fit × zoom                                            # zoom ∈ [1, 8], 1 = fit
originX = (container.w − image.w × scale) / 2 + pan.x           # centred, then panned
nx     = (sx − originX) / (image.w × scale)                     # screen → normalised
sx     = originX + nx × image.w × scale                         # normalised → screen
```

### Worked example (illustrative numbers)

| Quantity | At `zoom = 1` | At `zoom = 2` |
| --- | --- | --- |
| Original image | 3000 × 2000 px | 3000 × 2000 px |
| Container | 900 × 600 px | 900 × 600 px |
| `fit` / `scale` | 0.3 / 0.3 | 0.3 / 0.6 |
| Rendered | 900 × 600 | 1800 × 1200 |
| `origin` (pan 0) | (0, 0) | (−450, −300) |
| Pointer (270, 120) → normalised | (0.300, 0.200) | (0.400, 0.350) |
| Same point in image px | (900, 400) | (1200, 700) |
| Normalised 0.300 → screen `x` | 270 | 90 |

The same normalised value renders at a different pixel in each column — which is the whole reason the
stored number is the normalised one. Round-tripping `toNorm → toScreen` is stable because the stored
value keeps full double precision; the display value is rounded, the payload never is.

| View concern | Decision |
| --- | --- |
| Zoom | pointer-anchored, `1…8`, `+`/`−` keys or `Ctrl`/`⌘` + wheel; wheel alone scrolls the page |
| Pan | space-drag or middle-drag; arrow keys nudge when no shape is selected |
| Reset | `0` returns to fit-and-centre |
| Resize | `ResizeObserver` recomputes `View` only — shapes are untouched |
| Rotation | not supported; it would add an orientation term to every stored payload for no clinical gain |

## Interaction verbs and keyboard bindings

Every verb has a keyboard path (CLAUDE.md §11.2). The SVG surface is focusable, exposes
`role="application"` with an `aria-label` naming the image, and announces shape count changes in a
polite live region.

| Verb | Pointer | Keyboard |
| --- | --- | --- |
| Choose tool | tool palette buttons | `1` box · `2` rounded box · `3` polygon |
| Draw | press–drag–release (box), click vertices (polygon) | `Enter` starts a shape at the caret, arrows size it, `Enter` commits |
| Close polygon | click the first vertex | `Enter` |
| Cancel the shape in progress | — | `Esc` |
| Select / cycle shapes | click a shape | `Tab` / `Shift`+`Tab` |
| Move selection | drag the body | arrows (1 px), `Shift`+arrows (10 px) |
| Resize selection | drag one of 8 handles | `Alt`+arrows on the active edge |
| Move a polygon vertex | drag the vertex | `Tab` to the vertex, then arrows |
| Add / remove a vertex | double-click an edge / right-click a vertex | `Ctrl`+`Enter` / `Ctrl`+`Backspace` |
| Adjust corner radius | drag the radius handle | `[` / `]` |
| Delete selection | — | `Delete` or `Backspace` |
| Per-shape label | inspector select | focus the shape, then the label combobox |
| Undo / redo | — | `⌘`/`Ctrl`+`Z` / `⌘`/`Ctrl`+`Shift`+`Z` |
| Zoom / reset | wheel with `⌘`/`Ctrl` | `+` / `−` / `0` |
| Submit | Submit button | `⌘`/`Ctrl`+`Enter` |

Skip has no bare-key binding on purpose: it opens the `SkipReason` dialog, which cannot be dismissed
into a submission. Navigating away with uncommitted shapes raises a `ConfirmDialog`.

Pointer nudges are computed in normalised space: 1 screen px is `1 / (image.w × scale)`, so a nudge is
finer when zoomed in — the same key does the right thing at every zoom level.

## Undo / redo

The canvas is the one place in the app with a reducer instead of `useState` (CLAUDE.md §11.4).

```ts
// features/review/canvas-reducer.ts
type Shape  = { id: string; type: AnnotationType; geometry: Geometry; labelCode?: string };
type Doc    = { shapes: Shape[]; selectedId: string | null };
type State  = { past: Doc[]; present: Doc; future: Doc[] };   // past capped at 50 entries
type Action = { type: 'ADD' | 'UPDATE' | 'DELETE' | 'SELECT' | 'UNDO' | 'REDO' | 'RESET'; … };
```

| Rule | Detail |
| --- | --- |
| One entry per completed gesture | a 40-event drag is one undo step, not forty |
| `SELECT` is not undoable | selection changes `present` without pushing to `past` |
| Redo is cleared by an edit | standard linear history; no branching |
| `RESET` on image advance | the stack never spans two images |
| Nothing crosses a submit | after `201` the document is discarded; corrections go through `POST /annotations` and `DELETE /annotations/{id}` |
| AI overlays are outside the document | they are read-only props, so they cannot be undone into or out of existence |

## Overlay layering

Painted bottom to top in one SVG, so hit-testing order matches visual order.

| z | Layer | Source | Default opacity | Toggle |
| --- | --- | --- | --- | --- |
| 0 | Image | `ReviewItem.image_url` | 1.00 | — |
| 1 | Grad-CAM heat-map | `ReviewItem.gradcam_url` | 0.45 | yes; layer absent when the URL is `null` |
| 2 | AI localisation box | `ReviewItem.ai_localization` | 0.90 stroke, dashed, no fill | yes; absent when `null` |
| 3 | Existing human shapes | `ReviewItem.existing_annotations` | 0.10 fill, 0.80 stroke | yes |
| 4 | Current document shapes | canvas reducer | 0.12 fill, 1.00 stroke | — |
| 5 | Handles, vertices, radius handle | selection state | 1.00 | — |

Opacities are UI defaults exposed in the view controls, not thresholds. Colour is never the only
signal: the AI box is dashed, human shapes are solid, and each carries a text label.

Because no model has been trained, `gradcam_url` and `ai_localization` are `null` for every image
today, so layers 1 and 2 do not render and their toggles are hidden rather than shown disabled
(CLAUDE.md §2.3).

## Validation

The client validates for feedback; `annotation_service` validates authoritatively and returns
`422 VALIDATION_ERROR` with a `details` map. Constants live in one module per side — never inline in a
component or a route.

| Rule | Value | Applies to |
| --- | --- | --- |
| Coordinates inside the frame | clamp then require `0 ≤ x, y` and `x + w ≤ 1`, `y + h ≤ 1` | box, rounded box |
| Minimum edge | `w ≥ 0.01` and `h ≥ 0.01` (proposed default ≈ 1% of the image) | box, rounded box |
| Corner radius | `0 ≤ r ≤ 0.5`, normalised against `min(w, h)` | rounded box |
| Vertex count | `≥ 3`, implicitly closed, no duplicate closing point | polygon |
| Degenerate vertices | consecutive points closer than `0.002` are collapsed | polygon |
| Minimum hull area | derived AABB area `≥ 0.0001` | polygon |
| Label code | must exist in `disease_labels` and be active | submit body and per-shape label |
| Shape count | zero shapes is legal — the classifier trains on the label — but the UI asks for confirmation, and that image contributes no human box to the localisation metric | submit |

Rejection is per-shape and reported per-index, so one bad polygon does not discard a good box.

## What is sent

One request per image, exactly the `SubmitBody` of [api_contract.md](./api_contract.md) — the canvas
document flattened, nothing else:

```jsonc
POST /review/248/submit
{ "label_code": "MEL",                                     // seeded code, unverified vs data (§5)
  "annotations": [
    { "type": "BOUNDING_BOX", "geometry": { "x": 0.312, "y": 0.208, "w": 0.245, "h": 0.180 } },
    { "type": "POLYGON", "geometry": { "points": [[0.31,0.21],[0.55,0.24],[0.49,0.41]] },
      "label_code": "MEL" }
  ],
  "time_spent_ms": 41200, "note": null }
```

Each element becomes one `annotations` row (`source = 'HUMAN'`, `annotator_id`, `review_session_id`);
the shapes of one submit share a session id, which is how "what did this person draw in this sitting"
stays answerable. Rows written are listed step by step in
[hitl_workflow](./hitl_workflow.md#submit--one-transaction).

The label space itself comes from `disease_labels`, never from a frontend constant (CLAUDE.md §5). No
endpoint in `api_contract.md` publishes that list yet — adding one is a contract change and belongs in
the same commit as the annotation form, per the six-step procedure in [backend](./backend.md).

## Independence from the AI

| Rule | Consequence |
| --- | --- |
| AI shapes never seed the document | the annotator draws from the image, so agreement and IoU measure two independent readings |
| AI overlays are read-only props | no gesture can select, move or delete them |
| Submitting never touches `ai_predictions` | the row is insert-only at the database level (CLAUDE.md §2.4) |
| Corrections are additive | a disagreement adds human rows; it does not amend the prediction |
| Anchoring is a known threat | overlays can be hidden, and the effect is recorded as a limitation in [research_protocol](./research_protocol.md) |

## Segmentation seam

Pixel masks are a later extension, not v1. Adding one is a contract change, not a rewrite: a new
`AnnotationType` member on both sides of the enum-parity test, a documented `geometry` payload,
`annotation_service` validation, and the Dice row in the evaluation table
([ml_pipeline](./ml_pipeline.md)). `annotations.geometry` is `jsonb`, so the storage itself needs no
migration — which is why the tool list is short today instead of speculative.
