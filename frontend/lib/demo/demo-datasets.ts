/**
 * ┌───────────────────────────────────────────────────────────────────────────────────────┐
 * │  DEMO DATA — MedLoop AI dataset, version and image fixtures.                          │
 * │                                                                                       │
 * │  Nothing here was read from disk. No directory was scanned, no image was opened, no    │
 * │  metadata row was parsed. The file exists so Dataset Management and the dataset detail │
 * │  screen — filters, version list, split counts, lock state, all four render states —    │
 * │  can be built before the ingestion endpoints exist.                                    │
 * │                                                                                       │
 * │  Governed by CLAUDE.md §10: `isDemo: true`, a `<DemoBadge />` on every screen that      │
 * │  renders it, the global banner while `NEXT_PUBLIC_DATA_SOURCE=demo`, and complete       │
 * │  removal under `=api`.                                                                  │
 * │                                                                                       │
 * │  Two rules shape what is *in* here:                                                    │
 * │    · §2.2 — the real PAD-UFES-20 files are present in this repository, but this file    │
 * │      has not looked at them. Every name below is `demo-`prefixed and every patient      │
 * │      reference is obviously synthetic, so no row can be mistaken for a measured one.    │
 * │      In particular these are **not** real patient identifiers (§2.2, and the project    │
 * │      instruction not to generate synthetic identifiers that could be read as real).     │
 * │    · §2.5 — the locked version below carries `is_test_locked: true` and a `locked_at`,   │
 * │      so the screen's refusal path is exercised rather than assumed.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────┘
 */

import {
  DataStatus,
  DatasetStatus,
  ImageLifecycle,
  ImageSplit,
  ReviewStatus,
} from '@/types/domain';
import type { Dataset, DatasetCounts, DatasetDetail, DatasetVersion, ImageSummary } from '@/types/domain';
import type { Paginated } from '@/types/api';

/** Fixed dates. A fixture that follows the clock reads as live data and cannot be screenshotted twice. */
const CREATED = '2026-08-07T09:00:00+06:00';
const LOCKED = '2026-09-02T11:20:00+06:00';

/**
 * The same partition as `demo-statistics.ts`, and deliberately the same numbers: two screens
 * disagreeing about how many images exist is the kind of thing a reviewer notices immediately.
 * 1000 + 200 + 460 + 163 + 4 + 412 + 59 = 2298.
 */
const COUNTS: DatasetCounts = {
  total: 2298,
  staging: 0,
  train: 1000,
  validation: 200,
  test: 460,
  unused: 163,
  in_review: 4,
  validated: 412,
  skipped: 59,
  training_used: 0,
  archived: 0,
};

/** The staging version: nothing assigned yet, so every image sits in `staging`. */
const STAGING_COUNTS: DatasetCounts = {
  total: 240,
  staging: 240,
  train: 0,
  validation: 0,
  test: 0,
  unused: 0,
  in_review: 0,
  validated: 0,
  skipped: 0,
  training_used: 0,
  archived: 0,
};

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Versions
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `v1` is locked, `v2` is not.
 *
 * The pair matters more than either one: a locked version must refuse split reassignment while an
 * unlocked one accepts it, and a screen built against only one of them will have exactly one of those
 * two paths untested.
 */
const VERSIONS: readonly DatasetVersion[] = [
  {
    id: 1,
    dataset_id: 1,
    label: 'v1',
    note: 'Patient-level split, seed 20260905. Test set locked before any training was configured.',
    status: DatasetStatus.LOCKED,
    is_test_locked: true,
    locked_at: LOCKED,
    counts: COUNTS,
    created_at: CREATED,
  },
  {
    id: 2,
    dataset_id: 1,
    label: 'v2-staging',
    note: 'Room for a second import. No splits assigned, so nothing here is trainable yet.',
    status: DatasetStatus.STAGING,
    is_test_locked: false,
    locked_at: null,
    counts: STAGING_COUNTS,
    created_at: '2026-09-01T08:35:00+06:00',
  },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Datasets
 * ──────────────────────────────────────────────────────────────────────────────────────── */

const DATASET: Dataset = {
  id: 1,
  name: 'demo-dataset-01',
  description: 'Fixture dataset. Registered from a directory that this build never opened.',
  source: 'demo fixture — not a citation',
  status: DatasetStatus.ACTIVE,
  created_at: CREATED,
  archived_at: null,
};

/** An archived row, so the list's status filter and the "nothing is hard-deleted" rule are both visible. */
const ARCHIVED_DATASET: Dataset = {
  id: 2,
  name: 'demo-dataset-00',
  description: 'A first attempt, archived rather than deleted — §7 hard-deletes nothing.',
  source: null,
  status: DatasetStatus.ARCHIVED,
  created_at: '2026-08-05T14:10:00+06:00',
  archived_at: '2026-08-06T10:00:00+06:00',
};

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Images
 * ──────────────────────────────────────────────────────────────────────────────────────── */

interface ImageSeed {
  readonly split: ImageSplit;
  readonly review: ReviewStatus;
  readonly status: DataStatus;
  readonly label: string | null;
  readonly reviewed?: string;
}

/**
 * One page of rows for the detail screen's image table.
 *
 * `data_status` is spelled out per row rather than derived here, and the seeds are chosen so the
 * precedence in §4.1 is *visible*: row 4 is `UNUSED` + `VALIDATED` and shows as `VALIDATED`, because
 * review outcome outranks the split. A fixture where every `data_status` equalled its `split` would
 * make the derivation look like a no-op.
 *
 * Filenames are `demo-`prefixed six-digit sequences, not names shaped like the real dataset's, so no
 * row can be mistaken for a file on disk (§2.2). `patient_ref` and `lesion_ref` are likewise obvious
 * fixtures — they are not patient identifiers, real or plausible.
 */
const SEEDS: readonly ImageSeed[] = [
  { split: ImageSplit.TRAIN, review: ReviewStatus.NOT_REVIEWED, status: DataStatus.TRAIN, label: 'ACK' },
  { split: ImageSplit.TRAIN, review: ReviewStatus.NOT_REVIEWED, status: DataStatus.TRAIN, label: 'BCC' },
  { split: ImageSplit.VALIDATION, review: ReviewStatus.NOT_REVIEWED, status: DataStatus.VALIDATION, label: 'NEV' },
  { split: ImageSplit.UNUSED, review: ReviewStatus.VALIDATED, status: DataStatus.VALIDATED, label: 'NEV', reviewed: '2026-09-04T17:48:00+06:00' },
  { split: ImageSplit.UNUSED, review: ReviewStatus.VALIDATED, status: DataStatus.VALIDATED, label: null, reviewed: '2026-09-04T18:02:00+06:00' },
  { split: ImageSplit.UNUSED, review: ReviewStatus.SKIPPED, status: DataStatus.SKIPPED, label: 'SEK', reviewed: '2026-09-04T14:03:00+06:00' },
  { split: ImageSplit.UNUSED, review: ReviewStatus.IN_REVIEW, status: DataStatus.IN_REVIEW, label: 'SCC' },
  { split: ImageSplit.UNUSED, review: ReviewStatus.NOT_REVIEWED, status: DataStatus.UNUSED, label: 'MEL' },
  { split: ImageSplit.TEST, review: ReviewStatus.NOT_REVIEWED, status: DataStatus.TEST, label: 'ACK' },
  { split: ImageSplit.TEST, review: ReviewStatus.NOT_REVIEWED, status: DataStatus.TEST, label: 'BCC' },
  { split: ImageSplit.TRAIN, review: ReviewStatus.NOT_REVIEWED, status: DataStatus.TRAIN, label: 'SEK' },
  { split: ImageSplit.UNUSED, review: ReviewStatus.NOT_REVIEWED, status: DataStatus.UNUSED, label: null },
];

function toImage(seed: ImageSeed, index: number): ImageSummary {
  const n = index + 1;
  return {
    id: n,
    dataset_id: 1,
    dataset_version_id: 1,
    filename: `demo-${String(n).padStart(6, '0')}.png`,
    split: seed.split,
    review_status: seed.review,
    // `TRAINING_USED` would be a lie: no batch has ever claimed an image here.
    lifecycle: ImageLifecycle.ASSIGNED,
    data_status: seed.status,
    width: 640,
    height: 480,
    label_code: seed.label,
    patient_ref: `demo-patient-${String(Math.ceil(n / 2)).padStart(3, '0')}`,
    lesion_ref: `demo-lesion-${String(n).padStart(3, '0')}`,
    reviewed_at: seed.reviewed ?? null,
    created_at: CREATED,
  };
}

const IMAGES: Paginated<ImageSummary> = {
  items: SEEDS.map(toImage),
  page: 1,
  page_size: 25,
  // The page holds 12 of the 2298. Pagination is rendered from this figure, not from `items.length`.
  total: COUNTS.total,
  pages: Math.ceil(COUNTS.total / 25),
};

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Exports
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface DemoDatasets {
  /** Condition 3 of §10. A type-level `true`, so the compiler keeps it on. */
  readonly isDemo: true;
  readonly list: Paginated<Dataset>;
  readonly detail: DatasetDetail;
  readonly versions: readonly DatasetVersion[];
  readonly images: Paginated<ImageSummary>;
}

export const DEMO_DATASETS: DemoDatasets = {
  isDemo: true,
  list: {
    items: [DATASET, ARCHIVED_DATASET],
    page: 1,
    page_size: 25,
    total: 2,
    pages: 1,
  },
  detail: { ...DATASET, versions: VERSIONS, counts: COUNTS },
  versions: VERSIONS,
  images: IMAGES,
};
