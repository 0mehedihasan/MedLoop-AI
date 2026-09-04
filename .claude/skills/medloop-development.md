# MedLoop AI — Development conventions

Read this when: writing code in any layer, adding a dependency, testing, or closing out a session.
Extends `CLAUDE.md §0`, `§11`, `§12`.

## TypeScript

| Rule | Detail |
| --- | --- |
| `strict: true` | plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` where the codebase already sets them |
| no `any` | use `unknown` + a narrowing guard; a cast is a comment explaining why the compiler is wrong |
| no `!` on a real nullable | model `null` in the type and render the unavailable state (`§11.2`) |
| exported prop interfaces | `export interface ReviewPanelProps { … }`, one per component |
| `as const` for literal maps | routes, shortcut maps, enum→tone lookups |
| enums | import from `frontend/types/domain.ts`; never redeclare a member string |
| no default exports for components | named exports keep refactors greppable |
| discriminated unions over booleans | `{state:'loading'} \| {state:'error',error} \| …` beats three booleans |

## Python

| Rule | Detail |
| --- | --- |
| full type hints | including return types; `from __future__ import annotations` where it helps |
| Pydantic v2 at every boundary | separate `Create` / `Update` / `Read`; no ORM object crosses the HTTP line |
| SQLAlchemy 2.0 typed ORM | `Mapped[...]` / `mapped_column`; no legacy `Column` |
| no literals for config | thresholds, paths, secrets via `config.py` / the settings service (`§2.6`, `§11.3`) |
| explicit exceptions | `MedLoopError` subclasses; never `except Exception: pass` |
| dataclasses at the `ml/` seam | frozen, so a payload cannot be mutated after the fact |
| no import of `backend.app` from `ml/` | the engine stays runnable from a plain script (`§3.1`) |

## Size limits and modularity

| Unit | Soft limit | Split when |
| --- | --- | --- |
| `app/**/page.tsx` | ~40 lines | it starts fetching or holding state → move into `features/<area>/` |
| React component | ~150 lines | it renders two unrelated regions, or has >5 pieces of state → extract a child + a hook |
| custom hook | ~80 lines | it does two jobs (e.g. viewport *and* history) → two hooks |
| service method | ~50 lines | it opens two transactions, or handles two entities → two methods |
| router file | endpoints only | it grows a helper with business meaning → move to the service |
| any module | ~400 lines | it has two reasons to change |

No duplicated logic — extract it (`§11.4`). One way of doing a thing: if a helper exists, use it
rather than adding a second spelling. Services are per aggregate (`review`, `hitl`, `dataset`,
`model`, `training`, `settings`, `statistics`, `auth`), each with one clear entry point per use case.

## Environment variables

| Variable | Side | Purpose |
| --- | --- | --- |
| `MEDLOOP_DATABASE_URL` | backend | local PostgreSQL over loopback |
| `MEDLOOP_STORAGE_ROOT` | backend | the single runtime root (`§3.2`) |
| `MEDLOOP_ALLOWED_INGEST_ROOTS` | backend | upload allow-list (`medloop-security.md`) |
| `MEDLOOP_SECRET_KEY` | backend | token signing; generated at bootstrap, never committed |
| `MEDLOOP_API_BASE_URL` | backend/scripts | `http://127.0.0.1:8000/api/v1` |
| `NEXT_PUBLIC_API_BASE_URL` | frontend | same URL, client-visible |
| `NEXT_PUBLIC_DATA_SOURCE` | frontend | `demo` \| `api` (`§10`) |
| `NEXT_TELEMETRY_DISABLED` | frontend | `1` — no outbound anything (`§2.1`) |

- `.env.example` is committed with every key and a safe placeholder; `.env` is gitignored.
- Backend code reads env **only** through `config.py`; frontend code only through
  `frontend/lib/config.ts`. `process.env.X` scattered in components is a defect.
- Required variables are validated at startup and fail loudly. Never default a secret or a path.
- Only `NEXT_PUBLIC_*` reaches the browser — never put a secret behind that prefix.

## Error handling patterns

```ts
// frontend/lib/api-client.ts — the envelope becomes a typed result, never a thrown string
type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };  // ApiError = {code,message,details}
```

- Frontend: switch on `error.code` (`MODEL_UNAVAILABLE`, `DATASET_NOT_AVAILABLE`, …), render the
  matching state, keep the raw message available. Never `catch {}`, never a bare "Something went
  wrong" when the envelope told you what happened.
- Backend: raise a `MedLoopError`; one handler in `main.py` renders the envelope; unexpected
  exceptions log `ERROR` with a traceback server-side and return `INTERNAL_ERROR` with no internals.
- `ml/`: raise `DatasetNotAvailableError` for anything dataset-dependent; never return a stub value
  (`medloop-ml.md`).

## Testing strategy

| Layer | What to test | Offline? |
| --- | --- | --- |
| enums | `backend/tests/test_enum_parity.py` parses both files and fails on drift (`§4`) | yes |
| derived status | `derive_data_status` / `deriveDataStatus` agree on a shared fixture table (`§4.1`) | yes |
| geometry | clamp, normalise, `deriveBoundingBox`, IoU — same fixtures both languages (`§4.3`) | yes |
| HITL logic | threshold crossing, the four `§8.4` scenarios, skip semantics, with a fake settings store | yes |
| services | transition guards: `TEST` rejected, locked version rejected, `SKIPPED` excluded | yes, with a local DB |
| Postgres-specific | advisory lock + partial unique index behaviour (one batch, one `ACTIVE` model) | needs real local PostgreSQL — SQLite cannot express these |
| repositories | filter/pagination SQL against a local DB | needs local PostgreSQL |
| API | route → service wiring, auth guards, envelope shape, via `TestClient` | yes |
| path safety | `resolve_under` escape attempts, symlinks, `..` | yes |
| auth | hash/verify round-trip, `needs_rehash`, generic failure message | yes |
| localisation | threshold → region → box on **synthetic** CAM arrays (numpy only) | yes |
| frontend units | geometry, history reducer, navigation map, formatters | yes, if a runner is configured |
| training / inference / Grad-CAM on real weights | — | **no**: no dataset, no model; assert the raise instead |
| invariants | `scripts/verify_invariants.py` (`§12`) | yes, no network |

Tests live beside the layer they cover (`§11.4`). If the frontend has no unit-test runner configured,
propose one through the dependency procedure below instead of hand-rolling assertions in a script.

## Validation commands (`§12`)

```bash
# Frontend
cd frontend && npm run typecheck && npm run lint && npm run build

# Backend
cd backend && python -m compileall -q app worker && pytest -q

# Repo-wide invariants (no network needed, runs anywhere)
python3 scripts/verify_invariants.py
```

Run what applies to what you touched. `verify_invariants.py` fails if: a hard-coded HITL threshold
literal appears outside `system_settings` defaults and docs; a forbidden cloud SDK or hostname
appears; `enums.py` and `domain.ts` have drifted; a `frontend/lib/demo/*.ts` file is missing its
`DEMO DATA` banner; demo data is imported outside its allowed wiring; or a `docs/` file referenced
from `CLAUDE.md` does not exist.

## Dependency policy

Recorded decisions (`§11.5`) — do not silently reverse one:

| Considered | Decision | Reason |
| --- | --- | --- |
| Konva.js | **rejected** | exact normalised-coordinate control and keyboard handles; SVG + pointer events is ~1 file and fully testable |
| Recharts / Plotly | **rejected** | six simple chart types; hand-rolled SVG keeps the clinical language and the bundle small |
| Celery / Redis | **rejected** | one researcher, one laptop; a DB-polling worker has no broker to operate |
| Alembic | **deferred** | `0001_init.sql` is the schema of record while the schema moves; adopt before the first real dataset load |
| bcrypt / passlib | **deferred** | stdlib PBKDF2 keeps auth installable and offline-testable; swap via `PasswordHasher` |
| Docker (dev) | **rejected** | a VM layer on Apple Silicon for no benefit; PostgreSQL runs natively |

Proposing a new dependency:

1. State the need in one sentence and what breaks without it.
2. Show the stdlib / hand-rolled alternative and its real cost (lines, not vibes).
3. Check it: no network calls or telemetry (`§2.1`), permissive licence, actively maintained, no
   unusual/typosquat-looking name, no heavy transitive tree, works on Apple Silicon.
4. Pin an **exact** version (no `^`/`~`), commit the lockfile, and record the decision in
   `CLAUDE.md §11.5` + `TASKS.md` in the same commit.
5. Report it in the session summary. A dependency that phones home is disallowed outright.

## `TASKS.md` obligation (`§0`)

- Before starting: find the task, confirm it is not `BLOCKED`, confirm nothing upstream is unfinished.
- While working: if you discover work, add it as a task rather than silently expanding scope.
- After finishing: tick what you completed, record what you learned, and update the `BLOCKED` markers
  (Phases 4–12 stay blocked until the dataset arrives, `§15`).
- `TASKS.md` is the **only** progress tracker. Not chat, not a comment, not a new markdown file.

## Commit hygiene

| Rule | Detail |
| --- | --- |
| contract + code together | an endpoint change and `docs/api_contract.md` in one commit |
| schema + ORM together | `0001_init.sql` and `backend/app/models/` in one commit, or neither (`§7`) |
| enums together | `core/enums.py` and `types/domain.ts` in one commit (`§4`) |
| docs with decisions | architecture/schema/contract changes update `docs/` in the same commit (`§0` step 6) |
| never committed | `storage/**`, `.env`, weights, images, Grad-CAM PNGs, logs, `__pycache__`, `node_modules` |
| subject line | imperative, ≤ ~70 chars, names the layer: `backend: enforce one open HITL batch` |
| commit only when asked | staging specific files, never `git add .` with unrelated changes |

## Closing a session: report what you could not verify

Every hand-off states, briefly: files touched, decisions made (especially defaults chosen
unilaterally), what you ran and what it said, and **explicitly what you could not verify** (`§0`
step 9). Examples of honest gaps worth naming: `npm run build` not run because dependencies are not
installed; `pytest` not run because PostgreSQL is not running locally; torch not installed so the
device-resolution path was reasoned about, not executed; anything dataset-dependent still blocked.

Never report success without having run something. "Should work" is not a verification, and a claim
that the tests pass when they were not run is the single most expensive error in this project.
