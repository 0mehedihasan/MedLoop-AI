# Architecture

Scope: the processes, layers and directory boundaries that make up MedLoop AI on one machine, and the structural rules that keep the human-in-the-loop auditable.

See also: [database](./database.md) · [backend](./backend.md) · [frontend](./frontend.md) · [ml_pipeline](./ml_pipeline.md) · [hitl_workflow](./hitl_workflow.md) · [local_deployment](./local_deployment.md) · [api_contract](./api_contract.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §2 (hard rules), §3 (architecture), §11 (conventions).

## System diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  ONE MACHINE — MacBook Air M5 · 16 GB · 512 GB SSD                      │
│  No image, label, prediction, weight or log leaves it (CLAUDE.md §2.1)  │
│                                                                         │
│   Browser                                                               │
│      │  http://localhost:3000                                           │
│      ▼                                                                  │
│   Next.js frontend         App Router · React · TypeScript · Tailwind    │
│      │  fetch  http://127.0.0.1:8000/api/v1     (./api_contract.md)     │
│      ▼                                                                  │
│   FastAPI backend                                                       │
│      api/  ──▶  services/  ──▶  repositories/                           │
│                    │                  │                                 │
│                    │                  ▼                                 │
│                    │            PostgreSQL   state · lineage ·           │
│                    │                         settings · audit log        │
│                    ├──▶  Local storage       images · Grad-CAM PNGs ·    │
│                    │                         weights · batch manifests   │
│                    ├──▶  ML engine           PyTorch: classify /         │
│                    │                         explain / localise          │
│                    └──▶  training_jobs  ◀──  Training worker             │
│                         (table = queue)      separate OS process         │
└─────────────────────────────────────────────────────────────────────────┘
```

The API never trains in-process (CLAUDE.md §9.1). The worker never serves HTTP. The two meet only
through the `training_jobs` table and the storage root.

Module paths in this document are normative: new code lands at these paths, and the layer boundaries
below are review criteria, not suggestions.

## Component responsibilities

| Component | Owns | Must not |
| --- | --- | --- |
| `frontend/` | rendering, interaction, client-side validation, local session | compute metrics, decide promotion, read the filesystem, hold business rules |
| `backend/app/api/` | HTTP shape, auth guard, request/response schemas | contain business logic |
| `backend/app/services/` | business rules, state transitions, transaction boundaries | run raw SQL, know about HTTP |
| `backend/app/repositories/` | every database read and write | contain business rules |
| `backend/app/models/` | SQLAlchemy mapping mirroring `0001_init.sql` | drift from the SQL file |
| `backend/app/core/` | enums, errors, config, path safety, hashing protocol | import services or routers |
| `ml/` | tensors, model definitions, Grad-CAM, metrics | know about HTTP, DB sessions or the web session |
| `worker/` | long-running training jobs, job-row progress writes | be imported by a request handler |
| `scripts/` | db bootstrap, seeding, reconciliation, invariant checks | be required at request time |
| `storage/` | the one physical copy of every artefact | be committed, or hold anything derivable |
| PostgreSQL | all relational state, lineage and audit | be bypassed by file-based state |

## The single-direction rule

```text
api  ──▶  services  ──▶  repositories  ──▶  database
 ▲                                             │
 └──────────────  schemas (Pydantic)  ◀─────────┘   values flow back, imports never do
```

| Forbidden import | Why |
| --- | --- |
| `api/*` → `repositories/*` | a route with SQL reach grows business rules |
| `services/*` → `api/*` | services would inherit HTTP concerns and become untestable offline |
| `repositories/*` → `services/*` | circular, and lets a query decide policy |
| `ml/*` → `backend/app/*` | `ml/` must run under the worker with no web app present |
| `worker/*` imported by `api/*` | would put training in the request process (CLAUDE.md §9.1) |
| `frontend/features/*` → another feature's internals | shared code belongs in `components/ui/` or `lib/` |

`ml/` and `worker/` talk to the database only through `backend/app/repositories/` called by the
worker's own entry point — never by reaching into a service that assumes a request context.

## Request lifecycle — `POST /review/{image_id}/submit`

The most load-bearing flow in the system: one human decision, one transaction, one possible batch.

| # | Module | Does |
| --- | --- | --- |
| 1 | `frontend/features/review/` canvas + form | collects label and normalised geometry (CLAUDE.md §4.3) |
| 2 | `frontend/services/review-service.ts` | builds `SubmitBody`, attaches the bearer token |
| 3 | `backend/app/main.py` | ASGI entry, CORS limited to `localhost` origins, `MedLoopError` handler |
| 4 | `backend/app/api/review.py` | route only: parse → authorise → call service → return schema |
| 5 | `backend/app/api/deps.py` | `get_db`, `get_current_user`, `require_role(ADMIN, ANNOTATOR)` |
| 6 | `backend/app/schemas/review.py` | Pydantic v2 validation of `SubmitBody`, geometry bounds |
| 7 | `backend/app/services/review_service.py` | **opens the transaction**; guards: image exists, `split == UNUSED`, `review_status == IN_REVIEW` held by this user, never `TEST` → else `CONFLICT` |
| 8 | `backend/app/services/annotation_service.py` | persists each shape via `repositories/annotation_repository.py` |
| 9 | `backend/app/repositories/review_repository.py` | writes the `review_sessions` row incl. `agreement` and `model_version` |
| 10 | `backend/app/repositories/image_repository.py` | stamps `reviewed_at`, `reviewed_by`, sets `review_status = VALIDATED` |
| 11 | `backend/app/services/hitl_service.py` | advisory lock → increment counter → read `hitl_retraining_threshold` from `settings_service` → maybe `create_training_batch(threshold_at_creation=…)` |
| 12 | `backend/app/services/audit_service.py` | `ANNOTATION_SUBMITTED`, and `HITL_BATCH_CREATED` when a batch was cut |
| 13 | commit | steps 7–12 are one transaction; a partial validation is a corrupt experiment (CLAUDE.md §6.1) |
| 14 | `review_service.next_item()` | returns the next `ReviewItem` so the UI advances without a second round trip |

The AI prediction row is never read-modified-written by this path (CLAUDE.md §2.4). Starting the
training job is a separate, explicit transition — `POST /training/batches/{id}/start` — so the human's
request never blocks on a training process.

## Process model — three local processes, nothing else

```text
┌──────────────────────┐   ┌──────────────────────┐   ┌────────────────────────┐
│ next dev / next start│   │ uvicorn              │   │ training worker        │
│ localhost:3000       │──▶│ 127.0.0.1:8000       │◀──│ python -m worker.main  │
│ renders the UI       │   │ serves the API       │   │ polls training_jobs    │
└──────────────────────┘   └──────────┬───────────┘   └───────────┬────────────┘
                                      │  psycopg                  │  psycopg + torch
                                      ▼                           ▼
                            PostgreSQL (local socket) ◀── storage/ (local filesystem)
```

| Process | Command | Binds | Restart safety |
| --- | --- | --- | --- |
| Frontend | `npm run dev` (or `npm run build && npm start`) | `localhost:3000` | stateless |
| API | `uvicorn app.main:app --host 127.0.0.1 --port 8000` | `127.0.0.1:8000` | stateless; all state in PG/storage |
| Worker | `python -m worker.main` | nothing | resumes from `training_jobs`; a `RUNNING` job left by a crash is reconciled to `FAILED` with the reason recorded |

There is no fourth process: no broker, no cache, no scheduler, no container runtime
(CLAUDE.md §11.5). PostgreSQL runs natively.

## Repository layout (CLAUDE.md §3.2)

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

`storage/` is the single runtime root, configured by `MEDLOOP_STORAGE_ROOT`. **One physical copy of
each image**; splits and batch membership are database references, not copies — the 512 GB budget
depends on it (see [local_deployment](./local_deployment.md)).

## Local-only enforcement points

| Where | Enforcement |
| --- | --- |
| uvicorn | binds `127.0.0.1` explicitly — never `0.0.0.0`; the loopback bind is the perimeter |
| `backend/app/main.py` | CORS allow-list of `http://localhost:3000` / `http://127.0.0.1:3000` only |
| `backend/app/core/paths.py` | every served path is `realpath`-resolved and must sit under `MEDLOOP_STORAGE_ROOT`; traversal → `404`, never a leaked read |
| `POST /uploads` | registers a *local path*; it must resolve inside `MEDLOOP_ALLOWED_INGEST_ROOTS`. No bytes stream through the API and nothing is copied |
| `GET /images/{id}/gradcam` | returns real artefact bytes or `404` — never a synthesised placeholder (CLAUDE.md §2.3) |
| Auth | stdlib PBKDF2-HMAC-SHA256 behind `PasswordHasher`; zero third-party crypto wheels, nothing to phone home |
| Dependencies | no cloud SDK, no telemetry, no outbound HTTP client in a request path; a new dependency needs a recorded reason (CLAUDE.md §11.4) |
| `scripts/verify_invariants.py` | fails the repo on a forbidden cloud SDK or hostname, a hard-coded threshold literal, enum drift, or unbadged demo data (CLAUDE.md §12) |
| Database | local socket / `127.0.0.1` only; credentials from `.env`, never in source |

## Non-goals

Deliberate absences. Each one was considered and rejected for this system's size — see CLAUDE.md
§11.5 for the recorded decisions.

- **No containers.** Postgres, Node and Python run natively; Docker adds a VM layer on Apple Silicon
  for no benefit.
- **No message broker.** No Redis, no Celery, no RabbitMQ. The worker polls `training_jobs`.
- **No cloud anything.** No managed DB, object store, inference endpoint, annotation service,
  error tracker or analytics.
- **No microservices.** One API process; layers are packages, not network hops.
- **No CUDA-only paths, no distributed training, no cloud GPUs** (CLAUDE.md §2.8).
- **No chart or canvas library** — hand-rolled SVG for charts and the annotation surface.
- **No external identity provider.** Local accounts only (see [authentication](./authentication.md)).
- **No multi-tenant model.** One researcher, several local roles.

## What this architecture buys

| Property | Mechanism |
| --- | --- |
| Traceability | every artefact is a row; `images → dataset_versions → datasets`, `ai_predictions → models`, `training_samples → training_batches` (CLAUDE.md §7.1) |
| Comparability | one locked test dataset version evaluates every model version (CLAUDE.md §2.5) |
| Honesty | prediction rows immutable; missing explanation → hidden view, not an empty heat-map |
| Reversibility | nothing hard-deleted; archive + audit row instead |
| Fit | three processes, one laptop, no infrastructure to operate |
