/**
 * MedLoop AI — the shared vocabulary (CLAUDE.md §4).
 *
 * Every enum in this file is declared a second time in `backend/app/core/enums.py` with
 * **byte-identical string values**, and `backend/tests/test_enum_parity.py` parses both
 * files and fails if they drift. Adding a member here without adding it there is a defect.
 *
 * Enums are const objects rather than TypeScript `enum` declarations: `enum` emits runtime
 * code that `isolatedModules` complicates, const objects erase cleanly, and — the reason
 * that matters here — a flat `NAME: 'VALUE'` line is trivially parseable by the parity
 * test, which has to read this file as text rather than import it.
 *
 * String values, never ordinals. A number would let two members with the same position
 * compare equal across a rename, and these values are persisted in Postgres.
 *
 * NOTE (2026-09-05): this file is being written **before** `enums.py` exists, so for now it
 * is the sole source of the vocabulary. `enums.py` must mirror it, and the parity test must
 * be created alongside it, in the same commit.
 *
 * Two enums here are **not** in CLAUDE.md §4's table: {@link LogEvent} and {@link ServiceKey}.
 * They are still cross-language — the backend emits both values — so `enums.py` mirrors them
 * too, and the parity test's contract is: the 18 enums named in §4 must exist on both sides, and
 * any enum present on *both* sides must match member-for-member. That way adding a
 * frontend-only helper enum later fails loudly rather than being silently exempt.
 */

/* ────────────────────────────────────────────────────────────────────────────────────────
 * People
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export const Role = {
  ADMIN: 'ADMIN',
  ANNOTATOR: 'ANNOTATOR',
  RESEARCHER: 'RESEARCHER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Images: where a sample sits, and what a human did with it
 *
 * `split` and `reviewStatus` are orthogonal on purpose (§4.1). A TRAIN image is never
 * reviewed; an UNUSED image walks NOT_REVIEWED → IN_REVIEW → VALIDATED | SKIPPED.
 * Collapsing them into one column loses information and makes the transition guards in
 * `services/` unwriteable.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export const ImageSplit = {
  UNASSIGNED: 'UNASSIGNED',
  TRAIN: 'TRAIN',
  VALIDATION: 'VALIDATION',
  TEST: 'TEST',
  UNUSED: 'UNUSED',
} as const;
export type ImageSplit = (typeof ImageSplit)[keyof typeof ImageSplit];

export const ReviewStatus = {
  NOT_REVIEWED: 'NOT_REVIEWED',
  IN_REVIEW: 'IN_REVIEW',
  VALIDATED: 'VALIDATED',
  SKIPPED: 'SKIPPED',
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const ImageLifecycle = {
  STAGING: 'STAGING',
  ASSIGNED: 'ASSIGNED',
  TRAINING_USED: 'TRAINING_USED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ImageLifecycle = (typeof ImageLifecycle)[keyof typeof ImageLifecycle];

/**
 * The single flat vocabulary the UI filter and the statistics endpoints speak.
 *
 * Derived, never stored. See {@link deriveDataStatus} for the one implementation, which is
 * mirrored by `derive_data_status()` in Python.
 */
export const DataStatus = {
  STAGING: 'STAGING',
  TRAIN: 'TRAIN',
  VALIDATION: 'VALIDATION',
  TEST: 'TEST',
  UNUSED: 'UNUSED',
  IN_REVIEW: 'IN_REVIEW',
  VALIDATED: 'VALIDATED',
  SKIPPED: 'SKIPPED',
  TRAINING_USED: 'TRAINING_USED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type DataStatus = (typeof DataStatus)[keyof typeof DataStatus];

export const DatasetStatus = {
  STAGING: 'STAGING',
  ACTIVE: 'ACTIVE',
  LOCKED: 'LOCKED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type DatasetStatus = (typeof DatasetStatus)[keyof typeof DatasetStatus];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Annotation
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export const AnnotationType = {
  BOUNDING_BOX: 'BOUNDING_BOX',
  POLYGON: 'POLYGON',
  ROUNDED_BOX: 'ROUNDED_BOX',
} as const;
export type AnnotationType = (typeof AnnotationType)[keyof typeof AnnotationType];

/**
 * Who drew a shape. `AI_LOCALIZATION` geometry is derived from a model's attribution map;
 * `HUMAN` geometry was drawn by an annotator. Accepting an AI box **copies** it into a new
 * `HUMAN` row — the AI row is never edited (§2.4).
 */
export const AnnotationSource = {
  HUMAN: 'HUMAN',
  AI_LOCALIZATION: 'AI_LOCALIZATION',
} as const;
export type AnnotationSource = (typeof AnnotationSource)[keyof typeof AnnotationSource];

export const SkipReason = {
  POOR_IMAGE_QUALITY: 'POOR_IMAGE_QUALITY',
  UNCLEAR: 'UNCLEAR',
  WRONG_IMAGE_TYPE: 'WRONG_IMAGE_TYPE',
  DUPLICATE: 'DUPLICATE',
  CANNOT_DETERMINE: 'CANNOT_DETERMINE',
  OTHER: 'OTHER',
} as const;
export type SkipReason = (typeof SkipReason)[keyof typeof SkipReason];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Models, batches, jobs
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export const ModelStatus = {
  ACTIVE: 'ACTIVE',
  CANDIDATE: 'CANDIDATE',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ModelStatus = (typeof ModelStatus)[keyof typeof ModelStatus];

export const TrainingBatchStatus = {
  CREATED: 'CREATED',
  TRAINING: 'TRAINING',
  EVALUATING: 'EVALUATING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type TrainingBatchStatus = (typeof TrainingBatchStatus)[keyof typeof TrainingBatchStatus];

/**
 * A batch is *what to train on* and is immutable; a job is *an attempt at training it* and
 * is retryable. That is why the two status enums exist separately despite overlapping
 * members (§7).
 */
export const TrainingJobStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  EVALUATING: 'EVALUATING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type TrainingJobStatus = (typeof TrainingJobStatus)[keyof typeof TrainingJobStatus];

/** Derived from the counter, the batch and the candidate — never stored. */
export const HitlCycleStage = {
  NOT_READY: 'NOT_READY',
  READY_FOR_RETRAINING: 'READY_FOR_RETRAINING',
  TRAINING: 'TRAINING',
  EVALUATING: 'EVALUATING',
  CANDIDATE: 'CANDIDATE',
  PROMOTED: 'PROMOTED',
  REJECTED: 'REJECTED',
} as const;
export type HitlCycleStage = (typeof HitlCycleStage)[keyof typeof HitlCycleStage];

/** Configured intent. The device a forward pass *actually* ran on is reported separately (§2.3). */
export const TrainingDevice = {
  AUTO: 'AUTO',
  MPS: 'MPS',
  CPU: 'CPU',
} as const;
export type TrainingDevice = (typeof TrainingDevice)[keyof typeof TrainingDevice];

/** Default is `MANUAL_APPROVAL`: a clinical-adjacent system should not self-deploy (§8.1). */
export const PromotionMode = {
  AUTOMATIC: 'AUTOMATIC',
  MANUAL_APPROVAL: 'MANUAL_APPROVAL',
} as const;
export type PromotionMode = (typeof PromotionMode)[keyof typeof PromotionMode];

/**
 * Default is `MACRO_F1`: `minimum_improvement` is meaningless without naming the metric it
 * improves, and macro-F1 resists the class imbalance a skin-lesion dataset carries (§8.1).
 */
export const PromotionMetric = {
  ACCURACY: 'ACCURACY',
  MACRO_F1: 'MACRO_F1',
  MACRO_PRECISION: 'MACRO_PRECISION',
  MACRO_RECALL: 'MACRO_RECALL',
  AUROC_MACRO: 'AUROC_MACRO',
} as const;
export type PromotionMetric = (typeof PromotionMetric)[keyof typeof PromotionMetric];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Operations
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** A check that could not be performed reports `UNKNOWN`, never `ONLINE`. */
export const ServiceState = {
  ONLINE: 'ONLINE',
  DEGRADED: 'DEGRADED',
  OFFLINE: 'OFFLINE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type ServiceState = (typeof ServiceState)[keyof typeof ServiceState];

export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Derived status — one implementation per language (§4.1)
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** The inputs `deriveDataStatus` reads. Anything with these three fields satisfies it. */
export interface DataStatusInput {
  readonly lifecycle: ImageLifecycle;
  readonly reviewStatus: ReviewStatus;
  readonly split: ImageSplit;
}

/**
 * Collapse `(lifecycle, reviewStatus, split)` into the single flat {@link DataStatus} the UI
 * filters and the statistics endpoints use.
 *
 * Precedence, highest first (§4.1):
 *
 *     ARCHIVED > TRAINING_USED > VALIDATED > SKIPPED > IN_REVIEW
 *              > split (TRAIN | VALIDATION | TEST | UNUSED) > STAGING
 *
 * Mirrored by `derive_data_status()` in `backend/app/core/enums.py`. The two must agree for
 * every one of the 4 × 4 × 5 = 80 input combinations; a table-driven test over the full
 * cross-product is the cheapest guard, and it is cheap enough that there is no excuse.
 *
 * Why lifecycle wins over review status: an archived image that happens to carry a
 * `VALIDATED` review is still archived, and a `TRAINING_USED` image's review already
 * happened — showing it as `VALIDATED` would make it look available to the HITL pool when
 * it has already been consumed.
 */
export function deriveDataStatus(input: DataStatusInput): DataStatus {
  const { lifecycle, reviewStatus, split } = input;

  if (lifecycle === ImageLifecycle.ARCHIVED) return DataStatus.ARCHIVED;
  if (lifecycle === ImageLifecycle.TRAINING_USED) return DataStatus.TRAINING_USED;

  if (reviewStatus === ReviewStatus.VALIDATED) return DataStatus.VALIDATED;
  if (reviewStatus === ReviewStatus.SKIPPED) return DataStatus.SKIPPED;
  if (reviewStatus === ReviewStatus.IN_REVIEW) return DataStatus.IN_REVIEW;

  switch (split) {
    case ImageSplit.TRAIN:
      return DataStatus.TRAIN;
    case ImageSplit.VALIDATION:
      return DataStatus.VALIDATION;
    case ImageSplit.TEST:
      return DataStatus.TEST;
    case ImageSplit.UNUSED:
      return DataStatus.UNUSED;
    case ImageSplit.UNASSIGNED:
      return DataStatus.STAGING;
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Geometry — normalised [0,1] against the ORIGINAL image size (§4.3)
 *
 * Origin top-left, `x` right, `y` down. Never pixels: the viewer zooms and pans, and a
 * pixel coordinate would silently rot the moment the image is displayed at another size.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * A normalised point. Both components are in `[0,1]`.
 *
 * This is the **in-memory** point shape — what the viewport conversion and the hit tests work with.
 * It is deliberately *not* the wire shape of a polygon; see {@link PolygonGeometry}.
 */
export interface NormPoint {
  readonly x: number;
  readonly y: number;
}

/** A normalised axis-aligned box. This is also the shape every IoU calculation consumes. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface BoundingBoxGeometry extends Box {
  readonly type: typeof AnnotationType.BOUNDING_BOX;
}

/** `r` is normalised against `min(w, h)` — not against the image — and is `0 … 0.5`. */
export interface RoundedBoxGeometry extends Box {
  readonly type: typeof AnnotationType.ROUNDED_BOX;
  readonly r: number;
}

/**
 * At least 3 points, implicitly closed. The first point is never repeated at the end.
 *
 * Points are `[x, y]` **pairs, not `{x, y}` objects**, because that is the payload CLAUDE.md §4.3
 * and `docs/annotation_workflow.md` both specify, and this type is posted to the API verbatim — a
 * nicer-looking client type would simply be the wrong request body. The canvas converts to
 * {@link NormPoint} where objects read better and converts back on commit; that boundary is one
 * function in `geometry.ts`, which is cheaper than a whole-payload mapping layer.
 */
export interface PolygonGeometry {
  readonly type: typeof AnnotationType.POLYGON;
  readonly points: readonly (readonly [number, number])[];
}

export type Geometry = BoundingBoxGeometry | RoundedBoxGeometry | PolygonGeometry;

/** Natural pixel dimensions of an image, used only to convert for display. */
export interface PixelSize {
  readonly w: number;
  readonly h: number;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Entities — the DTO shapes from docs/api_contract.md
 *
 * Nullability here is copied from the contract, not guessed. `ai_prediction: null` means no
 * model exists; the UI renders `<Unavailable/>` and never substitutes a zero (§2.3).
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface User {
  readonly id: number;
  readonly username: string;
  readonly display_name: string;
  readonly role: Role;
  readonly is_active: boolean;
  readonly created_at: string;
}

/** The configurable label space. No disease code is hard-coded in either codebase (§5). */
export interface DiseaseLabel {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly display_order: number;
  readonly is_active: boolean;
  /** Stays `false` until the codes have been confirmed against the real files. */
  readonly verified_against_data: boolean;
  readonly created_at: string;
}

/** Lower-cased `DataStatus` members, exactly as the contract spells them. */
export interface DatasetCounts {
  readonly total: number;
  readonly staging: number;
  readonly train: number;
  readonly validation: number;
  readonly test: number;
  readonly unused: number;
  readonly in_review: number;
  readonly validated: number;
  readonly skipped: number;
  readonly training_used: number;
  readonly archived: number;
}

export interface Dataset {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly source: string | null;
  readonly status: DatasetStatus;
  readonly created_at: string;
  readonly archived_at: string | null;
}

export interface DatasetVersion {
  readonly id: number;
  readonly dataset_id: number;
  readonly label: string;
  readonly note: string | null;
  readonly status: DatasetStatus;
  /** Once true, split reassignment, deletion and image mutation are all refused (§2.5). */
  readonly is_test_locked: boolean;
  readonly locked_at: string | null;
  readonly counts: DatasetCounts;
  readonly created_at: string;
}

export interface DatasetDetail extends Dataset {
  readonly versions: readonly DatasetVersion[];
  readonly counts: DatasetCounts;
}

export interface Upload {
  readonly id: number;
  readonly dataset_id: number | null;
  readonly dataset_name: string;
  readonly description: string | null;
  readonly image_directory: string;
  readonly annotation_file: string | null;
  readonly metadata_file: string | null;
  readonly status: DatasetStatus;
  readonly inspection: { readonly state: string; readonly reason: string | null };
  readonly created_at: string;
}

export interface ImageSummary {
  readonly id: number;
  readonly dataset_id: number;
  readonly dataset_version_id: number;
  readonly filename: string;
  readonly split: ImageSplit;
  readonly review_status: ReviewStatus;
  readonly lifecycle: ImageLifecycle;
  /** Derived server-side with the same precedence as {@link deriveDataStatus}. */
  readonly data_status: DataStatus;
  readonly width: number | null;
  readonly height: number | null;
  /** Publisher-supplied label where one exists. `null` is not "unlabelled by mistake". */
  readonly label_code: string | null;
  readonly patient_ref: string | null;
  readonly lesion_ref: string | null;
  readonly reviewed_at: string | null;
  readonly created_at: string;
}

export interface Annotation {
  readonly id: number;
  readonly image_id: number;
  readonly annotator_id: number | null;
  readonly annotator_username: string | null;
  readonly source: AnnotationSource;
  readonly type: AnnotationType;
  readonly geometry: Geometry;
  readonly label_code: string | null;
  readonly created_at: string;
  readonly archived_at: string | null;
}

/** Immutable. A human correction never updates one of these rows (§2.4). */
export interface AiPrediction {
  readonly id: number;
  readonly image_id: number;
  readonly model_id: number;
  readonly model_version: string;
  readonly predicted_label_code: string;
  readonly confidence: number;
  /** Full class-probability vector, keyed by label code. */
  readonly probabilities: Readonly<Record<string, number>>;
  readonly gradcam_path: string | null;
  readonly localization: Geometry | null;
  /** The device the forward pass actually ran on, not the configured one (§2.3). */
  readonly device: string;
  readonly created_at: string;
}

/**
 * The provenance chain §7.1 requires the schema to answer *by query alone*. It is surfaced here
 * because the image detail drawer is where a researcher asks "where did this come from"; every
 * field is a join result, not a stored summary.
 */
export interface ImageLineage {
  readonly dataset_id: number;
  readonly dataset_name: string;
  readonly dataset_version_id: number;
  readonly dataset_version_label: string;
  readonly upload_id: number | null;
  readonly reviewed_by_id: number | null;
  readonly reviewed_by_username: string | null;
  readonly reviewed_at: string | null;
  /** Every batch that consumed this image, oldest first. Append-only (§8.4). */
  readonly training_batch_ids: readonly number[];
  /** Every model version trained on it — the answer to "did V2 see this sample?". */
  readonly trained_model_versions: readonly string[];
}

export interface ImageDetail extends ImageSummary {
  /** `null` means no model exists. The UI renders `<Unavailable/>`, never a zero (§2.3). */
  readonly ai_prediction: AiPrediction | null;
  readonly annotations: readonly Annotation[];
  readonly lineage: ImageLineage;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Review
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One human pass over one image. `agreement` and `ai_model_version` are stored *here*, at submit
 * time, so agreement stays attributable after a promotion changes the active model (§6.3).
 */
export interface ReviewSession {
  readonly id: number;
  readonly image_id: number;
  readonly reviewer_id: number;
  readonly reviewer_username: string;
  readonly human_label_code: string | null;
  readonly ai_predicted_label_code: string | null;
  readonly ai_confidence: number | null;
  readonly ai_model_version: string | null;
  /** `null` when there was no prediction to agree or disagree with. */
  readonly agreement: boolean | null;
  readonly review_status: ReviewStatus;
  readonly skip_reason: SkipReason | null;
  readonly note: string | null;
  readonly time_spent_ms: number | null;
  readonly created_at: string;
}

/** Where the current image sits in the queue. Drives the "3 of 412" indicator only. */
export interface QueuePosition {
  readonly position: number;
  readonly total: number;
  readonly remaining: number;
}

export interface ReviewItem {
  readonly image: ImageSummary;
  readonly image_url: string;
  /** `null` ⇒ no model exists; show "unavailable", never a fabricated class (§2.3). */
  readonly ai_prediction: AiPrediction | null;
  /** `null` ⇒ hide the XAI view *entirely*. An all-zero attribution still draws convincingly. */
  readonly gradcam_url: string | null;
  readonly ai_localization: Geometry | null;
  readonly existing_annotations: readonly Annotation[];
  readonly queue: QueuePosition;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Metrics
 *
 * Every field is nullable and the whole block is omitted rather than zeroed when a figure could
 * not be computed (§2.3, and the `source` discipline in docs/api_contract.md). `0.0` and "not
 * measured" are different facts, and a chart cannot tell them apart.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** Keys are the lower-cased {@link PromotionMetric} members, so promotion can index by setting. */
export interface ClassificationMetrics {
  readonly accuracy: number | null;
  readonly macro_f1: number | null;
  readonly macro_precision: number | null;
  readonly macro_recall: number | null;
  readonly auroc_macro: number | null;
}

/** Per-class row. `support` is mandatory: a macro average over 2 samples is not a result. */
export interface PerClassMetrics {
  readonly label_code: string;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
  readonly support: number;
}

/**
 * Row-major counts. `labels[i]` is the true class of `rows[i]`, `labels[j]` the predicted class of
 * `rows[i][j]`. Labels travel with the matrix so the axes cannot be transposed by a caller.
 */
export interface ConfusionMatrix {
  readonly labels: readonly string[];
  readonly rows: readonly (readonly number[])[];
}

/** Localisation quality. Present only once human ROIs and model localisation both exist. */
export interface LocalizationMetrics {
  readonly mean_iou: number | null;
  /** Fraction of samples whose IoU clears `iou_threshold`. The threshold is always published. */
  readonly localization_accuracy: number | null;
  readonly iou_threshold: number | null;
  readonly sample_count: number;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Models
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface Model {
  readonly id: number;
  /** Human-facing version string, e.g. `v1`. Unique; never reused after archival. */
  readonly version: string;
  readonly status: ModelStatus;
  readonly architecture: string;
  readonly training_batch_id: number | null;
  readonly training_dataset_version_id: number | null;
  readonly trained_at: string | null;
  readonly epochs_completed: number | null;
  /** Metrics on the *locked test set*, so two versions are comparable by construction (§9). */
  readonly test_metrics: ClassificationMetrics | null;
  readonly test_dataset_version_id: number | null;
  readonly promoted_at: string | null;
  readonly rejected_at: string | null;
  readonly archived_at: string | null;
  readonly created_at: string;
}

/** One epoch of training history. Streamed into the job row so the UI can poll (§9.1). */
export interface EpochRecord {
  readonly epoch: number;
  readonly train_loss: number | null;
  readonly val_loss: number | null;
  readonly val_accuracy: number | null;
  readonly val_macro_f1: number | null;
  readonly duration_ms: number | null;
}

export interface ModelEvaluation {
  readonly id: number;
  readonly model_id: number;
  readonly model_version: string;
  /** Which test data produced these numbers. Comparison across different values is refused (§9). */
  readonly dataset_version_id: number;
  readonly dataset_version_label: string;
  readonly metrics: ClassificationMetrics;
  readonly per_class: readonly PerClassMetrics[];
  readonly confusion_matrix: ConfusionMatrix | null;
  readonly localization: LocalizationMetrics | null;
  readonly sample_count: number;
  readonly device: string;
  readonly created_at: string;
}

export interface ModelDetail extends Model {
  /** Opaque by design: the training script owns the key set, not this type. */
  readonly hyperparameters: Readonly<Record<string, string | number | boolean>>;
  readonly loss_history: readonly EpochRecord[];
  readonly evaluations: readonly ModelEvaluation[];
  readonly artifact_path: string | null;
  readonly promotion_reason: string | null;
  readonly rejection_reason: string | null;
}

/** One row of `/models/comparison`. Rendered only when `comparable` is true. */
export interface ModelComparisonRow {
  readonly model_id: number;
  readonly version: string;
  readonly status: ModelStatus;
  readonly trained_at: string | null;
  readonly metrics: ClassificationMetrics;
  readonly localization: LocalizationMetrics | null;
  readonly sample_count: number;
}

/**
 * `comparable === false` carries a `reason` and the UI must render **the refusal, not the numbers**
 * — candidates measured on different test versions are not a comparison (§9).
 */
export interface ModelComparison {
  readonly test_dataset_version_id: number | null;
  readonly comparable: boolean;
  readonly reason: string | null;
  readonly rows: readonly ModelComparisonRow[];
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Batches and jobs
 *
 * A batch is *what to train on* and is immutable; a job is *an attempt at training it* and is
 * retryable. Batch 001 created at a threshold of 1000 stays a 1000-sample batch forever,
 * whatever the setting later becomes (§8.4).
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface TrainingBatch {
  readonly id: number;
  /** Monotonic, 1-based, and printed as `batch_001` in `storage/training_batches/`. */
  readonly batch_number: number;
  readonly status: TrainingBatchStatus;
  /** Frozen at creation. Never re-read from settings (§8.4). */
  readonly threshold_at_creation: number;
  readonly sample_count: number;
  readonly dataset_version_id: number | null;
  readonly created_at: string;
  readonly completed_at: string | null;
}

export interface TrainingBatchDetail extends TrainingBatch {
  readonly manifest_path: string | null;
  /** Per-class composition of the batch, so imbalance is visible before training starts. */
  readonly label_distribution: readonly { readonly label_code: string; readonly count: number }[];
  readonly jobs: readonly TrainingJob[];
  readonly resulting_model_id: number | null;
}

export interface TrainingJob {
  readonly id: number;
  readonly training_batch_id: number;
  readonly status: TrainingJobStatus;
  readonly device_requested: TrainingDevice;
  /** What the worker actually got. May differ from `device_requested` (§2.3). */
  readonly device_actual: string | null;
  readonly current_epoch: number | null;
  readonly total_epochs: number | null;
  /** `0 … 1`, clamped server-side. */
  readonly progress: number | null;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly error_message: string | null;
  readonly created_at: string;
}

export interface TrainingJobDetail extends TrainingJob {
  readonly epochs: readonly EpochRecord[];
  /** Last N worker log lines, already truncated server-side. Not a substitute for `system_logs`. */
  readonly log_tail: readonly string[];
  readonly hyperparameters: Readonly<Record<string, string | number | boolean>>;
  readonly resulting_model_id: number | null;
}

/**
 * The HITL cycle as one object. `threshold` is always the server's current setting — the client
 * never assumes 1000 (§2.6), and `threshold_met` is evaluated server-side so lowering the
 * threshold below the current count immediately reads as met (§8.4).
 */
export interface HitlStatus {
  readonly validated_since_last_training: number;
  readonly threshold: number;
  readonly remaining: number;
  /** `0 … 1`, clamped. Never derived client-side from the two counts above. */
  readonly progress: number;
  readonly stage: HitlCycleStage;
  readonly threshold_met: boolean;
  readonly current_batch: TrainingBatch | null;
  readonly current_job: TrainingJob | null;
  readonly active_model: Model | null;
  readonly candidate_model: Model | null;
  readonly last_training_at: string | null;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Settings and audit
 *
 * The frontend validates these for UX only. Server-side validation is authoritative and must be
 * assumed to be stricter (§8.1).
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface TrainingSettings {
  /** `> 0`. Default 1000 — a *default*, never a literal in a training condition (§2.6). */
  readonly hitl_retraining_threshold: number;
  readonly training_device: TrainingDevice;
  /** `1 … 512` */
  readonly batch_size: number;
  /** `1 … 1000` */
  readonly max_epochs: number;
  readonly early_stopping: boolean;
  readonly candidate_promotion_mode: PromotionMode;
  /** `0.0 … 1.0`, measured in `primary_promotion_metric` units. */
  readonly minimum_improvement: number;
  readonly primary_promotion_metric: PromotionMetric;
}

/** `PUT /admin/settings/training` accepts any subset, plus an optional audit reason. */
export type TrainingSettingsPatch = Partial<TrainingSettings>;

/** One audited settings mutation. Values are stringified so one row type covers every key. */
export interface SettingChange {
  readonly id: number;
  readonly key: string;
  readonly old_value: string | null;
  readonly new_value: string;
  readonly actor_id: number | null;
  readonly actor_username: string | null;
  readonly reason: string | null;
  readonly at: string;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Operations
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** The 21 audited events from docs/api_contract.md. Used for the log filter dropdown. */
export const LogEvent = {
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  DATASET_UPLOADED: 'DATASET_UPLOADED',
  DATASET_ASSIGNED: 'DATASET_ASSIGNED',
  DATASET_MODIFIED: 'DATASET_MODIFIED',
  DATASET_DELETED: 'DATASET_DELETED',
  TEST_SET_LOCKED: 'TEST_SET_LOCKED',
  ANNOTATION_SUBMITTED: 'ANNOTATION_SUBMITTED',
  IMAGE_SKIPPED: 'IMAGE_SKIPPED',
  HITL_BATCH_CREATED: 'HITL_BATCH_CREATED',
  TRAINING_STARTED: 'TRAINING_STARTED',
  TRAINING_COMPLETED: 'TRAINING_COMPLETED',
  TRAINING_FAILED: 'TRAINING_FAILED',
  CANDIDATE_CREATED: 'CANDIDATE_CREATED',
  MODEL_PROMOTED: 'MODEL_PROMOTED',
  MODEL_REJECTED: 'MODEL_REJECTED',
  MODEL_ARCHIVED: 'MODEL_ARCHIVED',
  LABEL_SPACE_CHANGED: 'LABEL_SPACE_CHANGED',
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  ERROR: 'ERROR',
} as const;
export type LogEvent = (typeof LogEvent)[keyof typeof LogEvent];

export interface SystemLog {
  readonly id: number;
  readonly at: string;
  readonly level: LogLevel;
  /** Server-authoritative. Typed as `string` because the server may add events ahead of this file. */
  readonly event: string;
  readonly actor_id: number | null;
  readonly actor_username: string | null;
  readonly entity_type: string | null;
  readonly entity_id: number | null;
  readonly message: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
}

/** The six probes `GET /health` reports. Each says what it actually checked. */
export const ServiceKey = {
  FRONTEND: 'frontend',
  API: 'api',
  DATABASE: 'database',
  ML_ENGINE: 'ml_engine',
  STORAGE: 'storage',
  TRAINING_WORKER: 'training_worker',
} as const;
export type ServiceKey = (typeof ServiceKey)[keyof typeof ServiceKey];

export interface ServiceHealth {
  readonly key: ServiceKey;
  readonly label: string;
  /** A check that could not be performed reports `UNKNOWN`, never `ONLINE` (§2.3). */
  readonly state: ServiceState;
  readonly detail: string | null;
  readonly checked_at: string;
}

export interface HealthResponse {
  readonly status: ServiceState;
  readonly version: string;
  readonly services: readonly ServiceHealth[];
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Statistics
 *
 * One series shape and one distribution shape for the whole app, so the six chart components in
 * `components/charts/` have exactly two input types between them.
 *
 * `source` is the honesty switch: `"unavailable"` means the figure could not be computed, and the
 * response *omits* the field rather than sending `0`. A chart cannot distinguish a true zero from
 * a missing measurement, so the type makes the caller handle it.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export type StatisticsSource = 'database' | 'unavailable';

/** `t` is a `YYYY-MM-DD` date, not a timestamp — the server only knows dates (§ contract). */
export interface SeriesPoint {
  readonly t: string;
  readonly v: number;
}

export interface Series {
  readonly key: string;
  readonly label: string;
  readonly points: readonly SeriesPoint[];
}

export interface DistributionSlice {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

export interface Distribution {
  readonly key: string;
  readonly label: string;
  readonly slices: readonly DistributionSlice[];
}

/** Every statistics payload carries its own provenance. */
export interface StatisticsEnvelope {
  readonly source: StatisticsSource;
  readonly from: string | null;
  readonly to: string | null;
}

/** Optional-everywhere by design: a KPI that cannot be computed is absent, not zero. */
export interface DashboardKpis {
  readonly total_images?: number;
  readonly datasets?: number;
  readonly reviewed?: number;
  readonly validated?: number;
  readonly skipped?: number;
  readonly pending_review?: number;
  readonly annotations?: number;
  readonly agreement_rate?: number;
}

export interface ActivityEntry {
  readonly at: string;
  readonly event: string;
  readonly actor_username: string | null;
  readonly message: string;
}

export interface DashboardStatistics extends StatisticsEnvelope {
  readonly kpis: DashboardKpis;
  readonly hitl: HitlStatus | null;
  readonly active_model: Model | null;
  readonly candidate_model: Model | null;
  /** Present only when a model has actually been evaluated. Otherwise the panel is empty (§10). */
  readonly latest_evaluation: ModelEvaluation | null;
  readonly review_activity: readonly Series[];
  readonly recent_activity: readonly ActivityEntry[];
  readonly services: readonly ServiceHealth[];
}

export interface DataStatistics extends StatisticsEnvelope {
  readonly granularity: 'day' | 'week';
  readonly counts: DatasetCounts;
  readonly series: readonly Series[];
  /** Expected keys: `data_status`, `split`, `label_code`, `dataset`. */
  readonly distributions: readonly Distribution[];
}

/**
 * One confidence bucket. `corrected / reviewed` is the correction rate *within* the bucket — the
 * evidence for RQ5 (does confidence identify samples worth reviewing). `reviewed` is carried so a
 * bucket holding three samples cannot be read as a trend.
 */
export interface ConfidenceBin {
  readonly lower: number;
  readonly upper: number;
  readonly reviewed: number;
  readonly corrected: number;
  readonly correction_rate: number | null;
}

export interface AnnotationStatistics extends StatisticsEnvelope {
  readonly reviewed_total: number;
  readonly agreement_count?: number;
  readonly agreement_rate?: number;
  readonly correction_rate?: number;
  readonly skip_rate?: number;
  readonly median_time_spent_ms?: number;
  /** Keys: `annotation_type`, `skip_reason`, `annotator`, `human_label`, `ai_label`. */
  readonly distributions: readonly Distribution[];
  readonly series: readonly Series[];
  readonly confidence_bins: readonly ConfidenceBin[];
  /** Human label vs AI label, over reviewed images only. Not a model evaluation. */
  readonly agreement_matrix: ConfusionMatrix | null;
}

export interface ModelStatistics extends StatisticsEnvelope {
  /** One point per model version, `t` being the training date. Empty until a model exists. */
  readonly metric_series: readonly Series[];
  readonly versions: readonly Model[];
  readonly evaluations: readonly ModelEvaluation[];
  readonly training_history: readonly TrainingJob[];
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Promotion metric ↔ metrics field — one mapping, once
 *
 * `primary_promotion_metric` is a {@link PromotionMetric} member (`MACRO_F1`); the value lives on
 * {@link ClassificationMetrics} under a lower-cased key (`macro_f1`). Every place that reads "the
 * primary metric of this model" needs that mapping, so it is declared here rather than re-derived
 * with `toLowerCase()` at each call site — a rename would then silently produce `undefined`.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export const PROMOTION_METRIC_FIELD: Readonly<
  Record<PromotionMetric, keyof ClassificationMetrics>
> = {
  [PromotionMetric.ACCURACY]: 'accuracy',
  [PromotionMetric.MACRO_F1]: 'macro_f1',
  [PromotionMetric.MACRO_PRECISION]: 'macro_precision',
  [PromotionMetric.MACRO_RECALL]: 'macro_recall',
  [PromotionMetric.AUROC_MACRO]: 'auroc_macro',
};

/**
 * Read one metric out of a metrics block. Returns `null` — never `0` — when the block is absent or
 * the figure was not computed, so a caller cannot accidentally chart a missing measurement (§2.3).
 */
export function readPromotionMetric(
  metrics: ClassificationMetrics | null,
  metric: PromotionMetric,
): number | null {
  if (metrics === null) return null;
  return metrics[PROMOTION_METRIC_FIELD[metric]];
}

