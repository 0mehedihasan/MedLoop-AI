# Development roadmap

Scope: the twelve phases, what gates each one, and where the project currently stands.

See also: [dataset_workflow](./dataset_workflow.md) · [ml_pipeline](./ml_pipeline.md) · [hitl_workflow](./hitl_workflow.md) · [model_versioning](./model_versioning.md) · [research_protocol](./research_protocol.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §0 (session protocol), §2.2 (dataset first), §5, §15 (current state).

Progress ticks live in `TASKS.md` — the only place progress is tracked (CLAUDE.md §3.2). This file
describes the phases and the gates between them; it does not duplicate the checklist.

## Overview

| # | Phase | Status | Gate to leave it |
| --- | --- | --- | --- |
| 1 | Foundation — contracts, docs, enums, layout | complete | contracts and enum parity in place |
| 2 | Frontend — shell, routes, primitives, canvas, demo data | complete | four states on every surface; demo rules honoured |
| 3 | Backend — schema, services, auth, dataset-independent endpoints | complete | `pytest -q` and `verify_invariants.py` green |
| 4 | **Dataset integration** | **BLOCKED — no dataset** | every findings table in `dataset_workflow.md` filled |
| 5 | Baseline ML — loaders, head, training loop, V1 | BLOCKED by 4 | a V1 row + an evaluation on the locked test set |
| 6 | Inference — predictions on real images | BLOCKED by 5 | one `ai_predictions` row per reviewed image, honest device |
| 7 | XAI — Grad-CAM and coarse localisation | BLOCKED by 5 | a real heat-map artefact and a derived box, or `None` |
| 8 | Human annotation on real data | BLOCKED by 4 | review sessions and annotations on actual images |
| 9 | HITL cycle — counter, threshold, batches | BLOCKED by 8 | batch 001 cut from real validated samples |
| 10 | Retraining — worker cycles, candidates, promotion | BLOCKED by 9 | V2 evaluated on the same locked test set, decision audited |
| 11 | Analytics — statistics from real rows | BLOCKED by 9 | every KPI sourced from the database, none omitted silently |
| 12 | Research — RQ1–RQ5 write-up | BLOCKED by 10 | result tables in `research_protocol.md` filled from computed metrics |

Phases 1–3 are recorded as complete in CLAUDE.md §15: a UI foundation, a schema, services, auth, and
the seams under `ml/`. Phases 4–12 are `BLOCKED`, and **all of them wait on the same thing**.

## Current position

```text
 1 ──▶ 2 ──▶ 3 ──▶ ▉ 4 DATASET ▉ ──▶ 5 ──▶ 6 ──▶ 7
                        │                      │
                        └──▶ 8 ──▶ 9 ──▶ 10 ──▶ 11 ──▶ 12
                    ▲
                    └─ you are here: waiting on real image files
```

The blocker is not effort, tooling or design — it is the absence of data. Nothing downstream may be
implemented from assumptions about filenames, class names, dimensions or splits (CLAUDE.md §2.2, §5).

## Phases

### 1 · Foundation — complete

- **Goal** one recorded set of rules, one contract, one vocabulary: `.claude/CLAUDE.md`,
  `docs/api_contract.md`, the enum pair, the repository layout, `0001_init.sql`.
- **Entry** none.
- **Exit** enums byte-identical in both languages, every doc referenced from CLAUDE.md exists,
  `scripts/verify_invariants.py` passes.

### 2 · Frontend — complete

- **Goal** the whole UI surface: shell, navigation, the twelve routes, primitives, SVG charts, the
  annotation canvas, and demo data under CLAUDE.md §10.
- **Entry** phase 1 contracts.
- **Exit** loading / empty / error / populated on every data surface; `MODEL_UNAVAILABLE` hides the
  prediction panel; `DemoBadge` on every demo surface; typecheck, lint and build clean.

### 3 · Backend — complete

- **Goal** FastAPI app, schema, repositories, services, auth, audit, and every endpoint that does not
  need image data — including the ones that deliberately refuse.
- **Entry** phase 1 contracts.
- **Exit** `compileall` + `pytest -q` green; dataset-dependent routes answer
  `DATASET_NOT_AVAILABLE` / `MODEL_UNAVAILABLE` rather than a placeholder.

### 4 · Dataset integration — BLOCKED, the gate

- **Goal** turn real files into `images` rows with verified labels, dimensions, identifiers and splits.
- **Entry** image files present on the machine, under `MEDLOOP_ALLOWED_INGEST_ROOTS`.
- **Exit** every findings table in [dataset_workflow](./dataset_workflow.md) filled from observation;
  `verified_against_data = true` for the active label codes; patient-disjoint splits assigned;
  `TEST` locked; the pre-flight checklist fully ticked.
- **Depends on** nothing but the data. **Blocks** 5–12.

### 5 · Baseline ML — BLOCKED by 4

- **Goal** loaders, transforms, augmentation, the head bound to the DB label space, the training loop,
  and V1 trained on `TRAIN`.
- **Entry** phase 4 exit, plus a resize/augmentation policy justified by the dimension table.
- **Exit** a `models` row with `hyperparameters`, `loss_history`, artefact and digest; one
  `model_evaluations` row on the locked `TEST` version; V1 `ACTIVE`.

### 6 · Inference — BLOCKED by 5

- **Goal** `POST /predictions/{image_id}/run` produces real predictions; `ReviewItem.ai_prediction`
  stops being `null`.
- **Entry** an `ACTIVE` model whose artefact digest verifies.
- **Exit** one immutable `ai_predictions` row per `(image, model)` with the full probability vector and
  the device that actually ran; re-running under a new version adds a row instead of replacing one.

### 7 · XAI and localisation — BLOCKED by 5

- **Goal** Grad-CAM on the target class, then threshold → largest region → padded hull → `BoxNorm`.
- **Entry** a trained model and a chosen `target_layer`.
- **Exit** a real heat-map artefact under `storage/gradcam/`, `cam_min`/`cam_max` recorded,
  `threshold_used` published beside the box, and `box = None` rendered as *not computable* when no
  region survives. Until then `GET /images/{id}/gradcam` stays `404` — never a synthesised image.

### 8 · Human annotation on real data — BLOCKED by 4

- **Goal** the canvas working against real images: claim, draw, label, submit, skip.
- **Entry** phase 4 exit. Independent of 5–7 — annotation does not need a model, which is what lets
  the first HITL pool fill while training work is still blocked.
- **Exit** `review_sessions` and `annotations` rows on real images, normalised geometry validated
  server-side, `TEST` images provably absent from the queue.

### 9 · HITL cycle — BLOCKED by 8

- **Goal** the counter, the threshold read from settings, the advisory lock, batch creation.
- **Entry** validated samples accumulating from phase 8.
- **Exit** batch 001 cut from real validated samples with `threshold_at_creation` recorded, member
  images `TRAINING_USED`, counter reset, `HITL_BATCH_CREATED` audited, and
  `scripts/reconcile_hitl_counter.py` reporting a zero delta.

### 10 · Retraining and promotion — BLOCKED by 9

- **Goal** the worker trains from a batch, registers a `CANDIDATE`, evaluates it, and an admin decides.
- **Entry** batch 001 and a V1 to compare against.
- **Exit** V2 evaluated on the **same** locked test version; the promotion criterion computed from
  settings; `MODEL_PROMOTED` or `MODEL_REJECTED` audited with the delta; exactly one `ACTIVE` model.

### 11 · Analytics — BLOCKED by 9

- **Goal** dashboards and statistics computed from real rows.
- **Entry** review sessions, predictions and evaluations that exist.
- **Exit** every KPI traceable to a query; `"source": "database"`; a figure that cannot be computed is
  omitted rather than sent as `0`; demo data removed under `NEXT_PUBLIC_DATA_SOURCE=api`.

### 12 · Research — BLOCKED by 10

- **Goal** answer RQ1–RQ5 from computed metrics across V1 → V4.
- **Entry** at least two comparable versions on one locked test set.
- **Exit** the result templates in [research_protocol](./research_protocol.md) filled with computed
  numbers, denominators and thresholds; threats to validity recorded; negative results reported.

## Critical path

```text
4 DATASET ──▶ 5 BASELINE ──┐
     │                     ├──▶ 10 RETRAINING ──▶ 12 RESEARCH
     └──▶ 8 ANNOTATION ──▶ 9 HITL ──┘
                                 └──▶ 11 ANALYTICS
6 INFERENCE and 7 XAI hang off 5 and are not on the path to the first comparison.
```

Phase 8 is the one long pole that can start the moment phase 4 lands, because annotation needs no
model. Phases 6 and 7 make the review screen richer and are required for RQ2/RQ3, but V2 can exist
without them.

## What can be done today

Without a single image file:

- Service-level unit tests with fake repositories: threshold logic, promotion arithmetic on synthetic
  metric inputs, transition guards, role guards, pagination, error mapping.
- Geometry validation and the normalised ↔ screen transforms — pure functions, fully testable.
- Enum parity, path containment, the counter-reconciliation query, `verify_invariants.py` rules.
- Accessibility and keyboard passes over the canvas and tables.
- Adopting Alembic **before** the first real dataset load, as recorded in CLAUDE.md §11.5.

What must not be done: fabricating a dataset to unblock a loader, shipping a placeholder heat-map,
seeding a metric so a chart renders, or hard-coding a threshold to skip a settings read.

## Definition of done — every phase

- [ ] `api_contract.md` updated in the same commit as any boundary change
- [ ] Tests written beside the layer they cover, and passing
- [ ] `npm run typecheck && npm run lint && npm run build` for frontend changes
- [ ] `python -m compileall -q app worker && pytest -q` for backend changes
- [ ] `python3 scripts/verify_invariants.py` green
- [ ] `docs/` updated where behaviour changed; no doc left contradicting the code
- [ ] `TASKS.md` ticked, with anything newly discovered added
- [ ] No fabricated value anywhere: unknown renders as `—`, unavailable capabilities return their code
- [ ] No new dependency without a recorded reason (CLAUDE.md §11.4, §11.5)

Anything that could not be run is reported rather than assumed passing (CLAUDE.md §12).
