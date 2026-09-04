# Database

Scope: the PostgreSQL schema — tables, keys, indexes — the lineage queries it must answer by query
alone, and the invariants it enforces in the database rather than in application code.

See also: [architecture](./architecture.md) · [backend](./backend.md) · [hitl_workflow](./hitl_workflow.md) · [model_versioning](./model_versioning.md) · [api_contract](./api_contract.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §4 (vocabulary), §7 (database), §8 (threshold).

**Schema of record: `backend/migrations/sql/0001_init.sql`.** `backend/app/models/` mirrors it
exactly — change both in one commit or neither. Alembic is deferred until the first real dataset load
(CLAUDE.md §11.5). Where this document and the SQL file disagree, the SQL file wins.

## ER overview

```text
users ─┬─created_by─> datasets ──< dataset_versions ──<─────────────┐
       ├─annotator_id─> annotations ────────image_id──> images <────┘
       ├─reviewer_id──> review_sessions ────image_id──>   │  │
       ├─actor_id────> system_logs                        │  └─label_id─> disease_labels
       └─updated_by──> system_settings                    │
                                                          ├──< ai_predictions ──model_id──> models
                                                          └──< training_samples
                                                                    │ batch_id
   training_batches ──<─┴─── training_jobs ──produces──> models ──< model_evaluations
        │ dataset_version_id                              │ training_batch_id      │
        └──────────> dataset_versions <───────────────────┴────────────────────────┘
                     (the locked TEST version evaluates every model version)
```

## Conventions

Applied to every table and omitted from the column tables below:

- `id bigserial PRIMARY KEY`; `created_at timestamptz NOT NULL DEFAULT now()`;
  `updated_at timestamptz NOT NULL DEFAULT now()` maintained by `trg_touch_updated_at`.
  `system_logs` names its timestamp `at` to match the API field.
- Archivable tables add `archived_at timestamptz NULL`: `datasets`, `dataset_versions`, `images`,
  `annotations`, `models`. Nothing is hard-deleted (CLAUDE.md §7).
- Enum columns are `text` + `CHECK (col IN (…))` mirroring `backend/app/core/enums.py` — readable in
  `pg_dump`, no `ALTER TYPE` ceremony, and `test_enum_parity.py` catches drift.
- `geometry`, `probabilities`, `metrics`, `hyperparameters`, `metadata`, `loss_history` are `jsonb`.
- All foreign keys are `ON DELETE RESTRICT`. `PK`/`FK`/`UQ`/`IDX` markers are inline in **notes**.

## Tables

### `users`

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `username` | `text` | no | — | `UQ`; no email required |
| `display_name` | `text` | no | — | shown in the header and audit rows |
| `role` | `text` | no | `'ANNOTATOR'` | `CHECK ∈ Role`; `IDX` |
| `password_hash` | `text` | no | — | PHC-style: algorithm, iterations, salt, digest |
| `is_active` | `boolean` | no | `true` | inactive login fails with the generic message |
| `last_login_at` | `timestamptz` | yes | — | written on successful auth |

### `disease_labels`

The label space is configuration, not an enum (CLAUDE.md §5): read by both the model head and the
annotation form.

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `code` | `text` | no | — | `UQ`; the brief's six codes are seeded, not hard-coded |
| `display_name` | `text` | no | — | label shown in the UI |
| `display_order` | `integer` | no | `0` | stable ordering; `IDX (is_active, display_order)` |
| `verified_against_data` | `boolean` | no | `false` | flips only after real-file inspection |
| `is_active` | `boolean` | no | `true` | retired codes stay for lineage |

### `datasets`

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `name` | `text` | no | — | `UQ (name) WHERE archived_at IS NULL` |
| `description` | `text` | yes | — | free text |
| `source` | `text` | yes | — | provenance: local path or citation |
| `status` | `text` | no | `'STAGING'` | `CHECK ∈ DatasetStatus`; `IDX` |
| `created_by` | `bigint` | no | — | `FK → users.id` |

### `dataset_versions`

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `dataset_id` | `bigint` | no | — | `FK → datasets.id` |
| `version_number` | `integer` | no | — | `UQ (dataset_id, version_number)`, 1-based |
| `label` | `text` | no | — | human tag, e.g. `baseline` |
| `note` | `text` | yes | — | why this version exists |
| `is_test_locked` | `boolean` | no | `false` | one-way door; `IDX` |
| `test_locked_at` | `timestamptz` | yes | — | set with the lock |
| `test_locked_by` | `bigint` | yes | — | `FK → users.id` |

A locked version refuses split reassignment, image mutation and deletion → `409 DATASET_LOCKED`.

### `images`

Centre of the lineage graph. One row per physical file; the file is never copied between splits.

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `dataset_version_id` | `bigint` | no | — | `FK → dataset_versions.id`; dataset via join |
| `file_path` | `text` | no | — | relative to `MEDLOOP_STORAGE_ROOT`; `UQ (dataset_version_id, file_path)` |
| `file_sha256` | `text` | yes | — | duplicate detection; `IDX` |
| `original_width` | `integer` | yes | — | px; denominator for normalised geometry |
| `original_height` | `integer` | yes | — | px; `NULL` until the file is probed |
| `split` | `text` | no | `'UNASSIGNED'` | `CHECK ∈ ImageSplit`; where it sits in the experiment |
| `review_status` | `text` | no | `'NOT_REVIEWED'` | `CHECK ∈ ReviewStatus`; what a human did |
| `lifecycle` | `text` | no | `'STAGING'` | `CHECK ∈ ImageLifecycle` |
| `label_id` | `bigint` | yes | — | `FK → disease_labels.id`; dataset-provided label |
| `patient_ref` | `text` | yes | — | opaque; only if the real data supplies one; `IDX` |
| `lesion_ref` | `text` | yes | — | grouping within a patient |
| `reviewed_by` | `bigint` | yes | — | `FK → users.id`, stamped at submit/skip |
| `reviewed_at` | `timestamptz` | yes | — | stamped at submit/skip (CLAUDE.md §6.1) |

`IDX (split, review_status)` drives the review queue; `IDX (dataset_version_id, split)` drives the
`counts` block; also `(label_id)`, `(created_at)`.

### `annotations`

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `image_id` | `bigint` | no | — | `FK → images.id`; `IDX` |
| `annotator_id` | `bigint` | yes | — | `FK → users.id`; `NULL` when `source = AI_LOCALIZATION` |
| `review_session_id` | `bigint` | yes | — | `FK → review_sessions.id`; groups shapes per submit |
| `type` | `text` | no | — | `CHECK ∈ AnnotationType` |
| `geometry` | `jsonb` | no | — | normalised `[0,1]` payload, CLAUDE.md §4.3 |
| `label_id` | `bigint` | yes | — | `FK → disease_labels.id`; per-shape label |
| `source` | `text` | no | `'HUMAN'` | `CHECK ∈ AnnotationSource` |

`DELETE /annotations/{id}` sets `archived_at`; prediction rows are untouched (CLAUDE.md §2.4).

### `ai_predictions`

Immutable: `trg_ai_predictions_immutable` rejects `UPDATE` and `DELETE`, and no repository exposes a
write path other than insert.

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `image_id` | `bigint` | no | — | `FK → images.id`; `UQ (image_id, model_id)` |
| `model_id` | `bigint` | no | — | `FK → models.id`; the version that produced it |
| `predicted_label_id` | `bigint` | no | — | `FK → disease_labels.id` |
| `confidence` | `numeric(6,5)` | no | — | `CHECK 0 ≤ confidence ≤ 1`; `IDX` |
| `probabilities` | `jsonb` | no | — | full vector `{label_code: p}` |
| `gradcam_path` | `text` | yes | — | artefact under `storage/gradcam/`; `NULL` ⇒ no XAI view |
| `localization` | `jsonb` | yes | — | derived coarse box, normalised `[0,1]` |
| `device` | `text` | no | — | device the forward pass **actually** used (CLAUDE.md §2.3) |

### `review_sessions`

One row per human decision — the primary research record.

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `image_id` | `bigint` | no | — | `FK → images.id`; `IDX` |
| `reviewer_id` | `bigint` | no | — | `FK → users.id`; `IDX` |
| `outcome` | `text` | no | — | `CHECK IN ('VALIDATED','SKIPPED')`; `IDX` |
| `human_label_id` | `bigint` | yes | — | `FK → disease_labels.id`; `NULL` when skipped |
| `ai_prediction_id` | `bigint` | yes | — | `FK → ai_predictions.id`; `NULL` when no model existed |
| `ai_label_id` | `bigint` | yes | — | copied at submit; survives later label edits |
| `agreement` | `boolean` | yes | — | `human_label_id = ai_label_id`; `NULL` without a prediction |
| `model_version` | `integer` | yes | — | frozen copy; attributable after promotion |
| `skip_reason` | `text` | yes | — | `CHECK ∈ SkipReason`; required iff `outcome='SKIPPED'` |
| `note` | `text` | yes | — | free text from either path |
| `time_spent_ms` | `integer` | yes | — | input to the annotation-time metric |

`CHECK ((outcome = 'SKIPPED') = (skip_reason IS NOT NULL))`; `IDX (created_at)`, `(agreement)`.

### `training_batches`

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `batch_number` | `integer` | no | — | `UQ`; names `storage/training_batches/batch_001/` |
| `status` | `text` | no | `'CREATED'` | `CHECK ∈ TrainingBatchStatus`; `IDX` |
| `sample_count` | `integer` | no | — | frozen at creation; equals the `training_samples` count |
| `threshold_at_creation` | `integer` | no | — | settings value at the moment of cutting (§8.4) |
| `base_model_id` | `bigint` | yes | — | `FK → models.id`; the ACTIVE model being improved on |
| `dataset_version_id` | `bigint` | no | — | `FK → dataset_versions.id` |
| `manifest_path` | `text` | yes | — | JSON manifest of member ids, written once |
| `created_by` | `bigint` | yes | — | `FK → users.id`; `NULL` when cut automatically |

`UQ ((true)) WHERE status IN ('CREATED','TRAINING','EVALUATING')` — at most one open batch.

### `training_samples`

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `batch_id` | `bigint` | no | — | `FK → training_batches.id` |
| `image_id` | `bigint` | no | — | `FK → images.id`; `UQ (batch_id, image_id)`; `IDX` |
| `label_id` | `bigint` | no | — | `FK → disease_labels.id`; the **human** label, frozen |
| `review_session_id` | `bigint` | yes | — | `FK → review_sessions.id`; the admitting decision |

Append-only: `trg_training_samples_immutable` rejects `UPDATE`/`DELETE` (CLAUDE.md §8.4).

### `training_jobs`

Separates *what to train on* (immutable batch) from *an attempt at training it* (retryable job).

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `batch_id` | `bigint` | no | — | `FK → training_batches.id`; `IDX` |
| `status` | `text` | no | `'QUEUED'` | `CHECK ∈ TrainingJobStatus`; `IDX` |
| `device_requested` | `text` | no | — | `CHECK ∈ TrainingDevice`, from settings |
| `device_used` | `text` | yes | — | resolved at start; reported, never assumed |
| `epochs_planned` | `integer` | no | — | `max_epochs` at start time |
| `epochs_completed` | `integer` | no | `0` | worker increments |
| `progress` | `numeric(4,3)` | no | `0` | `0…1`, clamped |
| `epoch_history` | `jsonb` | no | `'[]'` | live per-epoch rows; copied to `models.loss_history` |
| `started_at` | `timestamptz` | yes | — | — |
| `finished_at` | `timestamptz` | yes | — | — |
| `error_message` | `text` | yes | — | the real failure, not a summary |
| `log_path` | `text` | yes | — | file under `storage/logs/`; source of `log_tail` |

`UQ ((true)) WHERE status IN ('QUEUED','RUNNING','EVALUATING')` — one live job, which is what lets
`POST /training/batches/{id}/start` answer `409`.

### `models`

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `version` | `integer` | no | — | `UQ`; names `storage/models/v{version}/` |
| `status` | `text` | no | `'CANDIDATE'` | `CHECK ∈ ModelStatus`; `IDX` |
| `training_batch_id` | `bigint` | yes | — | `FK → training_batches.id`; `NULL` for the baseline |
| `training_dataset_version_id` | `bigint` | no | — | `FK → dataset_versions.id` |
| `architecture` | `text` | no | — | configured backbone identifier |
| `hyperparameters` | `jsonb` | no | — | full resolved config, not a diff |
| `epochs_trained` | `integer` | yes | — | actual, after early stopping |
| `loss_history` | `jsonb` | no | `'[]'` | `[{epoch, train_loss, val_loss, lr}]` |
| `metrics` | `jsonb` | yes | — | summary mirror of the primary evaluation row |
| `artifact_path` | `text` | yes | — | weights inside the registry directory |
| `artifact_sha256` | `text` | yes | — | integrity check before load |
| `promoted_at` | `timestamptz` | yes | — | set only on promotion |
| `decided_by` | `bigint` | yes | — | `FK → users.id`; `NULL` under `AUTOMATIC` |
| `decision_reason` | `text` | yes | — | promotion or rejection rationale |

`UQ (status) WHERE status = 'ACTIVE'` — **exactly one ACTIVE model** (CLAUDE.md §9).

### `model_evaluations`

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `model_id` | `bigint` | no | — | `FK → models.id` |
| `dataset_version_id` | `bigint` | no | — | `FK → dataset_versions.id`; the locked test version |
| `split` | `text` | no | `'TEST'` | `CHECK ∈ ImageSplit`; validation runs recorded too |
| `sample_count` | `integer` | no | — | how many images the numbers came from |
| `metrics` | `jsonb` | no | — | `{metric_key: value}` — only keys the code computed |
| `confusion_matrix` | `jsonb` | yes | — | ordered by `disease_labels.display_order` |
| `per_class` | `jsonb` | yes | — | precision/recall/F1/support per label code |
| `device` | `text` | no | — | device the evaluation actually ran on |

`UQ (model_id, dataset_version_id, split)`. Two models are comparable only when their rows share
`(dataset_version_id, split)` — see [model_versioning](./model_versioning.md).

### `system_logs`

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `at` | `timestamptz` | no | `now()` | `IDX (at DESC)`; API field name is `at` |
| `level` | `text` | no | `'INFO'` | `CHECK ∈ LogLevel`; `IDX` |
| `event` | `text` | no | — | one of the audited events in `api_contract.md` → Logs; `IDX` |
| `actor_id` | `bigint` | yes | — | `FK → users.id`; `NULL` for worker/system rows |
| `entity_type` | `text` | yes | — | `image`, `model`, `setting`, …; `IDX (entity_type, entity_id)` |
| `entity_id` | `bigint` | yes | — | loose reference, no FK across types |
| `message` | `text` | no | — | the actual state, not the intended one |
| `metadata` | `jsonb` | yes | — | old/new values for settings changes, etc. |

### `system_settings`

| column | type | null | default | notes |
| --- | --- | --- | --- | --- |
| `key` | `text` | no | — | `UQ`, e.g. `hitl_retraining_threshold` |
| `value_type` | `text` | no | — | `int` / `float` / `bool` / `enum` |
| `value` | `text` | no | — | typed on read by `settings_service` |
| `default_value` | `text` | no | — | the documented default, kept for reset |
| `updated_by` | `bigint` | yes | — | `FK → users.id` |

Defaults and validation: CLAUDE.md §8.1. Also holds the derived counter
`validated_since_last_training` (§8.2). This table is the **only** place the threshold value exists;
no code compares against a literal.

## Lineage queries

These answer CLAUDE.md §7.1 by query alone, with no log file involved. Every one of them returns zero
rows today — no image, prediction, batch or model exists (see the closing note).

**1 — Where did this image come from and what happened to it?**

```sql
SELECT i.id, d.name AS dataset, dv.version_number, dv.label, i.split, i.review_status,
       i.lifecycle, l.code AS dataset_label, u.username AS reviewed_by, i.reviewed_at
FROM images i
JOIN dataset_versions dv   ON dv.id = i.dataset_version_id
JOIN datasets d            ON d.id  = dv.dataset_id
LEFT JOIN disease_labels l ON l.id  = i.label_id
LEFT JOIN users u          ON u.id  = i.reviewed_by
WHERE i.id = $1;
```

**2 — What did the AI predict, and which model version produced it?**

```sql
SELECT p.created_at, m.version AS model_version, pl.code AS predicted, p.confidence, p.device,
       p.gradcam_path IS NOT NULL AS has_gradcam
FROM ai_predictions p
JOIN models m           ON m.id  = p.model_id
JOIN disease_labels pl  ON pl.id = p.predicted_label_id
WHERE p.image_id = $1 ORDER BY m.version DESC;
```

**3 — What did the human change?** Both rows survive; the disagreement is the signal.

```sql
SELECT rs.created_at, u.username, rs.outcome, rs.model_version, ai.code AS ai_label,
       hu.code AS human_label, rs.agreement, rs.skip_reason, rs.time_spent_ms,
       (SELECT count(*) FROM annotations a WHERE a.review_session_id = rs.id) AS shapes
FROM review_sessions rs
JOIN users u                ON u.id  = rs.reviewer_id
LEFT JOIN disease_labels ai ON ai.id = rs.ai_label_id
LEFT JOIN disease_labels hu ON hu.id = rs.human_label_id
WHERE rs.image_id = $1 ORDER BY rs.created_at;
```

**4 — Which batch consumed it, and which model versions were trained on it?**

```sql
SELECT tb.batch_number, tb.threshold_at_creation, tb.status AS batch_status,
       m.version AS produced_model, m.status AS model_status
FROM training_samples ts
JOIN training_batches tb ON tb.id = ts.batch_id
LEFT JOIN models m       ON m.training_batch_id = tb.id
WHERE ts.image_id = $1 ORDER BY tb.batch_number;
```

**5 — Reverse direction: exactly which images produced model V?** (release audit)

```sql
SELECT ts.image_id, i.file_path, l.code AS trained_label, ts.review_session_id
FROM models m
JOIN training_samples ts ON ts.batch_id = m.training_batch_id
JOIN images i            ON i.id = ts.image_id
JOIN disease_labels l    ON l.id = ts.label_id
WHERE m.version = $1;
```

**6 — Counter reconciliation**, the arbiter behind `scripts/reconcile_hitl_counter.py`:

```sql
SELECT count(*) FROM review_sessions rs
WHERE rs.outcome = 'VALIDATED'
  AND rs.created_at > COALESCE((SELECT max(created_at) FROM training_batches), '-infinity');
```

## Invariants and rationale

**Split and review_status are orthogonal** (CLAUDE.md §4.1). `split` is where the image sits in the
experiment; `review_status` is what a human did with it. A `TRAIN` image is never reviewed; an
`UNUSED` image walks `NOT_REVIEWED → IN_REVIEW → VALIDATED | SKIPPED`. One collapsed column would
lose that, and `TEST` + `VALIDATED` must stay *expressible* precisely so the service can *reject* it.

**`DataStatus` is derived, never stored** — one function per language (`derive_data_status` /
`deriveDataStatus`), precedence highest first:

```text
ARCHIVED > TRAINING_USED > VALIDATED > SKIPPED > IN_REVIEW
         > split (TRAIN | VALIDATION | TEST | UNUSED) > STAGING
```

Storing it would create a second truth to keep in sync. The `counts` block in `api_contract.md` is
exactly these members, lower-cased.

**One ACTIVE model, enforced by the database.** `UQ (status) WHERE status='ACTIVE'` means a promotion
must archive the incumbent in the same transaction or the write fails. The rule cannot rot in
application code.

**Batch immutability** (CLAUDE.md §8.4):

| Guard | Mechanism |
| --- | --- |
| membership frozen | `trg_training_samples_immutable` rejects `UPDATE`/`DELETE` |
| size frozen | `sample_count` written once; a check script compares it to the row count |
| threshold frozen | `threshold_at_creation` copied at creation and never re-read |
| one open batch | partial `UQ` on `status IN ('CREATED','TRAINING','EVALUATING')` |
| one live job | partial `UQ` on `status IN ('QUEUED','RUNNING','EVALUATING')` |

**Soft delete only.** No repository issues `DELETE` outside test fixtures. Archiving sets
`archived_at` plus the `ARCHIVED` status, writes a `system_logs` row, and leaves every foreign key
resolvable. `ai_predictions` and `training_samples` have no archive path at all — they are history.

**Locked test versions.** `is_test_locked = true` is one-way. Any write that would reassign a split,
mutate an image or delete a row in that version is refused with `409 DATASET_LOCKED`; a different
test set means a new version (CLAUDE.md §2.5).

**No dataset is loaded yet.** Every table is empty apart from seeded `users`, `disease_labels`
(`verified_against_data = false`) and `system_settings` defaults. Row counts, class distributions and
metric values are therefore unknown, not zero — statistics endpoints omit what they cannot compute.
