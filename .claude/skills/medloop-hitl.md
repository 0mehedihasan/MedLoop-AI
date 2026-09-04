# MedLoop AI — HITL loop

Read this when: touching the review queue, submit/skip, the validated counter, batching or
agreement. Extends `CLAUDE.md §6`, `§8`, `§4.2`. Endpoint shapes: `docs/api_contract.md` → Review,
Training.

## State machine

```text
                    split == UNUSED                     (TRAIN/VALIDATION/TEST never enter)
                          │
                 review_status = NOT_REVIEWED
                          │  POST /review/{id}/claim
                          ▼
                      IN_REVIEW ──────────────┐  POST /review/{id}/release
                          │                   └──────────► NOT_REVIEWED
        ┌─────────────────┴─────────────────┐
        │ POST …/submit                     │ POST …/skip
        ▼                                   ▼
    VALIDATED  ──► HITL pool ──► counter++  SKIPPED  ──X  never automatic
        │                                        (reason + note stored, counter untouched)
        └──► threshold check (§8.3) ──► maybe TrainingBatch(threshold_at_creation)
```

Guards enforced in `services/`, never in a route (`§4.2`):

| Guard | Rule |
| --- | --- |
| eligibility | only `split == UNUSED` may be claimed |
| test protection | `TEST` never enters the queue or the pool, lock state irrelevant; submit on a `TEST` image → `409 CONFLICT` |
| pool membership | `VALIDATED` only; `SKIPPED` is excluded |
| claim | a claim is a soft lock; `release` returns the row to `NOT_REVIEWED`. Re-review is not automatic — if added, it creates a **new** review session and never mutates the old one |

## Two record families, permanently separate (`§2.4`)

| `ai_predictions` (immutable) | `annotations` + `review_sessions` (human) |
| --- | --- |
| `image_id`, `model_id`, `model_version` | `image_id`, `annotator_id` (user) |
| `predicted_label_code`, `confidence` | human `label_code` |
| full `probabilities` vector | `type` ∈ `AnnotationType`, normalised `geometry` (`§4.3`) |
| `gradcam_path`, derived `localization` | `time_spent_ms`, `note` |
| `device` actually used, `created_at` | `reviewed_at`, `agreement`, `model_version` at review time |

Hard rules:
- A submit **never** issues `UPDATE ai_predictions` or `DELETE`. Corrections are new rows.
- `DELETE /annotations/{id}` soft-archives the annotation; the prediction is untouched.
- The AI's derived box is `AnnotationSource.AI_LOCALIZATION`; a human box is `HUMAN`. They are never
  merged, averaged or reconciled into one row.
- Disagreement is the primary research signal (`RQ1`, `RQ3`). Any "cleanup" that removes a
  contradiction destroys the experiment.

## Submit — one transaction, nine steps (`§6.1`)

```python
# services/review_service.py
def submit(self, *, image_id, user, payload) -> SubmitResult:
    with self._session.begin():                       # steps 1–8 are atomic
        image = self._images.get_for_review(image_id)         # guards: UNUSED, IN_REVIEW, not TEST
        self._sessions.record_label(image, user, payload.label_code)          # 1
        self._annotations.add_all(image, user, payload.annotations)           # 2
        #                                                                      3 prediction untouched
        image.reviewed_at = now(); image.review_status = ReviewStatus.VALIDATED   # 4, 5
        self._pool.add(image)                                                 # 6
        count = self._settings.increment_int("validated_since_last_training") # 7
        hitl = self._hitl.evaluate_threshold(count)                           # 8  (§8.3)
        log_event(self._session, event="ANNOTATION_SUBMITTED", actor=user, entity=("image", image.id))
    return SubmitResult(..., hitl=hitl, next=self._queue.next_item(user, payload.filters))  # 9
```

| Step | Detail |
| --- | --- |
| 1 | human disease label onto the review session |
| 2 | one row per annotation; `[0,1]` geometry validated at the schema boundary |
| 3 | prediction row deliberately left alone — class, confidence, model version preserved |
| 4–5 | `reviewed_at` stamped, `review_status = VALIDATED` |
| 6 | added to the HITL pool — a query over `VALIDATED`, materialised into `training_samples` at batch time |
| 7 | counter incremented **inside** the transaction |
| 8 | threshold evaluated in the same transaction; may create a batch |
| 9 | next queue item returned **after** commit so the UI advances without a round trip |

A partially validated sample is a corrupt experiment: if step 8 raises, the whole submit rolls back,
counter included.

## Skip (`§6.2`)

```text
POST /review/{id}/skip  {reason: SkipReason, note?, time_spent_ms?}
  → review_status = SKIPPED, reason + note stored, review session recorded
  → counter NOT touched, NOT enqueued for training, next queue item returned
```

`SkipReason ∈ {POOR_IMAGE_QUALITY, UNCLEAR, WRONG_IMAGE_TYPE, DUPLICATE, CANNOT_DETERMINE, OTHER}`.
Skip rate per reason is a research metric — never collapse the reasons into one flag. Audited as
`IMAGE_SKIPPED`.

## The counter

| Property | Value |
| --- | --- |
| Name / home | `validated_since_last_training`, in `system_settings`, served by the settings service |
| Meaning | **new** validated samples since the last batch was *created* — not total validated |
| Reset | only when a batch is created; never on a settings change, never on a job failure |
| Truth | derivable from `review_sessions`; `scripts/reconcile_hitl_counter.py` is the arbiter (`§8.2`) |
| Exposure | `GET /training/status` → `HitlStatus.validated_since_last_training` + `threshold` + `remaining` + `progress` (clamped 0..1) |

`threshold_met` is computed **server-side** as `count >= threshold`. The client never compares
against a literal, and never assumes `1000` (`§2.6`).

## Trigger and the duplicate-batch guard (`§8.3`)

```python
# services/hitl_service.py — pseudocode
HITL_LOCK = 0x4D4C4831                       # one key for the whole HITL cycle

def evaluate_threshold(self, count: int) -> HitlStatus:
    self._session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": HITL_LOCK})
    threshold = self._settings.get_int("hitl_retraining_threshold")   # NEVER a literal
    if count >= threshold and not self._batches.has_open_cycle():
        batch = self._batches.create(threshold_at_creation=threshold,
                                     sample_ids=self._pool.unbatched_validated_ids())
        self._settings.set_int("validated_since_last_training", 0)
        log_event(self._session, event="HITL_BATCH_CREATED", entity=("training_batch", batch.id))
    return self._status()
```

Two independent defences, both required:

1. **Advisory transaction lock** — serialises concurrent submits, so two simultaneous crossings
   cannot both pass the `count >= threshold` test.
2. **Partial unique index** — at most one non-terminal batch can exist, so even a lock bug cannot
   persist a duplicate:

```sql
CREATE UNIQUE INDEX one_open_hitl_batch ON training_batches ((true))
  WHERE status IN ('CREATED', 'TRAINING', 'EVALUATING');
```

One batch → at most one active training job (`§9.1`). When a cycle is already open the counter keeps
climbing; `threshold_met` stays true and the UI shows "ready" without creating a second batch. That
is why a counter may legitimately read above the threshold.

`HitlCycleStage` is **derived**, never stored:

| Condition | Stage |
| --- | --- |
| `count < threshold`, no open batch | `NOT_READY` |
| `count >= threshold`, no open batch | `READY_FOR_RETRAINING` |
| job `QUEUED`/`RUNNING`, then job `EVALUATING` | `TRAINING`, then `EVALUATING` |
| candidate registered, undecided | `CANDIDATE` |
| candidate promoted / rejected | `PROMOTED` / `REJECTED` |

## Threshold changes never rewrite history (`§8.4`)

| # | Change | Counter | Correct behaviour |
| --- | --- | --- | --- |
| 1 | `1000 → 500` | `731` | already met → `threshold_met = true`, stage `READY_FOR_RETRAINING`. The 731 samples are **not** discarded, reset, renumbered or split into a 500 + 231 pair. |
| 2 | `500 → 2000` | `731` | the 731 keep counting toward 2000; `remaining = 1269`. Nothing is dropped, no batch is created. |
| 3 | any change while stage ∈ {`TRAINING`, `EVALUATING`} | any | the live batch is untouched — it keeps its `threshold_at_creation`; the new value applies to the *next* cycle only. |
| 4 | `1000 → 100` just after a batch reset the counter to `0` | `0` | nothing retroactive; the next 100 validations create the next batch. |

Every change writes a `SETTINGS_CHANGED` audit row: user, key, old, new, timestamp, optional reason
(e.g. `ADMIN changed hitl_retraining_threshold 1000 → 500`).

## Batch immutability

- `training_batches` stores `batch_number`, `status`, `sample_count`, **`threshold_at_creation`**,
  `created_at`, and links to the dataset version it drew from.
- `training_samples` is written **once**, at creation, from the unbatched `VALIDATED` pool. Afterwards
  it is append-only-at-creation, i.e. immutable (`§4.2`).
- A batch created at threshold 1000 stays a 1000-sample batch forever, whatever the setting becomes.
- Re-running training uses a **new job** on the same batch: jobs are retryable, batches are not —
  that separation is why both tables exist (`§7`).
- Never delete a batch. Terminal states are `COMPLETED`, `FAILED`, `CANCELLED`.

## Agreement (`§6.3`)

```python
agreement = None if ai_prediction is None else (human_label_code == ai_prediction.predicted_label_code)
```

- Stored on `review_sessions` at submit time **with the model version** that produced the
  prediction, so agreement stays attributable after a promotion changes the active model.
- `agreement` is **nullable**. No model ⇒ `NULL`, never `false` — a missing prediction is not a
  disagreement, and counting it as one silently deflates the agreement rate.
- Correction rate, agreement rate and skip rate are computed by `/statistics/annotations` from these
  rows only. No frontend arithmetic (`§3.1`).
- Confidence-vs-correction bins join `review_sessions.agreement` to `ai_predictions.confidence` —
  the `RQ5` groundwork (`medloop-research.md`).

## HITL failure modes

| Failure mode | Symptom | Fix |
| --- | --- | --- |
| counter incremented outside the transaction | counter drifts from `review_sessions` | step 7 inside `begin()`; reconcile script |
| threshold literal | lowering the setting changes nothing | `settings.get_int(...)` |
| two batches at one crossing | duplicate batch numbers, doubled samples | advisory lock **and** partial unique index |
| reset on settings change | 731 validated samples vanish | reset only on batch creation |
| `agreement = false` with no model | agreement rate looks catastrophic | keep it `NULL` |
| prediction row updated on correction | disagreement signal erased | append annotation rows only |
| `TEST` image reviewed | locked test set contaminated | guard at claim *and* submit |
