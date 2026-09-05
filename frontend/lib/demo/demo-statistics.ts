/**
 * ┌───────────────────────────────────────────────────────────────────────────────────────┐
 * │  DEMO DATA — MedLoop AI statistics fixtures (Data Statistics + Annotation Statistics). │
 * │                                                                                       │
 * │  Nothing here was counted. No image was opened, no review session was read, no model   │
 * │  produced anything. The file exists so both statistics screens — filters, charts,      │
 * │  transcripts and all four render states — can be built before the API is wired.        │
 * │                                                                                       │
 * │  Governed by CLAUDE.md §10:                                                           │
 * │    · every export carries `isDemo: true`;                                              │
 * │    · both screens render a `<DemoBadge />`, and the shell shows the global banner        │
 * │      while `NEXT_PUBLIC_DATA_SOURCE=demo`;                                             │
 * │    · `NEXT_PUBLIC_DATA_SOURCE=api` removes all of it — the screens then show real       │
 * │      empty states rather than a fixture mixed into live data.                           │
 * │                                                                                       │
 * │  What is deliberately absent, because §10 forbids it even behind a badge:              │
 * │    · `agreement_count`, `agreement_rate` and `correction_rate` are omitted. All three   │
 * │      are statements about a *model's* predictions, and no model exists on this machine  │
 * │      (§15) — so there is nothing to agree with and nothing to have corrected.           │
 * │    · `confidence_bins` is empty and `agreement_matrix` is `null` for the same reason:    │
 * │      a confidence is a model output, and RQ5 cannot be illustrated with invented ones.  │
 * │    · `training_used` is `0` everywhere. Training has never run here.                    │
 * │                                                                                       │
 * │  About the per-label counts below: they are an arbitrary descending ramp that happens   │
 * │  to sum to the total quoted in the project brief. They are **not** the measured class   │
 * │  distribution of any dataset on this machine — that figure comes out of the ingestion   │
 * │  report, and this file has not read a single row of metadata (§2.2).                    │
 * └───────────────────────────────────────────────────────────────────────────────────────┘
 */

import { AnnotationType, SkipReason } from '@/types/domain';
import type {
  AnnotationStatistics,
  DataStatistics,
  DatasetCounts,
  Distribution,
  Series,
  SeriesPoint,
} from '@/types/domain';

/**
 * The fixture window. Fixed dates, never `Date.now()` — a fixture that follows the clock reads as
 * live data and cannot be screenshotted twice.
 */
const FROM = '2026-08-07';
const TO = '2026-09-05';

/**
 * `source` is the one field of both payloads a fixture must not supply. The union is
 * `'database' | 'unavailable'`; a fixture is neither, and choosing one would be a claim about
 * provenance. Both screens read provenance from `IS_DEMO` instead.
 */
export type DemoDataStatistics = Omit<DataStatistics, 'source'>;
export type DemoAnnotationStatistics = Omit<AnnotationStatistics, 'source'>;

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Counts
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * A **partition**, not a set of overlapping tallies. `DatasetCounts` keys are the lower-cased
 * `DataStatus` members, and `DataStatus` is derived by precedence (§4.1:
 * `ARCHIVED > TRAINING_USED > VALIDATED > SKIPPED > IN_REVIEW > split > STAGING`), so every image
 * lands in exactly one bucket and the ten buckets sum to `total`.
 *
 * That is why `validated`, `skipped` and `in_review` do not appear inside `unused`: an `UNUSED` image
 * that a human has validated is counted as `validated` and nowhere else. `unused` here means
 * "`UNUSED` and nobody has touched it yet" — the images still queueable for review.
 *
 * 1000 + 200 + 460 + 163 + 4 + 412 + 59 = 2298.
 */
const COUNTS: DatasetCounts = {
  total: 2298,
  staging: 0,
  train: 1000,
  validation: 200,
  // Locked, and therefore never reviewed and never in the HITL pool, whatever the counter says (§2.5).
  test: 460,
  unused: 163,
  in_review: 4,
  validated: 412,
  skipped: 59,
  // No training has run on this machine, so no image can have been consumed by a batch.
  training_used: 0,
  archived: 0,
};

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Distributions
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** Mirrors {@link COUNTS} minus `total`, so the donut and the KPI row cannot disagree. */
const BY_DATA_STATUS: Distribution = {
  key: 'data_status',
  label: 'Derived data status',
  slices: [
    { key: 'train', label: 'Train', count: COUNTS.train },
    { key: 'validation', label: 'Validation', count: COUNTS.validation },
    { key: 'test', label: 'Test', count: COUNTS.test },
    { key: 'unused', label: 'Unused', count: COUNTS.unused },
    { key: 'in_review', label: 'In review', count: COUNTS.in_review },
    { key: 'validated', label: 'Validated', count: COUNTS.validated },
    { key: 'skipped', label: 'Skipped', count: COUNTS.skipped },
  ],
};

/**
 * The raw `images.split` column, which is orthogonal to review status (§4.1). `UNUSED` here is the
 * whole pool — 163 untouched, 4 claimed, 412 validated, 59 skipped — so this distribution and the
 * one above describe the same 2298 images from two different angles rather than contradicting.
 */
const BY_SPLIT: Distribution = {
  key: 'split',
  label: 'Split',
  slices: [
    { key: 'train', label: 'TRAIN', count: 1000 },
    { key: 'validation', label: 'VALIDATION', count: 200 },
    { key: 'test', label: 'TEST', count: 460 },
    { key: 'unused', label: 'UNUSED', count: 638 },
  ],
};

/**
 * The six seeded label codes (§5), `verified_against_data: false` wherever the label space itself is
 * rendered. See the header block on the counts: a descending ramp, chosen to exercise the axis, not
 * measured from anything.
 */
const BY_LABEL: Distribution = {
  key: 'label_code',
  label: 'Publisher label',
  slices: [
    { key: 'ACK', label: 'ACK', count: 700 },
    { key: 'BCC', label: 'BCC', count: 600 },
    { key: 'NEV', label: 'NEV', count: 500 },
    { key: 'SEK', label: 'SEK', count: 300 },
    { key: 'SCC', label: 'SCC', count: 150 },
    { key: 'MEL', label: 'MEL', count: 48 },
  ],
};

/** One dataset. Named `demo-` like every other reference in the fixtures, and not claimed to be real. */
const BY_DATASET: Distribution = {
  key: 'dataset',
  label: 'Dataset',
  slices: [{ key: 'd1', label: 'demo-dataset-01', count: 2298 }],
};

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Series
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** `t` is a `YYYY-MM-DD` calendar day, matching `SeriesPoint`. */
function day(index: number): string {
  const base = new Date(`${FROM}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + index);
  return base.toISOString().slice(0, 10);
}

/**
 * Ingestion is one event, not a trickle: the whole staging directory is registered in a single pass,
 * so the series has **one** point rather than a plausible daily drip. Every other day is *absent*,
 * not zero — `LineSeriesChart` draws a gap there and the transcript prints a dash, which is the
 * truthful rendering of "nothing was recorded on that date".
 */
const INGESTED: Series = {
  key: 'ingested',
  label: 'Images registered',
  points: [{ t: day(0), v: 2298 }],
};

/** A gentle ramp over the last three weeks of the window, with two blank days left blank. */
const VALIDATED_PER_DAY: readonly SeriesPoint[] = [
  { t: day(9), v: 12 },
  { t: day(10), v: 18 },
  { t: day(11), v: 24 },
  { t: day(12), v: 21 },
  // day(13) and day(14) absent on purpose — a weekend nobody reviewed.
  { t: day(15), v: 30 },
  { t: day(16), v: 27 },
  { t: day(17), v: 33 },
  { t: day(18), v: 29 },
  { t: day(19), v: 36 },
  { t: day(22), v: 41 },
  { t: day(23), v: 38 },
  { t: day(24), v: 44 },
  { t: day(26), v: 31 },
  { t: day(28), v: 28 },
];

const SKIPPED_PER_DAY: readonly SeriesPoint[] = [
  { t: day(9), v: 2 },
  { t: day(11), v: 4 },
  { t: day(12), v: 3 },
  { t: day(15), v: 6 },
  { t: day(17), v: 5 },
  { t: day(19), v: 8 },
  { t: day(22), v: 7 },
  { t: day(24), v: 9 },
  { t: day(26), v: 6 },
  { t: day(28), v: 9 },
];

const REVIEW_SERIES: readonly Series[] = [
  { key: 'validated', label: 'Validated', points: VALIDATED_PER_DAY },
  { key: 'skipped', label: 'Skipped', points: SKIPPED_PER_DAY },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Data Statistics
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface DemoDataStatisticsFixture {
  /** Condition 3 of §10. A type-level `true`, so the compiler keeps it on. */
  readonly isDemo: true;
  readonly statistics: DemoDataStatistics;
}

export const DEMO_DATA_STATISTICS: DemoDataStatisticsFixture = {
  isDemo: true,
  statistics: {
    from: FROM,
    to: TO,
    granularity: 'day',
    counts: COUNTS,
    series: [INGESTED, ...REVIEW_SERIES],
    distributions: [BY_DATA_STATUS, BY_SPLIT, BY_LABEL, BY_DATASET],
  },
};

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Annotation Statistics
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * 412 validated reviews carry 412 human annotations here — one shape each, which is the common case
 * and keeps the type breakdown readable. `ROUNDED_BOX` is present but rare, because it exists in the
 * canvas and a fixture that never produced one would leave that column untested.
 */
const BY_ANNOTATION_TYPE: Distribution = {
  key: 'annotation_type',
  label: 'Annotation type',
  slices: [
    { key: AnnotationType.BOUNDING_BOX, label: 'Bounding box', count: 371 },
    { key: AnnotationType.POLYGON, label: 'Polygon', count: 34 },
    { key: AnnotationType.ROUNDED_BOX, label: 'Rounded box', count: 7 },
  ],
};

/** Sums to the 59 skips in {@link COUNTS}. Every member of `SkipReason` appears, including `OTHER`. */
const BY_SKIP_REASON: Distribution = {
  key: 'skip_reason',
  label: 'Skip reason',
  slices: [
    { key: SkipReason.POOR_IMAGE_QUALITY, label: 'Poor image quality', count: 21 },
    { key: SkipReason.UNCLEAR, label: 'Unclear', count: 14 },
    { key: SkipReason.CANNOT_DETERMINE, label: 'Cannot determine', count: 11 },
    { key: SkipReason.WRONG_IMAGE_TYPE, label: 'Wrong image type', count: 6 },
    { key: SkipReason.DUPLICATE, label: 'Duplicate', count: 4 },
    { key: SkipReason.OTHER, label: 'Other', count: 3 },
  ],
};

/** Sums to `reviewed_total` (471 = 412 validated + 59 skipped). Two fixture annotators. */
const BY_ANNOTATOR: Distribution = {
  key: 'annotator',
  label: 'Annotator',
  slices: [
    { key: 'demo-annotator', label: 'demo-annotator', count: 318 },
    { key: 'demo-admin', label: 'demo-admin', count: 153 },
  ],
};

/**
 * What the humans chose, over the 412 validated images. Deliberately *not* the same shape as
 * {@link BY_LABEL}: the publisher's label and the annotator's label are different records and the
 * research question is where they diverge, so a fixture that made them identical would hide the one
 * comparison this screen exists to support.
 *
 * There is no `ai_label` distribution anywhere in this file. That row is written by a model.
 */
const BY_HUMAN_LABEL: Distribution = {
  key: 'human_label',
  label: 'Human label',
  slices: [
    { key: 'ACK', label: 'ACK', count: 121 },
    { key: 'BCC', label: 'BCC', count: 104 },
    { key: 'NEV', label: 'NEV', count: 88 },
    { key: 'SEK', label: 'SEK', count: 54 },
    { key: 'SCC', label: 'SCC', count: 31 },
    { key: 'MEL', label: 'MEL', count: 14 },
  ],
};

export interface DemoAnnotationStatisticsFixture {
  readonly isDemo: true;
  readonly statistics: DemoAnnotationStatistics;
}

export const DEMO_ANNOTATION_STATISTICS: DemoAnnotationStatisticsFixture = {
  isDemo: true,
  statistics: {
    from: FROM,
    to: TO,
    reviewed_total: 471,
    // `agreement_count`, `agreement_rate` and `correction_rate` are omitted. See the header block.
    // 59 / 471. Carried rather than derived, mirroring the real payload: the client never computes a rate.
    skip_rate: 0.1253,
    median_time_spent_ms: 41_500,
    distributions: [BY_ANNOTATION_TYPE, BY_HUMAN_LABEL, BY_SKIP_REASON, BY_ANNOTATOR],
    series: REVIEW_SERIES,
    // Empty and null, not fabricated. Both need a model's confidence and a model's predicted class.
    confidence_bins: [],
    agreement_matrix: null,
  },
};
