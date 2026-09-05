/**
 * ┌───────────────────────────────────────────────────────────────────────────────────────┐
 * │  DEMO DATA — MedLoop AI model-analysis fixture.                                       │
 * │                                                                                       │
 * │  **No model has been trained on this machine. Nothing in this file was measured.**     │
 * │                                                                                       │
 * │  Governed by CLAUDE.md §10, and this is the one fixture where §10 is at its most       │
 * │  restrictive, because every figure on `/analyze` is by definition a claim about a       │
 * │  trained model's performance — the exact claim §2.3 and §10 forbid inventing.           │
 * │                                                                                       │
 * │  ## The registry is EMPTY, and that is the honest state                                 │
 * │                                                                                       │
 * │  {@link DEMO_ANALYZE}.`models` is `[]` and `active` is `null`. `/analyze` in demo mode   │
 * │  therefore renders `Blocked` with `NO_MODEL_REASON` — not a table of versions, not a     │
 * │  single percentage. A `Model` row carrying `test_metrics` would state that a forward      │
 * │  pass ran over a locked test set and produced those numbers. It did not.                 │
 * │                                                                                       │
 * │  ## `preview` is the §10 layout-preview carve-out, and nothing else may read it          │
 * │                                                                                       │
 * │  §10 allows one exception: "a separate, explicitly-labelled *layout preview* toggle       │
 * │  exists so the research view can be designed, and its numbers are watermarked            │
 * │  SYNTHETIC". {@link PreviewPayload} is that toggle's data and it is hand-typed to be      │
 * │  *shaped* like an evaluation so the tiles, the per-class table and the matrix can be      │
 * │  laid out. Its only legal consumer is `features/analyze/LayoutPreview.tsx`, which wraps    │
 * │  every pixel of it in `<SyntheticWatermark />` behind an off-by-default control.           │
 * │                                                                                       │
 * │  Three properties keep it from ever being mistaken for a result: it is unreachable        │
 * │  without a deliberate click, the watermark is inside the same subtree as the numbers so    │
 * │  a screenshot carries it, and `previewOnly: true` is a type-level marker any future        │
 * │  consumer has to acknowledge in writing.                                                  │
 * │                                                                                       │
 * │  The figures are chosen to exercise the *rendering*, not to look impressive: `v1` has an   │
 * │  unmeasured AUROC and no localisation at all, `v3` carries a `null` macro-precision, and   │
 * │  the version-to-version movement is small and uneven. A clean monotonic climb is what a    │
 * │  fabricated result looks like, and it is precisely the picture this project must never      │
 * │  publish.                                                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────┘
 */

import { ModelStatus } from '@/types/domain';
import type {
  ClassificationMetrics,
  ConfusionMatrix,
  LocalizationMetrics,
  Model,
  ModelComparison,
  ModelEvaluation,
  PerClassMetrics,
} from '@/types/domain';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The truthful state
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** No version is registered, because no training run has completed (§15). */
const NO_MODELS: readonly Model[] = [];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The layout preview — SYNTHETIC, hand-typed, watermarked at the point of use
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** The locked test version every preview row shares, so the comparison is `comparable: true`. */
const PREVIEW_TEST_VERSION_ID = 3;
const PREVIEW_TEST_VERSION_LABEL = 'test-locked-20260905';
/** 230 images: a ~10 % test split of the 2,298 the other fixtures count. */
const PREVIEW_SAMPLE_COUNT = 230;

const PREVIEW_LABELS: readonly string[] = ['ACK', 'BCC', 'NEV', 'SEK', 'SCC', 'MEL'];
/** Same class ratios as `demo-statistics.ts`, so the fixtures do not describe two datasets. */
const PREVIEW_SUPPORT: readonly number[] = [70, 60, 50, 30, 15, 5];

export const PREVIEW_MODEL_COUNT = 3;

/** Three parallel arrays into `PerClassMetrics` rows, so the numbers stay readable as columns. */
function previewPerClass(
  precision: readonly number[],
  recall: readonly number[],
  f1: readonly number[],
): readonly PerClassMetrics[] {
  return PREVIEW_LABELS.map((code, index) => ({
    label_code: code,
    precision: precision[index] ?? null,
    recall: recall[index] ?? null,
    f1: f1[index] ?? null,
    support: PREVIEW_SUPPORT[index] ?? 0,
  }));
}

/**
 * `null` is used deliberately below.
 *
 * A metric that was not computed is `null`, never `0`, and the preview has to prove the tiles handle
 * that — `v1` predates the AUROC code path and carries no localisation at all. If every field were
 * populated the preview would be checking the easy half of the layout only.
 */
const V1_METRICS: ClassificationMetrics = {
  accuracy: 0.7261,
  macro_f1: 0.5488,
  macro_precision: 0.5931,
  macro_recall: 0.5217,
  auroc_macro: null,
};

const V2_METRICS: ClassificationMetrics = {
  accuracy: 0.7478,
  macro_f1: 0.5903,
  macro_precision: 0.6104,
  macro_recall: 0.5766,
  auroc_macro: 0.8842,
};

/**
 * Accuracy slips while macro-F1 rises — the imbalance story macro-F1 exists to tell, and the reason
 * §8.1 makes it the default promotion metric. A preview in which every number climbs together would
 * be teaching the wrong lesson about what these five figures are for.
 *
 * Every value here is derived by hand from {@link V3_MATRIX} rather than chosen: accuracy is its
 * trace over 230, and the three macro averages are the means of the per-class columns below. The
 * frontend must never *compute* a metric (§3.1), so the arithmetic was done once, off-screen, and
 * written down — which also means a reader who checks the matrix against the tiles finds them
 * agreeing instead of finding two different synthetic stories.
 */
const V3_METRICS: ClassificationMetrics = {
  accuracy: 0.7391,
  macro_f1: 0.6633,
  macro_precision: 0.6755,
  macro_recall: 0.6537,
  auroc_macro: 0.8971,
};

/**
 * Row-major, `labels[i]` true and `labels[j]` predicted, per {@link ConfusionMatrix}.
 *
 * Each row sums to its class support, which is the one internal consistency a matrix has to satisfy;
 * a preview whose margins disagreed with the per-class table would teach the layout nothing. MEL —
 * five samples — is mostly predicted as NEV, which is the failure a dermatology model actually makes,
 * and it is why the melanoma row is the one worth looking at even though it is the smallest.
 *
 * Only `v3` carries a matrix. `v1` and `v2` leave it `null` so the grid's own empty state is on screen
 * in the preview rather than being assumed to work.
 */
const V3_MATRIX: ConfusionMatrix = {
  labels: PREVIEW_LABELS,
  rows: [
    [55, 5, 6, 2, 2, 0],
    [3, 49, 4, 2, 2, 0],
    [6, 3, 36, 3, 0, 2],
    [4, 2, 3, 20, 1, 0],
    [1, 4, 1, 1, 8, 0],
    [0, 0, 2, 0, 1, 2],
  ],
};

/** Precision, recall and F1 for {@link V3_MATRIX}, in {@link PREVIEW_LABELS} order. */
const V3_PER_CLASS: readonly PerClassMetrics[] = previewPerClass(
  [0.7971, 0.7778, 0.6923, 0.7143, 0.5714, 0.5],
  [0.7857, 0.8167, 0.72, 0.6667, 0.5333, 0.4],
  [0.7912, 0.7967, 0.7059, 0.6897, 0.5517, 0.4444],
);

/**
 * Localisation, with the threshold it is measured at — §2.3 requires publishing it, because a pass
 * rate over an unknown cut-off is not a reading anyone can interpret.
 *
 * `sample_count` is 41, not 230: IoU needs *both* a human ROI and an AI region for the same image, and
 * only a fraction of a test set has been annotated by hand. A localisation figure quoted over the whole
 * test set would be the more flattering number and the wrong one.
 */
const V3_LOCALIZATION: LocalizationMetrics = {
  mean_iou: 0.4913,
  localization_accuracy: 0.4390,
  iou_threshold: 0.5,
  sample_count: 41,
};

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Preview versions
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `v1` from the initial train split, `v2` from HITL batch 001, `v3` a candidate from batch 002 — the
 * §14 protocol as three rows, which is the shape the registry has to lay out.
 *
 * `v3` is `CANDIDATE` and `v2` is `ACTIVE`, so the promote and reject controls are reachable in the
 * preview and their placement can be judged. The controls are inert there: `LayoutPreview` passes no
 * handlers, because a promotion is a real audited transition and there is nothing to transition.
 */
const PREVIEW_MODELS: readonly Model[] = [
  {
    id: 3,
    version: 'v3',
    status: ModelStatus.CANDIDATE,
    architecture: 'resnet18',
    training_batch_id: 2,
    training_dataset_version_id: 4,
    trained_at: '2026-09-04T21:12:40+06:00',
    epochs_completed: 22,
    test_metrics: V3_METRICS,
    test_dataset_version_id: PREVIEW_TEST_VERSION_ID,
    promoted_at: null,
    rejected_at: null,
    archived_at: null,
    created_at: '2026-09-04T19:58:03+06:00',
  },
  {
    id: 2,
    version: 'v2',
    status: ModelStatus.ACTIVE,
    architecture: 'resnet18',
    training_batch_id: 1,
    training_dataset_version_id: 3,
    trained_at: '2026-08-28T14:31:07+06:00',
    epochs_completed: 30,
    test_metrics: V2_METRICS,
    test_dataset_version_id: PREVIEW_TEST_VERSION_ID,
    promoted_at: '2026-08-28T15:02:19+06:00',
    rejected_at: null,
    archived_at: null,
    created_at: '2026-08-28T13:04:55+06:00',
  },
  {
    id: 1,
    version: 'v1',
    status: ModelStatus.ARCHIVED,
    architecture: 'resnet18',
    training_batch_id: null,
    training_dataset_version_id: 2,
    trained_at: '2026-08-19T11:22:48+06:00',
    epochs_completed: 30,
    test_metrics: V1_METRICS,
    test_dataset_version_id: PREVIEW_TEST_VERSION_ID,
    promoted_at: '2026-08-19T11:40:02+06:00',
    rejected_at: null,
    archived_at: '2026-08-28T15:02:19+06:00',
    created_at: '2026-08-19T10:15:30+06:00',
  },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Preview evaluations
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One evaluation per version, all on the *same* locked test version — which is what makes the
 * comparison legal at all (§9).
 *
 * `device` is `cpu` throughout. §2.3 requires reporting the device the forward pass actually ran on,
 * and since none of these ran anywhere, the least misleading value is the one the settings fixture
 * already carries.
 */
const PREVIEW_EVALUATIONS: Readonly<Record<number, ModelEvaluation>> = {
  3: {
    id: 3,
    model_id: 3,
    model_version: 'v3',
    dataset_version_id: PREVIEW_TEST_VERSION_ID,
    dataset_version_label: PREVIEW_TEST_VERSION_LABEL,
    metrics: V3_METRICS,
    per_class: V3_PER_CLASS,
    confusion_matrix: V3_MATRIX,
    localization: V3_LOCALIZATION,
    sample_count: PREVIEW_SAMPLE_COUNT,
    device: 'cpu',
    created_at: '2026-09-04T21:19:11+06:00',
  },
  2: {
    id: 2,
    model_id: 2,
    model_version: 'v2',
    dataset_version_id: PREVIEW_TEST_VERSION_ID,
    dataset_version_label: PREVIEW_TEST_VERSION_LABEL,
    metrics: V2_METRICS,
    // Empty and `null` on purpose: the per-class table and the matrix must show their empty states.
    per_class: [],
    confusion_matrix: null,
    localization: {
      mean_iou: 0.4471,
      localization_accuracy: 0.3659,
      iou_threshold: 0.5,
      sample_count: 41,
    },
    sample_count: PREVIEW_SAMPLE_COUNT,
    device: 'cpu',
    created_at: '2026-08-28T14:38:52+06:00',
  },
  1: {
    id: 1,
    model_id: 1,
    model_version: 'v1',
    dataset_version_id: PREVIEW_TEST_VERSION_ID,
    dataset_version_label: PREVIEW_TEST_VERSION_LABEL,
    metrics: V1_METRICS,
    per_class: [],
    confusion_matrix: null,
    /** No localisation at all — the baseline predates any human ROI to compare against. */
    localization: null,
    sample_count: PREVIEW_SAMPLE_COUNT,
    device: 'cpu',
    created_at: '2026-08-19T11:29:16+06:00',
  },
};

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Preview comparison
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** Ascending by version, because a comparison is read left to right as the loop progressing. */
const PREVIEW_COMPARISON: ModelComparison = {
  test_dataset_version_id: PREVIEW_TEST_VERSION_ID,
  comparable: true,
  reason: null,
  rows: [1, 2, 3].map((id) => {
    const model = PREVIEW_MODELS.find((candidate) => candidate.id === id);
    const evaluation = PREVIEW_EVALUATIONS[id];
    return {
      model_id: id,
      version: model?.version ?? `v${String(id)}`,
      status: model?.status ?? ModelStatus.ARCHIVED,
      trained_at: model?.trained_at ?? null,
      metrics: evaluation?.metrics ?? V1_METRICS,
      localization: evaluation?.localization ?? null,
      sample_count: PREVIEW_SAMPLE_COUNT,
    };
  }),
};

/**
 * The refusal §9 requires, kept beside the legal comparison so the branch that renders it is not dead
 * code in the preview. The compare screen offers it as an explicit control rather than as the default,
 * because the default should show the layout that will normally be on screen.
 */
const PREVIEW_INCOMPARABLE: ModelComparison = {
  test_dataset_version_id: null,
  comparable: false,
  reason:
    'v2 was evaluated on test-locked-20260905 and v4 on test-locked-20261102. Two models measured on different test data are not a comparison, so no figures are shown. Evaluate both against the same locked dataset version before comparing them.',
  rows: [],
};

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Exports
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The synthetic half, behind one property so a consumer cannot reach a preview number by accident.
 *
 * `previewOnly: true` is a type-level marker, not a runtime flag. Anything that destructures this has
 * had to write the word "preview", which is the smallest possible speed bump between a hand-typed
 * figure and a screen that presents it as a result.
 */
export interface PreviewPayload {
  readonly previewOnly: true;
  readonly models: readonly Model[];
  readonly evaluations: Readonly<Record<number, ModelEvaluation>>;
  readonly comparison: ModelComparison;
  /** The `comparable: false` branch, for the control that demonstrates the refusal. */
  readonly incomparable: ModelComparison;
}

export interface DemoAnalyze {
  /** Condition 3 of §10. A type-level `true`, so the compiler keeps it on. */
  readonly isDemo: true;
  /** Empty. See the header: an absent model is the truthful state of this machine. */
  readonly models: readonly Model[];
  /** `null`. No version has been promoted, because no version has been trained. */
  readonly active: Model | null;
  readonly preview: PreviewPayload;
}

export const DEMO_ANALYZE: DemoAnalyze = {
  isDemo: true,
  models: NO_MODELS,
  active: null,
  preview: {
    previewOnly: true,
    models: PREVIEW_MODELS,
    evaluations: PREVIEW_EVALUATIONS,
    comparison: PREVIEW_COMPARISON,
    incomparable: PREVIEW_INCOMPARABLE,
  },
};
