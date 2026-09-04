# Local deployment

Scope: getting MedLoop AI running on one machine — prerequisites, one-time setup, the three processes,
ports, storage, health checks, troubleshooting and backup.

See also: [architecture](./architecture.md) · [backend](./backend.md) · [database](./database.md) · [authentication](./authentication.md) · [ml_pipeline](./ml_pipeline.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §2.1 (local only), §2.8 (hardware), §3.2 (layout), §12 (validation).

Everything runs on the laptop. There is no container, no broker, no orchestrator, no managed database
and no remote service of any kind — by rule, not by omission (CLAUDE.md §2.1).

## Prerequisites

| Requirement | Version | Note |
| --- | --- | --- |
| macOS on Apple Silicon | 14+ | target envelope is a MacBook Air M5, 16 GB RAM, 512 GB SSD (§2.8) |
| Python | 3.11+ | `python3 --version` |
| Node.js | LTS 20+ | `node --version`; npm ships with it |
| PostgreSQL | 15+ | local server on `127.0.0.1:5432` |
| Free disk | budget by dataset size × 1 copy + models + logs | see the storage table below |

Intel Macs and Linux run the app and the tests; only `MPS` is unavailable there, and device resolution
reports `CPU` with a `fallback_reason` rather than failing (see [ml_pipeline](./ml_pipeline.md)). No
GPU is required to develop, because nothing trains until a dataset exists.

## One-time setup

```bash
# 1 — database and role
createuser -s medloop 2>/dev/null || true
createdb -O medloop medloop

# 2 — schema of record (idempotent; the only way the schema is created)
psql -U medloop -d medloop -f backend/migrations/sql/0001_init.sql

# 3 — configuration
cp .env.example .env
python3 -c "import secrets; print('MEDLOOP_SECRET_KEY=' + secrets.token_urlsafe(48))" >> .env
#   then edit .env: MEDLOOP_DB_URL, MEDLOOP_STORAGE_ROOT, MEDLOOP_ALLOWED_INGEST_ROOTS

# 4 — seed the prototype admin (hashes the password; refuses to run twice)
python3 scripts/seed_admin.py

# 5 — dependencies
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
```

| Step | Creates | Idempotent |
| --- | --- | --- |
| 1–2 | role `medloop`, database `medloop`, 15 tables + indexes + seed rows | yes |
| 3 | `.env` (gitignored); startup fails fast without `MEDLOOP_SECRET_KEY` | yes |
| 4 | one `ADMIN` user — hash only, never a password literal ([authentication](./authentication.md)) | yes, refuses |
| 5 | `.venv/`, `node_modules/` | yes |

## Running — three processes

```bash
# terminal 1 — API
cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# terminal 2 — training worker (polls training_jobs; no broker)
cd backend && python -m worker.main

# terminal 3 — frontend
cd frontend && npm run dev
```

| Target | Does |
| --- | --- |
| `make db` | applies `0001_init.sql` |
| `make seed` | seeds the admin user |
| `make api` / `make worker` / `make web` | the three commands above, one each |
| `make dev` | all three with prefixed output |
| `make verify` | `npm run typecheck && npm run lint`, `compileall`, `pytest -q`, `scripts/verify_invariants.py` |
| `make backup` | `pg_dump` + a storage-root archive (below) |

Order does not matter. The worker needs only the database; the API needs only the database; the
frontend needs the API unless `NEXT_PUBLIC_DATA_SOURCE=demo`, in which case it renders demo data behind
the mandatory banner and never calls the API (CLAUDE.md §10). Stopping the worker stops training
progress; it does not affect review work.

## Ports

| Port | Process | Bound to | Configured by |
| --- | --- | --- | --- |
| 3000 | `next dev` | `localhost` | Next.js default |
| 8000 | `uvicorn` | `127.0.0.1` | `MEDLOOP_API_HOST` / `MEDLOOP_API_PORT` |
| 5432 | PostgreSQL | `127.0.0.1` | `MEDLOOP_DB_URL` |

**Nothing binds to `0.0.0.0`.** `MEDLOOP_API_HOST` defaults to `127.0.0.1` and setting it to a public
interface is a rule violation, not a configuration choice: there is no authentication hardening,
no rate limiting and no TLS in this build ([authentication](./authentication.md)). CORS allows only the
two loopback origins in `MEDLOOP_CORS_ORIGINS`.

## Storage

`MEDLOOP_STORAGE_ROOT` is the one runtime root, gitignored in its entirety (CLAUDE.md §3.2).

```text
storage/
├── data/{train,validation,test,unused,validated,skipped}/   staging locations
├── annotations/          exported annotation artefacts
├── models/v1/ v2/ …      weights + digest + resolved config per version
├── training_batches/batch_001/ …   per-batch manifests
├── gradcam/              heat-map PNGs, one per (image, model version)
└── logs/                 structured API and worker logs
```

| Rule | Detail |
| --- | --- |
| One physical copy per image | splits and batch membership are database references, never file copies — the 512 GB budget depends on it |
| Containment | every served path is resolved with `realpath` and must sit inside the root (`core/paths.py`); an escape is `404`, not a read |
| Ingest paths | `POST /uploads` registers a path under `MEDLOOP_ALLOWED_INGEST_ROOTS`; an empty list means uploads are refused |
| Rough budget | images (one copy) + `~100 MB` per model version (illustrative, EfficientNet-B0 with optimiser state) + Grad-CAM PNGs + logs |
| Nothing committed | `storage/` never enters git, so a clone is code only |

## Apple MPS

| Point | Detail |
| --- | --- |
| Selection | `training_device` in `system_settings` (`AUTO` \| `MPS` \| `CPU`) — a database setting, not an env var (CLAUDE.md §8.1) |
| Fallback | `AUTO` resolves to `MPS` only when `torch.backends.mps.is_available()`; otherwise `CPU` with a recorded `fallback_reason` |
| Reported honestly | `training_jobs.device_used`, `ai_predictions.device` and `model_evaluations.device` store what actually ran |
| Unified memory | the GPU shares the 16 GB with the OS; close the dev server before a long run |
| Determinism | bit-wise reproducibility is **not** claimed on MPS; the seed makes the procedure repeatable, not the floats |
| Mixed precision | unverified on MPS — measure before enabling and record the result |

## Health check

```bash
curl -s http://127.0.0.1:8000/api/v1/health | python3 -m json.tool
```

`services[]` covers `frontend`, `api`, `database`, `ml_engine`, `storage`, `training_worker`. Each entry
reports what was actually probed; a dependency that could not be checked is `UNKNOWN`, never `ONLINE`.
`ml_engine` reporting no active model is the correct state today, not a fault.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Address already in use` on 8000 | a previous `uvicorn` is alive | `lsof -ti :8000 \| xargs kill`, or set `MEDLOOP_API_PORT` |
| `connection refused` to Postgres | server not running | start the local PostgreSQL service, then retry `psql -U medloop -d medloop -c 'select 1'` |
| `role "medloop" does not exist` | step 1 skipped | re-run `createuser` / `createdb` |
| API exits at startup | `MEDLOOP_SECRET_KEY` unset | add it to `.env`; the fail-fast is deliberate — a generated fallback would invalidate tokens on every restart |
| Everyone logged out after a restart | the secret key changed | tokens are signed with it; keep one value in `.env` |
| Device reports `CPU` with `MPS` requested | `torch.backends.mps.is_available()` is false | read `fallback_reason`; nothing is wrong, the run is honest |
| `409 MODEL_UNAVAILABLE` on inference or Grad-CAM | no `ACTIVE` model exists | expected: nothing has been trained ([model_versioning](./model_versioning.md)) |
| `501 DATASET_NOT_AVAILABLE` | a dataset-dependent capability | expected until Phase 4 ([dataset_workflow](./dataset_workflow.md)) |
| Dashboards show `—` everywhere | no data and no model | correct behaviour; a figure that cannot be computed is omitted, never sent as `0` |
| Browser blocks API calls | origin not in `MEDLOOP_CORS_ORIGINS` | add the exact loopback origin; do not widen to `*` |
| Worker never claims a job | worker not running, or a job is already live | check `GET /training/jobs`; one live job at a time is enforced by a partial unique index |
| `test_enum_parity` fails | `enums.py` and `domain.ts` drifted | add the member in both files (CLAUDE.md §4) |

## Backup

```bash
pg_dump -U medloop -Fc medloop > backups/medloop-$(date +%F).dump      # rows: the lineage
tar -czf backups/storage-$(date +%F).tgz storage/                       # artefacts: weights, CAMs, logs
```

Restore the dump first, then the archive — the database references paths inside the storage root, so
artefacts without rows are unattributable and rows without artefacts report a missing artefact. Take a
pair before locking a test split and before a promotion: both are one-way doors.

## After any change

```bash
cd frontend && npm run typecheck && npm run lint && npm run build
cd backend  && python -m compileall -q app worker && pytest -q
python3 scripts/verify_invariants.py
```

Run what applies to what you touched, and report anything you could not run (CLAUDE.md §12).
