# HITL workflow

Scope: the human-in-the-loop cycle — queue, claim, submit, skip, the validated-sample counter, and the
threshold that cuts a training batch.

See also: [annotation_workflow](./annotation_workflow.md) · [database](./database.md) · [model_versioning](./model_versioning.md) · [research_protocol](./research_protocol.md) · [api_contract](./api_contract.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §2.6 (threshold is configuration), §6 (workflow), §8 (full threshold rule set).

## State machine

```text
        ┌───────────────────────────────────────────────────────────────────┐
        │                          REVIEW QUEUE                             │
        │  eligible ⇔ split = UNUSED  ∧  review_status = NOT_REVIEWED        │
        │  TRAIN / VALIDATION / TEST are never eligible, lock or no lock     │
        └───────────────────────────────┬───────────────────────────────────┘
                                        │ POST /review/{id}/claim
                                        ▼
                                 ┌──────────────┐  POST /review/{id}/release
                                 │  IN_REVIEW   │ ──────────────────────────▶ NOT_REVIEWED
                                 └──────┬───────┘
                submit /submit          │          skip /skip
              ┌─────────────────────────┴──────────────────────────┐
              ▼                                                    ▼
       ┌─────────────┐                                      ┌─────────────┐
       │  VALIDATED  │  the only status eligible for the     │   SKIPPED   │
       └──────┬──────┘  HITL pool (CLAUDE.md §4.2)           └──────┬──────┘
              │                                                    │
              ▼                                                     X never joins a batch
   validated_since_last_training += 1                                 automatically
              │
              ▼
   threshold met?  ──no──▶ stage = NOT_READY
              │yes
              ▼
   training_batches row (threshold_at_creation) ──▶ member images: lifecycle = TRAINING_USED
              │
              ▼
   stage = READY_FOR_RETRAINING ──▶ TRAINING ──▶ EVALUATING ──▶ CANDIDATE ──▶ PROMOTED | REJECTED
```

`HitlCycleStage` is derived from row state, never stored as a workflow flag.

## Submit — one transaction

`POST /review/{image_id}/submit`, steps 1–8 of CLAUDE.md §6.1 inside a single transaction.

| # | Action | Rows written |
| --- | --- | --- |
| 0 | guards: image exists, `split = UNUSED`, `review_status = IN_REVIEW` held by this user, label code is active | — |
| 1 | persist the human disease label | `review_sessions.human_label_id` |
| 2 | persist each annotation geometry | one `annotations` row per shape, `source = HUMAN` |
| 3 | leave the AI prediction untouched | *nothing* — class, confidence and version are preserved |
| 4 | stamp review provenance | `images.reviewed_at`, `images.reviewed_by` |
| 5 | set `review_status = VALIDATED` | `images.review_status` |
| 6 | admit to the HITL pool (eligibility, not a copy) | — the pool is a query over `review_sessions` |
| 7 | increment the counter | `system_settings.validated_since_last_training` |
| 8 | evaluate the threshold, possibly cut a batch | `training_batches` + N `training_samples` + `images.lifecycle = TRAINING_USED` |
| 9 | audit | `system_logs`: `ANNOTATION_SUBMITTED`, and `HITL_BATCH_CREATED` when a batch was cut |

Then, outside the transaction, the response carries the next `ReviewItem` so the UI advances without a
second round trip. Any failure rolls back all of it: a partially validated sample is a corrupt
experiment.

## Skip

`POST /review/{image_id}/skip` with a `SkipBody` reason. Skipping is a first-class research signal, not
a failure path: an image a clinician cannot label is evidence about the data, and the skip rate is a
reported figure (see [research_protocol](./research_protocol.md)).

| Property | Behaviour |
| --- | --- |
| Status | `review_status = SKIPPED`; the review session records the reason |
| Counter | **not** incremented — skipped work never moves the threshold |
| Training | never enters a batch automatically; `lifecycle` is left as it was and never becomes `TRAINING_USED` |
| Recoverable | an admin can return it to `NOT_REVIEWED` for another pass; the skip row remains in the audit trail |
| Audit | `system_logs`: `IMAGE_SKIPPED` |

## The counter

`system_settings.validated_since_last_training` is a cursor, not a total. It counts validations since
the last batch was cut and is reset to `0` by that cut — the lifetime total is always recoverable by
counting `review_sessions`.

```text
GET /training/status  ──▶  HitlStatus {
    validated_since_last_training,     # the counter
    threshold,                         # system_settings.hitl_retraining_threshold
    remaining,                         # max(0, threshold − counter)
    progress,                          # counter / threshold, clamped to 1.0
    threshold_met,                     # the boolean the UI must not recompute
    stage, current_batch, current_job, active_model, candidate_model, last_training_at }
```

The UI renders `count / threshold` from this payload. No screen and no component hard-codes a target
number (CLAUDE.md §2.6); `ProgressBar` receives both values or renders nothing.

### Reconciliation

The counter is a cached aggregate, so it can drift — a manual `UPDATE`, an interrupted restore, a
schema-level fix applied outside the API. `scripts/reconcile_hitl_counter.py` recomputes it:

```sql
-- validated samples that no batch has consumed yet
SELECT count(*) FROM images i
  JOIN review_sessions rs ON rs.image_id = i.id
 WHERE i.review_status = 'VALIDATED'
   AND i.lifecycle    <> 'TRAINING_USED';
```

The script reports the stored value, the computed value and the delta; `--apply` writes the corrected
value and an audit row. It never deletes a batch and never lowers `lifecycle` — reconciling the cursor
must not rewrite history.

## The trigger — threshold read, never compiled

```python
# backend/app/services/hitl_service.py  (shape, inside the submit transaction)
def on_sample_validated(session, actor_id) -> Batch | None:
    lock_advisory(session, HITL_LOCK_KEY)                  # serialise deciders
    threshold = settings_service.get_int("hitl_retraining_threshold")   # configuration
    count = settings_repository.increment_validated_counter(session)
    if count < threshold:
        return None                                        # stage stays NOT_READY
    samples = review_repository.unconsumed_validated(session)           # the HITL pool
    batch = training_repository.create_batch(
        session, sample_count=len(samples), threshold_at_creation=threshold)
    training_repository.add_samples(session, batch.id, samples)         # frozen membership
    image_repository.mark_training_used(session, [s.image_id for s in samples])
    settings_repository.reset_validated_counter(session)
    audit_service.log(session, "HITL_BATCH_CREATED", actor_id, batch.id)
    return batch
```

Every number in that function comes from `system_settings`. `1000` is the **default value of
`hitl_retraining_threshold`**, shipped in the seed row and editable at
`PUT /admin/settings/training`; it is not a condition in the code and not an environment variable
(CLAUDE.md §8.1). A comparison written as `if count < 1000` would be a defect.

Creating the batch is where automation stops. The training job is started explicitly through
`POST /training/batches/{batch_id}/start`, so no HTTP request ever spends its lifetime training a
model.

## Concurrency

Two annotators submitting at the same moment must not both cut a batch from overlapping samples.

| Guard | Mechanism |
| --- | --- |
| Serialise the decision | `pg_advisory_xact_lock(HITL_LOCK_KEY)` taken *before* the counter is read; released at commit |
| Atomic increment | the counter is bumped by `SET value = value + 1` in SQL, never read-modify-write in Python |
| One batch per sample | `training_samples` carries `UQ (batch_id, image_id)` and membership is only ever inserted for images still `lifecycle <> 'TRAINING_USED'` |
| One live job | a partial unique index permits a single `QUEUED`/`RUNNING` `training_jobs` row; a second start is a `409 CONFLICT` |
| One ACTIVE model | `UQ (status) WHERE status = 'ACTIVE'` — promotion archives the incumbent in the same transaction |

The lock is scoped to the transaction, so the loser of the race simply observes the reset counter and
returns `None`. See [database](./database.md) for the index definitions.

## Changing the threshold

`PUT /admin/settings/training` validates and writes the new value plus a `SETTINGS_CHANGED` audit row.
The write itself never cuts, un-cuts or resizes a batch — only a validation event evaluates the rule.

| Scenario | Counter | Effect |
| --- | --- | --- |
| Raised above the counter (illustrative: 1000 → 1500) | 1200 | nothing happens; the next submit compares 1201 against 1500 and waits |
| Lowered below the counter (illustrative: 1000 → 500) | 700 | still nothing on write; the next submit compares 701 against 500 and cuts a batch of 701 |
| Changed while earlier batches exist | any | those rows keep their own `threshold_at_creation`; history is never relabelled |
| Changed while a job is `RUNNING` | any | the job and its batch membership are untouched; the new value applies to the *next* cut |

The counter is never reset by a settings change — only by a batch cut or by an explicit reconciliation.

## Batch immutability

| Property | Rule |
| --- | --- |
| Membership | `training_samples` rows are inserted once at creation and never added to or removed |
| Labels | the human label is copied into the sample row, so a later re-annotation cannot alter what was trained on |
| Threshold | `threshold_at_creation` is stored on the batch — the setting it was cut under, not the setting today |
| Failure | a `FAILED` job leaves the batch intact; a retry reuses it rather than re-cutting |
| Deletion | none. A batch is the provenance of a model version (CLAUDE.md §2.5) |

That is what will make the question *"which samples was this version trained on?"* answerable months
after the fact — for whichever version eventually exists.

## What never enters a batch automatically

| Data | Why |
| --- | --- |
| `SKIPPED` images | no human label exists to train on |
| `IN_REVIEW` / `NOT_REVIEWED` | not validated |
| `TRAIN` / `VALIDATION` / `TEST` split members | reserved by dataset design; a `TEST` image is protected by the version lock and never appears in the queue at all |
| Already-consumed images | `lifecycle = TRAINING_USED` excludes them from the pool query |

## Agreement and correction rate

`agreement` is computed **at submit time** and stored on the review session together with
`model_version`, so it stays attributable after promotion changes the active model (CLAUDE.md §6.3).
Statistics aggregate that stored column over reviews that **had a prediction**; `agreement IS NULL`
(no model existed) is excluded from the denominator, never counted as a disagreement.

| Figure | Definition | Value today |
| --- | --- | --- |
| Agreement | `count(agreement) FILTER (WHERE agreement) / count(agreement)` | — |
| Correction rate | `1 − agreement`, same denominator | — |
| Skip rate | `SKIPPED / (VALIDATED + SKIPPED)` | — |
| Mean review time | mean of `review_sessions.time_spent_ms` | — |

No prediction has ever been produced, so every denominator is `0` and all four are reported as `—`
(unknown), never `0%`. `statistics_service` omits a figure it cannot compute (CLAUDE.md §2.3).

## Worked example — one image, `UNUSED` → `TRAINING_USED`

Illustrative walkthrough with `hitl_retraining_threshold = 1000` (its default) and the counter at 999.

| Step | Call | Rows written |
| --- | --- | --- |
| 1 | `GET /review/queue` | — (read: `split = UNUSED ∧ NOT_REVIEWED`, ordered oldest first) |
| 2 | `POST /review/248/claim` | `images.review_status = IN_REVIEW` only — a `review_sessions` row records a *decision*, so none exists yet |
| 3 | annotator draws two boxes, picks a label | nothing — canvas state is client-side until submit |
| 4 | `POST /review/248/submit` | `review_sessions` (`outcome = VALIDATED`, `human_label_id`, `time_spent_ms`; `ai_prediction_id`/`agreement`/`model_version` all `NULL` — no model exists); 2 × `annotations` (`source = HUMAN`, normalised geometry); `images.reviewed_at`/`reviewed_by`; `images.review_status = VALIDATED` |
| 5 | same transaction | counter 999 → **1000** |
| 6 | same transaction | 1000 ≥ 1000 ⇒ `training_batches` row (`sample_count = 1000`, `threshold_at_creation = 1000`), 1000 × `training_samples`, 1000 × `images.lifecycle = TRAINING_USED`, counter reset to 0 |
| 7 | same transaction | `system_logs`: `ANNOTATION_SUBMITTED`, `HITL_BATCH_CREATED` |
| 8 | response | `SubmitResult` with `hitl.batch_created = true`, `hitl.batch_id`, and the next `ReviewItem` |
| 9 | `POST /training/batches/{id}/start` (explicit, admin) | `training_jobs` row `QUEUED`; the worker picks it up |
| 10 | worker | job → `RUNNING` → `EVALUATING` → `COMPLETED`; a `CANDIDATE` model row |

Image 248 is now `derive_data_status = TRAINING_USED`, out of the queue permanently, and traceable to
the batch and the model version it fed. Promotion of that candidate is a separate, human decision —
see [model_versioning](./model_versioning.md).
