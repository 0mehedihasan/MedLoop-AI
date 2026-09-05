# TASKS.md — MedLoop AI

> The only place progress is tracked. `.claude/CLAUDE.md` §0 step 4 sends every session here before
> it writes code, and step 7 sends it back afterwards.
>
> **Rules for this file.** A box is ticked only when the work was *verified*, and the verification is
> named beside it. A phase that cannot start says what it is waiting for. Nothing is ticked because it
> "should work". If you discover something, add it under §D — a finding that lives only in a chat
> reply is lost at the next compaction.

Last verified: **2026-09-05**.

---

## A. Blocked on a hand edit — `.claude/CLAUDE.md` contains four false statements

`.claude/` is not writable from the agent session (the editor refuses the path), so these have to be
corrected by hand. They matter more than a normal doc staleness bug: CLAUDE.md is read *first*, every
session, and three of the four tell the reader to refuse work that is now legitimate.

| § | What it says now | What is true on 2026-09-05 |
| --- | --- | --- |
| 2.2 | "**No real medical dataset has been supplied yet.**" and "When the real data arrives, follow the 11-step inspection procedure" | PAD-UFES-20 is in `Dataset/`, LFS-tracked, CC BY 4.0. The 11-step inspection **ran** read-only and every finding is in `docs/dataset_workflow.md`. The prohibitions still hold (do not re-download, do not modify/rename/delete the files, do not fabricate, do not train-and-claim) — but as standing rules, not as "until the data arrives". |
| 5 | "**Status: no real dataset supplied. Phase 4 onward is `BLOCKED`.**" and the table note "*not verified against files*" | Phase 4 is unblocked and is the next implementation gate. The PAD-UFES-20 row is now measured: 2,298 images, 1,373 patients, 1,891 real lesions, 6 classes, all decode. ISIC and PH2 are still planning references only. |
| 5 | "Confirm them against the real files at inspection time and flip the flag then." | Confirmed: all six codes (`ACK`, `BCC`, `MEL`, `NEV`, `SCC`, `SEK`) exist in the data and there is no seventh. `verified_against_data` stays `false` only because no database exists to hold the row. |
| 15 | "Backend \| FastAPI + schema + services + auth foundation" | `backend/` is an **empty directory**. Nothing has been written. `git ls-files backend` returns nothing. |

§15's dataset row and "Next action for a new session" paragraph follow from the first two rows.

`docs/development_roadmap.md` carried the same errors and **was corrected on 2026-09-05** — it is
writable. Use it as the wording reference when editing CLAUDE.md. What changed there: the overview
table (phase 1 → partly, phase 3 → not started, phase 4 → unblocked, phases 5 and 8 → blocked by 3
*and* 4), the "current position" diagram and its prose, a "where it actually stands" line under each of
phases 1–4, the critical-path diagram now headed by phase 3, and "what can be done today" — which said
"without a single image file" and now says the backend is the constraint.


---

## B. Phases

Phase numbering and exit criteria are defined in
[docs/development_roadmap.md](docs/development_roadmap.md). This is the checklist; that is the
contract. If they disagree, the roadmap wins and this file is wrong.

### 1 · Foundation — complete

- [x] `.claude/CLAUDE.md` — the source of truth (§A lists four statements in it that are now stale)
- [x] `.claude/skills/` — all eleven skills named in §13 exist
- [x] `docs/` — all fourteen reference files exist, including `api_contract.md`
- [x] `frontend/types/domain.ts` — the shared vocabulary, TypeScript half
- [ ] `backend/app/core/enums.py` — the Python half. **Not written.** Blocks the parity test.
- [ ] `backend/tests/test_enum_parity.py` — must land in the same commit as `enums.py`
- [ ] `backend/migrations/sql/0001_init.sql` — the schema of record. **Not written.**
- [x] `scripts/verify_invariants.py` — seven rules, stdlib only. Verified: exits 0 on this tree
      (6 PASS, 1 SKIP — the parity rule has no Python file to read yet), and every rule was checked
      against a deliberately broken copy of the tree in `/tmp`, one violation at a time, with the
      copy restored to green between each. The parity rule was additionally checked in the *positive*
      direction: a faithfully mirrored `enums.py` generated from `domain.ts` (18 enums, 83 members)
      makes it PASS, so it is not a rule that only ever fails.

- [ ] `scripts/reconcile_hitl_counter.py` — deferred to phase 3 on purpose: it is a query against
      `review_sessions` and `system_settings`, and writing it before the migration exists would be
      writing it against a schema nobody has committed to

### 2 · Frontend — complete

- [x] Shell, navigation, login, `not-found`, `error` — routes declared once in `lib/navigation.ts`
- [x] Thirteen route pages under `app/`, three primary nav areas, Review Data nested inside Data &
      Admin (§11.1)
- [x] `components/ui/` — 21 primitives; `components/charts/` — six hand-rolled SVG charts, each
      carrying its numbers as a real `<table>`
- [x] Annotation canvas — SVG + pointer events, normalised `[0,1]` geometry, keyboard paths
- [x] Seven feature areas: `analyze`, `datasets`, `logs`, `review`, `statistics`, `training`,
      `uploads`
- [x] Loading / empty / error / populated on every data surface
- [x] Demo data under §10 — nine `lib/demo/demo-*.ts` fixtures, `DEMO DATA` banners, `DemoBadge` on
      every surface that renders one, `SYNTHETIC` watermark on the two layout previews
- [x] Verified: `tsc --noEmit` clean, `eslint .` clean (both run from `frontend/`)
- [ ] `next build` — **not run in this session.** The installed SWC binary is `darwin-arm64`; the
      agent sandbox is Linux. Run it on the Mac before trusting the production build.

### 3 · Backend — NOT STARTED, and the roadmap used to claim otherwise

`backend/` is an empty directory. This is the next thing to build, and it is not blocked by anything:
every endpoint below either needs no image data or is specified to *refuse* until there is some.

- [ ] `app/core/` — `config.py`, `enums.py`, `errors.py` (`MedLoopError` hierarchy), `security.py`
      with the `PasswordHasher` protocol and the stdlib PBKDF2 default (§11.3)
- [ ] `migrations/sql/0001_init.sql` — fifteen tables (§7), the partial unique index that keeps one
      `ACTIVE` model, the partial unique index that keeps one open training batch, and the two
      columns the duplicate policy needs: `images.duplicate_group_id` and `images.label_conflict`
- [ ] `app/models/` — SQLAlchemy 2.0 typed ORM mirroring the SQL exactly, same commit
- [ ] `app/repositories/` — all database access, no business rules
- [ ] `app/services/` — the transition guards (§4.2), `settings_service`, `hitl_service` with the
      advisory lock, `promotion_service` with the §9 arithmetic
- [ ] `app/api/` — one thin router per file; the shapes are already fixed by `docs/api_contract.md`
      and by what `frontend/lib/api.ts` calls
- [ ] `app/main.py` — one exception handler mapping `MedLoopError` → status; routes never raise
      `HTTPException` for a domain problem
- [ ] `tests/` — `test_enum_parity.py` first; then services against fake repositories (threshold
      arithmetic, promotion arithmetic on synthetic metric inputs, guards, roles, error mapping)
- [ ] `worker/` — the DB-polling training worker skeleton: `QUEUED → RUNNING → EVALUATING →
      COMPLETED | FAILED | CANCELLED`, never imported by a request handler
- [ ] Verified with `python -m compileall -q app worker` and `pytest -q`

Contract note: the frontend is already written against these endpoints, so `docs/api_contract.md` and
`frontend/lib/api.ts` together are the specification. Read both before inventing a response shape.

### 4 · Dataset integration — UNBLOCKED, the gate

The data is here and inspected. What is missing is the code that turns files into rows.

- [x] The 11-step read-only inspection — every finding and its producing command is in
      `docs/dataset_workflow.md`. **Do not re-measure. Read that file.**
- [ ] `disease_labels` seeded from the six observed codes, `verified_against_data = true` (the
      evidence exists; the row does not, because the database does not)
- [ ] Ingestion writing `images` rows: `PAT_<patient>_<lesion>_<n>.png` parsed, dimensions and colour
      mode recorded per file, `(patient_id, lesion_id)` as the lesion key — never `lesion_id` alone
- [ ] `duplicate_group_id` + `label_conflict` populated for the 15 byte-identical groups; the 12
      contradictory ones excluded from `TEST` only, published labels kept, nothing "fixed"
- [ ] The recorded split applied at ingestion: stratify each patient by their rarest class, order by
      `sha256(f"{seed}:{patient_id}")`, **seed `20260905`**, 70/15/15 → 1,611/328/359
- [ ] `TEST` locked; the dataset version stamped; the pre-flight checklist in
      `docs/dataset_workflow.md` fully ticked

### 5–12 · Downstream — blocked by 3 and 4, not by data

Exit criteria for each are in the roadmap; they are not repeated here. What `ml/` already has, and
what it deliberately does not:

- [x] `ml/runtime/device.py` — MPS with CPU fallback, and it reports the device the forward pass
      *actually* ran on rather than the configured one (§2.3)
- [x] `ml/runtime/seeding.py`, `ml/training/hyperparameters.py`, `ml/evaluation/metrics_types.py`,
      `ml/localization/geometry.py`, `ml/errors.py`
- [x] `ml/classification/`, `ml/inference/`, `ml/preprocessing/`, `ml/xai/` exist as packages with
      **no implementation** — that is the honest state, not an oversight
- [ ] 5 Baseline ML · 6 Inference · 7 XAI and localisation · 8 Annotation on real data · 9 HITL cycle
      · 10 Retraining and promotion · 11 Analytics · 12 Research

Two things must stay true through all of them: no number reaches a screen unless this build computed
it, and `GET /images/{id}/gradcam` answers `404` until a real heat-map artefact exists — never a
synthesised image.

---

## C. Discovered — things found while building, kept here so they are not rediscovered

1. **Every `Dataset/` file reads as modified in a sandbox without Git LFS.** `git status` shows
   ` M` on all 2,283 LFS objects because `HEAD` holds pointer text, the working tree holds real PNG
   bytes, and with no `git-lfs` binary the clean filter cannot convert one to the other. It is clean
   on the Mac. **Never run `git add -A` or `git commit -a` from an environment without git-lfs** — it
   would commit 3.3 GiB of raw PNGs as ordinary blobs.
2. **LFS bandwidth is over quota by design.** 2,283 objects ≈ 3.326 GiB against a 1 GiB monthly
   allowance, so a single fresh `git clone` exceeds it. Anyone cloning should expect to fetch the
   images another way, or pay for the pack.
3. **`react-hooks/exhaustive-deps` cannot see stability through a member expression.** `useApiQuery`
   and `useApiAction` return fresh object literals each render while `refetch` / `run` / `reset` keep
   stable `useCallback` identities. Destructure at the call site
   (`const { refetch: refetchModels } = modelsQuery;`) so the dependency array holds plain
   identifiers. Passing the whole object rebuilds every handler on every render.
4. **A Tailwind alpha modifier outside the *configured* opacity scale compiles to nothing, silently.**
   `fill-annotation-human/12` type-checked, linted and shipped an opaque black annotation over the
   lesion. `tailwind.config.ts` now extends the scale with `8`, `12`, `18`;
   `scripts/verify_invariants.py` reads that config rather than assuming the default scale, so the
   three real steps are not flagged.
5. **The `z-*` canvas scale names layer order but cannot be applied inside an `<svg>`.** SVG paints in
   document order. The tokens document intent; the ordering is done by element sequence.
6. **`next build` cannot run in the agent sandbox.** The installed SWC binary is `darwin-arm64`.
   `tsc --noEmit` and `eslint .` both run there, so the gap is the production bundle only.
7. **The §2.6 threshold rule missed camelCase, and the broken-copy test is what found it.** The word
   pattern was `validated_since`, so `validatedSinceLastTraining >= 1000` — the exact shape a frontend
   helper would take — passed. Fixed by matching against the line with `_` removed and case folded,
   against `validatedsince`. A rule can look right, exit 0 on a clean tree, and still be blind; only
   feeding it a real violation shows which.
8. **A verifier that greps for a pattern will eventually flag the file that documents the pattern.**
   `verify_invariants.py` reported its own docstring, because `strip_comment` truncates at `//` and `#`
   but knows nothing about a Python triple-quoted string, so prose inside one reads as code.
   `scripts/verify_invariants.py` is now in the threshold rule's exemption list for the same reason
   `.claude/` and `docs/` are. Related: writing `"""` inside a docstring closes it — that cost one
   `SyntaxError`.


---

## D. Validation — what to run, and where it can run

```bash
# Repo-wide invariants (§2 guard). No network, no database, no node_modules. Runs anywhere.
python3 scripts/verify_invariants.py

# Frontend
cd frontend && npm run typecheck && npm run lint     # both run in the agent sandbox
cd frontend && npm run build                         # macOS only — darwin-arm64 SWC binary

# Backend (once phase 3 exists)
cd backend && python -m compileall -q app worker && pytest -q
```

`verify_invariants.py` is the guard against §2 quietly eroding. Its seven rules fail on: a hard-coded
HITL threshold literal outside the settings defaults, the docs and this script itself; a forbidden cloud
SDK, telemetry package or hostname — in an import specifier, a URL literal, `package.json`, or
`backend/requirements*.txt`; drift between `enums.py` and `domain.ts` in either direction; a
`lib/demo/*.ts` file that is misnamed, missing its `DEMO DATA` banner in the first eight lines, or
exporting nothing marked `isDemo: true`; a demo import from anywhere outside `app/**`, `features/**` and
`lib/demo/**`; a Tailwind alpha modifier outside the scale `tailwind.config.ts` actually configures; and
a `docs/` or `.claude/skills/` file that CLAUDE.md names but which does not exist. Run it before every
commit — it is fast and it needs nothing installed. A `SKIP` line is a rule whose subject does not exist
yet and says what would make it run; it is not a pass.


---

## E. Next action

Phase 3. Write the backend, starting with `backend/app/core/enums.py` and
`backend/tests/test_enum_parity.py` in one commit, then `0001_init.sql`. The frontend already calls
these endpoints, so `docs/api_contract.md` and `frontend/lib/api.ts` are the specification — read both
before choosing a response shape. Phase 4 can start in parallel the moment the schema exists.

Correct the four statements in §A by hand while you are there.




