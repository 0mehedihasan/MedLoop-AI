# MedLoop AI — Annotation canvas

Read this when: touching the canvas, the three tools, geometry, the viewer transform or undo/redo.
Extends `CLAUDE.md §4.3`, `§11.2`, `§11.5`. SVG + pointer events — **no Konva, no canvas library**.

## Files

```text
frontend/features/review/canvas/
├── AnnotationCanvas.tsx        <svg> root, pointer handlers, layer order
├── useViewport.ts              zoom / pan / fit / reset, screen↔image conversion
├── useAnnotationHistory.ts     undo / redo over immutable snapshots
├── geometry.ts                 clamp, normalise, deriveBoundingBox, area, iou
├── shortcuts.ts                the ONE keyboard map, also rendered in the help panel
├── tools/{boxTool,polygonTool,roundedBoxTool}.ts
└── overlays/{GradCamOverlay,AiBoxOverlay,HumanShapes,SelectionHandles}.tsx
```

## The three tools

| Tool | `AnnotationType` | Gesture | Payload (`§4.3`) |
| --- | --- | --- | --- |
| Bounding Box | `BOUNDING_BOX` | press-drag-release | `{ x, y, w, h }` |
| Rounded Box | `ROUNDED_BOX` | press-drag-release, then radius handle | `{ x, y, w, h, r }`, `r` normalised against `min(w,h)`, `0 ≤ r ≤ 0.5` |
| Polygon | `POLYGON` | click points, `Enter`/click-first to close | `{ points: [[x,y], …] }`, ≥ 3 points, implicitly closed |

All coordinates are **normalised `[0,1]`** against the *original* image width/height, origin
top-left, `x` right, `y` down. Never store pixels — the viewer zooms and pans, so pixel coordinates
would silently rot (`§4.3`).

Validation before a shape is committed (client) and again at the schema boundary (server, authoritative):

| Check | Rule |
| --- | --- |
| range | every value clamped to `[0,1]`; a drag past the edge clips, it does not extend the image |
| minimum size | `w, h ≥ 0.005` — rejects accidental click-shapes |
| polygon points | ≥ 3 after de-duplicating points within an epsilon; never auto-close by appending the first point |
| radius | `0 ≤ r ≤ 0.5`, expressed against `min(w,h)`, not against the image |
| precision | round to 6 decimals on commit; do not round during a drag |
| negative extents | normalise a right-to-left / bottom-to-top drag into positive `w`, `h` |

## Derived axis-aligned bbox (one definition per language)

```ts
// geometry.ts — mirrored by derive_bounding_box() in ml/evaluation/localization_metrics.py
export function deriveBoundingBox(g: Geometry): Box {
  switch (g.type) {
    case 'BOUNDING_BOX': return { x: g.x, y: g.y, w: g.w, h: g.h };
    case 'ROUNDED_BOX':  return { x: g.x, y: g.y, w: g.w, h: g.h };   // r ignored for IoU
    case 'POLYGON':      return boxFromExtent(g.points);              // min/max over points
  }
}
```

Every localisation metric (IoU, localisation accuracy, Grad-CAM ∩ ROI) consumes the derived box, so
the metric has exactly one definition regardless of the tool used (`§4.3`). The two implementations
must agree; a table-driven test on shared fixtures is the cheapest guard.

## Viewport transform

```ts
type Viewport = { scale: number; tx: number; ty: number };   // screen = image_px * scale + t

// image_px = norm * natural;  so:
toScreen(n, v, size) => ({ x: n.x * size.w * v.scale + v.tx, y: n.y * size.h * v.scale + v.ty })
toImage(p, v, size)  => clamp01({ x: (p.x - v.tx) / (v.scale * size.w),
                                  y: (p.y - v.ty) / (v.scale * size.h) })
```

| Verb | Behaviour |
| --- | --- |
| zoom | wheel / `+` / `−`, anchored on the cursor (or viewport centre for keys); clamp `scale` to `[fit, 8×]` |
| pan | space-drag, middle-drag, or arrow keys with no selection; clamped so the image cannot leave the frame entirely |
| fit | `scale = min(frameW / imgW, frameH / imgH)`, centred — the initial state for every image |
| reset | back to fit **and** clear selection; does **not** clear shapes |

Rules: `p.x`/`p.y` come from `event.clientX/Y` minus the SVG bounding rect. Use
`setPointerCapture` on `pointerdown` so a drag that leaves the SVG still tracks. All hit-testing
happens in normalised space, so hit tolerance must be divided by `scale` (a 6 px handle stays 6 px on
screen at every zoom level). Never mutate a shape from a `pointermove` without a committed gesture.

## Interaction verbs

| Verb | Pointer | Applies to | Notes |
| --- | --- | --- | --- |
| select | click a shape (topmost hit wins) | one shape | `Tab` cycles; selection is UI state, never persisted |
| move | drag body | selection | arrows nudge `0.5%`, `Shift`+arrows `5%` of image size |
| resize | drag a corner/edge handle; polygon: drag a vertex | selection | `Alt`+arrows resize by the same steps |
| delete | `Delete` / `Backspace` | selection | removes the *unsaved* shape; a saved one goes through `DELETE /annotations/{id}` (soft archive) |
| undo / redo | — | whole shape list | one step per committed gesture |
| clear | — | whole shape list | one undoable step, and it asks for confirmation |

## Undo / redo

```ts
type Snapshot = readonly Shape[];                       // immutable; shapes are never mutated
type History  = { past: Snapshot[]; present: Snapshot; future: Snapshot[] };
const HISTORY_LIMIT = 50;                                // oldest entries drop off the front
```

- One snapshot per **completed** gesture — never per `pointermove`. A 300-event drag is one entry.
- `commit(next)` pushes `present` onto `past`, sets `present = next`, and **clears `future`**.
- Bounded depth: `past` is capped at `HISTORY_LIMIT`; dropping the oldest entry is silent.
- History is **per image and client-only**. Advancing the queue resets it — undoing into the previous
  image is the worst bug this component can have, because it would edit a submitted annotation.
- Nothing in history is sent to the server; submit posts `present` only.
- Redo survives only until the next commit, per the rule above.

## Keyboard equivalents (`shortcuts.ts` is the only declaration site)

Every action is reachable without a pointer (`§11.2`). The help panel renders this map, so it cannot
drift from the handlers.

| Action | Key | Action | Key |
| --- | --- | --- | --- |
| Bounding box tool | `1` | Undo | `Cmd/Ctrl + Z` |
| Polygon tool | `2` | Redo | `Cmd/Ctrl + Shift + Z` |
| Rounded box tool | `3` | Clear all | `Cmd/Ctrl + Shift + Backspace` |
| Select mode | `V` | Delete selected | `Delete` / `Backspace` |
| Cancel draw / deselect | `Esc` | Nudge / resize | arrows / `Alt`+arrows |
| Close polygon | `Enter` | Zoom in / out | `+` / `−` |
| Cycle shapes | `Tab` | Fit / reset | `0` / `R` |
| Toggle Grad-CAM | `G` | Toggle AI box | `B` |
| Submit | `Cmd/Ctrl + Enter` | Skip | `Cmd/Ctrl + Shift + Enter` |

Keys are ignored while focus is in a text field. Destructive keys (clear, skip) confirm first.

## Overlay layering

```text
z6  selection handles + active tool preview     always, opacity 1
z5  human annotation shapes                     stroke 1, fill 0.12
z4  AI bounding box (dashed)                     stroke 1, no fill      hidden if ai_localization null
z3  Grad-CAM heat-map                            opacity 0.45 (slider 0.2–0.8), hidden if no artefact
z2  original image                               opacity 1
z1  neutral backdrop
```

| View preset | Enables |
| --- | --- |
| Original | image only |
| AI Prediction | image + AI box + prediction panel |
| Grad-CAM | image + heat-map |
| AI Bounding Box | image + AI box |
| Human Annotation | image + human shapes |
| Combined | image + heat-map + AI box + human shapes |

- "Combined" is a **preset over the same layers**, not a seventh data source and not a merged record.
- Opacity is a *render* property. It is never persisted with a geometry and never affects a metric.
- When `gradcam_url` is `null` the Grad-CAM view is **removed from the switcher**, not shown empty
  (`§2.3`). Same for the AI box when `ai_localization` is `null`.
- Layer visibility state lives in the review feature, not in the canvas component, so the keyboard
  map, the switcher and the URL can all drive it.

## Human and AI data never merge (`§2.4`)

| Action in the UI | What is written |
| --- | --- |
| draw a shape and submit | new `annotations` row, `source = HUMAN`, `annotator_id = current user` |
| "accept the AI box" | the AI geometry is **copied** into a new `HUMAN` annotation row; the AI row is untouched |
| edit after accepting | still a `HUMAN` row; the AI's original box remains queryable for IoU |
| delete an annotation | soft archive; `ai_predictions` unaffected |
| nothing drawn, label corrected | label recorded on the review session; no geometry row |

Never write a human shape into `ai_predictions.localization`, never average the two, never let the
canvas "reconcile" them. The gap between the two is `RQ2`/`RQ3`.

## Canvas failure modes

| Failure mode | Symptom | Fix |
| --- | --- | --- |
| pixel coordinates stored | shapes drift after zoom or on a different screen | normalise on commit, always |
| snapshot per pointermove | undo needs 300 presses, memory climbs | one snapshot per gesture |
| history not reset on advance | undo edits the previous image's annotation | reset on `image_id` change |
| hit tolerance in screen px | handles unreachable when zoomed out | divide tolerance by `scale` |
| overlay opacity persisted | metric changes when a slider moves | opacity stays in view state |
| accept-AI writes to the prediction | disagreement signal destroyed | copy into a new `HUMAN` row |
| polygon auto-closed by duplicating point 1 | first == last vertex, IoU off by a hair | closure is implicit |
| keyboard map duplicated in a component | help panel lies about the shortcut | import from `shortcuts.ts` |
