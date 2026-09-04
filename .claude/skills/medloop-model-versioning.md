# MedLoop AI — Model versioning and promotion

Read this when: touching the model registry, candidate evaluation, comparison or promotion. Extends
`CLAUDE.md §2.5`, `§2.7`, `§9`. Endpoints: `docs/api_contract.md` → Models, Training.
**No model has been trained; nothing here implies one exists.**

## Lifecycle

```text
V1 ACTIVE
  │   HITL batch 001 reaches the threshold (§8.3) ─► job ─► candidate registered
  ▼
V2 CANDIDATE
  │   evaluate on the SAME locked test dataset version (§2.5)
  ├── criteria met ──► MANUAL_APPROVAL: eligible, waits for an admin action
  │                    AUTOMATIC:       promotes itself, logs the promotion
  │                         └──► V2 ACTIVE   +   V1 ARCHIVED
  └── criteria not met ──► V2 REJECTED   +   V1 stays ACTIVE
```

`training finished → replace the active model` is forbidden (`§2.7`). The only legal path is
`training → candidate → evaluation on the locked test set → comparison → promotion decision`.

| From | To | Trigger | Guard | Audit event |
| --- | --- | --- | --- | --- |
| — | `CANDIDATE` | worker registers a finished job | job `COMPLETED`, artefact on disk | `CANDIDATE_CREATED` |
| `CANDIDATE` | `ACTIVE` | `POST /models/{id}/promote`, or `AUTOMATIC` | evaluation exists on the current locked test version **and** criteria met | `MODEL_PROMOTED` |
| `CANDIDATE` | `REJECTED` | `POST /models/{id}/reject` or failed criteria | reason required | `MODEL_REJECTED` |
| `ACTIVE` | `ARCHIVED` | another model is promoted | same transaction as the promotion | `MODEL_PROMOTED` (carries both ids) |
| `ARCHIVED` | `ACTIVE` | rollback (see below) | explicit admin action + reason | `MODEL_PROMOTED` with `rollback: true` |
| any | `ARCHIVED` | `POST /models/{id}/archive` | never for the live `ACTIVE` model without a replacement | `MODEL_REJECTED`/`MODEL_PROMOTED` context |

Nothing is hard-deleted. A `REJECTED` model keeps its row, its evaluations and its artefacts —
"we tried this and it was worse" is a result (`§7`).

## The one-ACTIVE invariant

```sql
-- migrations/sql/0001_init.sql
CREATE UNIQUE INDEX one_active_model ON models ((true)) WHERE status = 'ACTIVE';
```

Promotion is one transaction, and **order matters** because the index is checked immediately:

```python
with session.begin():
    session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": MODEL_LOCK})
    previous = repo.get_active()
    if previous: previous.status = ModelStatus.ARCHIVED; previous.archived_at = now()   # first
    candidate.status = ModelStatus.ACTIVE; candidate.promoted_at = now()                # then
    log_event(session, event="MODEL_PROMOTED", entity=("model", candidate.id),
              metadata={"previous_model_id": previous.id if previous else None, "reason": reason})
```

- `GET /models/active` returns `Model | null`. `null` is the current, correct answer: no model exists.
- Every consumer of "the active model" resolves it through the service, never by "highest version".
- With no `ACTIVE` model, inference and XAI endpoints answer `409 MODEL_UNAVAILABLE` — they never
  fall back to a candidate, a rejected model or a random-init network (`§2.3`).

## What every model row stores (`§9`)

| Field | Notes |
| --- | --- |
| `version` | monotonic `V1`, `V2`, … assigned at registration, never reused |
| `status` | `ModelStatus` |
| `training_batch_id` | which HITL batch produced it (`null` only for the baseline) |
| `training_dataset_version_id` | which dataset version it trained on |
| `trained_at`, `promoted_at`, `archived_at` | timeline |
| `hyperparameters` | JSON: architecture, lr, batch size, epochs, augmentation, **seed** |
| `epoch_count`, `loss_history` | per-epoch train/val loss + lr (`docs/api_contract.md` → `ModelDetail`) |
| `metrics` | snapshot of the primary evaluation; the authoritative rows are `model_evaluations` |
| `artefact_path`, `artefact_sha256` | path under `storage/models/vN/` + integrity hash |
| `device`, `torch_version` | the device actually used (`§2.3`), for reproducibility notes |

`model_evaluations` is per `(model, dataset_version)` — that pairing is what makes the comparability
check computable, so never collapse it into a single `metrics` blob on the model row.

## Promotion criterion

```python
metric    = settings.get_enum("primary_promotion_metric")   # default MACRO_F1 (§8.1)
min_delta = settings.get_float("minimum_improvement")        # default 0.005
active_eval    = evals.for_model_on(active.id,    locked_test_version_id)
candidate_eval = evals.for_model_on(candidate.id, locked_test_version_id)

delta    = candidate_eval.metrics[metric] - active_eval.metrics[metric]
eligible = delta >= min_delta        # ties and equal scores are NOT an improvement
```

| Case | Outcome |
| --- | --- |
| no `ACTIVE` model yet | the first model may be promoted with **no comparison**, but still requires an evaluation on the locked test version; audited with `baseline: true` |
| metric key missing from either evaluation | **refuse** — `409 CONFLICT` with the reason. Missing is never treated as `0` |
| evaluations on different dataset versions | **refuse** — not comparable (below) |
| `delta >= min_delta` | eligible; `MANUAL_APPROVAL` waits, `AUTOMATIC` promotes |
| `0 <= delta < min_delta` | not eligible; the improvement is inside the noise band the admin chose |
| `delta < 0` | not eligible → `REJECTED` |

`minimum_improvement` is meaningless without naming the metric it improves, which is why
`primary_promotion_metric` exists (`§8.1`). Both are settings, never literals (`§2.6`).
`PromotionMetric` must be declared in `backend/app/core/enums.py` **and**
`frontend/types/domain.ts` like every other enum, or `test_enum_parity.py` fails (`§4`).

## MANUAL_APPROVAL vs AUTOMATIC

| | `MANUAL_APPROVAL` (default) | `AUTOMATIC` |
| --- | --- | --- |
| A passing candidate | becomes *eligible*; stays `CANDIDATE` | promotes itself in the same flow |
| Who acts | an `ADMIN` calls `POST /models/{id}/promote` | the service, immediately after evaluation |
| Audit | `MODEL_PROMOTED` with the acting user | `MODEL_PROMOTED` with `actor = system` |
| A failing candidate | `REJECTED` with the computed reason | identical |
| Rationale | a clinical-adjacent system should not self-deploy (`§8.1`) | unattended experiment sweeps |

The UI must distinguish *eligible* from *promoted*. "Meets the criteria" is not "is in use".

## Refusing an invalid comparison

```text
V2 evaluated on locked test version 7      V3 evaluated on locked test version 9
                    └──────────► NOT COMPARABLE ◄───────────┘
GET /models/comparison?model_ids=2,3
  → { test_dataset_version_id: null, comparable: false,
      reason: "Models were evaluated on different locked test versions (7, 9).", rows: [] }
```

- The service refuses and says why; it does **not** return numbers with a warning attached.
- The UI renders the refusal, not the numbers (`docs/api_contract.md` → Models).
- The same rule gates promotion: a candidate evaluated against a different test version cannot be
  promoted by comparison. Re-evaluate it on the current locked version first.
- Need a different test set? Create a new dataset version and re-evaluate **every** model you intend
  to compare (`§2.5`). Never edit a locked version — `409 DATASET_LOCKED`.

## On-disk registry

```text
storage/models/v2/
├── weights.pt          state_dict only — never a pickled nn.Module
├── manifest.json       version, batch id, dataset version, hyperparameters, seed,
│                       torch version, resolved device, transform metadata, sha256
├── metrics.json        evaluation snapshot (mirror of model_evaluations rows)
├── loss_history.json   per-epoch train/val loss + lr
└── logs/train.log      the job's log tail, as the UI shows it
```

- The **database is the source of truth**; files are artefacts. A directory with no row is orphaned
  and must not be picked up by scanning the filesystem.
- `artefact_sha256` is verified on load; a mismatch raises rather than predicting with unknown weights.
- Directory name is `vN` matching `models.version`. Never overwrite `vN/` — a retrained batch is a
  new version.
- `storage/` is gitignored in full (`§3.2`). No weights, no manifests, no logs in the repo.

## Rollback

1. Only an `ARCHIVED` model (previously active) is rollback-eligible. A `REJECTED` one must be
   re-evaluated and go through the normal decision.
2. `POST /models/{id}/promote` with a `reason`; `ADMIN` only; audited as `MODEL_PROMOTED` with
   `rollback: true` and the id being demoted.
3. The service archives the current `ACTIVE` in the same transaction — the invariant never breaks.
4. Rollback is an **operational override**, not a claim of superiority. It must not write or imply an
   improvement, and the criterion result is recorded as "not applicable, rollback".
5. History is untouched: existing `ai_predictions` keep their original `model_id` and
   `model_version`, evaluations stay, and the rolled-back model does **not** inherit the candidate's
   numbers. Only *new* predictions use the newly active model.
6. Verify the rolled-back model has an evaluation on the **current** locked test version; if not, say
   so in the response and in the audit row instead of implying comparability.

## Versioning failure modes

| Failure mode | Symptom | Fix |
| --- | --- | --- |
| candidate auto-promoted after training | untested model serving predictions | evaluation + decision are separate steps (`§2.7`) |
| two `ACTIVE` rows | random model answers each request | partial unique index + archive-then-promote order |
| comparison across test versions | improvement that is really a test-set change | refuse, with the reason |
| missing metric treated as `0` | a candidate "beats" the active model | refuse the comparison |
| `metrics` blob only on the model row | comparability unprovable | keep `model_evaluations` per dataset version |
| filesystem scanned for models | orphaned directory becomes "a model" | DB rows are the registry |
| `vN/` overwritten on retrain | previous version unreproducible | new directory per version |
| rollback described as an upgrade | the research record is falsified | audit as an override, no metric claim |
