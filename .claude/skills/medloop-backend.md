# MedLoop AI — Backend

Read this when: touching FastAPI, schemas, services, repositories or migrations. Extends
`CLAUDE.md §3.1`, `§7`, `§11.3`. **Endpoints live in `docs/api_contract.md` and are not repeated
here — change the contract first, in the same commit as the code.**

## Layout

```text
backend/
├── app/
│   ├── main.py             app factory · router include · ONE exception handler · CORS · 127.0.0.1
│   ├── config.py           pydantic-settings; every env var lands here and nowhere else
│   ├── core/               enums.py (§4 parity) · errors.py (MedLoopError + code→status) ·
│   │                       security.py (PasswordHasher, PBKDF2, tokens) · pagination.py ·
│   │                       status.py (derive_data_status, §4.1) · audit.py (log_event)
│   ├── db/session.py       engine, sessionmaker, session dependency
│   ├── models/             SQLAlchemy 2.0 typed ORM — mirrors 0001_init.sql exactly
│   ├── schemas/            Pydantic v2 boundary types (Create / Update / Read)
│   ├── repositories/       all database access
│   ├── services/           all business rules, transitions, transactions
│   └── api/
│       ├── deps.py         DI: session, current_user, require_role, PageParams, filters
│       ├── router.py       APIRouter(prefix="/api/v1"), includes the modules below
│       └── v1/             auth · health · datasets · uploads · images · review · annotations ·
│                           predictions · models · training · statistics · admin_settings · logs
├── migrations/sql/0001_init.sql     schema of record (§7)
├── worker/                          training worker process (§9.1)
└── tests/                           incl. test_enum_parity.py
```

One router per file, named after the contract section it implements — a router grows endpoints,
never concerns.

## Thin routes

```python
# api/v1/review.py
@router.post("/{image_id}/submit", response_model=SubmitResult)
async def submit_review(image_id: int, body: SubmitBody,
        user: User = Depends(require_role(Role.ADMIN, Role.ANNOTATOR)),
        service: ReviewService = Depends(get_review_service)) -> SubmitResult:
    return service.submit(image_id=image_id, user=user, payload=body)
```

Parse → authorise → call one service method → return a schema. That is the whole route.

| Do | Don't |
| --- | --- |
| one service call per route | orchestrate two services in a route |
| `Depends(require_role(...))` | check `user.role` inside the handler body |
| let the exception handler map errors | `raise HTTPException` for a domain problem |

## Errors — one hierarchy, one handler

```python
# core/errors.py
class MedLoopError(Exception):           # __init__(message: str, **details: object)
    code: str = "INTERNAL_ERROR"; http_status: int = 500

class ValidationRuleError(MedLoopError):   code, http_status = "VALIDATION_ERROR", 422
class AuthenticationError(MedLoopError):   code, http_status = "UNAUTHENTICATED", 401
class PermissionDeniedError(MedLoopError): code, http_status = "FORBIDDEN", 403
class NotFoundError(MedLoopError):         code, http_status = "NOT_FOUND", 404
class ConflictError(MedLoopError):         code, http_status = "CONFLICT", 409
class DatasetLockedError(ConflictError):   code = "DATASET_LOCKED"
class ModelUnavailableError(ConflictError):code = "MODEL_UNAVAILABLE"
```

`main.py` registers exactly one handler that renders the envelope from `docs/api_contract.md`:
`{"error": {"code", "message", "details"}}`. It also maps two foreign exception types:

| Raised by | Mapped to | Note |
| --- | --- | --- |
| `pydantic.ValidationError` / FastAPI request validation | `VALIDATION_ERROR` 422 | same envelope, never FastAPI's default shape |
| `ml.errors.DatasetNotAvailableError` | `DATASET_NOT_AVAILABLE` 501 | `ml/` cannot import `backend/app` (`§3.1`), so ML owns the type and the handler translates it |
| anything else | `INTERNAL_ERROR` 500 | logged as `ERROR` with a traceback; the response body carries no internals |

Services raise domain errors, repositories raise at most `NotFoundError`, routes raise nothing.
Messages are user-facing: no SQL, no paths, no stack text.

## Pydantic v2 schemas

`backend/app/schemas/<entity>.py`, three shapes minimum, no ORM leakage:

| Schema | Purpose | Rules |
| --- | --- | --- |
| `XCreate` | request body for `POST` | required fields only; no `id`, no timestamps, no status |
| `XUpdate` | `PATCH`/`PUT` body | every field optional; `model_config = ConfigDict(extra="forbid")` |
| `XRead` / `XDetail` | response, plain or with children | explicit fields; enums typed from `core/enums.py`; `XDetail` composes nested `Read` schemas |

- `from_attributes=True` on read schemas, converted in the service, not the route. Never
  `response_model=<ORM model>`, never a model with an unloaded lazy relationship.
- Field validators express *shape*; business rules (e.g. "test set is locked") live in services.
- Geometry is a discriminated union on `AnnotationType` with normalised `[0,1]` bounds enforced by
  validators (`§4.3`) — reject pixel coordinates at the boundary. Enum values are the literal
  strings from `§4`, never integers.

## SQLAlchemy 2.0 models

```python
class Image(Base):
    __tablename__ = "images"
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_version_id: Mapped[int] = mapped_column(ForeignKey("dataset_versions.id"), index=True)
    split: Mapped[ImageSplit] = mapped_column(SAEnum(ImageSplit, native_enum=False), index=True)
    archived_at: Mapped[datetime | None] = mapped_column(nullable=True)
```

- `Mapped[...]` / `mapped_column` everywhere; no legacy `Column` declarations.
- The model mirrors `0001_init.sql`; edit both in one commit or neither (`§7`).
- `split` and `review_status` stay separate columns (`§4.1`). `DataStatus` is derived, never stored.
- No cascade deletes. Archival is `archived_at` + status (`§7`).
- Relationships are `lazy="raise"` by default so an accidental N+1 fails loudly in tests.

## Repositories

```python
# repositories/image_repository.py
def list_page(self, f: ImageFilters, p: PageParams) -> tuple[Sequence[Image], int]:
    stmt = select(Image).where(*build_image_filters(f))       # shared filter builders
    total = self._s.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = self._s.scalars(stmt.order_by(Image.id.desc())
                           .offset(p.offset).limit(p.limit)).all()
    return rows, total
```

- Every DB statement lives in a repository. A service that writes `select(...)` is a violation.
- Repositories **never** `commit()`, never emit audit rows, never decide a transition.
- Filter builders live in `repositories/filters.py` so `/images`, `/review/queue` and
  `/statistics/*` cannot disagree about what `data_status=VALIDATED` means.

## Dependency injection (`api/deps.py`)

| Dependency | Returns | Notes |
| --- | --- | --- |
| `get_session()` | `Session` | request-scoped, rolls back on exception |
| `current_user()` | `User` | validates the bearer token; raises `AuthenticationError` |
| `require_role(*roles)` | `User` | raises `PermissionDeniedError`; the only role gate |
| `PageParams` / `DateRange` | paging + inclusive `from_`/`to` | `page_size` default 25, max 200; UI presets resolve client-side |
| `get_<x>_service()` | service instance | wires repositories; the only place they are constructed |

Construct services only in `deps.py` — one that opens its own session breaks the transaction.

## Transactions live in services

```python
def submit(self, *, image_id: int, user: User, payload: SubmitBody) -> SubmitResult:
    with self._session.begin():          # ONE transaction, §6.1 steps 1–8: label, annotations,
        ...                              # review_session, HITL pool, counter, threshold check
        log_event(self._session, event="ANNOTATION_SUBMITTED", actor=user, entity=("image", image_id))
    return result                        # step 9 (next queue item) may read after commit
```

- One `begin()` per service entry point. Nested writes join it; they do not open their own.
- Cross-aggregate invariants (one `ACTIVE` model, one live job, one batch per threshold crossing)
  are enforced by a partial unique index **and** an advisory lock, not a read-then-write check.
- Never `commit()` mid-request to "make the data visible" — that is how a half-validated sample is
  born (`§6.1`).

## Settings service — why no threshold literal exists

`services/settings_service.py` reads typed rows from `system_settings` (`§8.1`) and is the only
source of `hitl_retraining_threshold`, `training_device`, `batch_size`, `max_epochs`,
`early_stopping`, `candidate_promotion_mode`, `minimum_improvement`, `primary_promotion_metric`.

- Callers use `settings.get_int("hitl_retraining_threshold")` / `get_enum(...)`; `1000` appears only
  as the seeded default row and in docs (`§2.6`).
- Validation is **server-authoritative**; the frontend validates for UX only (`§8.1`).
- Every `PUT` writes a `SETTINGS_CHANGED` audit row with user, key, old, new, timestamp, reason.
- Lowering the threshold below the current counter makes it *met*; never rewrite history (`§8.4`).
  `scripts/verify_invariants.py` fails the build on a literal outside defaults and docs.

## Pagination, statistics and audit

- List responses are `Page[T]` → `{items, page, page_size, total, pages}`, exactly as contracted.
- Filters arrive as one dependency object per resource; an invalid value raises `VALIDATION_ERROR`
  and never silently falls back to "all".
- Series are `{key, label, points:[{t, v}]}`; distributions `{key, label, slices:[…]}`. Every
  statistics response carries `"source": "database" | "unavailable"` and **omits** a figure it
  cannot compute rather than sending `0` (`§2.3`).
- Health checks report what they actually probed; unknown is `UNKNOWN`, never `ONLINE`.

`core/audit.py::log_event` is the single writer of `system_logs`, called from services **inside** the
transaction that caused the change. Event names are the closed list in `docs/api_contract.md`
(`AUTH_LOGIN` … `SETTINGS_CHANGED`, `ERROR`). Row: level, event, actor, entity type/id, message,
metadata JSON. Never logged: passwords, hashes, tokens, image bytes, file contents, whole geometry
payloads — log identifiers and counts. Log the state that actually happened, not the intended one
(`§11.4`): the device the forward pass ran on, not the configured device (`§2.3`).

## Backend failure modes

| Failure mode | Symptom | Fix |
| --- | --- | --- |
| business rule in a route | two endpoints disagree about a transition | move it into the service |
| repository imported by a route | `deps.py` grows DB wiring per endpoint | route → service only |
| `HTTPException` for domain errors | envelope drift, frontend cannot switch on `code` | raise a `MedLoopError` |
| threshold literal | `if count >= 1000` anywhere | `settings.get_int(...)` |
| audit written outside the transaction | log row exists for a rolled-back change | `log_event` inside `begin()` |
| `0` for an uncomputable metric | dashboard implies a trained model | omit the field, `source="unavailable"` |
