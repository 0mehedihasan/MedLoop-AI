# MedLoop AI — Architecture

Read this when: adding a layer, moving a responsibility, wiring a new service, or deciding where a
piece of logic belongs. Extends `CLAUDE.md §3`; enforces `§2.1` (local only) and `§2.8` (hardware).

## The stack

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser                                        http://localhost:3000    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  fetch · JSON · Authorization: Bearer
┌────────────────────────────────▼────────────────────────────────────────┐
│ Next.js — App Router, React, TS strict, Tailwind          frontend/     │
│   app/ (routes) · features/ (screens) · components/ · lib/ · types/     │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  http://127.0.0.1:8000/api/v1
┌────────────────────────────────▼────────────────────────────────────────┐
│ FastAPI                                                  backend/app/   │
│        api/  ──►  services/  ──►  repositories/                         │
└───┬──────────────┬───────────────┬──────────────────────┬───────────────┘
    │              │               │                      │
┌───▼───────┐ ┌────▼─────────┐ ┌───▼──────────────┐ ┌─────▼──────────────┐
│ PostgreSQL│ │ Local storage│ │ ML Engine   ml/  │ │ Training worker    │
│ relational│ │ storage/     │ │ PyTorch:         │ │ backend/worker/    │
│ state,    │ │ images,      │ │  classify        │ │ polls training_    │
│ lineage,  │ │ gradcam PNGs,│ │  explain         │ │ jobs; never runs   │
│ settings, │ │ weights,     │ │  localise        │ │ inside the API     │
│ audit log │ │ manifests    │ │                  │ │ process            │
└───────────┘ └──────────────┘ └──────────────────┘ └────────────────────┘
```

Processes on the laptop: PostgreSQL (native), FastAPI (uvicorn), Next.js dev/build server, and the
worker as a separate local process. Nothing else. No container runtime, no broker, no reverse proxy.

## Layer responsibilities (deeper than §3.1)

| Layer | Path | Owns | May import | Must never |
| --- | --- | --- | --- | --- |
| UI | `frontend/app/`, `frontend/features/` | routing, rendering, interaction, optimistic UX, client-side date-preset resolution | `frontend/lib/`, `components/`, `types/` | compute a metric, decide promotion, read the filesystem, hold a business rule, hard-code a route |
| API | `backend/app/api/` | HTTP shape, auth guard, request/response schemas, pagination params | `schemas/`, `services/`, `api/deps.py` | contain business logic, import a repository, raise `HTTPException` for a domain error |
| Services | `backend/app/services/` | business rules, state transitions, transaction boundaries, threshold reads | `repositories/`, `core/`, `ml/` seams | run raw SQL, know a URL/status code, know a request object |
| Repositories | `backend/app/repositories/` | every DB read/write, query composition, filter/pagination SQL | `models/`, SQLAlchemy session | branch on a business rule, call a service, emit an audit decision |
| ML | `ml/` | tensors, model construction, device resolution, Grad-CAM, metrics | torch, numpy, its own subpackages | import `backend/app/**`, open a DB session, know about auth/HTTP |
| Worker | `backend/worker/` | long-running training/evaluation jobs, progress writes | `services/`, `ml/` | be imported by a request handler |

## Single-direction rule

```text
api  ──►  services  ──►  repositories  ──►  database
 │           │
 │           └──►  ml/  (pure functions and Protocol implementations)
 └──►  schemas/  (Pydantic, both directions)
```

| From → To | Legal? | Note |
| --- | --- | --- |
| `api` → `services` | yes | the only way a route does work |
| `api` → `repositories` | **no** | the most common violation; grep for it in review |
| `services` → `repositories` | yes | one repository call per aggregate, inside the service's transaction |
| `services` → `api` | **no** | circular; move the shared type to `schemas/` or `core/` |
| `repositories` → `services` | **no** | invert it: pass the value in |
| `ml/` → `backend/app` | **no** | `ml/` must stay runnable from a plain script |
| `worker` → `services` | yes | the worker is a second caller of the same services |
| `api` → `worker` | **no** | the API enqueues a `training_jobs` row; it never calls the worker |

Enqueue, do not call: `POST /training/batches/{id}/start` writes a `QUEUED` job row and returns.
The worker discovers it by polling. That is the whole queue.

## Where lineage is carried

Lineage lives in **foreign keys**, never in log lines (`CLAUDE.md §7.1`).

```text
datasets ─◄ dataset_versions ─◄ images ─◄ ai_predictions ──► models ──► training_batches
                                  │  ├──◄ annotations ──► users            │
                                  │  └──◄ review_sessions ──► users        │
                                  └──────◄ training_samples ───────────────┘
                                            model_evaluations ──► (models, dataset_versions)
```

Rules that keep it answerable by query alone:
- Every prediction stores `model_id` **and** the denormalised `model_version` string, so a promoted
  or archived model does not erase attribution.
- `review_sessions` stamps the model version that produced the prediction it reviewed (`§6.3`).
- `model_evaluations` stores the `dataset_version_id` it ran on — this is what makes the
  "not comparable" refusal computable (`§9`).
- Nothing is hard-deleted. Delete = `ARCHIVED` + `archived_at`.

## The model registry's place

The registry is **database rows plus a directory**, not a service and not a third-party tool.

| Concern | Where |
| --- | --- |
| Truth about which model is `ACTIVE` | `models` table + partial unique index |
| Weights and artefacts | `storage/models/vN/` (`§3.2`) |
| Promotion / rejection decisions | `services/` (model service), audited to `system_logs` |
| Read path for inference | resolve `ACTIVE` row → load artefact path → hand to `ml/` |

`ml/` never queries the registry. A service resolves the row and passes a path and hyperparameters
into the ML seam. See `medloop-model-versioning.md`.

## Why there are no containers, brokers or microservices

| Missing thing | Why it stays missing |
| --- | --- |
| Docker for dev | a VM layer on Apple Silicon for no benefit; Postgres runs natively (`§11.5`) |
| Celery / Redis / RabbitMQ | one researcher, one laptop; a DB-polling worker has no broker to operate |
| Microservices | four responsibilities, one deploy target; network hops would be pure cost |
| Cloud anything | `§2.1` — medical images never leave the machine |
| Kubernetes / nginx / gunicorn fleet | single-user localhost has no scaling problem to solve |

If a task seems to need one of these, the requirement is almost always "the API must not block" —
which the worker already solves.

## Adding a new capability without breaking layering

Worked recipe (order matters; each step is reviewable on its own):

1. **Contract first** — add the endpoint row to `docs/api_contract.md` and its error codes. Frontend
   and backend both implement against that file, in the same commit.
2. **Enums** — if a new state appears, add it to `backend/app/core/enums.py` *and*
   `frontend/types/domain.ts` with byte-identical values, or `backend/tests/test_enum_parity.py`
   fails (`§4`).
3. **Schema** — extend `backend/migrations/sql/0001_init.sql` and the SQLAlchemy model in
   `backend/app/models/` in the same commit, or neither (`§7`).
4. **Repository** — add the query. No branching on business meaning.
5. **Service** — put the rule, the guard, the transaction and the audit write here.
6. **Schemas** — separate Pydantic `Create` / `Update` / `Read` models in `backend/app/schemas/`.
7. **Route** — thin: parse → authorise → call service → return schema.
8. **Route declaration** — add the path to `frontend/lib/navigation.ts`; no page hard-codes a string
   (`§11.1`).
9. **Frontend** — client function in `frontend/lib/`, screen in `frontend/features/<area>/`, all
   four states (loading, empty, error, populated).
10. **Validate** — `§12`. Update `TASKS.md`. Report what you could not run.

Anti-patterns that mean you skipped a step:
- a route with an `if` about domain state → belongs in a service;
- a service importing `fastapi` → the HTTP concern leaked downward;
- a component computing a rate or a percentage from raw counts → the statistics endpoints own that;
- an `ml/` module reading `os.environ` for a DB URL → it is not a pure engine any more.

## Local-only enforcement points

| Point | Mechanism |
| --- | --- |
| API bind address | `127.0.0.1` only — never `0.0.0.0` |
| CORS | allow-list exactly the local frontend origin |
| Frontend → API | `NEXT_PUBLIC_API_BASE_URL`, must be a loopback URL |
| Image bytes | served only via `GET /images/{id}/file`, resolved under `MEDLOOP_STORAGE_ROOT` |
| Ingest | `POST /uploads` registers a **local path** inside `MEDLOOP_ALLOWED_INGEST_ROOTS`; no bytes stream through the API, nothing is copied |
| Dependencies | anything that phones home is disallowed; justify every addition in the report |
| CI guard | `scripts/verify_invariants.py` fails on a forbidden cloud SDK or hostname (`§12`) |

One physical copy of each image. Splits and batch membership are database references, not file
copies — the 512 GB budget depends on it (`§3.2`).
