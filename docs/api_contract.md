# API contract — MedLoop AI

Single source of truth for the HTTP boundary. **Frontend and backend both implement against this
file.** Change it here first, in the same commit as the code.

- Base URL: `http://127.0.0.1:8000/api/v1` (`MEDLOOP_API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL`)
- Transport: JSON. `Authorization: Bearer <token>` on everything except `/health` and `/auth/login`.
- Enum values are the literal strings in `.claude/CLAUDE.md` §4.
- Timestamps: ISO-8601 with offset. Geometry: normalised `[0,1]`, per CLAUDE.md §4.3.

## Conventions

**Error envelope** — every non-2xx response:

```json
{ "error": { "code": "MODEL_UNAVAILABLE", "message": "No ACTIVE model exists.",
             "details": {"hint": "Phase 5 is blocked on the dataset."} } }
```

| `code` | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 422 | request failed schema or server-side rule validation |
| `UNAUTHENTICATED` | 401 | missing/expired token |
| `FORBIDDEN` | 403 | authenticated but role lacks the permission |
| `NOT_FOUND` | 404 | no such row |
| `CONFLICT` | 409 | illegal state transition |
| `DATASET_LOCKED` | 409 | attempt to mutate a locked test version |
| `MODEL_UNAVAILABLE` | 409 | no active model — inference/XAI cannot run |
| `DATASET_NOT_AVAILABLE` | 501 | dataset-dependent capability is deliberately unimplemented |
| `INTERNAL_ERROR` | 500 | unexpected |

**Pagination** — list endpoints accept `page` (1-based) and `page_size` (default 25, max 200) and
return `{ "items": [...], "page": 1, "page_size": 25, "total": 0, "pages": 0 }`.

**Date range** — `from`/`to` are inclusive ISO dates. UI presets (`today`, `yesterday`, `last_7d`,
`last_30d`, `custom`) are resolved client-side into `from`/`to`; the server only knows dates.

## Endpoints

### Auth

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | `{username, password}` | `{token, expires_at, user}` |
| `POST` | `/auth/logout` | — | `204` |
| `GET` | `/auth/session` | — | `{user, expires_at}` |

`user = {id, username, display_name, role, is_active, created_at}`.
Invalid credentials → `401 UNAUTHENTICATED`, constant-time comparison, generic message.

### Health

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/health` | `{status, version, services: ServiceHealth[]}` |

`ServiceHealth = {key, label, state, detail, checked_at}` where `key ∈ {frontend, api, database,
ml_engine, storage, training_worker}` and `state ∈ ServiceState`. Each check reports what it
actually probed; unknown is `UNKNOWN`, never `ONLINE`.

### Datasets

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/datasets` | `?status&q&page&page_size` → paginated `Dataset[]` |
| `POST` | `/datasets` | `{name, description, source}` → `Dataset` |
| `GET` | `/datasets/{id}` | `DatasetDetail` incl. `versions[]` and `counts` |
| `PATCH` | `/datasets/{id}` | `{name?, description?}` |
| `POST` | `/datasets/{id}/archive` | soft; `DELETE /datasets/{id}` is an alias |
| `GET` | `/datasets/{id}/versions` | `DatasetVersion[]` |
| `POST` | `/datasets/{id}/versions` | `{label, note}` → `DatasetVersion` |
| `GET` | `/dataset-versions/{id}` | `DatasetVersion` incl. `counts`, `is_test_locked` |
| `POST` | `/dataset-versions/{id}/assign` | `{assignments: [{split, image_ids}]}` → `{updated, counts}` |
| `POST` | `/dataset-versions/{id}/lock-test` | `{confirm: true, reason?}` → `DatasetVersion` |

`counts = {total, staging, train, validation, test, unused, in_review, validated, skipped,
training_used, archived}` — keys are lower-cased `DataStatus` members.
Assigning a split on a locked version → `409 DATASET_LOCKED`.

### Uploads

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/uploads` | `{dataset_name, description?, image_directory, annotation_file?, metadata_file?}` |
| `GET` | `/uploads/{id}` | `Upload` |
| `GET` | `/uploads` | paginated `Upload[]` |

Registers a **local path** for staging — no bytes are streamed through the API, nothing is copied.
The server validates the path is inside `MEDLOOP_ALLOWED_INGEST_ROOTS`, exists, and is readable.
Response `status` is always `STAGING`; `inspection` is
`{"state": "BLOCKED", "reason": "DATASET_NOT_AVAILABLE"}` until Phase 4 — the endpoint records the
intent and refuses to guess at structure.

### Images

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/images` | filters below → paginated `ImageSummary[]` |
| `GET` | `/images/{id}` | `ImageDetail` = summary + `ai_prediction` + `annotations[]` + `lineage` |
| `GET` | `/images/{id}/file` | image bytes; path resolved under the storage root only |
| `GET` | `/images/{id}/gradcam` | artefact bytes, or `404` — **never a synthesised placeholder** |

Filters: `dataset_id`, `dataset_version_id`, `data_status`, `split`, `review_status`, `label_code`,
`ai_label_code`, `confidence_min`, `confidence_max`, `annotation_type`, `from`, `to`, `q`.

### Review

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/review/queue` | filters → `{total, remaining, position, item: ReviewItem \| null}` |
| `POST` | `/review/{image_id}/claim` | → `ReviewItem` (`review_status = IN_REVIEW`) |
| `POST` | `/review/{image_id}/release` | → `204` (back to `NOT_REVIEWED`) |
| `POST` | `/review/{image_id}/submit` | `SubmitBody` → `SubmitResult` |
| `POST` | `/review/{image_id}/skip` | `{reason, note?, time_spent_ms?}` → `SkipResult` |

```ts
SubmitBody = { label_code: string,
               annotations: { type: AnnotationType, geometry: Geometry, label_code?: string }[],
               time_spent_ms?: number, note?: string }

ReviewItem = { image: ImageSummary, image_url: string,
               ai_prediction: AiPrediction | null,      // null ⇒ no model; UI shows "unavailable"
               gradcam_url: string | null,              // null ⇒ hide the XAI view entirely
               ai_localization: Geometry | null,
               existing_annotations: Annotation[], queue: { position, total, remaining } }

SubmitResult = { review_session_id, agreement: boolean,
                 hitl: { validated_since_last_training, threshold, remaining, stage,
                         batch_created: boolean, batch_id: number | null },
                 next: ReviewItem | null }
```

Submitting on a `TEST` image → `409 CONFLICT`. `threshold` in the response is always read from
settings; the client never assumes 1000.

### Labels

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/labels` | `{items: DiseaseLabel[], verified_against_data: boolean}` |
| `POST` | `/labels` | `{code, name, description?, display_order?}` → `DiseaseLabel` (`ADMIN`) |
| `PATCH` | `/labels/{id}` | `{name?, description?, display_order?, is_active?}` (`ADMIN`) |

`DiseaseLabel = {id, code, name, description, display_order, is_active, verified_against_data,
created_at}`. This is the **configurable label space** — the annotation disease selector, the
prediction class vector and the model head all read it from here. No class list is hard-coded in
either codebase. `verified_against_data` stays `false` until the real dataset has been inspected
(CLAUDE.md §5), and the UI shows an "unverified label space" note while it is.

### Annotations

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/annotations` | `?image_id&annotator_id&type&from&to` → paginated |
| `POST` | `/annotations` | `{image_id, type, geometry, label_code?}` |
| `DELETE` | `/annotations/{id}` | soft-archive; AI predictions are never affected |

### Predictions

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/predictions` | `?image_id&model_id` → paginated `AiPrediction[]` |
| `POST` | `/predictions/{image_id}/run` | `409 MODEL_UNAVAILABLE` while no model exists |

`AiPrediction = {id, image_id, model_id, model_version, predicted_label_code, confidence,
probabilities, gradcam_path, localization, device, created_at}`.
A prediction row is immutable. Human corrections live in `annotations` / `review_sessions`.

### Models

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/models` | `?status` → `Model[]`, newest first |
| `GET` | `/models/active` | `Model \| null` |
| `GET` | `/models/{id}` | `ModelDetail` incl. `hyperparameters`, `loss_history`, `evaluations[]` |
| `GET` | `/models/{id}/evaluations` | `ModelEvaluation[]` |
| `GET` | `/models/comparison` | `?model_ids=1,2,3` → `{test_dataset_version_id, comparable, reason?, rows}` |
| `POST` | `/models/{id}/promote` | `{reason?}` → `Model`; refuses unless criteria met |
| `POST` | `/models/{id}/reject` | `{reason}` → `Model` |
| `POST` | `/models/{id}/archive` | → `Model` |

`comparison.comparable` is `false` with a `reason` when candidates were evaluated on different test
dataset versions. The UI must render the refusal, not the numbers.

### Training

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/training/status` | `HitlStatus` |
| `GET` | `/training/batches` | paginated `TrainingBatch[]` |
| `GET` | `/training/batches/{id}` | `TrainingBatchDetail` incl. `sample_count`, `threshold_at_creation` |
| `POST` | `/training/batches/{id}/start` | → `TrainingJob`; `409` if a job is already live |
| `GET` | `/training/jobs` | paginated `TrainingJob[]` |
| `GET` | `/training/jobs/{id}` | `TrainingJobDetail` incl. `epochs[]`, `log_tail` |
| `POST` | `/training/jobs/{id}/cancel` | → `TrainingJob` |

```ts
HitlStatus = { validated_since_last_training: number, threshold: number, remaining: number,
               progress: number,                 // 0..1, clamped
               stage: HitlCycleStage, threshold_met: boolean,
               current_batch: TrainingBatch | null, current_job: TrainingJob | null,
               active_model: Model | null, candidate_model: Model | null,
               last_training_at: string | null }
```

`threshold_met` is `validated_since_last_training >= threshold` evaluated server-side, so lowering
the threshold below the current count immediately reads as met (CLAUDE.md §8.4).

### Statistics

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/statistics/dashboard` | KPI block + HITL block + model block + activity + health |
| `GET` | `/statistics/data` | `?from&to&granularity=day\|week` → counts, time series, distributions |
| `GET` | `/statistics/annotations` | agreement, correction rate, skip rate, type usage, confidence-vs-correction bins |
| `GET` | `/statistics/models` | per-version metric series and training history |

Series shape is uniform: `{ key, label, points: [{ t: "YYYY-MM-DD", v: number }] }`.
Distribution shape: `{ key, label, slices: [{ key, label, count }] }`.
Every statistics response carries `"source": "database" | "unavailable"` and, when a figure cannot be
computed yet, omits it rather than sending `0`.

### Admin settings

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/admin/settings/training` | `TrainingSettings` + `{editable_by: Role[]}` |
| `PUT` | `/admin/settings/training` | partial `TrainingSettings` + `{reason?}` → updated settings |
| `GET` | `/admin/settings/history` | `?key` → `SettingChange[]` (`user`, `old`, `new`, `at`, `reason`) |

`TrainingSettings = {hitl_retraining_threshold, training_device, batch_size, max_epochs,
early_stopping, candidate_promotion_mode, minimum_improvement, primary_promotion_metric}`.
`ADMIN` only. Every change writes an audit row. Validation per CLAUDE.md §8.1 and it is
**server-authoritative**.

### Logs

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/logs` | `?level&event&actor_id&from&to&q&page` → paginated `SystemLog[]` |
| `GET` | `/logs/events` | distinct `event` values, for the filter dropdown |

`SystemLog = {id, at, level, event, actor_id, actor_username, entity_type, entity_id, message,
metadata}`. Audited events: `AUTH_LOGIN`, `AUTH_LOGIN_FAILED`, `AUTH_LOGOUT`, `DATASET_UPLOADED`,
`DATASET_ASSIGNED`, `DATASET_MODIFIED`, `DATASET_DELETED`, `TEST_SET_LOCKED`,
`ANNOTATION_SUBMITTED`, `IMAGE_SKIPPED`, `HITL_BATCH_CREATED`, `TRAINING_STARTED`,
`TRAINING_COMPLETED`, `TRAINING_FAILED`, `CANDIDATE_CREATED`, `MODEL_PROMOTED`, `MODEL_REJECTED`,
`MODEL_ARCHIVED`, `LABEL_SPACE_CHANGED`, `SETTINGS_CHANGED`, `ERROR`.

## Not in the API, on purpose

| Capability | Where it lives instead | Why |
| --- | --- | --- |
| User creation / password reset | `scripts/create_user.py` | a single local researcher does not need a user-admin surface; keeping it out removes a privilege-escalation path |
| Image byte upload | `POST /uploads` registers a **local directory path** | streaming a whole dataset through HTTP on the same machine is pure waste; nothing is copied |
| Model rollback | `POST /models/{id}/archive` then `POST /models/{id}/promote` | an explicit two-step leaves two audit rows; a one-click rollback would hide which decision was made |
| Anything training-related that blocks | the worker process polls `training_jobs` | the API must stay responsive; see CLAUDE.md §9.1 |
