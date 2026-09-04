/**
 * MedLoop AI — one function per endpoint in `docs/api_contract.md`.
 *
 * Paths appear here and nowhere else, for the same reason routes appear only in `navigation.ts`: a
 * contract change should be a diff on one line, not a grep across features.
 *
 * Every function is a thin call into `http` from `api-client.ts`. No branching, no caching, no
 * retry — those are decisions for the caller, which knows whether it is rendering a table or a
 * review queue.
 */

import { http } from './api-client';
import type {
  ActiveModelResponse,
  AnnotationListQuery,
  AnnotationListResponse,
  AnnotationResponse,
  AssignSplitsBody,
  AssignSplitsResponse,
  CreateAnnotationBody,
  CreateDatasetBody,
  CreateDatasetVersionBody,
  CreateLabelBody,
  CreateUploadBody,
  DatasetDetailResponse,
  DatasetListQuery,
  DatasetListResponse,
  DatasetResponse,
  DatasetVersionListResponse,
  DatasetVersionResponse,
  DateRangeQuery,
  ImageDetailResponse,
  ImageListQuery,
  ImageListResponse,
  LabelsResponse,
  LockTestSetBody,
  LoginBody,
  LoginResponse,
  LogEventListResponse,
  LogListQuery,
  LogListResponse,
  ModelComparisonQuery,
  ModelComparisonResponse,
  ModelDetailResponse,
  ModelEvaluationListResponse,
  ModelListQuery,
  ModelListResponse,
  ModelMutationResponse,
  PageQuery,
  PatchDatasetBody,
  PatchLabelBody,
  PredictionListQuery,
  PredictionListResponse,
  PromoteModelBody,
  RejectModelBody,
  ReviewQueueQuery,
  ReviewQueueResponse,
  SessionResponse,
  SettingsHistoryQuery,
  SettingsHistoryResponse,
  SkipBody,
  SkipResult,
  SubmitBody,
  SubmitResult,
  TrainingBatchDetailResponse,
  TrainingBatchListResponse,
  TrainingJobDetailResponse,
  TrainingJobListResponse,
  TrainingJobMutationResponse,
  TrainingSettingsResponse,
  UpdateTrainingSettingsBody,
  UploadResponse,
} from '@/types/api';
import type {
  AiPrediction,
  AnnotationStatistics,
  DashboardStatistics,
  DataStatistics,
  DiseaseLabel,
  HealthResponse,
  HitlStatus,
  ModelStatistics,
  ReviewItem,
} from '@/types/domain';

/* ── Auth ────────────────────────────────────────────────────────────────────────────── */

/** `anonymous: true` — a stale token must not travel with a login attempt. */
export const login = (body: LoginBody): Promise<LoginResponse> =>
  http.post<LoginResponse>('/auth/login', body, { anonymous: true });

export const logout = (): Promise<void> => http.post<void>('/auth/logout');

export const getSession = (signal?: AbortSignal): Promise<SessionResponse> =>
  http.get<SessionResponse>('/auth/session', { signal });

/* ── Health ──────────────────────────────────────────────────────────────────────────── */

export const getHealth = (signal?: AbortSignal): Promise<HealthResponse> =>
  http.get<HealthResponse>('/health', { signal, anonymous: true });

/* ── Datasets ────────────────────────────────────────────────────────────────────────── */

export const listDatasets = (
  query?: DatasetListQuery,
  signal?: AbortSignal,
): Promise<DatasetListResponse> => http.get<DatasetListResponse>('/datasets', { query, signal });

export const createDataset = (body: CreateDatasetBody): Promise<DatasetResponse> =>
  http.post<DatasetResponse>('/datasets', body);

export const getDataset = (id: number, signal?: AbortSignal): Promise<DatasetDetailResponse> =>
  http.get<DatasetDetailResponse>(`/datasets/${id}`, { signal });

export const patchDataset = (id: number, body: PatchDatasetBody): Promise<DatasetResponse> =>
  http.patch<DatasetResponse>(`/datasets/${id}`, body);

/** Soft — sets `ARCHIVED` and stamps `archived_at`. Nothing is hard-deleted (§7). */
export const archiveDataset = (id: number): Promise<DatasetResponse> =>
  http.post<DatasetResponse>(`/datasets/${id}/archive`);

export const listDatasetVersions = (
  id: number,
  signal?: AbortSignal,
): Promise<DatasetVersionListResponse> =>
  http.get<DatasetVersionListResponse>(`/datasets/${id}/versions`, { signal });

export const createDatasetVersion = (
  id: number,
  body: CreateDatasetVersionBody,
): Promise<DatasetVersionResponse> =>
  http.post<DatasetVersionResponse>(`/datasets/${id}/versions`, body);

export const getDatasetVersion = (
  id: number,
  signal?: AbortSignal,
): Promise<DatasetVersionResponse> =>
  http.get<DatasetVersionResponse>(`/dataset-versions/${id}`, { signal });

/** `409 DATASET_LOCKED` on a locked version. The caller renders the refusal (§2.5). */
export const assignSplits = (id: number, body: AssignSplitsBody): Promise<AssignSplitsResponse> =>
  http.post<AssignSplitsResponse>(`/dataset-versions/${id}/assign`, body);

export const lockTestSet = (id: number, body: LockTestSetBody): Promise<DatasetVersionResponse> =>
  http.post<DatasetVersionResponse>(`/dataset-versions/${id}/lock-test`, body);

/* ── Uploads ─────────────────────────────────────────────────────────────────────────── */

export const createUpload = (body: CreateUploadBody): Promise<UploadResponse> =>
  http.post<UploadResponse>('/uploads', body);

export const getUpload = (id: number, signal?: AbortSignal): Promise<UploadResponse> =>
  http.get<UploadResponse>(`/uploads/${id}`, { signal });

/* ── Images ──────────────────────────────────────────────────────────────────────────── */

export const listImages = (
  query?: ImageListQuery,
  signal?: AbortSignal,
): Promise<ImageListResponse> => http.get<ImageListResponse>('/images', { query, signal });

export const getImage = (id: number, signal?: AbortSignal): Promise<ImageDetailResponse> =>
  http.get<ImageDetailResponse>(`/images/${id}`, { signal });

/** Path only — the bytes are fetched by the browser via `artifactUrl`, not by this module. */
export const imageFilePath = (id: number): string => `/images/${id}/file`;

/** `404` when no artefact exists. **Never** a synthesised placeholder (§2.3). */
export const gradcamPath = (id: number): string => `/images/${id}/gradcam`;

/* ── Review ──────────────────────────────────────────────────────────────────────────── */

export const getReviewQueue = (
  query?: ReviewQueueQuery,
  signal?: AbortSignal,
): Promise<ReviewQueueResponse> =>
  http.get<ReviewQueueResponse>('/review/queue', { query, signal });

export const claimImage = (imageId: number): Promise<ReviewItem> =>
  http.post<ReviewItem>(`/review/${imageId}/claim`);

export const releaseImage = (imageId: number): Promise<void> =>
  http.post<void>(`/review/${imageId}/release`);

/**
 * Steps 1–8 of §6.1 happen inside one server-side transaction; this call either validates the
 * sample completely or not at all. `next` comes back with the response so the queue advances
 * without a second round trip.
 */
export const submitReview = (imageId: number, body: SubmitBody): Promise<SubmitResult> =>
  http.post<SubmitResult>(`/review/${imageId}/submit`, body);

/** Does not touch the HITL counter and never enqueues for training (§6.2). */
export const skipImage = (imageId: number, body: SkipBody): Promise<SkipResult> =>
  http.post<SkipResult>(`/review/${imageId}/skip`, body);

/* ── Labels ──────────────────────────────────────────────────────────────────────────── */

/** The configurable label space. No disease code is hard-coded in this codebase (§5). */
export const listLabels = (signal?: AbortSignal): Promise<LabelsResponse> =>
  http.get<LabelsResponse>('/labels', { signal });

export const createLabel = (body: CreateLabelBody): Promise<DiseaseLabel> =>
  http.post<DiseaseLabel>('/labels', body);

export const patchLabel = (id: number, body: PatchLabelBody): Promise<DiseaseLabel> =>
  http.patch<DiseaseLabel>(`/labels/${id}`, body);

/* ── Annotations ─────────────────────────────────────────────────────────────────────── */

export const listAnnotations = (
  query?: AnnotationListQuery,
  signal?: AbortSignal,
): Promise<AnnotationListResponse> =>
  http.get<AnnotationListResponse>('/annotations', { query, signal });

export const createAnnotation = (body: CreateAnnotationBody): Promise<AnnotationResponse> =>
  http.post<AnnotationResponse>('/annotations', body);

/** Soft-archive. AI predictions are never affected — that separation is the experiment (§2.4). */
export const deleteAnnotation = (id: number): Promise<void> =>
  http.delete<void>(`/annotations/${id}`);

/* ── Predictions ─────────────────────────────────────────────────────────────────────── */

export const listPredictions = (
  query?: PredictionListQuery,
  signal?: AbortSignal,
): Promise<PredictionListResponse> =>
  http.get<PredictionListResponse>('/predictions', { query, signal });

/** `409 MODEL_UNAVAILABLE` while no model exists. That is the expected answer, not an outage. */
export const runPrediction = (imageId: number): Promise<AiPrediction> =>
  http.post<AiPrediction>(`/predictions/${imageId}/run`);

/* ── Models ──────────────────────────────────────────────────────────────────────────── */

export const listModels = (
  query?: ModelListQuery,
  signal?: AbortSignal,
): Promise<ModelListResponse> => http.get<ModelListResponse>('/models', { query, signal });

export const getActiveModel = (signal?: AbortSignal): Promise<ActiveModelResponse> =>
  http.get<ActiveModelResponse>('/models/active', { signal });

export const getModel = (id: number, signal?: AbortSignal): Promise<ModelDetailResponse> =>
  http.get<ModelDetailResponse>(`/models/${id}`, { signal });

export const listModelEvaluations = (
  id: number,
  signal?: AbortSignal,
): Promise<ModelEvaluationListResponse> =>
  http.get<ModelEvaluationListResponse>(`/models/${id}/evaluations`, { signal });

/**
 * `comparable: false` arrives with a `reason` when the candidates were measured on different test
 * dataset versions. The caller must render the refusal, not the numbers (§9).
 */
export const compareModels = (
  query: ModelComparisonQuery,
  signal?: AbortSignal,
): Promise<ModelComparisonResponse> =>
  http.get<ModelComparisonResponse>('/models/comparison', { query, signal });

/** Refuses unless the promotion criteria are met. The client never pre-judges that (§2.7). */
export const promoteModel = (id: number, body?: PromoteModelBody): Promise<ModelMutationResponse> =>
  http.post<ModelMutationResponse>(`/models/${id}/promote`, body ?? {});

export const rejectModel = (id: number, body: RejectModelBody): Promise<ModelMutationResponse> =>
  http.post<ModelMutationResponse>(`/models/${id}/reject`, body);

export const archiveModel = (id: number): Promise<ModelMutationResponse> =>
  http.post<ModelMutationResponse>(`/models/${id}/archive`);

/* ── Training ────────────────────────────────────────────────────────────────────────── */

/** `threshold` in the response is always the server's setting; never assume 1000 (§2.6). */
export const getTrainingStatus = (signal?: AbortSignal): Promise<HitlStatus> =>
  http.get<HitlStatus>('/training/status', { signal });

export const listTrainingBatches = (
  query?: PageQuery,
  signal?: AbortSignal,
): Promise<TrainingBatchListResponse> =>
  http.get<TrainingBatchListResponse>('/training/batches', { query, signal });

export const getTrainingBatch = (
  id: number,
  signal?: AbortSignal,
): Promise<TrainingBatchDetailResponse> =>
  http.get<TrainingBatchDetailResponse>(`/training/batches/${id}`, { signal });

/** `409` when a job is already live — one batch, at most one active job (§8.3). */
export const startTrainingBatch = (id: number): Promise<TrainingJobMutationResponse> =>
  http.post<TrainingJobMutationResponse>(`/training/batches/${id}/start`);

export const listTrainingJobs = (
  query?: PageQuery,
  signal?: AbortSignal,
): Promise<TrainingJobListResponse> =>
  http.get<TrainingJobListResponse>('/training/jobs', { query, signal });

export const getTrainingJob = (
  id: number,
  signal?: AbortSignal,
): Promise<TrainingJobDetailResponse> =>
  http.get<TrainingJobDetailResponse>(`/training/jobs/${id}`, { signal });

export const cancelTrainingJob = (id: number): Promise<TrainingJobMutationResponse> =>
  http.post<TrainingJobMutationResponse>(`/training/jobs/${id}/cancel`);

/* ── Statistics ──────────────────────────────────────────────────────────────────────── */

export const getDashboardStatistics = (signal?: AbortSignal): Promise<DashboardStatistics> =>
  http.get<DashboardStatistics>('/statistics/dashboard', { signal });

export const getDataStatistics = (
  query?: DateRangeQuery & { readonly granularity?: 'day' | 'week' },
  signal?: AbortSignal,
): Promise<DataStatistics> => http.get<DataStatistics>('/statistics/data', { query, signal });

export const getAnnotationStatistics = (
  query?: DateRangeQuery,
  signal?: AbortSignal,
): Promise<AnnotationStatistics> =>
  http.get<AnnotationStatistics>('/statistics/annotations', { query, signal });

export const getModelStatistics = (signal?: AbortSignal): Promise<ModelStatistics> =>
  http.get<ModelStatistics>('/statistics/models', { signal });

/* ── Admin settings ──────────────────────────────────────────────────────────────────── */

export const getTrainingSettings = (signal?: AbortSignal): Promise<TrainingSettingsResponse> =>
  http.get<TrainingSettingsResponse>('/admin/settings/training', { signal });

/** Server-authoritative validation (§8.1). Every change writes an audit row. */
export const updateTrainingSettings = (
  body: UpdateTrainingSettingsBody,
): Promise<TrainingSettingsResponse> =>
  http.put<TrainingSettingsResponse>('/admin/settings/training', body);

export const getSettingsHistory = (
  query?: SettingsHistoryQuery,
  signal?: AbortSignal,
): Promise<SettingsHistoryResponse> =>
  http.get<SettingsHistoryResponse>('/admin/settings/history', { query, signal });

/* ── Logs ────────────────────────────────────────────────────────────────────────────── */

export const listLogs = (query?: LogListQuery, signal?: AbortSignal): Promise<LogListResponse> =>
  http.get<LogListResponse>('/logs', { query, signal });

/** Distinct `event` values, so the filter dropdown is populated by the data, not by a literal list. */
export const listLogEvents = (signal?: AbortSignal): Promise<LogEventListResponse> =>
  http.get<LogEventListResponse>('/logs/events', { signal });

