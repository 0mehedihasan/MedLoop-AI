# Model versioning

Scope: the model registry — statuses, the on-disk layout, evaluation comparability, the promotion
criterion, rollback, and the audit trail behind each decision.

See also: [ml_pipeline](./ml_pipeline.md) · [hitl_workflow](./hitl_workflow.md) · [database](./database.md) · [research_protocol](./research_protocol.md) · [api_contract](./api_contract.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §2.5 (comparability), §8.1 (settings), §9 (lifecycle).

## Status — the registry is empty

**No model exists.** No version has been trained, evaluated, promoted or rejected; `GET /models`
returns an empty list and `GET /models/active` returns `null`. Every consumer treats that as
`MODEL_UNAVAILABLE`, not as a zero-score model (CLAUDE.md §2.3). The version history table at the end
of this document is the record that will be filled in — it is empty because nothing has happened.

## Lifecycle

```text
V1 ACTIVE  (the baseline, trained from the dataset splits — no HITL batch)
   │
   │ HITL batch 001 reaches the threshold, admin starts the job
   ▼
V2 CANDIDATE ──▶ evaluated on the SAME locked TEST dataset version as V1
   │
   ├── criterion met  ──▶ V2 ACTIVE   and V1 ARCHIVED   (one transaction)
   └── criterion fails ──▶ V2 REJECTED and V1 stays ACTIVE
```

| `ModelStatus` | Meaning | Can serve predictions |
| --- | --- | --- |
| `CANDIDATE` | trained and evaluated, awaiting a decision | no |
| `ACTIVE` | the one model inference and Grad-CAM use | yes |
| `REJECTED` | decided against; artefacts and metrics are kept as evidence | no |
| `ARCHIVED` | superseded by a promotion, or retired by hand | no |

`UQ (status) WHERE status = 'ACTIVE'` makes "exactly one active model" a database fact rather than a
convention. A promotion that forgot to archive the incumbent fails the insert instead of quietly
producing two active models.

## The model row

`models` stores everything needed to describe a run without opening a file (columns in
[database](./database.md#models)):

| Group | Columns |
| --- | --- |
| Identity | `version` (`UQ`, names the directory), `status`, `architecture` |
| Provenance | `training_batch_id` (`NULL` for the baseline), `training_dataset_version_id`, `created_at` |
| Configuration | `hyperparameters` — the fully resolved config including `seed`, not a diff from defaults |
| Outcome | `epochs_trained`, `loss_history`, `metrics` (mirror of the primary evaluation row) |
| Artefact | `artifact_path`, `artifact_sha256` |
| Decision | `promoted_at`, `decided_by` (`NULL` under `AUTOMATIC`), `decision_reason` |

Metrics live authoritatively in `model_evaluations`, one row per
`(model_id, dataset_version_id, split)`; `models.metrics` is a convenience copy of the primary one.

## On-disk registry

One directory per version, named from `models.version`, under the single storage root. Nothing here is
in git.

```text
storage/models/
├── v1/
│   ├── weights.pt          checkpoint of the best epoch (validation loss)
│   ├── weights.sha256      digest, mirrored into models.artifact_sha256
│   ├── hyperparameters.json  the resolved config, incl. seed and device_used
│   ├── label_space.json    ordered label codes the head was bound to
│   └── epochs.json         per-epoch train_loss / val_loss / lr / seconds
└── v2/ …
```

| Rule | Detail |
| --- | --- |
| Write once | a version directory is never rewritten; a retrain is a new version, never an in-place update |
| Verified before load | the digest is checked before `torch.load`; a mismatch is `MODEL_UNAVAILABLE`, never a silent load |
| Row and file are independent | deleting a directory does not delete the row — the row keeps the evidence and reports the artefact as missing |
| Label order is frozen | `label_space.json` is authoritative for that version; later edits to `disease_labels` cannot re-order an existing head |
| Grad-CAM artefacts | `storage/gradcam/{image_id}/v{version}.png`, so an explanation is attributable to the version that produced it |

That last rule is why re-running inference under a new version adds an `ai_predictions` row rather than
replacing one: the old prediction, its confidence and its heat-map stay attached to the model that made
them.

## Evaluation and comparability

Every candidate is evaluated by the worker on the **same locked `TEST` dataset version** as the model
it is compared against (CLAUDE.md §2.5). Comparability is decided by data, not by assertion:

```sql
-- two models are comparable iff their evaluation rows agree on this pair
SELECT model_id FROM model_evaluations
 WHERE dataset_version_id = :locked_test_version AND split = 'TEST';
```

| Situation | Behaviour |
| --- | --- |
| Both models evaluated on the same locked test version | comparison is rendered |
| Different test versions | `GET /models/comparison` returns `comparable: false` with a `reason`; the UI renders the refusal, **not** the numbers |
| Candidate has no evaluation row | it cannot be promoted; the promote call fails with a reason |
| Test version not locked | comparison is refused — an unlocked yardstick can change between runs |
| Metric missing from one side | that metric is dropped from the comparison, not defaulted to `0` |

## Promotion criterion

```text
m = settings.primary_promotion_metric        # default MACRO_F1
δ = settings.minimum_improvement             # default 0.005

eligible ⇔ candidate.status = 'CANDIDATE'
         ∧ both rows exist for the same locked (dataset_version_id, split = 'TEST')
         ∧ candidate.metrics[m] − active.metrics[m] ≥ δ
         ∧ artefact digest verifies
```

Both values come from `system_settings` through `settings_service` and are editable at
`PUT /admin/settings/training`. No comparison constant is written in the code.

### Worked examples — arithmetic only

**Every number below is illustrative.** No model has produced a metric; these rows exist to define the
comparison, not to report a result.

| # | Active `MACRO_F1` (illustrative) | Candidate (illustrative) | δ | Outcome |
| --- | --- | --- | --- | --- |
| A | 0.812 | 0.830 (+0.018) | 0.005 | passes → eligible for promotion |
| B | 0.812 | 0.815 (+0.003) | 0.005 | fails — improvement below the margin |
| C | 0.812 | 0.812 (±0.000) | 0.005 | fails — a tie is not an improvement |
| D | 0.812 | 0.790 (−0.022) | 0.005 | fails — regression |
| E | *no active model* | any | — | first model becomes `ACTIVE` with no comparison; the baseline case |
| F | 0.812 | 0.850 on a **different** test version | — | refused as not comparable, whatever the delta |

Row F is the important one: a bigger number on a different yardstick is not evidence, and the service
says so instead of ranking them.

### Modes

| `candidate_promotion_mode` | Behaviour | Row effects |
| --- | --- | --- |
| `MANUAL_APPROVAL` *(default)* | a passing candidate becomes *eligible* and waits for `POST /models/{id}/promote` | `decided_by` = the admin, `decision_reason` = their text |
| `AUTOMATIC` | the worker promotes a passing candidate itself and logs it | `decided_by` = `NULL`, reason states the automatic rule |

`MANUAL_APPROVAL` is one of the four defaults that must not be silently reversed (CLAUDE.md §8.2): a
clinical-adjacent system should not self-deploy. `POST /models/{id}/promote` on a candidate that fails
the criterion is refused with the computed delta in the response — the endpoint never promotes on
request alone. `POST /models/{id}/reject` requires a reason.

## The promotion transaction

| # | Step | Rows |
| --- | --- | --- |
| 1 | re-read the settings and re-evaluate the criterion *inside* the transaction | — |
| 2 | archive the incumbent | old `models.status = 'ARCHIVED'` |
| 3 | activate the candidate | `status = 'ACTIVE'`, `promoted_at`, `decided_by`, `decision_reason` |
| 4 | audit | `system_logs`: `MODEL_PROMOTED` with both versions in `metadata` |

Steps 2 and 3 share one transaction, so the partial unique index never sees two `ACTIVE` rows even for
an instant. Rejection is the same shape: `status = 'REJECTED'`, mandatory reason, `MODEL_REJECTED`.

## Rollback

There is no one-click rollback, and that is deliberate: `POST /models/{id}/promote` refuses a candidate
that does not meet the criterion, and an older version compared against a better incumbent never does.
The supported retreat is two explicit, audited steps:

```text
1. POST /models/{active_id}/archive     → no ACTIVE model; inference answers MODEL_UNAVAILABLE
2. POST /models/{older_id}/promote      → case E above: no incumbent, so no comparison is required
```

The gap between them is visible, not hidden — every prediction surface reports "no active model" for
the duration. Two consequences worth knowing: `ai_predictions` rows made by the archived version stay
exactly as they were, and the audited-event list in [api_contract.md](./api_contract.md) has no
`MODEL_ARCHIVED` member, so a standalone archive is a contract change before it is a code change.

## Audit trail

| Event | Written when | `metadata` |
| --- | --- | --- |
| `CANDIDATE_CREATED` | the worker registers a trained model | version, batch id, epochs, device used |
| `MODEL_PROMOTED` | promotion commits | new version, archived version, metric, delta, δ, mode |
| `MODEL_REJECTED` | rejection commits | version, metric, delta, reason |
| `TRAINING_STARTED` / `_COMPLETED` / `_FAILED` | job transitions | job id, batch id, error message on failure |
| `SETTINGS_CHANGED` | `minimum_improvement`, mode or metric edited | key, old, new, reason |

Together these answer "why is this model live" without reading code: the batch it came from, the
samples in that batch, the metric that justified it, the person who decided, and the settings in force
at the time.

## Version history — empty

| Version | Status | Batch | Test version | `MACRO_F1` | Δ vs previous | Decided by | Promoted at |
| --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — | — |

No row exists because no model has been trained. `—` means unknown, not zero — see
[development_roadmap](./development_roadmap.md) for what must happen before the first row appears.
