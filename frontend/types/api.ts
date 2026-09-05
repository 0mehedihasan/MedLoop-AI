/**
 * MedLoop AI — the transport layer of `docs/api_contract.md`.
 *
 * `domain.ts` holds the *entities*. This file holds the *envelopes*: the error shape, the
 * pagination wrapper, and one request/response type per endpoint. The split matters because a
 * component should be able to import `ImageSummary` without also importing the vocabulary of HTTP.
 *
 * Nothing in here performs I/O. The client that does lives in `lib/api-client.ts` and is the only
 * module allowed to construct a URL.
 *
 * Naming follows the contract literally: snake_case fields, because renaming at the boundary means
 * two vocabularies for one thing and a mapping layer nobody maintains.
 */

import type {
  AiPrediction,
  Annotation,
  AnnotationType,
  Dataset,
  DatasetCounts,
  DatasetDetail,
  DatasetVersion,
  DiseaseLabel,
  Geometry,
  HitlCycleStage,
  ImageDetail,
  ImageSplit,
  ImageSummary,
  Model,
  ModelComparison,
  ModelDetail,
  ModelEvaluation,
  QueuePosition,
  ReviewItem,
  ReviewStatus,
  Role,
  SettingChange,
  SkipReason,
  SystemLog,
  TrainingBatch,
  TrainingBatchDetail,
  TrainingJob,
  TrainingJobDetail,
  TrainingSettings,
  TrainingSettingsPatch,
  Upload,
  User,
} from './domain';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Errors
 *
 * Every non-2xx response carries `{ error: { code, message, details } }`. The UI branches on
 * `code`, never on the HTTP status and never on the message text — the message is for humans and
 * is allowed to change wording without breaking a caller.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export const ApiErrorCode = {
  /** 422 — request failed schema or server-side rule validation. */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** 401 — missing or expired token. The shell redirects to `/login`. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** 403 — authenticated, but the role lacks the permission. Not a redirect; render a refusal. */
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  /** 409 — illegal state transition. */
  CONFLICT: 'CONFLICT',
  /** 409 — attempt to mutate a locked test version (§2.5). */
  DATASET_LOCKED: 'DATASET_LOCKED',
  /** 409 — no active model, so inference/XAI cannot run. Renders `<Unavailable/>`. */
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  /** 501 — a dataset-dependent capability is *deliberately* unimplemented. Renders `<Blocked/>`. */
  DATASET_NOT_AVAILABLE: 'DATASET_NOT_AVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface ApiErrorBody {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>> | null;
}

/** The literal JSON body of a failed response. */
export interface ApiErrorEnvelope {
  readonly error: ApiErrorBody;
}

/**
 * A transport or parse failure that produced no envelope — the backend is not running, or returned
 * HTML. Distinguished from {@link ApiErrorEnvelope} so "the API is down" and "the API said no" can
 * be rendered differently; conflating them is how a local-only app ends up claiming a rule was
 * violated when in fact nothing was listening on the port.
 */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR' as const;

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Pagination
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/*
 * ## Every `*Query` type below is a `type`, never an `interface`
 *
 * `api-client.ts` types a query bag as `Readonly<Record<string, QueryValue>>`, and TypeScript only
 * grants an *implicit index signature* to object types that come from a type alias. An interface
 * never gets one, so `interface PageQuery { page?: number }` is **not** assignable to that record
 * and every call site fails with "Index signature for type 'string' is missing".
 *
 * Declaring them as aliases keeps the value types checked — each property still has to be a
 * `QueryValue`, so a `Date` or a nested object is rejected at the call site — while letting the
 * client iterate them generically. Converting one back to an `interface` breaks the build; that is
 * the intended safety net, not a nuisance.
 */

/** `page` is 1-based. `page_size` defaults to 25 server-side and is capped at 200. */
export type PageQuery = {
  readonly page?: number;
  readonly page_size?: number;
};

export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 200;

export interface Paginated<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly page_size: number;
  readonly total: number;
  readonly pages: number;
}

/**
 * `from`/`to` are inclusive `YYYY-MM-DD`. The presets are resolved **client-side** into that pair;
 * the server only ever sees dates, which keeps timezone reasoning in exactly one place.
 */
export type DateRangeQuery = {
  readonly from?: string;
  readonly to?: string;
};

export const DateRangePreset = {
  /**
   * No constraint. Present because §4.1's filter contract is "absent means no constraint, never a
   * default that quietly hides rows" — which needs a *nameable* option in the UI, not the absence
   * of one. It is the only preset that resolves to an empty query.
   */
  ALL_TIME: 'all_time',
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  LAST_7D: 'last_7d',
  LAST_30D: 'last_30d',
  CUSTOM: 'custom',
} as const;
export type DateRangePreset = (typeof DateRangePreset)[keyof typeof DateRangePreset];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Auth
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface LoginBody {
  readonly username: string;
  readonly password: string;
}

export interface LoginResponse {
  readonly token: string;
  readonly expires_at: string;
  readonly user: User;
}

export interface SessionResponse {
  readonly user: User;
  readonly expires_at: string;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Datasets
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export type DatasetListQuery = PageQuery & {
  readonly status?: string;
  readonly q?: string;
};

export interface CreateDatasetBody {
  readonly name: string;
  readonly description?: string;
  readonly source?: string;
}

export interface PatchDatasetBody {
  readonly name?: string;
  readonly description?: string;
}

export interface CreateDatasetVersionBody {
  readonly label: string;
  readonly note?: string;
}

/** One split reassignment. Batched so a 400-image move is one transaction, not 400. */
export interface SplitAssignment {
  readonly split: ImageSplit;
  readonly image_ids: readonly number[];
}

export interface AssignSplitsBody {
  readonly assignments: readonly SplitAssignment[];
}

export interface AssignSplitsResponse {
  readonly updated: number;
  readonly counts: DatasetCounts;
}

/**
 * `confirm` is required and must be `true`. Locking is irreversible in effect — §2.5 makes the
 * locked test set untouchable — so the intent is carried in the body rather than inferred from the
 * fact that someone reached the endpoint.
 */
export interface LockTestSetBody {
  readonly confirm: true;
  readonly reason?: string;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Uploads
 *
 * Registers a **local directory path**. No bytes stream through the API and nothing is copied —
 * one physical copy of each image is what keeps the 512 GB budget honest (§3.2).
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface CreateUploadBody {
  readonly dataset_name: string;
  readonly description?: string;
  /** Must resolve inside `MEDLOOP_ALLOWED_INGEST_ROOTS`; the server checks, not the client. */
  readonly image_directory: string;
  readonly annotation_file?: string;
  readonly metadata_file?: string;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Images
 *
 * Every filter is optional and absent means "no constraint" — never a default that quietly hides
 * rows. `data_status` is the flat derived vocabulary; `split` and `review_status` remain available
 * because a researcher sometimes needs the orthogonal axes rather than the collapsed one (§4.1).
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export type ImageListQuery = PageQuery &
  DateRangeQuery & {
    readonly dataset_id?: number;
    readonly dataset_version_id?: number;
    readonly data_status?: string;
    readonly split?: ImageSplit;
    readonly review_status?: ReviewStatus;
    /** The publisher's / human label. */
    readonly label_code?: string;
    /** The model's predicted label. Separate field: §2.4 keeps the two records apart. */
    readonly ai_label_code?: string;
    readonly confidence_min?: number;
    readonly confidence_max?: number;
    readonly annotation_type?: AnnotationType;
    readonly q?: string;
  };

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Review
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export type ReviewQueueQuery = {
  readonly dataset_id?: number;
  readonly dataset_version_id?: number;
  readonly label_code?: string;
  readonly ai_label_code?: string;
  readonly confidence_min?: number;
  readonly confidence_max?: number;
};

export interface ReviewQueueResponse extends QueuePosition {
  readonly item: ReviewItem | null;
}

/** A shape as submitted: no `id`, no `annotator`, no `source` — the server assigns all three. */
export interface SubmitAnnotation {
  readonly type: AnnotationType;
  readonly geometry: Geometry;
  readonly label_code?: string;
}

export interface SubmitBody {
  readonly label_code: string;
  readonly annotations: readonly SubmitAnnotation[];
  readonly time_spent_ms?: number;
  readonly note?: string;
}

/**
 * The HITL consequence of one submit. `threshold` is echoed from settings on every response so the
 * client never has to remember it and never assumes 1000 (§2.6); `batch_created` reports what
 * actually happened inside the submit transaction (§6.1).
 */
export interface SubmitHitlOutcome {
  readonly validated_since_last_training: number;
  readonly threshold: number;
  readonly remaining: number;
  readonly stage: HitlCycleStage;
  readonly batch_created: boolean;
  readonly batch_id: number | null;
}

export interface SubmitResult {
  readonly review_session_id: number;
  /**
   * `null` when there was no prediction to agree or disagree with, matching `ReviewSession.agreement`
   * in `types/domain.ts`. With no trained model on this machine that is the *only* value this field can
   * currently take — reporting `false` would state that the human contradicted the model, which is a
   * fabricated comparison (§2.3, §6.3).
   */
  readonly agreement: boolean | null;
  readonly hitl: SubmitHitlOutcome;
  /** The next queue item, so the UI advances without a second round trip. */
  readonly next: ReviewItem | null;
}

export interface SkipBody {
  readonly reason: SkipReason;
  readonly note?: string;
  readonly time_spent_ms?: number;
}

/** Deliberately carries no `hitl` block: a skip never touches the counter (§6.2). */
export interface SkipResult {
  readonly review_session_id: number;
  readonly next: ReviewItem | null;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Labels — the configurable label space (§5)
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `verified_against_data` is a property of the whole label space, not of one row: it answers "have
 * these codes been confirmed against the real files?". While it is `false` the UI shows an
 * "unverified label space" note, which is the difference between a seeded guess and a finding.
 */
export interface LabelsResponse {
  readonly items: readonly DiseaseLabel[];
  readonly verified_against_data: boolean;
}

export interface CreateLabelBody {
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly display_order?: number;
}

export interface PatchLabelBody {
  readonly name?: string;
  readonly description?: string;
  readonly display_order?: number;
  readonly is_active?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Annotations
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export type AnnotationListQuery = PageQuery &
  DateRangeQuery & {
    readonly image_id?: number;
    readonly annotator_id?: number;
    readonly type?: AnnotationType;
  };

export interface CreateAnnotationBody {
  readonly image_id: number;
  readonly type: AnnotationType;
  readonly geometry: Geometry;
  readonly label_code?: string;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Predictions, models, training
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export type PredictionListQuery = PageQuery & {
  readonly image_id?: number;
  readonly model_id?: number;
};

export type ModelListQuery = {
  readonly status?: string;
};

export type ModelComparisonQuery = {
  /** Serialised as a comma-separated list, e.g. `?model_ids=1,2,3`. */
  readonly model_ids: readonly number[];
};

export interface PromoteModelBody {
  readonly reason?: string;
}

/** `reason` is mandatory on rejection: an unexplained rejection is an unusable audit row. */
export interface RejectModelBody {
  readonly reason: string;
}

export type LogListQuery = PageQuery &
  DateRangeQuery & {
    readonly level?: string;
    readonly event?: string;
    readonly actor_id?: number;
    readonly q?: string;
  };

export type SettingsHistoryQuery = {
  readonly key?: string;
};

/** `PUT /admin/settings/training` — a partial patch plus the reason that goes into the audit row. */
export interface UpdateTrainingSettingsBody {
  readonly settings: TrainingSettingsPatch;
  readonly reason?: string;
}

export interface TrainingSettingsResponse {
  readonly settings: TrainingSettings;
  /**
   * Roles permitted to write. The settings form is gated on **this**, not on a client-side
   * `role === 'ADMIN'` comparison — the server owns the permission and the client mirroring it
   * would be a second authority that can disagree.
   */
  readonly editable_by: readonly Role[];
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Response aliases
 *
 * Named per endpoint so `lib/api-client.ts` reads as a list of contracts rather than a pile of
 * generics, and so a contract change shows up as a diff on one line here.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export type DatasetListResponse = Paginated<Dataset>;
export type DatasetResponse = Dataset;
export type DatasetDetailResponse = DatasetDetail;
export type DatasetVersionListResponse = readonly DatasetVersion[];
export type DatasetVersionResponse = DatasetVersion;

export type UploadListResponse = Paginated<Upload>;
export type UploadResponse = Upload;

export type ImageListResponse = Paginated<ImageSummary>;
export type ImageDetailResponse = ImageDetail;

export type AnnotationListResponse = Paginated<Annotation>;
export type AnnotationResponse = Annotation;

export type PredictionListResponse = Paginated<AiPrediction>;

export type ModelListResponse = readonly Model[];
export type ActiveModelResponse = Model | null;
export type ModelDetailResponse = ModelDetail;
export type ModelEvaluationListResponse = readonly ModelEvaluation[];
export type ModelComparisonResponse = ModelComparison;
export type ModelMutationResponse = Model;

export type TrainingBatchListResponse = Paginated<TrainingBatch>;
export type TrainingBatchDetailResponse = TrainingBatchDetail;
export type TrainingJobListResponse = Paginated<TrainingJob>;
export type TrainingJobDetailResponse = TrainingJobDetail;
export type TrainingJobMutationResponse = TrainingJob;

export type LogListResponse = Paginated<SystemLog>;
export type LogEventListResponse = readonly string[];
export type SettingsHistoryResponse = readonly SettingChange[];

