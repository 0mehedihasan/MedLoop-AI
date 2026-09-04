# Dataset workflow

Scope: the state of the dataset (there is none), the inspection procedure to run when one arrives, and
the empty findings tables that procedure fills in.

See also: [ml_pipeline](./ml_pipeline.md) · [database](./database.md) · [development_roadmap](./development_roadmap.md) · [research_protocol](./research_protocol.md) · [api_contract](./api_contract.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §2.2 (dataset first), §5 (dataset rules), §2.3 (never fabricate).

## Status — NO DATASET IS PRESENT

**No image file has been supplied, inspected, counted or loaded.** Every findings table below is empty
on purpose. This file is the recorded destination for the inspection results (CLAUDE.md §5): filling
it in is what unblocks Phase 4 onward, and nothing downstream may be written before it is filled.

The datasets named in the project brief — PAD-UFES-20 (initial), ISIC (HITL expansion), PH2 (optional
benchmark) — are *plans*. Nothing about them has been verified against files on this machine.

## Never assume

| Unknown | Why it blocks code |
| --- | --- |
| Directory layout | the loader's path walk and the `images.file_path` convention |
| Filenames | any id parsed out of a name; whether a name encodes patient or lesion |
| Extensions | decoder choice; whether `.png`, `.jpg`, `.bmp` or mixed |
| Image count | batch size, epoch length, memory budget, split arithmetic |
| Dimensions and aspect ratios | resize/crop policy; whether 224 px distorts or discards |
| Class names and count | the model head width and `disease_labels` rows |
| Metadata columns | what can be a feature, what is only provenance |
| Patient / lesion identifiers | whether a leakage-free split is even possible |
| Annotation formats | whether any human region exists for the localisation metric |
| Pre-existing splits | whether the authors' split must be honoured for comparability |

A guess in any row above produces code that runs, looks correct, and measures the wrong thing.

## Inspection procedure

Eleven steps, run once, in order, on a **copy** kept outside the repository. Record every result in the
tables below in the same session — an unrecorded observation is an assumption tomorrow.

| # | Step | Approach | Records into |
| --- | --- | --- | --- |
| 1 | Locate and freeze the source | copy to a path under `MEDLOOP_ALLOWED_INGEST_ROOTS`, note the byte size, never edit in place | Source |
| 2 | Directory inventory | `find <root> -maxdepth 3 -type d` + per-directory file counts | Directory inventory |
| 3 | Extension census | `find <root> -type f | sed 's/.*\.//' | sort | uniq -c` | Extensions |
| 4 | File and image count | count decodable files; count failures separately | Counts |
| 5 | Dimension distribution | PIL `Image.open(p).size` over every file; min/median/max, aspect ratios | Dimensions |
| 6 | Metadata inspection | read the CSV/XLSX header; one row per column with dtype, null rate, cardinality | Metadata columns |
| 7 | Class distribution | value counts of the label column; map to codes only after this | Class distribution |
| 8 | Identifier analysis | candidate patient/lesion columns; images per patient; do names agree with metadata | Identifiers |
| 9 | Duplicate detection | `sha256` per file; group identical digests; note near-duplicates separately | Duplicates |
| 10 | Existing splits | any split column, folder or manifest shipped by the authors | Existing splits |
| 11 | Annotation availability | masks, boxes or none; format; how many images are covered | Annotations |

## Findings — all empty

`—` means **not observed**. It never means zero, none or absent.

### Source

| Field | Value |
| --- | --- |
| Dataset name / release | — |
| Obtained from | — |
| Licence and use terms | — |
| Local path (outside the repo) | — |
| Total bytes | — |
| Inspected on / by | — |

### Directory inventory

| Path (relative to root) | Kind | Files | Notes |
| --- | --- | --- | --- |
| — | — | — | — |

### Extensions

| Extension | Files | Decodable | Notes |
| --- | --- | --- | --- |
| — | — | — | — |

### Counts

| Figure | Value |
| --- | --- |
| Files found | — |
| Images decodable | — |
| Decode failures | — |
| Non-image files | — |

### Dimensions

| Statistic | Width | Height | Notes |
| --- | --- | --- | --- |
| min | — | — | — |
| median | — | — | — |
| max | — | — | — |
| distinct aspect ratios | — | — | — |

Until this table is filled, the `input_size = 224` default is an unjustified choice, not a decision:
whether it downsamples detail or upsamples noise is exactly what the dimension distribution answers.

### Metadata columns

| Column | dtype | Null rate | Distinct | Role (identifier / label / clinical / provenance) |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

### Class distribution

| Class as written in the data | Count | Share | Mapped `disease_labels.code` |
| --- | --- | --- | --- |
| — | — | — | — |

The six codes seeded by the migration are `ACK`, `BCC`, `MEL`, `NEV`, `SCC`, `SEK`, all with
`verified_against_data = false`. They are configuration rows, not an enum, and this table is the
evidence that flips the flag — or that renames them.

### Identifiers

| Question | Answer |
| --- | --- |
| Patient identifier column | — |
| Lesion identifier column | — |
| Patients | — |
| Images per patient (min / median / max) | — |
| Lesions per patient | — |
| Identifier also encoded in filenames | — |
| Metadata and filenames agree | — |

### Duplicates

| Figure | Value |
| --- | --- |
| Distinct `sha256` digests | — |
| Byte-identical groups | — |
| Images inside duplicate groups | — |
| Cross-class duplicates (contradictory labels) | — |
| Near-duplicate policy applied | — |

### Existing splits

| Field | Value |
| --- | --- |
| Split shipped by the authors | — |
| Form (column / folders / manifest) | — |
| Sizes per split | — |
| Patient-disjoint as shipped | — |
| Decision: honour or re-split | — |

### Annotations shipped with the data

| Field | Value |
| --- | --- |
| Regions available | — |
| Format (mask / box / polygon) | — |
| Images covered | — |
| Coordinate convention in the source | — |
| Convertible to normalised `[0,1]` | — |

## From files to rows

Registration is a *path* registration: no bytes stream through the API and nothing is copied
(CLAUDE.md §2.7).

```text
POST /uploads {dataset_name, image_directory, metadata_file?, annotation_file?}
      │   server checks the path is inside MEDLOOP_ALLOWED_INGEST_ROOTS, exists, is readable
      ▼
POST /datasets            ──▶ datasets row
POST /datasets/{id}/versions ──▶ dataset_versions row (label, note)
      │
      ▼   one images row per file: file_path relative to the storage root, file_sha256,
          original_width/height, split = UNASSIGNED, lifecycle = STAGING
POST /dataset-versions/{id}/assign  {assignments: [{split, image_ids}]}
      ▼
POST /dataset-versions/{id}/lock-test  {confirm: true}   ── one-way door
```

`POST /uploads` answers today with `inspection = {"state": "BLOCKED", "reason":
"DATASET_NOT_AVAILABLE"}`: it records the intent and refuses to guess the structure. The row-creating
step above is Phase 4 work and does not exist yet.

## Split design

| Rule | Detail |
| --- | --- |
| Patient level | when a patient identifier exists, all of a patient's images go to one split; lesion grouping applies *within* a patient (CLAUDE.md §5) |
| Deterministic | assignment is a stable hash of `group_key` (patient, else lesion, else image id) — re-running assigns identically |
| No identifier | the split is image-level and the leakage risk is recorded as a limitation, not silently ignored |
| Test is locked | `POST /dataset-versions/{id}/lock-test` freezes it; every later mutation is `409 DATASET_LOCKED` |
| Test is invisible to review | `TEST` images never enter the review queue, so no human can annotate the yardstick |
| HITL growth | new validated work becomes `TRAIN` material through batches; the test split never grows |
| Proportions | proposed 70 / 15 / 15 (illustrative) — final ratios wait on the class distribution above |

Rare classes decide the design: if a class has too few patients to appear in all three splits, the
choice is to merge, drop or report it separately — and it is recorded here before training, not after
the metric looks bad.

## Label space

The label space is a table, not code: `disease_labels` rows carry `code`, `name`, `is_active`,
`display_order`, `verified_against_data`. The model head width and the annotation UI both read it, so
a rename is a data change and a class count change is a retraining decision — never an edit to an enum
in two languages (CLAUDE.md §5).

| Action | Effect |
| --- | --- |
| Confirm a seeded code against the data | set `verified_against_data = true`; nothing else moves |
| Class in the data with no row | add a row before any training run; it cannot be inferred at load time |
| Seeded code absent from the data | set `is_active = false`; keep the row so old references still resolve |
| Class count changes after a model exists | the old model's `label_space` is frozen in its row; a new count means a new version, not a reload |

## Pre-flight checklist — all unticked

- [ ] Every findings table above is filled with observed values
- [ ] `verified_against_data` is `true` for every active label code
- [ ] Duplicate policy decided and applied; contradictory-label duplicates resolved
- [ ] Patient-level split assigned and verified disjoint across `TRAIN` / `VALIDATION` / `TEST`
- [ ] `TEST` split locked, with the reason recorded
- [ ] `original_width` / `original_height` populated for every image row
- [ ] Resize and augmentation policy justified by the dimension and class tables
- [ ] `scripts/verify_invariants.py` passes and the counts in `GET /dataset-versions/{id}` match the files

Nothing in Phase 5 onward starts before the last box is ticked — see
[development_roadmap](./development_roadmap.md).
