# MedLoop AI — Dataset handling

Read this when: **before** writing one line of dataset-dependent code. This file owns the inspection
procedure referenced by `CLAUDE.md §2.2` and `§5`.

## The inspection-first rule

> **No real medical dataset has been supplied.** Nothing that depends on dataset structure may be
> written, and no dataset may be downloaded, until the real files are on this machine and have been
> inspected by the procedure below.

| Never | Instead |
| --- | --- |
| download PAD-UFES-20 / ISIC / PH2 | wait for the files; the user supplies them locally (`§2.1`) |
| write a loader "for the expected layout" | raise `DatasetNotAvailableError` and stop (`medloop-ml.md`) |
| invent filenames, classes, columns, counts | record `UNKNOWN` in `docs/dataset_workflow.md` |
| train, evaluate or produce a metric | `TASKS.md` Phase 4+ stays `BLOCKED` |
| present mock predictions as AI output | demo rules `§10`, badge and all |

## Do not assume — the explicit list

Filenames · file extensions · case sensitivity · directory layout · nesting depth · image count ·
image dimensions · aspect ratios · colour mode (RGB / RGBA / grayscale / CMYK) · bit depth · EXIF
orientation · compression artefacts · duplicate images · class names · class codes · class balance ·
label location (CSV column vs directory name vs filename) · metadata file format · metadata column
names, types, units, missing-value markers · patient identifiers · lesion identifiers ·
images-per-patient · pre-existing splits · provided masks or boxes · annotation format ·
train/test leakage in the source · character encoding · locale-formatted numbers.

Every one of these is a *finding*, recorded with evidence. `~2,298 images, ~1,373 patients, 6 classes`
from the brief is a **planning reference, not a fact** (`§5`).

## The 11-step procedure

```text
1 inspect ─► 2 inventory ─► 3 validate ─► 4 duplicates ─► 5 classes ─► 6 metadata
     ─► 7 patient relationships ─► 8 annotation availability ─► 9 split design
     ─► 10 document ─► 11 implement
```

All of 1–8 are **read-only**: no renaming, moving, converting, deleting or writing inside the source
directory. Findings go to `docs/dataset_workflow.md`, one section per step, each with the command
that produced it so the next session can re-run it.

| # | Step | Answers | Record in `docs/dataset_workflow.md` |
| --- | --- | --- | --- |
| 1 | **Inspect** | what is actually on disk: root path, tree depth, file types, sibling files (CSV/JSON/XML/README/LICENSE) | the real tree (depth-limited), the absolute root, the licence and any usage terms |
| 2 | **Inventory** | how many images, which extensions, total bytes, per-directory counts | exact counts per extension and directory; total size vs the 512 GB budget |
| 3 | **Validate** | which files actually decode; dimensions, colour mode, bit depth, EXIF orientation | dimension histogram, mode counts, the list of unreadable/corrupt files (do not delete them) |
| 4 | **Duplicates** | exact duplicates (content hash) and suspected near-duplicates | hash-collision groups, the near-dup method + threshold, and a decision per group |
| 5 | **Classes** | label vocabulary as it exists in the data, counts, imbalance ratio, rare classes | code → count table, min/max ratio, whether codes match the seeded label space |
| 6 | **Metadata** | every column: name, dtype, unit, missing-value marker, cardinality, whether the label lives here | column inventory with missingness per column; join key to images |
| 7 | **Patient relationships** | do patient / lesion identifiers exist? images per patient, lesions per patient | identifier column names, distribution of images per patient, whether IDs are unique across the set |
| 8 | **Annotation availability** | are masks/boxes provided, in what format, for how many images | coverage (`n` annotated / `n` total), format, coordinate convention and origin |
| 9 | **Split design** | proportions, grouping unit, stratification, seed, which version gets locked | the exact split rule, the seed, resulting per-class counts per split |
| 10 | **Document** | is every unknown now either answered or explicitly still unknown? | flip `disease_labels.verified_against_data` for codes confirmed; list remaining unknowns |
| 11 | **Implement** | only now: loaders, transforms, label mapping, splitting, training | link the commits/PR to the findings that justify each choice |

Step 3 detail worth writing down: EXIF orientation is the classic silent corrupter — a viewer shows
the image rotated, the tensor is not. Decide once (respect EXIF or strip it), apply the same decision
at training and inference, and record it with the model's transform metadata.

Step 4 detail: duplicates matter twice over — once as leakage across splits, once as inflated
per-class counts. Record the decision (drop, keep-one, keep-all-in-one-split) per group; never
silently de-duplicate.

## Patient-level splitting

```text
WRONG                                   RIGHT
patient P17: img_a ─► TRAIN             patient P17: img_a, img_b, img_c ─► TRAIN  (whole patient)
             img_b ─► TEST              patient P18: img_d, img_e        ─► TEST
             img_c ─► TRAIN
   ⇒ the model has seen this
     patient's skin, lighting,
     camera and lesion already
     ⇒ test scores are inflated
```

- Grouping unit is the **patient** where a patient identifier exists; lesion-level grouping applies
  *within* a patient, never across (`§5`).
- Stratify by class **subject to** the grouping constraint — group first, then balance; a
  class-perfect split that straddles patients is worthless.
- The split is computed once from a recorded seed and stored as `images.split` on a
  `dataset_versions` row. It is never recomputed per run (`medloop-ml.md`).
- Leakage is unrecoverable after the fact: every V1…Vn comparison rests on the locked test set
  (`§2.5`), so a contaminated test set invalidates the whole research claim, not just one number.
- Lock the test set explicitly (`POST /dataset-versions/{id}/lock-test`, `{confirm: true}`) and note
  the reason. After that, split reassignment returns `409 DATASET_LOCKED`.
- If no patient identifier exists, say so in writing and state what the split can and cannot support.
  Do not invent a surrogate patient ID from filename prefixes without evidence they encode a patient.

## The label space is configurable, not an enum

`disease_labels` rows (`§5`, `§7`), read by **both** the model head width and the annotation UI:

| Column | Meaning |
| --- | --- |
| `code` | short code as it appears in the data (e.g. a 3-letter diagnostic code) |
| `display_name` | what the annotator sees in the dropdown |
| `is_active`, `sort_order` | UI control without deleting history |
| `verified_against_data` | **`false` until inspection confirms the code exists in the real files** |

The six PAD-UFES-20 codes named in the brief — `ACK`, `BCC`, `MEL`, `NEV`, `SCC`, `SEK` — are seeded
with `verified_against_data = false`. They are **planning references** (`§5`):

| Do | Don't |
| --- | --- |
| read the label space from the database | `if label in ("ACK", "BCC", …)` anywhere |
| size the model head as `len(active labels)` | hard-code `num_classes = 6` |
| show unverified codes with an "unverified" marker in admin UI | present them as the confirmed class set |
| flip the flag per code at step 10, with evidence | flip all six because five matched |

A code found in the data but absent from the table is a **finding**, not an error to swallow: add the
row, note it, and check whether the brief's vocabulary was simply wrong.

## Pre-loader checklist (tick every box, in `TASKS.md`)

- [ ] real dataset present on this machine, under a path inside `MEDLOOP_ALLOWED_INGEST_ROOTS`
- [ ] licence / terms of use read and recorded
- [ ] steps 1–8 complete, each with the command that produced the finding
- [ ] `docs/dataset_workflow.md` has no `UNKNOWN` left that the loader depends on
- [ ] image count, extension set and dimension distribution recorded
- [ ] corrupt/unreadable file list recorded (files left in place)
- [ ] duplicate groups recorded with a per-group decision
- [ ] class vocabulary reconciled against `disease_labels`; flags flipped where confirmed
- [ ] metadata columns inventoried with missingness; join key to images verified
- [ ] patient/lesion identifier columns confirmed, or their absence stated
- [ ] annotation coverage and coordinate convention recorded (or "none provided")
- [ ] split rule + seed + per-class counts written down and reviewed
- [ ] test dataset version created and **locked**, with a reason
- [ ] EXIF/orientation and colour-mode decisions recorded as transform metadata
- [ ] `TASKS.md` Phase 4 unblocked in the same commit as the findings

Only with every box ticked does step 11 begin. A loader written from an unfinished checklist is the
one defect that silently poisons every downstream metric.

## Dataset failure modes

| Failure mode | Symptom | Fix |
| --- | --- | --- |
| assumed layout | loader crashes, or worse, silently reads 40 % of the files | step 1 first, evidence in docs |
| duplicates across splits | test accuracy suspiciously high | content-hash de-dup before splitting |
| random split with patient IDs present | inflated scores that shrink on new patients | group by patient |
| label read from the filename without evidence | mislabelled minority classes | confirm at step 5/6 |
| EXIF orientation ignored at inference only | good validation, poor real predictions | one decision, both paths |
| hard-coded 6 classes | head/UI drift after the real vocabulary lands | read `disease_labels` |
| test set assembled after seeing model results | the comparison stops meaning anything | lock at step 9 |
| findings only in chat | next session re-guesses | `docs/dataset_workflow.md` is the record |
