/**
 * ┌───────────────────────────────────────────────────────────────────────────────────────┐
 * │  DEMO DATA — MedLoop AI review-queue fixtures.                                        │
 * │                                                                                       │
 * │  Nothing here was measured, photographed, predicted or annotated by a model. The file  │
 * │  exists so the review workspace — canvas, label picker, inspector, submit and skip —   │
 * │  can be built and reviewed before the backend is wired.                               │
 * │                                                                                       │
 * │  Governed by CLAUDE.md §10:                                                           │
 * │    · every export carries `isDemo: true`;                                              │
 * │    · the screen renders a `<DemoBadge />`, and the shell shows the global banner while  │
 * │      `NEXT_PUBLIC_DATA_SOURCE=demo`;                                                   │
 * │    · `NEXT_PUBLIC_DATA_SOURCE=api` removes all of it — the queue then shows real empty  │
 * │      states, never a fixture mixed into live data.                                     │
 * │                                                                                       │
 * │  What is deliberately absent, because §10 forbids it even behind a badge:              │
 * │    · `ai_prediction` is `null` on every item — no model exists on this machine, so      │
 * │      there is no predicted class and no confidence to show;                             │
 * │    · `gradcam_url` is `null`, so the attribution view is removed from the switcher      │
 * │      rather than drawn empty (§2.3: an all-zero gradient still looks convincing);       │
 * │    · `ai_localization` is `null`, so the AI-box view is removed too;                    │
 * │    · the images are flat vector drawings stamped SYNTHETIC. None of them could be       │
 * │      mistaken for a clinical photograph, which is the §10 condition on demo imagery.    │
 * │                                                                                       │
 * │  Patient and lesion references are prefixed `demo-` and are not claimed to be real.    │
 * └───────────────────────────────────────────────────────────────────────────────────────┘
 */

import {
  AnnotationSource,
  AnnotationType,
  ImageLifecycle,
  ImageSplit,
  ReviewStatus,
  deriveDataStatus,
} from '@/types/domain';
import type { Annotation, DiseaseLabel, ImageSummary, ReviewItem } from '@/types/domain';
import type { LabelsResponse } from '@/types/api';

/** Fixed, not `Date.now()`: a fixture that follows the clock looks live and cannot be screenshotted twice. */
const CREATED_AT = '2026-09-01T08:35:00+06:00';

/** Every demo image is drawn at this size, so the normalised coordinates below mean one thing. */
const IMAGE_W = 640;
const IMAGE_H = 480;

/**
 * One obviously-synthetic "image", as an SVG data URL.
 *
 * A data URL rather than a file under `public/`: `useBitmap` fetches whatever string it is given, so
 * nothing about the canvas needs a demo branch, and no bitmap that could be confused with a
 * photograph is ever committed to the repository.
 *
 * The drawing is a flat ellipse on a ruled grid, in a hue that is not skin, stamped SYNTHETIC across
 * the middle. Reading the source is enough to see there is no photograph anywhere in this build.
 */
function syntheticImage(hue: number, cx: number, cy: number, rx: number, ry: number): string {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(IMAGE_W)}" height="${String(IMAGE_H)}" viewBox="0 0 ${String(IMAGE_W)} ${String(IMAGE_H)}">`,
    `<defs><pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse">`,
    `<path d="M32 0H0v32" fill="none" stroke="hsl(${String(hue)} 18% 74%)" stroke-width="1"/>`,
    `</pattern></defs>`,
    `<rect width="100%" height="100%" fill="hsl(${String(hue)} 22% 88%)"/>`,
    `<rect width="100%" height="100%" fill="url(#g)"/>`,
    `<ellipse cx="${String(cx)}" cy="${String(cy)}" rx="${String(rx)}" ry="${String(ry)}" fill="hsl(${String(hue)} 42% 58%)" stroke="hsl(${String(hue)} 46% 38%)" stroke-width="3"/>`,
    `<ellipse cx="${String(cx)}" cy="${String(cy)}" rx="${String(rx / 2)}" ry="${String(ry / 2)}" fill="none" stroke="hsl(${String(hue)} 46% 34%)" stroke-width="2" stroke-dasharray="7 5"/>`,
    `<text x="50%" y="52%" text-anchor="middle" font-family="ui-monospace, monospace" font-size="46" font-weight="700" fill="hsl(${String(hue)} 30% 30%)" opacity="0.5">SYNTHETIC</text>`,
    `<text x="50%" y="62%" text-anchor="middle" font-family="ui-monospace, monospace" font-size="17" fill="hsl(${String(hue)} 25% 32%)" opacity="0.75">DEMO DATA — not a clinical image</text>`,
    `</svg>`,
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * The seeded label space (§5), carried as data.
 *
 * `verified_against_data` stays **false**. The flag is a property of the real label space and is
 * flipped by the dataset inspection, not by a fixture — a demo file is in no position to claim that
 * six codes were confirmed against files it never opened.
 */
const LABEL_CODES: readonly (readonly [string, string])[] = [
  ['ACK', 'Actinic keratosis'],
  ['BCC', 'Basal cell carcinoma'],
  ['MEL', 'Melanoma'],
  ['NEV', 'Nevus'],
  ['SCC', 'Squamous cell carcinoma'],
  ['SEK', 'Seborrheic keratosis'],
];

const LABELS: readonly DiseaseLabel[] = LABEL_CODES.map(([code, name], index) => ({
  id: index + 1,
  code,
  name,
  description: null,
  display_order: index + 1,
  is_active: true,
  verified_against_data: false,
  created_at: CREATED_AT,
}));

export const DEMO_LABELS: LabelsResponse = {
  items: LABELS,
  verified_against_data: false,
};

/**
 * `split` is `UNUSED` on every item, because that is the only split §4.2 lets into the review queue.
 * `review_status` varies — `NOT_REVIEWED` for an untouched image, `IN_REVIEW` for one that was claimed
 * and left unfinished, which is the case that has to render existing shapes. `data_status` is
 * **derived** by the shared function rather than written out, so the fixture cannot disagree with the
 * precedence rule it is meant to illustrate.
 */
interface DemoImageSpec {
  readonly id: number;
  readonly filename: string;
  readonly patient: number;
  readonly lesion: number;
  readonly reviewStatus?: ReviewStatus;
  /** The publisher's label where the source data carried one. Not the model's, and not a human's. */
  readonly labelCode?: string | null;
}

function demoImage(spec: DemoImageSpec): ImageSummary {
  const reviewStatus = spec.reviewStatus ?? ReviewStatus.NOT_REVIEWED;
  return {
    id: spec.id,
    dataset_id: 1,
    dataset_version_id: 1,
    filename: spec.filename,
    split: ImageSplit.UNUSED,
    review_status: reviewStatus,
    lifecycle: ImageLifecycle.ASSIGNED,
    data_status: deriveDataStatus({
      lifecycle: ImageLifecycle.ASSIGNED,
      reviewStatus,
      split: ImageSplit.UNUSED,
    }),
    width: IMAGE_W,
    height: IMAGE_H,
    label_code: spec.labelCode ?? null,
    patient_ref: `demo-p${String(spec.patient).padStart(3, '0')}`,
    lesion_ref: `demo-l${String(spec.lesion).padStart(3, '0')}`,
    reviewed_at: null,
    created_at: CREATED_AT,
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The queue
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One already-saved human shape, carried by the second item.
 *
 * The workspace has a code path that only runs when a shape came back from the server: removing it
 * must not fire an immediate `DELETE`, because that would not be undoable — the archive is part of the
 * submit payload. Without a saved shape in the fixture that path can never be exercised by hand, so
 * exactly one item has one.
 *
 * `source` is `HUMAN`. There is no `AI_LOCALIZATION` annotation anywhere in this file: that row is
 * written by a model, and §2.4 keeps the two record kinds apart — inventing one would put a fabricated
 * AI output in the same list as a human's work, which is the confusion the separation exists to prevent.
 */
const SAVED_BOX: Annotation = {
  id: 9001,
  image_id: 102,
  annotator_id: 1,
  annotator_username: 'demo-annotator',
  source: AnnotationSource.HUMAN,
  type: AnnotationType.BOUNDING_BOX,
  geometry: { type: AnnotationType.BOUNDING_BOX, x: 0.3, y: 0.26, w: 0.37, h: 0.43 },
  label_code: 'NEV',
  created_at: '2026-09-01T09:12:00+06:00',
  archived_at: null,
};

/**
 * Three items — the smallest queue that shows all three behaviours the workspace has to get right:
 * an untouched image, an image with work already on it, and a last item after which the queue is
 * exhausted rather than looping.
 *
 * `remaining` counts items **still to do, including the current one**, so the last item reads `1`.
 * `position`/`total` drive the "2 of 3" indicator.
 *
 * `ai_prediction`, `gradcam_url` and `ai_localization` are `null` on every item, and that is the whole
 * point: no model exists on this machine (§15), so the prediction panel renders `<Unavailable/>` and
 * both model-derived layers are *removed from the switcher*. A demo confidence of `0.87` would be a
 * fabricated result even behind a badge (§10), and an empty heat-map still draws convincingly (§2.3).
 */
const ITEMS: readonly ReviewItem[] = [
  {
    image: demoImage({ id: 101, filename: 'demo-0001.svg', patient: 1, lesion: 1 }),
    image_url: syntheticImage(206, 300, 214, 122, 94),
    ai_prediction: null,
    gradcam_url: null,
    ai_localization: null,
    existing_annotations: [],
    queue: { position: 1, total: 3, remaining: 3 },
  },
  {
    // Same patient as the first item, a different lesion: the inspector shows both refs, and
    // patient-level grouping is visible in a fixture rather than only in the split code.
    image: demoImage({
      id: 102,
      filename: 'demo-0002.svg',
      patient: 1,
      lesion: 2,
      reviewStatus: ReviewStatus.IN_REVIEW,
      labelCode: 'NEV',
    }),
    image_url: syntheticImage(168, 352, 236, 96, 132),
    ai_prediction: null,
    gradcam_url: null,
    ai_localization: null,
    existing_annotations: [SAVED_BOX],
    queue: { position: 2, total: 3, remaining: 2 },
  },
  {
    image: demoImage({ id: 103, filename: 'demo-0003.svg', patient: 2, lesion: 3 }),
    image_url: syntheticImage(262, 268, 190, 88, 74),
    ai_prediction: null,
    gradcam_url: null,
    ai_localization: null,
    existing_annotations: [],
    queue: { position: 3, total: 3, remaining: 1 },
  },
];

/**
 * `isDemo: true` is the §10 condition 3 marker, and it is read at runtime rather than being decoration:
 * the workspace asserts it before rendering the badge, so a fixture that lost the flag would show up
 * unmarked in review rather than silently.
 *
 * There is deliberately no `hitl` block here. Submitting in demo mode counts **nothing** — no row is
 * written, no counter moves — so the hook reports `hitl: null` and the UI says the count is not being
 * kept. A fixture that shipped `validated_since_last_training: 731` would be a fabricated experiment
 * state, and it is exactly the number a reader would quote.
 */
export interface DemoReviewQueue {
  readonly isDemo: true;
  /** The seeded label space, `verified_against_data: false` (§5). */
  readonly labels: LabelsResponse;
  readonly items: readonly ReviewItem[];
}

export const DEMO_REVIEW: DemoReviewQueue = {
  isDemo: true,
  labels: DEMO_LABELS,
  items: ITEMS,
};
