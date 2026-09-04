# CLAUDE.md — MedLoop AI

> **This file is the persistent source of truth for MedLoop AI.**
> Read it fully at the start of every session, before touching any code.

---

## 0. Session protocol (follow in order)

1. **Read this file** (`.claude/CLAUDE.md`) completely.
2. **Read the relevant skill files** in `.claude/skills/` for the layer you are about to touch.
   The skill index is in §13.
3. **Inspect existing code** before writing new code. Match the conventions already present; do
   not introduce a second way of doing something that already has one way.
4. **Check `TASKS.md`** — find the task, confirm it is not `BLOCKED`, confirm nothing upstream of
   it is unfinished.
5. **Implement** the requested task.
6. **Update documentation** in `docs/` if an architecture decision, schema, or contract changed.
7. **Update `TASKS.md`** — tick what you completed, add what you discovered.
8. **Run validation** — see §12. Never report success without having run something.
9. **Report what changed** — files touched, decisions made, what you verified, and explicitly what
   you could *not* verify.

If a request conflicts with a hard rule in §2, say so and stop. Do not silently comply.

---

## 1. Identity

| Field | Value |
| --- | --- |
| Name | **MedLoop AI** |
| Full title | MedLoop AI: A Local Human-in-the-Loop Explainable Medical Imaging System for Interactive Annotation and Continuous Model Refinement |
| Author | Md. Mehedi Hasan — AMIR Lab, Dept. of CSE, Bangladesh University of Business and Technology (BUBT), Dhaka |
| License | Apache-2.0 |
| Kind | Local research prototype and software platform. **Not** a medical device, not a product, not a diagnostic tool. |

**One-sentence definition.** A fully local medical image platform where an AI model predicts and
explains a skin lesion, a human reviews or corrects the prediction, validated feedback is
accumulated, and the system automatically trains and evaluates successive model versions.

**The closed loop:**

```text
Upload → Assign → Train → Predict → Explain → Human Review → Correct
   → Validate → Accumulate → Retrain → Evaluate → Version → Deploy → Repeat
```

**The research contribution is the whole loop**, not any single stage. MedLoop AI is *not* "a skin
disease classifier". A change that improves the classifier but breaks traceability of the loop is
the wrong change.

---

## 2. Hard rules

These are not preferences. Violating one is a defect regardless of how well the code works.

### 2.1 Local only

Medical images **never leave the machine**. No Firebase, Supabase, AWS, Azure, GCP, Cloudinary, no
external inference/annotation/medical APIs, no cloud DB, no cloud storage, no telemetry. Images,
metadata, annotations, predictions, Grad-CAM outputs, model files, training data, logs, the
database, authentication and statistics all stay local. The app is reached over `localhost`.

Any new dependency that phones home is disallowed. If you add a package, justify it in the PR/report.

### 2.2 Dataset inspection first

**No real medical dataset has been supplied yet.** Until it is, never:

- download PAD-UFES-20, ISIC, PH2 or any other dataset;
- fabricate a dataset, filenames, directory layout, metadata columns, class names or patient IDs;
- train a real medical model;
- invent trained-model metrics;
- present mock predictions as real AI output.

PAD-UFES-20 (planned first dataset), ISIC (planned HITL expansion) and PH2 (optional benchmark) are
**architectural planning references only** at this stage. When the real data arrives, follow the
11-step inspection procedure in `.claude/skills/medloop-dataset.md` *before* writing any
dataset-dependent code. See also §5.

### 2.3 Never fabricate results

No invented accuracy, loss curve, confusion matrix, Grad-CAM heat-map, IoU or confidence value may
be rendered as if it came from a model. Demo data is permitted only under §10, and only when
visibly marked.

An interface that *looks* confident but is not is worse than no interface. When an explanation
cannot be computed, hide the explanation view — do not render an empty attribution, because an
all-zero gradient still draws a smooth, convincing heat-map. Publish the threshold behind any
binary verdict. Report the device the forward pass actually ran on, not the configured one.

### 2.4 AI predictions and human annotations are separate records

A human correction **never** updates, overwrites or deletes an AI prediction row. Both are stored
independently and joined by `image_id`. Disagreement between them is the primary research signal;
destroying it destroys the experiment.

### 2.5 The locked test set is untouchable

Once a test set is locked it must never be retrained on, human-corrected for training, added to the
HITL pool, used for model fitting, or casually modified. Need a different test set? Create a new
dataset version. Every model version is evaluated on the *same* locked test set.

### 2.6 The HITL threshold is configuration, never a literal

`1000` is the **default** value of `hitl_retraining_threshold`. It must never appear as a
hard-coded training condition anywhere in `backend/`, `ml/` or `frontend/`. Read it from the
settings service. See §8 for the full rule set.

### 2.7 Candidates are never auto-promoted without evaluation

`training finished → replace active model` is forbidden. The only legal path is
`training → candidate → evaluation on locked test set → comparison → promotion decision`.

### 2.8 Hardware envelope

Target: **MacBook Air M5, 16 GB RAM, 512 GB SSD.** Apple Silicon **MPS** with a **CPU fallback**.
Do not design for CUDA-only flows, large GPU budgets, huge vision models, large detectors or
segmentation nets, distributed training, cloud GPUs, extra microservices, containers or any
infrastructure the loop does not need.

---

## 3. Architecture

```text
Browser
   ↓  http://localhost:3000
Next.js Frontend  (App Router, React, TypeScript, Tailwind)
   ↓  http://127.0.0.1:8000/api/v1
FastAPI Backend
   ↓
Services
   ├── PostgreSQL          (relational state, lineage, settings, audit log)
   ├── Local Storage       (images, Grad-CAM PNGs, model weights, batch manifests)
   ├── ML Engine           (PyTorch: classify / explain / localise)
   └── Training Worker     (out-of-process; never blocks the API)
```

No cloud dependency at any layer.

### 3.1 Layer responsibilities

| Layer | Owns | Must not |
| --- | --- | --- |
| `frontend/` | rendering, interaction, client validation, local session | compute metrics, decide promotion, read the filesystem, hold business rules |
| `backend/app/api/` | HTTP shape, auth guard, request/response schemas | contain business logic |
| `backend/app/services/` | all business rules, transitions, transactions | run raw SQL, know about HTTP |
| `backend/app/repositories/` | all database access | contain business rules |
| `ml/` | tensors, models, metrics | know about HTTP, database sessions or the web session |
| `worker/` | long-running training jobs | be imported by request handlers |

**Single-direction rule:** `api → services → repositories → database`. A route never imports a
repository. A service never imports a route. `ml/` never imports from `backend/app/`.

### 3.2 Repository layout

```text
MedLoop-AI/
├── .claude/            CLAUDE.md + reusable skills (read first, every session)
├── docs/               reference documentation, one file per concern
├── TASKS.md            phase checklist; the only place progress is tracked
├── frontend/           Next.js app
├── backend/            FastAPI app + SQL migrations + worker + tests
├── ml/                 PyTorch interfaces and services (framework-agnostic seams)
├── scripts/            local helper scripts (db bootstrap, verification)
└── storage/            LOCAL RUNTIME DATA — gitignored, never committed
    ├── data/{train,validation,test,unused,validated,skipped}/
    ├── annotations/
    ├── models/v1/ v2/ …
    ├── training_batches/batch_001/ …
    ├── gradcam/
    └── logs/
```

`storage/` is the single runtime root, configured by `MEDLOOP_STORAGE_ROOT`. Nothing inside it is
ever committed. **One physical copy of each image**; splits and batch membership are database
references, not copies — the 512 GB SSD budget depends on this.

---

## 4. Shared vocabulary (the contract)

Every enum below is declared **twice** — once in `backend/app/core/enums.py`, once in
`frontend/types/domain.ts` — with **byte-identical string values**.
`backend/tests/test_enum_parity.py` parses both files and fails if they drift. If you add a member,
add it in both places or the test breaks.

| Enum | Members |
| --- | --- |
| `Role` | `ADMIN`, `ANNOTATOR`, `RESEARCHER` |
| `ImageSplit` | `UNASSIGNED`, `TRAIN`, `VALIDATION`, `TEST`, `UNUSED` |
| `ReviewStatus` | `NOT_REVIEWED`, `IN_REVIEW`, `VALIDATED`, `SKIPPED` |
| `ImageLifecycle` | `STAGING`, `ASSIGNED`, `TRAINING_USED`, `ARCHIVED` |
| `DataStatus` (derived, display/filter only) | `STAGING`, `TRAIN`, `VALIDATION`, `TEST`, `UNUSED`, `IN_REVIEW`, `VALIDATED`, `SKIPPED`, `TRAINING_USED`, `ARCHIVED` |
| `DatasetStatus` | `STAGING`, `ACTIVE`, `LOCKED`, `ARCHIVED` |
| `AnnotationType` | `BOUNDING_BOX`, `POLYGON`, `ROUNDED_BOX` |
| `AnnotationSource` | `HUMAN`, `AI_LOCALIZATION` |
| `SkipReason` | `POOR_IMAGE_QUALITY`, `UNCLEAR`, `WRONG_IMAGE_TYPE`, `DUPLICATE`, `CANNOT_DETERMINE`, `OTHER` |
| `ModelStatus` | `ACTIVE`, `CANDIDATE`, `REJECTED`, `ARCHIVED` |
| `TrainingBatchStatus` | `CREATED`, `TRAINING`, `EVALUATING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `TrainingJobStatus` | `QUEUED`, `RUNNING`, `EVALUATING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `HitlCycleStage` (derived) | `NOT_READY`, `READY_FOR_RETRAINING`, `TRAINING`, `EVALUATING`, `CANDIDATE`, `PROMOTED`, `REJECTED` |
| `TrainingDevice` | `AUTO`, `MPS`, `CPU` |
| `PromotionMode` | `AUTOMATIC`, `MANUAL_APPROVAL` |
| `PromotionMetric` | `ACCURACY`, `MACRO_F1`, `MACRO_PRECISION`, `MACRO_RECALL`, `AUROC_MACRO` |
| `ServiceState` | `ONLINE`, `DEGRADED`, `OFFLINE`, `UNKNOWN` |
| `LogLevel` | `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |

### 4.1 Why split and review status are separate columns

`images.split` (where the image sits in the experiment) and `images.review_status` (what a human did
with it) are **orthogonal**. A `TRAIN` image is never reviewed; an `UNUSED` image moves
`NOT_REVIEWED → IN_REVIEW → VALIDATED | SKIPPED`. Collapsing them into one column loses information
and makes the transition guards unwriteable.

`DataStatus` is the **single flat vocabulary** used by the UI filter and the statistics endpoints. It
is *derived*, never stored, by one function implemented identically in both languages
(`derive_data_status` / `deriveDataStatus`), with this precedence, highest first:

```text
ARCHIVED  >  TRAINING_USED  >  VALIDATED  >  SKIPPED  >  IN_REVIEW
          >  split (TRAIN | VALIDATION | TEST | UNUSED)  >  STAGING
```

### 4.2 Transition guards (enforced in `services/`, not in routes)

- Only `split == UNUSED` may enter the review queue.
- `TEST` never enters the review queue and never joins the HITL pool — regardless of lock state.
- A `LOCKED` dataset version rejects split reassignment, deletion, and image mutation.
- `SKIPPED` never joins a training batch automatically.
- `VALIDATED` is the only status eligible for the HITL pool.
- Batch membership is immutable once the batch row exists (§8.4).

### 4.3 Coordinate convention

**All** geometry — human annotations and AI localisation alike — is stored **normalised to `[0, 1]`**
against the *original* image width/height, origin top-left, `x` right, `y` down.

| Type | Payload |
| --- | --- |
| `BOUNDING_BOX` | `{ x, y, w, h }` |
| `ROUNDED_BOX` | `{ x, y, w, h, r }` — `r` normalised against `min(w, h)`, `0 ≤ r ≤ 0.5` |
| `POLYGON` | `{ points: [[x, y], …] }`, ≥ 3 points, implicitly closed |

Never store pixel coordinates. The viewer zooms and pans; pixel coordinates would silently rot.
`ROUNDED_BOX` and `POLYGON` both expose a derived axis-aligned bounding box for IoU maths so the
localisation metric has one definition.

---

## 5. Dataset rules

**Status: no real dataset supplied. Phase 4 onward in `TASKS.md` is `BLOCKED`.**

Planned datasets, for planning only:

| Dataset | Role | Notes recorded from the project brief — **not verified against files** |
| --- | --- | --- |
| PAD-UFES-20 | initial | ~2,298 clinical smartphone images, ~1,373 patients, 6 diagnostic classes, clinical metadata |
| ISIC | HITL expansion | challenge data includes lesion segmentation resources |
| PH2 | optional benchmark | small; comparison only |

The six PAD-UFES-20 codes referenced in the brief — `ACK`, `BCC`, `MEL`, `NEV`, `SCC`, `SEK` — are
seeded into the **configurable label space** (`disease_labels` table), flagged
`verified_against_data = false`. They are **not** a hard-coded enum anywhere. The label space is
read from the database by both the model head and the annotation UI. Confirm them against the real
files at inspection time and flip the flag then.

**Never assume** filenames, directory layout, extensions, image count, image dimensions, class names,
metadata columns, patient/lesion identifiers, annotation formats, or pre-existing splits.

When the dataset arrives, run the inspection procedure in `.claude/skills/medloop-dataset.md`,
write the findings into `docs/dataset_workflow.md`, and only then implement preprocessing, loaders,
class mapping, splitting, augmentation, training, inference, Grad-CAM and localisation.

Where patient identifiers exist, **split at patient level** — a patient's images must never straddle
train and test. Lesion-level grouping applies within a patient.

---

## 6. HITL workflow

```text
UNUSED  →  IN REVIEW  →  VALIDATED  ─→  HITL training pool
                      └→  SKIPPED    ─X  (never automatic)
```

Every AI prediction row stores: image, predicted class, confidence, full class-probability vector,
model version, Grad-CAM artefact path, derived localisation, timestamp.

Every human annotation row stores: image, annotator, disease label, annotation type, normalised
coordinates, timestamp.

### 6.1 Submit

1. Persist the human disease label.
2. Persist the human annotation geometry.
3. Leave the AI prediction row untouched (class, confidence, model version all preserved).
4. Stamp `reviewed_at`.
5. Set `review_status = VALIDATED`.
6. Add the sample to the HITL pool.
7. Increment `validated_since_last_training`.
8. Evaluate the threshold (§8.3) inside the same transaction.
9. Return the next queue item so the UI advances without a round trip.

Steps 1–8 are **one transaction**. A partially validated sample is a corrupt experiment.

### 6.2 Skip

Set `review_status = SKIPPED`, store the optional `SkipReason` and free-text note, do **not** touch
the HITL counter, do **not** enqueue for training, advance to the next image.

### 6.3 Agreement

`agreement = (human_label == ai_predicted_class)`. Computed and stored on the review session row at
submit time together with the model version that produced the prediction, so agreement remains
attributable after promotion changes the active model.

---

## 7. Database

PostgreSQL. Entities:

```text
users              datasets            dataset_versions    images
disease_labels     annotations         ai_predictions      review_sessions
training_batches   training_samples    models              model_evaluations
system_logs        system_settings     training_jobs
```

`disease_labels` and `training_jobs` are additions to the brief's list: the first makes the label
space configurable instead of hard-coded (§5), the second separates *what to train on* (immutable
batch) from *an attempt at training it* (retryable job).

Schema of record: `backend/migrations/sql/0001_init.sql`. SQLAlchemy models in
`backend/app/models/` must mirror it exactly. Change both, in the same commit, or neither.

### 7.1 Lineage requirement

The schema must answer, by query alone, without reading a log file:

> Where did this image come from? Which dataset and dataset version? Which split? Was it reviewed,
> by whom, and when? What did the AI predict, and which model version produced that prediction?
> What did the human change? Which training batch consumed it? Which model versions were trained
> on it?

Concretely: `images → dataset_versions → datasets`, `ai_predictions → models`,
`annotations → users`, `training_samples → (training_batches, images)`,
`models → training_batches`, `model_evaluations → (models, dataset_versions)`.

Nothing is hard-deleted. Deletion sets `ARCHIVED` and stamps `archived_at`.

---

## 8. The HITL threshold — full rule set

Read §2.6 first. This section is the implementation contract.

### 8.1 Settings

Stored in `system_settings` as typed key/value rows, served by
`backend/app/services/settings_service.py`, exposed at `GET|PUT /api/v1/admin/settings/training`.

| Key | Type | Default | Validation |
| --- | --- | --- | --- |
| `hitl_retraining_threshold` | int | **1000** | `> 0` |
| `training_device` | enum | `AUTO` | ∈ `TrainingDevice` |
| `batch_size` | int | `32` | `1 … 512` |
| `max_epochs` | int | `30` | `1 … 1000` |
| `early_stopping` | bool | `true` | — |
| `candidate_promotion_mode` | enum | `MANUAL_APPROVAL` | ∈ `PromotionMode` |
| `minimum_improvement` | float | `0.005` | `0.0 … 1.0` |
| `primary_promotion_metric` | enum | `MACRO_F1` | ∈ `PromotionMetric` |

Two defaults are engineering choices, not brief requirements, and are recorded here so they are not
silently reversed: `candidate_promotion_mode = MANUAL_APPROVAL` (a clinical-adjacent system should
not self-deploy) and `primary_promotion_metric = MACRO_F1` (`minimum_improvement` is meaningless
without naming the metric it improves; macro-F1 resists the class imbalance skin-lesion datasets
carry).

**Server-side validation is authoritative.** The frontend validates for UX only. Never trust it.

### 8.2 Counter

`validated_since_last_training` counts **new** validated samples since the last batch was created.
It is derived state, kept in `system_settings` for cheap reads and reconcilable at any time from
`review_sessions` — `scripts/reconcile_hitl_counter.py` is the arbiter if they disagree.

### 8.3 Trigger

```python
# services/hitl_service.py — pseudocode; the real code takes an advisory lock first
increment(validated_since_last_training)
threshold = settings.get_int("hitl_retraining_threshold")   # NEVER a literal
if validated_since_last_training >= threshold:
    create_training_batch(threshold_at_creation=threshold)
    reset(validated_since_last_training)
```

Guarded by a PostgreSQL advisory lock plus a partial unique index so two concurrent submits cannot
create two batches. One batch → at most one active training job.

### 8.4 Threshold changes never rewrite history

- `1000 → 500` while the counter reads `731`: the threshold is **already met**. Surface
  "ready for retraining" — do **not** discard, reset or renumber the 731 samples.
- `500 → 2000` while the counter reads `731`: the 731 keep counting toward 2000.
- Every batch stores `threshold_at_creation`. Batch 001 created at 1000 samples stays a
  1000-sample batch forever, whatever the setting later becomes.
- Batch membership (`training_samples`) is append-only at creation and immutable afterwards.
- Every settings change writes a `system_logs` row with user, key, old value, new value, timestamp
  and optional reason — e.g. `ADMIN changed hitl_retraining_threshold 1000 → 500`.

---

## 9. Model lifecycle

```text
V1 ACTIVE
   ↓  HITL batch 001 reaches threshold
V2 CANDIDATE
   ↓  evaluate on the SAME locked test set
   ├── meets promotion criteria  → V2 ACTIVE,  V1 ARCHIVED
   └── fails                     → V2 REJECTED, V1 stays ACTIVE
```

Exactly one model is `ACTIVE` at a time, enforced by a partial unique index. Promotion and rejection
are both audited.

Promotion criteria: `candidate[primary_metric] - active[primary_metric] >= minimum_improvement`,
both measured on the identical locked test dataset version. Under `MANUAL_APPROVAL` a passing
candidate is *eligible* and waits for an explicit admin action; under `AUTOMATIC` it promotes itself
and logs the promotion. A candidate evaluated against a *different* test version is not comparable —
the service refuses to compare and says why.

Every model row stores: version, status, training batch, training dataset version, training date,
hyperparameters, epoch count, metrics, per-epoch loss history, model artefact path.

### 9.1 Training worker

FastAPI **never trains in-process**.

```text
FastAPI  → enqueue training_job → local worker process → train → evaluate
         → register model (CANDIDATE) → promotion decision
```

Job states: `QUEUED → RUNNING → EVALUATING → COMPLETED | FAILED | CANCELLED`. The worker polls the
job table; no broker, no Redis, no Celery — a single local process is the right size for one
researcher on one laptop. Progress and per-epoch loss stream into the job row so the UI can poll.

---

## 10. Demo data rule

Until the backend and dataset are connected the frontend may render mock data **only** under all of
these conditions:

1. It lives under `frontend/lib/demo/`, in a file named `demo-*.ts`.
2. The file opens with the banner comment block containing the literal token `DEMO DATA`.
3. It is exported through `DEMO_DATASET`-style named exports carrying `isDemo: true`.
4. Every screen that renders it shows a `<DemoBadge />`, and the app shell shows a global
   demo-mode banner while `NEXT_PUBLIC_DATA_SOURCE=demo`.
5. Setting `NEXT_PUBLIC_DATA_SOURCE=api` removes all of it and the UI falls back to real empty
   states — no silent mixing of demo and live data.

Forbidden even with a badge: any number presented as a *trained model's* performance, any image that
could be mistaken for a real clinical photograph, and any Grad-CAM-looking heat-map. Demo imagery is
procedurally drawn, obviously synthetic, and watermarked. Model performance panels render an
**empty state** ("no trained model — blocked on dataset"), not placeholder percentages; a separate,
explicitly-labelled *layout preview* toggle exists so the research view can be designed, and its
numbers are watermarked `SYNTHETIC`.

Never write, in code comments, docs or chat, that the system "has trained a model" or "achieves"
any figure.

---

## 11. Conventions

### 11.1 Navigation — exactly three primary areas

```text
Dashboard
Data & Admin          ← protected; Review Data lives INSIDE it
   ├── Review Data
   ├── Dataset Management
   ├── Upload Data
   ├── Data Statistics
   ├── Annotation Statistics
   ├── Training Management
   └── System Logs
Analyze Model
```

**Review Data is never a top-level nav item.** Routes are defined once, in
`frontend/lib/navigation.ts`; no page hard-codes a path string.

### 11.2 Frontend

- Next.js App Router, React, TypeScript `strict`, Tailwind. Feature code in `frontend/features/<area>/`,
  shared primitives in `frontend/components/ui/`, cross-cutting helpers in `frontend/lib/`.
- No `any`. No non-null `!` assertion to silence a real nullable. Props interfaces exported.
- Every data surface implements four states: **loading, empty, error, populated**. A component that
  can only render the happy path is unfinished.
- Charts are hand-rolled SVG in `components/charts/` — no chart library. Rationale in §11.5.
- The annotation canvas is SVG + pointer events, no Konva. Rationale in §11.5.
- Accessibility is not optional: real `<button>`/`<label>` elements, visible focus rings,
  `aria-*` on custom widgets, keyboard paths for every annotation action, `prefers-reduced-motion`
  respected. Contrast ≥ 4.5:1 for text.
- Desktop-first (review work happens on a laptop) but nothing may break below `md`.
- Restrained motion: 120–200 ms, opacity and small transforms only. No gradient washes, no
  glassmorphism, no cartoon medical iconography, no marketing-site aesthetics.

### 11.3 Backend

- Python 3.11+, full type hints, Pydantic v2 schemas at every boundary, SQLAlchemy 2.0 typed ORM.
- One router per file in `api/`, thin: parse → authorise → call service → return schema.
- Domain errors subclass `MedLoopError` and map to HTTP status in one exception handler in `main.py`.
  Routes do not raise `HTTPException` for domain problems.
- No secret, path or threshold literals in code — everything through `config.py` / settings service.
- Password hashing behind a `PasswordHasher` protocol. Default is stdlib PBKDF2-HMAC-SHA256
  (600 000 iterations, per-user 16-byte salt) so the auth path has **zero** third-party
  dependencies and stays testable offline; Argon2id is the documented upgrade seam.

### 11.4 Both

Small modules over large ones. No duplicated logic — extract it. No dependency added without a
recorded reason. Tests live beside the layer they cover. Log the actual state, not the intended one.

### 11.5 Recorded dependency decisions

| Considered | Decision | Reason |
| --- | --- | --- |
| Konva.js for annotation | **rejected** | We need exact normalised-coordinate control and keyboard handles; SVG + pointer events is ~1 file, zero bytes of dependency, and fully testable. |
| Recharts / Plotly | **rejected** | Six chart types, all simple. Hand-rolled SVG keeps the clinical visual language consistent and avoids a heavy client bundle. |
| Celery / Redis | **rejected** | One researcher, one laptop. A DB-polling worker process is sufficient and has no broker to operate. |
| Alembic | **deferred** | `0001_init.sql` is the schema of record while the schema is still moving. Adopt Alembic before the first real dataset load (tracked in `TASKS.md`). |
| bcrypt / passlib | **deferred** | stdlib PBKDF2 keeps auth installable and testable with no wheels; swap via `PasswordHasher`. |
| Docker | **rejected for dev** | Adds a VM layer on an M-series laptop for no benefit; Postgres runs natively. |

---

## 12. Validation

Run what applies to what you touched. Report anything you could not run.

```bash
# Frontend
cd frontend && npm run typecheck && npm run lint && npm run build

# Backend
cd backend && python -m compileall -q app worker && pytest -q

# Repo-wide invariants (no network needed, runs anywhere)
python3 scripts/verify_invariants.py
```

`scripts/verify_invariants.py` is the guard against the rules in §2 quietly eroding. It fails if:

- a hard-coded HITL threshold literal appears outside `system_settings` defaults and docs;
- a forbidden cloud SDK or hostname appears anywhere;
- `enums.py` and `domain.ts` have drifted;
- a `frontend/lib/demo/*.ts` file is missing its `DEMO DATA` banner;
- demo data is imported outside `lib/demo/` and `features/**/demo` wiring;
- a `docs/` file referenced from this file does not exist.

---

## 13. Skill index — read the ones that apply

| Skill | Read it when |
| --- | --- |
| `medloop-architecture.md` | adding a layer, moving responsibility, wiring a new service |
| `medloop-frontend.md` | any UI work |
| `medloop-backend.md` | any FastAPI, schema or service work |
| `medloop-ml.md` | anything touching PyTorch, devices, Grad-CAM or metrics |
| `medloop-hitl.md` | review flow, counter, batching, agreement |
| `medloop-annotation.md` | the canvas, tools, geometry, undo/redo |
| `medloop-dataset.md` | **before** any dataset-dependent code — contains the inspection procedure |
| `medloop-model-versioning.md` | registry, candidate evaluation, promotion |
| `medloop-security.md` | auth, roles, file handling, path safety, audit |
| `medloop-research.md` | metrics, experiment protocol, what may and may not be claimed |
| `medloop-development.md` | conventions, testing, dependency policy, task hygiene |

Reference documentation lives in `docs/` — `architecture`, `database`, `frontend`, `backend`,
`ml_pipeline`, `hitl_workflow`, `annotation_workflow`, `dataset_workflow`, `model_versioning`,
`authentication`, `local_deployment`, `research_protocol`, `development_roadmap`.

---

## 14. Research frame

**RQ1** Does iterative human feedback improve classification performance across successive versions?
**RQ2** Does human-corrected localisation improve lesion localisation?
**RQ3** How closely does Grad-CAM align with human-annotated regions?
**RQ4** Can human-validated feedback support continuous local refinement?
**RQ5** Can confidence/uncertainty identify samples most worth reviewing? *(after the core loop works)*

Metrics: classification — accuracy, precision, recall, F1, AUROC, confusion matrix; localisation —
IoU, localisation accuracy (Dice once segmentation exists); HITL — AI/human agreement, correction
rate, skip rate, annotation time; XAI — Grad-CAM ∩ human ROI overlap.

Protocol: baseline `V1` from the initial train split, evaluated on the locked test set. Then
`HITL batch 001 → V2`, `batch 002 → V3`, `batch 003 → V4`, each evaluated on **the same** locked test
set. Comparison across versions is only valid on identical test data — the code enforces this.

Never report a number the code did not compute.

---

## 15. Current state

| Area | State |
| --- | --- |
| Knowledge base, docs, TASKS.md | complete |
| Frontend | complete as a UI foundation; demo-data-driven under §10 |
| Backend | FastAPI + schema + services + auth foundation; no dataset-dependent endpoints |
| ML | interfaces and device resolution only — **no training, no inference, no Grad-CAM** |
| Dataset | **not supplied**; Phases 4–12 in `TASKS.md` are `BLOCKED` |
| Trained models | **none exist** |

**Next action for a new session:** the dataset is the blocker. When it arrives, inspect it per
`.claude/skills/medloop-dataset.md`, record findings in `docs/dataset_workflow.md`, then start
Phase 4 in `TASKS.md`. Do not begin Phase 4 from assumptions.

