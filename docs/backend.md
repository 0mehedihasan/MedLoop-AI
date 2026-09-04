# Backend

Scope: the FastAPI application — layout, layers, error mapping, transactions, configuration, and the
procedure for adding an endpoint without breaking the contract.

See also: [architecture](./architecture.md) · [database](./database.md) · [authentication](./authentication.md) · [hitl_workflow](./hitl_workflow.md) · [api_contract](./api_contract.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §3.1 (layers), §8 (settings), §11.3 (backend conventions).

**Endpoint detail is not repeated here.** Paths, bodies, responses and error codes live in
[api_contract.md](./api_contract.md); this document covers the machinery behind them.

## Tree

```text
backend/
├── app/
│   ├── main.py             app factory, CORS allow-list, exception handler, router mounts
│   ├── config.py           Settings (pydantic-settings) — every env var, no literals elsewhere
│   ├── api/                one router per file + deps.py
│   ├── schemas/            Pydantic v2 request/response models
│   ├── services/           business rules, transitions, transaction boundaries
│   ├── repositories/       every SQL / ORM statement
│   ├── models/             SQLAlchemy 2.0 typed mappings, mirror of 0001_init.sql
│   └── core/
│       ├── enums.py        parity twin of frontend/types/domain.ts
│       ├── errors.py       MedLoopError hierarchy
│       ├── security.py     PasswordHasher protocol + PBKDF2 implementation, tokens
│       ├── paths.py        storage-root containment, safe file resolution
│       ├── db.py           engine, session factory, advisory-lock helper
│       └── logging.py      structured local logging → storage/logs/
├── migrations/sql/0001_init.sql      schema of record
├── worker/                 main.py (poll loop), runner.py (job execution), reconcile.py
├── tests/                  unit + integration, beside the layer they cover
└── requirements.txt
```

## Modules

| Module | Owns | Never |
| --- | --- | --- |
| `main.py` | app assembly, one exception handler, health mount | business logic |
| `config.py` | typed settings from env; fails fast on a missing secret | reading the database |
| `api/*.py` | parse → authorise → call service → return schema | SQL, rules, `HTTPException` for domain errors |
| `api/deps.py` | session, current user, role guard, settings injection | anything request-specific beyond wiring |
| `schemas/*.py` | boundary shapes and field validation | ORM objects leaking outward |
| `services/*.py` | rules, guards, transactions, audit events | raw SQL, HTTP knowledge |
| `repositories/*.py` | statements and row mapping | deciding policy |
| `models/*.py` | table mappings | computed business attributes |
| `core/*.py` | primitives shared by all layers | importing services or routers |
| `worker/*` | claiming and running jobs, writing progress | serving HTTP |

## Routers

`auth` · `health` · `datasets` · `dataset_versions` · `uploads` · `images` · `review` ·
`annotations` · `predictions` · `models` · `training` · `statistics` · `admin` · `logs` — one file
each under `app/api/`, all mounted under `/api/v1` in `main.py`, all documented in
[api_contract.md](./api_contract.md).

## Errors — `MedLoopError` → HTTP

Every domain error subclasses `MedLoopError` and carries `code`, `message`, optional `details`. One
handler in `main.py` renders the envelope from `api_contract.md`; routes never raise `HTTPException`
for a domain problem (CLAUDE.md §11.3).

| Exception | `code` | HTTP | Raised by |
| --- | --- | --- | --- |
| `ValidationFailed` | `VALIDATION_ERROR` | 422 | services for server-side rules; FastAPI for schema failures |
| `Unauthenticated` | `UNAUTHENTICATED` | 401 | `auth_service` — missing/expired/invalid token |
| `PermissionDenied` | `FORBIDDEN` | 403 | `require_role` and service-level checks |
| `NotFound` | `NOT_FOUND` | 404 | repositories via services; also path resolution failures |
| `Conflict` | `CONFLICT` | 409 | illegal transition, e.g. submitting on a `TEST` image |
| `DatasetLocked` | `DATASET_LOCKED` | 409 | any mutation inside a locked test version |
| `ModelUnavailable` | `MODEL_UNAVAILABLE` | 409 | inference/XAI with no `ACTIVE` model |
| `DatasetNotAvailable` | `DATASET_NOT_AVAILABLE` | 501 | deliberately unimplemented dataset-dependent capability |
| anything else | `INTERNAL_ERROR` | 500 | logged with a traceback to `storage/logs/`, generic message out |

`401` responses are deliberately uniform: invalid username and invalid password are indistinguishable,
compared in constant time.

## Schema conventions — `schemas/`

| Suffix | Use |
| --- | --- |
| `…Create` / `…Update` | request bodies; `Update` fields all optional |
| `…Summary` | list rows — the cheap projection |
| `…Detail` | single-resource read, includes nested blocks |
| `…Body` / `…Result` | action payload and outcome, e.g. `SubmitBody` / `SubmitResult` |
| `Page[T]` | generic `{items, page, page_size, total, pages}` envelope |
| `…Filters` | query-parameter models bound with `Depends()` |

- Field names are `snake_case` and byte-identical to `api_contract.md`.
- Enum fields are typed with the classes from `core/enums.py`, never bare `str`.
- `model_config = ConfigDict(from_attributes=True)`; no SQLAlchemy object is ever returned from a
  route.
- Unknown fields are rejected (`extra="forbid"`) so a client typo is a `422`, not a silent no-op.

## Services and the rule each owns

| Service | Rule it is responsible for |
| --- | --- |
| `auth_service` | credential verification, token issue/verify, `AUTH_*` audit rows |
| `user_service` | user creation, deactivation, role change |
| `dataset_service` | dataset/version lifecycle, split assignment, `lock-test` as a one-way door |
| `upload_service` | ingest path must resolve inside the allowed roots; records intent, never guesses structure |
| `image_service` | filter composition, `derive_data_status`, safe file resolution |
| `review_service` | queue order, claim/release, the submit transaction and its transition guards |
| `annotation_service` | geometry validation and normalisation, soft archive |
| `prediction_service` | refuses without an `ACTIVE` model; records the device actually used |
| `hitl_service` | counter, threshold read from settings, advisory lock, batch creation |
| `training_service` | job start/cancel, one-live-job guard, progress projection |
| `model_service` | registry, promotion criterion, comparability refusal, archive on promote |
| `evaluation_service` | writes `model_evaluations` rows; only metrics the code computed |
| `settings_service` | typed get/set with authoritative validation + audit row |
| `statistics_service` | aggregation; omits a figure it cannot compute instead of sending `0` |
| `audit_service` | the only writer of `system_logs` |
| `health_service` | probes each dependency; reports `UNKNOWN` rather than assuming `ONLINE` |

## Repositories

One per aggregate; the only place a statement is written. Each takes an explicit `Session` — it never
opens its own.

| Repository | Tables |
| --- | --- |
| `user_repository`, `label_repository` | `users`, `disease_labels` |
| `dataset_repository`, `dataset_version_repository` | `datasets`, `dataset_versions` |
| `image_repository` | `images` (filters, queue candidates, counts) |
| `annotation_repository` | `annotations` |
| `prediction_repository` | `ai_predictions` (insert + read only) |
| `review_repository` | `review_sessions` |
| `training_repository` | `training_batches`, `training_samples`, `training_jobs` |
| `model_repository`, `evaluation_repository` | `models`, `model_evaluations` |
| `settings_repository`, `log_repository` | `system_settings`, `system_logs` |
| `stats_repository` | read-only aggregate queries across the above |

## `api/deps.py`

```text
get_settings()                     cached Settings from config.py
      │
      ▼
get_engine() ──▶ get_db()          yields a Session; commit on success, rollback on exception
                     │
bearer_token() ──────┼──▶ get_current_user()      decodes + verifies the token, loads the user,
                     │           │                 rejects inactive accounts → 401
                     │           ▼
                     │      require_role(*roles)   → 403 when the role is not listed
                     ▼
              get_settings_service()               typed settings reader (threshold, device, …)
```

Every protected route declares `user = Depends(require_role(Role.ADMIN, …))`; nothing reads the role
from a request body. `/health` and `/auth/login` are the only unauthenticated routes.

## Transaction boundaries

| Rule | Detail |
| --- | --- |
| One transaction per request | opened by `get_db`, committed once at the end of a successful request |
| Services own the boundary | a service may call other services; nested calls join the same session and never commit |
| Repositories never commit | they add, flush when they need an id, and return |
| Locks before reads that decide | `hitl_service` takes `pg_advisory_xact_lock(<key>)` before reading the counter, so two concurrent submits cannot both cut a batch |
| The submit path is atomic | annotations + review session + image stamp + counter + possible batch + audit rows commit together (CLAUDE.md §6.1) |
| The worker owns its own sessions | short transactions per progress write, so a long epoch never holds a lock |
| Failure means nothing happened | a partially validated sample is a corrupt experiment; no compensating writes, no partial success responses |

## Configuration

All of it in `config.py`, all of it from the environment, none of it in source (CLAUDE.md §11.3).
`.env.example` is the template; `.env` is gitignored.

| Variable | Type | Default | Meaning |
| --- | --- | --- | --- |
| `MEDLOOP_ENV` | str | `local` | label reported by `/health` |
| `MEDLOOP_DB_URL` | str | `postgresql+psycopg://medloop@127.0.0.1:5432/medloop` | database DSN; loopback only |
| `MEDLOOP_STORAGE_ROOT` | path | `./storage` | the single runtime root; every served path must resolve inside it |
| `MEDLOOP_ALLOWED_INGEST_ROOTS` | path list | *(empty)* | `:`-separated roots `POST /uploads` may register; empty ⇒ uploads refused |
| `MEDLOOP_SECRET_KEY` | str | *(required)* | HMAC key for session tokens; startup fails if unset |
| `MEDLOOP_TOKEN_TTL_MINUTES` | int | `720` | token lifetime (recorded engineering choice) |
| `MEDLOOP_PBKDF2_ITERATIONS` | int | `600000` | password hashing cost (CLAUDE.md §11.3) |
| `MEDLOOP_CORS_ORIGINS` | str list | `http://localhost:3000,http://127.0.0.1:3000` | CORS allow-list |
| `MEDLOOP_API_HOST` | str | `127.0.0.1` | never `0.0.0.0` |
| `MEDLOOP_API_PORT` | int | `8000` | uvicorn port |
| `MEDLOOP_LOG_LEVEL` | enum | `INFO` | ∈ `LogLevel` |
| `MEDLOOP_LOG_DIR` | path | `${STORAGE_ROOT}/logs` | file sink |
| `MEDLOOP_WORKER_POLL_SECONDS` | int | `5` | job table poll interval |
| `MEDLOOP_API_BASE_URL` | str | `http://127.0.0.1:8000/api/v1` | used by scripts |
| `NEXT_PUBLIC_API_BASE_URL` | str | same as above | frontend client |
| `NEXT_PUBLIC_DATA_SOURCE` | enum | `demo` | `demo` \| `api` (CLAUDE.md §10) |

**No training/HITL knob is an env var.** `hitl_retraining_threshold`, device, batch size, epochs,
promotion mode and `minimum_improvement` live in `system_settings` and are edited through
`PUT /admin/settings/training` (CLAUDE.md §8.1).

## Adding an endpoint — 6 steps

1. **Contract first.** Add the row to [api_contract.md](./api_contract.md): path, body, response,
   error codes. Same commit as the code.
2. **Schemas.** Request/response models in `schemas/`, enums from `core/enums.py`.
3. **Repository.** The statement, on an injected `Session`, returning rows or `None`.
4. **Service.** The rule: guards, transitions, transaction, `audit_service` event on any state change.
   Raise a `MedLoopError` subclass — never an `HTTPException`.
5. **Router.** Thin function in `api/<area>.py`: `Depends(require_role(...))`, call the service,
   return the schema. Mount it in `main.py` if the file is new.
6. **Verify.** Tests beside the layer, then `python -m compileall -q app worker && pytest -q` and
   `python3 scripts/verify_invariants.py`; update `docs/` and tick `TASKS.md` (CLAUDE.md §0, §12).

## Testing

| Layer | Approach |
| --- | --- |
| Services | unit tests with fake repositories and a fake settings service — no database, no network |
| Repositories | integration tests against a local test database, each test in a rolled-back transaction |
| Routers | `TestClient` with dependency overrides for user/role, asserting status **and** `error.code` |
| Invariants | `test_enum_parity.py` (parses `enums.py` + `domain.ts`), plus `scripts/verify_invariants.py` |

Offline-testable today: enum parity, error mapping, pagination envelope, path containment, geometry
validation, role guards, threshold logic against a fake settings service, promotion arithmetic on
synthetic metric inputs, and the counter reconciliation query.

Not testable yet, and explicitly so: anything requiring real images, PyTorch, a trained model or the
Grad-CAM chain. Those paths return `DATASET_NOT_AVAILABLE` or `MODEL_UNAVAILABLE` until Phase 4
unblocks — see [development_roadmap](./development_roadmap.md) and [ml_pipeline](./ml_pipeline.md).
