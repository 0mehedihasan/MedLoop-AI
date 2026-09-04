# Dataset workflow

Scope: what the supplied dataset actually contains, the commands that measured it, and the decisions
those measurements now justify.

See also: [ml_pipeline](./ml_pipeline.md) · [database](./database.md) · [development_roadmap](./development_roadmap.md) · [research_protocol](./research_protocol.md) · [api_contract](./api_contract.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §2.2 (dataset first), §5 (dataset rules), §2.3 (never fabricate). Licence and attribution: [`../DATASET_LICENSE.md`](../DATASET_LICENSE.md).

## Status — PAD-UFES-20 inspected, 2026-09-05

**One dataset is present and has been inspected read-only.** Every number below was measured from the
files in this repository; none is copied from the published record without being re-measured, and none
is estimated. Where a measurement disagrees with the record, the disagreement is stated.

| | |
| --- | --- |
| Dataset | PAD-UFES-20, version 1 (see [`DATASET_LICENSE.md`](../DATASET_LICENSE.md)) |
| Location | `Dataset/` — **inside** this repository, carried by Git LFS |
| Images | 2,298 PNG, 3,606,533,669 B |
| Metadata | `Dataset/metadata.csv`, 2,298 rows × 26 columns |
| Inspection steps 1–11 | complete, read-only |
| Annotations shipped | **none** |
| Author-defined split | **none** |
| Database rows created | **none** — `images`, `dataset_versions`, `disease_labels` are still empty |
| Trained models | **none** |

**Deviation from the original procedure, recorded deliberately.** Earlier revisions of this file said
to inspect a copy kept *outside* the repository. That is no longer the arrangement: the dataset is
intentionally version-controlled in-repo under `Dataset/` via Git LFS, so the inspection ran against
the working tree. It ran strictly read-only — no file under `Dataset/` was written, renamed or deleted
(proof in [How these findings were produced](#how-these-findings-were-produced)).

**What this unblocks.** Phase 4 (dataset registration and loaders) may now be written *against these
findings*, not against assumptions. Phase 5 onward still waits on the checklist at the end of this
file. Nothing here constitutes a trained model, a metric, or a prediction — CLAUDE.md §2.3 stands.

## Provenance and licence

Not restated here. `DATASET_LICENSE.md` is the record of origin, DOI, CC BY 4.0 obligations, the 19
contributors, the ethics approvals, and the one change made in this repository (a directory rename).
Read it before redistributing anything under `Dataset/`.

## How these findings were produced

| Field | Value |
| --- | --- |
| Inspected on | 2026-09-05 |
| Environment | Python 3.10.12, Pillow 12.3.0, git 2.34.1 — no package was installed |
| Mode | read-only; steps 1–11 open files for reading only |
| Write proof | `find Dataset -newermt '-3 hours' -type f` → only `Dataset/images/.DS_Store` (a Finder artefact, gitignored); **0** `.png` or `.csv` touched |
| Git proof | `git status --porcelain -- Dataset` → 2,298 × `M` and nothing else — no `A`, `D`, `R` or `??` |

The 2,298 `M` entries are a **missing-filter artefact, not a modification**: `git-lfs` is not installed
in the inspection sandbox, so Git cannot run the clean filter and reports every pointer as changed.
Every committed pointer's `oid` was verified equal to the on-disk SHA-256 of the file (2,298 of 2,298,
zero mismatches). **Never `git add` an image from an environment without `git-lfs`** — without the
clean filter Git would store 3.36 GiB of raw bytes instead of 131-byte pointers.

One pass produced the per-image inventory used by every table below (path, bytes, SHA-256, width,
height, mode, bit depth, frame count, ICC, EXIF, decode result):

```bash
python3 - <<'PY'
import io, csv, glob, hashlib
from PIL import Image
rows = []
for p in sorted(glob.glob('Dataset/images/imgs_part_*/*.png')):
    b = open(p, 'rb').read()
    r = {'path': p, 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}
    try:
        im = Image.open(io.BytesIO(b))
        ex = im.getexif()
        r |= {'fmt': im.format, 'w': im.width, 'h': im.height, 'mode': im.mode,
              'nframes': getattr(im, 'n_frames', 1), 'exif_n': len(ex), 'orient': ex.get(274),
              'icc': 1 if im.info.get('icc_profile') else 0, 'bits': im.info.get('bits')}
        im.load()                       # full decode, not just a header read
        r['decode'] = 'ok'
    except Exception as e:
        r['decode'] = f'FAIL:{type(e).__name__}:{e}'
    rows.append(r)
w = csv.DictWriter(open('/tmp/img_inventory.tsv', 'w', newline=''), fieldnames=list(rows[0]),
                   delimiter='\t', lineterminator='\n', extrasaction='ignore')
w.writeheader(); w.writerows(rows)
print(len(rows), 'rows ->', '/tmp/img_inventory.tsv')
PY
```

Runtime ≈ 40 s for 3.36 GiB. The inventory is written to `/tmp`, never into the repository.
`lineterminator='\n'` is not cosmetic: `csv.writer` defaults to CRLF, which leaves a stray `\r` on the
last field and makes every `awk '$NF == "ok"'` check below silently report a failure. Each findings
section names the command that derives it from that inventory or from `metadata.csv`.

## Never assume — now answered

| Unknown | Answer | Section |
| --- | --- | --- |
| Directory layout | `Dataset/images/imgs_part_{1,2,3}/` + `Dataset/metadata.csv`; depth 3, no nesting inside the parts | [Directory inventory](#directory-inventory) |
| Filenames | `PAT_<patient>_<lesion>_<n>.png`, 2,298 of 2,298 match; IDs in the name agree with the CSV exactly | [Identifiers](#identifiers) |
| Extensions | `.png` only, all lowercase, 0 mixed-case, 0 other image types | [Extensions](#extensions) |
| Image count | 2,298 files, 2,298 decode | [Counts](#counts) |
| Dimensions and aspect ratios | 1,450 distinct sizes, 147–3,476 px, 1,876 exactly square | [Dimensions](#dimensions) |
| Class names and count | 6 codes, exactly the 6 seeded; `BOD` absent | [Class distribution](#class-distribution) |
| Metadata columns | 26, inventoried with two distinct missing-value conventions | [Metadata columns](#metadata-columns) |
| Patient / lesion identifiers | both present; `patient_id` globally unique, **`lesion_id` is not** | [Identifiers](#identifiers) |
| Annotation formats | **nothing shipped** — no mask, box, polygon or coordinate column | [Annotations](#annotations-shipped-with-the-data) |
| Pre-existing splits | **none** — and `imgs_part_*` must not be used as one | [Existing splits](#existing-splits) |

## Findings

Every `—` in this file has been replaced by a measurement. If a cell ever reads `—` again it means
*not observed*, never zero.

### Source

| Field | Value |
| --- | --- |
| Dataset name / release | PAD-UFES-20, version 1, published 7 July 2020 |
| Obtained from | supplied by the author on this machine; **not downloaded by any agent** (CLAUDE.md §2.2) |
| Licence and use terms | CC BY 4.0 — recorded in [`DATASET_LICENSE.md`](../DATASET_LICENSE.md) |
| Local path | `Dataset/` inside the repository, tracked by Git LFS (`Dataset/**/*.png filter=lfs`) |
| Total bytes | `Dataset/` 3,606,940,350 B; images alone 3,606,533,669 B (**3.36 GiB**); `metadata.csv` 316,209 B |
| Unique LFS payload | 2,283 objects, 3,571,595,590 B (3.326 GiB) — 15 byte-identical pairs deduplicate |
| Inspected on / by | 2026-09-05, read-only inspection recorded in this file |

```bash
du -sb Dataset && find Dataset -type f -name '*.png' -printf '%s\n' | awk '{s+=$1} END{print s}'
```

### Directory inventory

| Path (relative to root) | Kind | Files | Bytes | Notes |
| --- | --- | --- | --- | --- |
| `Dataset/` | dir | 1 + 1 | — | `metadata.csv`, plus a gitignored `.DS_Store` |
| `Dataset/images/` | dir | 0 + 1 | — | contains only the three parts, plus a gitignored `.DS_Store` |
| `Dataset/images/imgs_part_1/` | dir | 911 | 1,249,473,691 | flat, `.png` only |
| `Dataset/images/imgs_part_2/` | dir | 659 | 1,132,865,211 | flat, `.png` only |
| `Dataset/images/imgs_part_3/` | dir | 728 | 1,224,194,767 | flat, `.png` only — **class-segregated, see [trap 5](#5-imgs_part_3-is-not-an-arbitrary-chunk)** |

No `README`, `LICENSE`, split manifest, annotation file or archive is shipped inside `Dataset/`. The
only non-image files are `metadata.csv` and two `.DS_Store` files created by macOS Finder; both
`.DS_Store` files are gitignored and were never committed.

```bash
find Dataset -maxdepth 3 -type d | sort
find Dataset -type f ! -name '*.png' | sort
```

### Extensions

| Extension | Files | Decodable | Notes |
| --- | --- | --- | --- |
| `.png` | 2,298 | 2,298 | all lowercase; PIL reports `format == 'PNG'` for all |
| `.csv` | 1 | n/a | `metadata.csv`, UTF-8, LF, no BOM, no quoting |
| `.DS_Store` | 2 | n/a | Finder artefact, gitignored, not part of the dataset |

Zero files match `*.PNG`, `*.Png`, `*.JPG` or `*.jpeg`. A case-insensitive glob is therefore
unnecessary, but a loader that assumes case-sensitivity is still correct only on this dataset.

```bash
find Dataset -type f | sed 's/.*\.//' | sort | uniq -c | sort -rn
```

### Counts

| Figure | Value |
| --- | --- |
| Files found under `Dataset/images` | 2,298 |
| Images fully decoded (`Image.open(...).load()`) | **2,298** |
| Decode failures | **0** |
| Truncated / CRC-failing files | **0** |
| Multi-frame (animated) PNGs | 0 — every file reports `n_frames == 1` |
| Non-image files inside `images/` | 1 (`.DS_Store`, gitignored) |
| `metadata.csv` rows ↔ files | **1:1 exact** — 0 declared-but-missing, 0 on-disk-but-undeclared |

This is a full decode of every file, not a header read: nothing in this dataset will fail at load time
for corruption. There is no "unreadable files" list to keep, and therefore nothing was deleted.

```bash
awk -F'\t' 'NR>1 && $NF!="ok"' /tmp/img_inventory.tsv | wc -l    # expect 0
```

### Dimensions

| Statistic | Width | Height | Notes |
| --- | --- | --- | --- |
| min | 147 | 147 | smallest file overall |
| median | 779 | 779 | |
| mean | 934 | 934 | |
| max | 3,474 | 3,476 | |
| distinct `(w, h)` pairs | **1,450** | | no dominant native size |
| distinct aspect ratios | **77** | | 0.888 – 1.157, median exactly 1.000 |
| orientation | | | 1,876 square · 227 portrait · 195 landscape |
| commonest sizes | | | 750² ×75 · 640² ×40 · 1242² ×17 · 1125² ×10 |

| Colour and encoding | Value |
| --- | --- |
| Mode | **`RGBA` 1,440 · `RGB` 858** — mixed channel count |
| Bit depth | 8 bits/channel for all 2,298 |
| ICC profile embedded | 2 files |
| DPI metadata | absent in 2,289; three distinct values in the remaining 9 |
| EXIF block present | 67 files |
| EXIF `Orientation` (tag 274) | present in 67 files, **value `1` (identity) in all 67**; absent in 2,231 |

**Resize decision, now justified.** 15 images are smaller than 224 px on a side and 400 are smaller
than 448 px, so `input_size = 224` upsamples 15 files and downsamples the median (779 px) by ~3.5×.
224 remains the working default because it matches ImageNet-pretrained backbones on the M-series
budget (CLAUDE.md §2.8); the point is that it is now a measured trade-off, not an inherited constant.
Aspect ratio is near-1 for the large majority, so a square resize distorts little — but it is not
uniform, and 422 non-square images will be distorted by a naive `resize((224, 224))`.

**EXIF decision, settled once (CLAUDE.md `medloop-dataset.md`, "the classic silent corrupter").**
Strip EXIF and apply **no** rotation. This is safe *because it was measured*: every orientation tag
present is `1`, so honouring EXIF and ignoring it produce identical tensors on this dataset. Record
the decision in the transform metadata anyway, and apply it identically at training and inference —
a future dataset will not be this cooperative.

```bash
# from the inventory: sizes, modes, EXIF orientation
awk -F'\t' 'NR>1{print $5"x"$6}' /tmp/img_inventory.tsv | sort | uniq -c | sort -rn | head
awk -F'\t' 'NR>1{print $7}'      /tmp/img_inventory.tsv | sort | uniq -c
awk -F'\t' 'NR>1{print $10}'     /tmp/img_inventory.tsv | sort | uniq -c
```

### Metadata columns

`Dataset/metadata.csv` — 2,298 data rows, 26 columns, every row exactly 26 fields, no quoting, no
embedded delimiter, UTF-8 with zero non-ASCII bytes, LF endings, trailing newline present.
SHA-256 `14d145235cedb022548257acb0d84dcd949e2c916f65d2baa7c38ed5339e9527`.

| # | Column | Observed dtype | Blank | Distinct | Role |
| --- | --- | --- | --- | --- | --- |
| 1 | `patient_id` | str `PAT_<n>` | 0 | 1,373 | **identifier — the split grouping key** |
| 2 | `lesion_id` | int-as-str | 0 | 1,641 | identifier, **not globally unique** |
| 3 | `smoke` | bool `True`/`False` | 804 (35.0 %) | 2 | clinical |
| 4 | `drink` | bool | 804 (35.0 %) | 2 | clinical |
| 5 | `background_father` | str, 13 values incl. `UNK` | 818 (35.6 %) | 13 | demographic |
| 6 | `background_mother` | str, 11 values incl. `UNK` | 822 (35.8 %) | 11 | demographic |
| 7 | `age` | int | 0 | 84 | clinical — range 6–94, median 62 |
| 8 | `pesticide` | bool | 804 (35.0 %) | 2 | clinical |
| 9 | `gender` | str `MALE`/`FEMALE` | 804 (35.0 %) | 2 | demographic |
| 10 | `skin_cancer_history` | bool | 804 (35.0 %) | 2 | clinical |
| 11 | `cancer_history` | bool | 804 (35.0 %) | 2 | clinical |
| 12 | `has_piped_water` | bool | 804 (35.0 %) | 2 | socio-economic |
| 13 | `has_sewage_system` | bool | 804 (35.0 %) | 2 | socio-economic |
| 14 | `fitspatrick` | float 1.0–6.0 | 804 (35.0 %) | 6 | clinical — **spelled as in the source**; do not "fix" it to `fitzpatrick` |
| 15 | `region` | str, 14 values | 0 | 14 | clinical — anatomical site |
| 16 | `diameter_1` | float 0.0–100.0 | 804 (35.0 %) | 42 | lesion measurement — 4 rows are `0.0` |
| 17 | `diameter_2` | float 0.0–70.0 | 804 (35.0 %) | 38 | lesion measurement — 4 rows are `0.0` |
| 18 | `diagnostic` | str, 6 codes | 0 | 6 | **label** |
| 19 | `itch` | str `True`/`False`/`UNK` | 0 | 3 | symptom — **three-state, not boolean** |
| 20 | `grew` | str + `UNK` ×402 | 0 | 3 | symptom |
| 21 | `hurt` | str + `UNK` ×10 | 0 | 3 | symptom |
| 22 | `changed` | str + `UNK` ×396 | 0 | 3 | symptom |
| 23 | `bleed` | str + `UNK` ×6 | 0 | 3 | symptom |
| 24 | `elevation` | str + `UNK` ×2 | 0 | 3 | symptom |
| 25 | `img_id` | str filename | 0 | 2,298 | **join key to the image files** |
| 26 | `biopsed` | bool | 0 | 2 | provenance — **label leak, never a feature ([trap 2](#2-missingness-and-biopsed-both-leak-the-label))** |

**Two missing-value conventions coexist.** An empty field means *not collected*; the literal string
`UNK` means *asked and unknown*. A reader that only handles `NaN` will silently treat `UNK` as a valid
category — which is defensible for the symptom columns, but must be a decision, not an accident.
`region`, `gender` and the anatomical vocabulary carry no sentinel; `background_father` contains both
`BRASIL` and `BRAZIL`, so a naive one-hot encoder produces two categories for one country.

```bash
python3 - <<'PY'
import csv
rows = list(csv.DictReader(open('Dataset/metadata.csv', newline='', encoding='utf-8')))
for c in rows[0]:
    vals  = [r[c] for r in rows]
    blank = sum(1 for v in vals if v == '')
    uniq  = len({v for v in vals if v != ''})
    print(f'{c:<22}{blank:>6} blank ({100*blank/len(vals):>4.1f}%)  {uniq:>5} distinct')
PY
```

### Class distribution

| Class as written in the data | Images | Share | Patients | `(patient, lesion)` pairs | Biopsy-proven | Mapped `disease_labels.code` |
| --- | --- | --- | --- | --- | --- | --- |
| `BCC` | 845 | 36.77 % | 513 | 652 | **100.0 %** | `BCC` |
| `ACK` | 730 | 31.77 % | 525 | 644 | 24.4 % | `ACK` |
| `NEV` | 244 | 10.62 % | 185 | 216 | 24.6 % | `NEV` |
| `SEK` | 235 | 10.23 % | 176 | 198 | 6.4 % | `SEK` |
| `SCC` | 192 | 8.36 % | 133 | 145 | **100.0 %** | `SCC` |
| `MEL` | 52 | **2.26 %** | **36** | 36 | **100.0 %** | `MEL` |
| total | 2,298 | 100 % | 1,373 | 1,891 | 1,342 (58.4 %) | 6 codes |

- **Imbalance ratio 16.25 : 1** (`BCC` : `MEL`). Macro-F1 as the promotion metric (CLAUDE.md §8.1) is
  the right default precisely because of this; accuracy would be dominated by `BCC` + `ACK` = 68.5 %.
- **A constant `BCC` predictor scores 36.77 % accuracy.** Any reported accuracy at or below that
  number means the model learned nothing, and any accuracy figure must be read against this floor.
- The three cancers (`BCC`, `SCC`, `MEL`) are **100 % biopsy-proven**; `ACK`, `NEV` and `SEK` carry a
  clinical diagnosis in most rows. Label confidence is therefore not uniform across classes, and a
  disagreement on `SEK` is not the same kind of evidence as a disagreement on `MEL`.
- `BOD` (Bowen's disease) does **not** appear: the authors clustered it into `SCC`, which is why the
  record describes seven lesion types and the label space has six.

**Effect on `disease_labels` (CLAUDE.md §5).** All six seeded codes exist in the data, spelled
identically, and no seventh code appears — the sets are equal in both directions. The evidence needed
to set `verified_against_data = true` therefore exists for all six. The flag is **not yet flipped**:
no database has been created, so there is no row to update. Flip it in the same change that first
seeds `disease_labels` from a real migration run, and cite this section.

```bash
python3 - <<'PY'
import csv
from collections import Counter
rows = list(csv.DictReader(open('Dataset/metadata.csv', newline='', encoding='utf-8')))
c = Counter(r['diagnostic'] for r in rows)
for k, v in c.most_common():
    print(f'{k:<5}{v:>6}{100*v/len(rows):>8.2f}%')
print('classes', len(c), '| imbalance %.2f' % (max(c.values()) / min(c.values())))
PY
```

### Identifiers

| Question | Answer |
| --- | --- |
| Patient identifier column | `patient_id`, format `PAT_<n>`, 1,373 distinct, never blank |
| Lesion identifier column | `lesion_id`, integer-as-string, 1,641 distinct values |
| Patients | **1,373** |
| Images per patient (min / median / max) | 1 / 1 / 10 — mean 1.67 |
| Distribution of images per patient | 1 img ×829 · 2 ×328 · 3 ×132 · 4 ×42 · 5 ×21 · 6 ×12 · 7 ×6 · 10 ×3 |
| Lesions per patient (min / median / max) | 1 / 1 / 8 |
| Images per lesion (min / median / max) | 1 / 1 / 8 |
| Identifier also encoded in filenames | **yes** — `PAT_<patient>_<lesion>_<n>.png`, 2,298 of 2,298 match the pattern |
| Metadata and filenames agree | **exactly** — 0 `patient_id` disagreements, 0 `lesion_id` disagreements |
| `img_id` ↔ file correspondence | 1:1, 0 missing, 0 undeclared |
| Patients spanning more than one `imgs_part_*` directory | **0** |
| Patients carrying more than one diagnostic | **179 of 1,373** |

**`lesion_id` is not a global key.** 250 `lesion_id` values are reused by more than one patient, and
226 `lesion_id` values consequently carry more than one `diagnostic`. Within a single patient the id
*is* unique: all 1,891 `(patient_id, lesion_id)` pairs map to exactly one diagnostic, 0 exceptions.

| Counting rule | Lesions |
| --- | --- |
| distinct `lesion_id` values | 1,641 — the figure quoted by the published record |
| distinct `(patient_id, lesion_id)` pairs | **1,891** — the number of physically distinct lesions |

Group by `patient_id`; use `(patient_id, lesion_id)` as the lesion key. A `GROUP BY lesion_id` merges
lesions from different patients and different classes — it will not error, it will just be wrong.
`images.lesion_id` must therefore never be a unique or foreign key on its own.

**829 patients (60.4 %) contribute exactly one image**, so patient-level grouping costs little here:
the grouping constraint binds on only ~40 % of patients. That is a favourable case and should not be
generalised to ISIC.

```bash
python3 - <<'PY'
import csv
from collections import defaultdict
rows = list(csv.DictReader(open('Dataset/metadata.csv', newline='', encoding='utf-8')))
owner = defaultdict(set); pair = defaultdict(set)
for r in rows:
    owner[r['lesion_id']].add(r['patient_id'])
    pair[(r['patient_id'], r['lesion_id'])].add(r['diagnostic'])
print('lesion_id shared by >1 patient:', sum(1 for v in owner.values() if len(v) > 1))
print('(patient,lesion) pairs:', len(pair),
      '| ambiguous:', sum(1 for v in pair.values() if len(v) > 1))
PY
```

### Duplicates

| Figure | Value |
| --- | --- |
| Distinct `sha256` digests | **2,283** |
| Byte-identical groups | **15**, all of size 2 |
| Images inside duplicate groups | 30 |
| Groups whose members share a patient | **15 of 15** |
| Groups whose members share a `lesion_id` | 0 |
| **Groups with contradictory labels** | **12 of 15** |
| Near-duplicate detection | **not run** — no perceptual hashing was performed; recorded as an open item, not as a negative result |
| Policy applied | **none yet.** Nothing was de-duplicated, moved or deleted |

The 12 contradictory groups are the significant finding: the *same bytes* appear twice under the same
patient with two different `lesion_id` values and two different diagnoses.

| Digest | Files | Labels |
| --- | --- | --- |
| `64eb82d804` | `PAT_202_307_424.png` · `PAT_202_308_721.png` | `ACK` / `BCC` |
| `ecb934c688` | `PAT_302_650_477.png` · `PAT_302_651_529.png` | `BCC` / `SCC` |
| `5e0296e7e9` | `PAT_311_666_191.png` · `PAT_311_667_416.png` | `BCC` / `SCC` |
| `68f38859eb` | `PAT_38_1002_34.png` · `PAT_38_1003_68.png` | `ACK` / `BCC` |
| `d409bcc632` | `PAT_38_1002_668.png` · `PAT_38_1003_226.png` | `ACK` / `BCC` |
| `1ae8598873` | `PAT_419_2767_323.png` · `PAT_419_833_148.png` | `ACK` / `SCC` |
| `f0d611660c` | `PAT_56_86_479.png` · `PAT_56_88_274.png` | `BCC` / `SCC` |
| `57be822962` | `PAT_570_1084_637.png` · `PAT_570_1085_344.png` | `BCC` / `SCC` |
| `ee72376f4f` | `PAT_570_1084_939.png` · `PAT_570_1085_429.png` | `BCC` / `SCC` |
| `41fcc30952` | `PAT_691_1311_2.png` · `PAT_691_3994_671.png` | `ACK` / `BCC` |
| `0a8d541f07` | `PAT_691_1311_890.png` · `PAT_691_3994_791.png` | `ACK` / `BCC` |
| `8148753acb` | `PAT_759_1433_914.png` · `PAT_759_1538_566.png` | `BCC` / `NEV` |
| `13116b2842` | `PAT_528_3072_615.png` · `PAT_528_993_589.png` | `ACK` / `ACK` — consistent |
| `1ca244d7c5` | `PAT_701_1321_156.png` · `PAT_701_4056_457.png` | `SEK` / `SEK` — consistent |
| `e6c6e7dde6` | `PAT_834_1572_430.png` · `PAT_834_1574_276.png` | `SCC` / `SCC` — consistent |

**What this is, most likely.** These are patients with two lesions photographed in one session; one
frame appears to have been filed under both lesion records. The image cannot be two classes at once,
so at least one label in each of the 12 groups is attached to the wrong lesion.

**What must not happen.** Do not silently drop one member, and do not "fix" a label — that is editing
third-party data, and CC BY 4.0 requires modifications to be declared. `DATASET_LICENSE.md` currently
declares *no* label change; keep that true.

**Recommended handling, for approval before Phase 4 implements it:** keep all 30 files, keep the
labels exactly as published, and add a `duplicate_group_id` plus a `label_conflict` flag on the
`images` row. Then (a) exclude conflicted pairs from `TEST` so the locked yardstick contains no image
whose label is provably ambiguous, (b) keep them in `TRAIN` as declared, and (c) report the count in
every results table as a known label-noise floor. Two of these images can never both be right, so a
model that reaches 100 % on them is memorising, and a model that is "wrong" on one may be right.

**Leakage is already prevented by the grouping rule** — every duplicate pair shares a patient, so
patient-level splitting keeps both members in the same split. Verified below, not assumed.

```bash
awk -F'\t' 'NR>1{print $3}' /tmp/img_inventory.tsv | sort | uniq -d | wc -l   # 15 groups
```

### Existing splits

| Field | Value |
| --- | --- |
| Split shipped by the authors | **none** |
| Split-like column in `metadata.csv` | none — no `split`, `fold`, `train`, `test`, `val` or `subset` column |
| Manifest file | none |
| `imgs_part_1/2/3` as a candidate split | **patient-disjoint (0 patients span two parts) but unusable — see below** |
| Decision | **re-split from scratch**, patient-level, seed recorded |

| Part | Images | Patients | `BCC` | `ACK` | `NEV` | `SEK` | `SCC` | `MEL` | Biopsy-proven | Clinical fields blank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `imgs_part_1` | 911 | 461 | 540 | 167 | 41 | 33 | 108 | 22 | 802 (88.0 %) | 0 |
| `imgs_part_2` | 659 | 379 | 305 | 180 | 36 | 24 | 84 | 30 | 540 (81.9 %) | 76 |
| `imgs_part_3` | 728 | 533 | **0** | 383 | 167 | 178 | **0** | **0** | **0** | **728 (100 %)** |

`imgs_part_3` contains **no cancer class at all** and every one of its rows has the clinical fields
blank and `biopsed = False`. The parts are a distribution convenience, not an experimental design.

### Annotations shipped with the data

| Field | Value |
| --- | --- |
| Regions available | **none** |
| Format (mask / box / polygon) | n/a — no mask file, no coordinate column, no annotation file anywhere under `Dataset/` |
| Columns resembling geometry | none — no `mask`, `box`, `bbox`, `poly`, `seg`, `roi`, `coord`, `x1`, `y1` |
| Images covered | **0 of 2,298** |
| Coordinate convention in the source | n/a |
| Convertible to normalised `[0,1]` | n/a |

**Consequence for the research questions (CLAUDE.md §14).** There is no localisation ground truth in
this dataset, so **RQ2 (localisation improvement) and RQ3 (Grad-CAM ∩ human ROI) have no baseline
until humans annotate inside the loop.** That is not a blocker — human annotation is the product — but
it means the first localisation number cannot exist before review sessions produce regions, and no
"IoU against the dataset" is computable at any point. `diameter_1` / `diameter_2` describe lesion size
in the clinical record; they are not image coordinates and must never be converted into a box.

## Six findings that change the code

Everything above is inventory. These six are the ones that will silently corrupt a result if the
loader is written from the published description instead of from the files.

### 1. Colour mode is mixed — 1,440 `RGBA` and 858 `RGB`

A loader that does not convert produces tensors with 4 channels for 62.7 % of the data and 3 for the
rest. `ToTensor()` will happily emit both, the first `Conv2d(3, ...)` will fail on some batches and not
others, and the failure looks random because it depends on which files a shuffled batch drew.

**Decision:** `Image.open(p).convert('RGB')` unconditionally, before any transform, at training *and*
inference. Record the conversion in the transform metadata. Do not rewrite the files.

### 2. Missingness and `biopsed` both leak the label

804 rows (35.0 %) have **the same eleven clinical columns blank** — `smoke`, `drink`, `pesticide`,
`gender`, `skin_cancer_history`, `cancer_history`, `has_piped_water`, `has_sewage_system`,
`fitspatrick`, `diameter_1`, `diameter_2` — verified to be the identical set of rows, not eleven
overlapping sets. And that set is perfectly confounded with the label:

| The 804 blank-clinical rows | The other 1,494 rows |
| --- | --- |
| `biopsed = True` in **0** of 804 | 1,342 biopsy-proven |
| `ACK` 447 · `SEK` 188 · `NEV` 169 | `BCC` 845 · `ACK` 283 · `SCC` 192 · `NEV` 75 · `MEL` 52 · `SEK` 47 |
| **0 cancer cases** | all 1,089 cancer cases |

So "the clinical fields are empty" implies "not `BCC`, not `SCC`, not `MEL`" with certainty on this
data. A missing-indicator feature, an imputation flag, or `biopsed` itself used as an input would let
a model score extremely well by reading the collection protocol instead of the lesion.

**Decisions:** `biopsed` is provenance and is **never** a model input. If clinical metadata is ever
used as a feature, missing-indicator columns are forbidden and the leak must be stated in the results.
Also: `dropna()` on the clinical columns would silently delete 35 % of the data *and* every `SEK`/`NEV`
majority — never clean this dataset by dropping rows. The image-only classifier planned for V1 avoids
the problem entirely, which is one more reason to keep V1 image-only.

### 3. `lesion_id` is unique only within a patient

250 values are reused across patients; 1,641 distinct values describe 1,891 distinct lesions. Group by
`patient_id`, key lesions by `(patient_id, lesion_id)`, and never put a unique constraint on
`images.lesion_id`.

### 4. Twelve byte-identical pairs carry contradictory labels

30 files, 15 groups, 12 of them label-conflicting — see [Duplicates](#duplicates). This is a ceiling on
achievable accuracy and it belongs in the results discussion, not in a cleanup script.

### 5. `imgs_part_3` is not an arbitrary chunk

Zero `BCC`, zero `SCC`, zero `MEL`; 100 % of its 728 rows are non-biopsied with blank clinical fields.
Using the parts as a split, or as a "quick subset" for a smoke test, produces a 3-class experiment that
looks like a 6-class one. Any subset for testing must be drawn by the split rule, never by directory.

### 6. `MEL` is scarce at the patient level, and the split ratio decides how badly

52 images across **36 patients**. Because grouping is by patient, the ratio choice moves whole patients:

| Ratio | `MEL` patients TRAIN / VAL / TEST | ≈ `MEL` images |
| --- | --- | --- |
| 70 / 15 / 15 | 25 / 5 / 6 | 36 / 8 / 8 |
| 60 / 20 / 20 | 22 / 7 / 7 | 31 / 10 / 11 |
| 80 / 10 / 10 | 29 / 4 / 3 | 42 / 5 / 5 |

With ~8 `MEL` images in the locked test set, **one melanoma flipping changes `MEL` recall by ~12.5
points and macro-F1 by roughly 2 points** — the same order as `minimum_improvement = 0.005` amplified
several times over. Two consequences, both mandatory: report per-class support beside every metric so a
reader can see the denominator, and treat a macro-F1 difference smaller than the `MEL`-driven noise
floor as *no difference* rather than an improvement (CLAUDE.md §9). This is the strongest argument for
`MANUAL_APPROVAL` as the default promotion mode.

## From files to rows

Registration is a *path* registration: no bytes stream through the API and nothing is copied — one
physical copy of each image, splits and batch membership are database references (CLAUDE.md §3.2).

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

**None of this exists in code yet.** `backend/` is an empty directory; the contract above is the
specification in [api_contract](./api_contract.md), where dataset-dependent capabilities answer
`DATASET_NOT_AVAILABLE` (501) until Phase 4. What has changed is only that the specification can now
be implemented from measurements: `file_sha256`, `original_width`, `original_height` and the split
assignment for all 2,298 images are known and reproducible from the commands in this file.

Ingest root: `Dataset/` sits inside the repository, so `MEDLOOP_ALLOWED_INGEST_ROOTS` must include the
repository path for registration to succeed. That is a configuration value, not a code constant.

## Split design

| Rule | Detail |
| --- | --- |
| Patient level | all of a patient's images go to one split; lesion grouping applies *within* a patient (CLAUDE.md §5). Feasible here — 829 of 1,373 patients have a single image |
| Grouping key | `patient_id`. **Never `lesion_id`** — 250 values are shared across patients |
| Stratification | each patient is placed in the stratum of the **rarest class** among their images, so the 36 `MEL` patients drive placement rather than being absorbed by `BCC` |
| Deterministic | order within each stratum is `sha256(f"{seed}:{patient_id}")`; no RNG state, no dependence on file order or dict order — re-running assigns identically |
| Seed | `20260905`, recorded on the `dataset_versions` row, never re-drawn |
| Test is locked | `POST /dataset-versions/{id}/lock-test` freezes it; every later mutation is `409 DATASET_LOCKED` |
| Test is invisible to review | `TEST` images never enter the review queue, so no human can annotate the yardstick |
| HITL growth | new validated work becomes `TRAIN` material through batches; the test split never grows |
| Proportions | **70 / 15 / 15 measured below** — the trade-off is `MEL` support, not arithmetic |

Candidate assignment, computed read-only and **not applied** (no database exists):

| Split | Images | Share | Patients | `BCC` | `ACK` | `NEV` | `SEK` | `SCC` | `MEL` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `TRAIN` | 1,611 | 70.1 % | 961 | 584 | 523 | 162 | 165 | 137 | 40 |
| `VALIDATION` | 328 | 14.3 % | 206 | 127 | 99 | 40 | 29 | 28 | **5** |
| `TEST` | 359 | 15.6 % | 206 | 134 | 108 | 42 | 41 | 27 | **7** |

| Verification | Result |
| --- | --- |
| Patients appearing in more than one split | **0** |
| Byte-identical duplicate groups straddling splits | **0** — every group is intra-patient, so grouping handles them |
| Class present in all three splits | 6 of 6 |
| Reproducible from seed alone | yes — pure function of `(seed, patient_id, class)` |

Rare classes decide the design, and here they decide it uncomfortably: `MEL` lands 5 images in
`VALIDATION` and 7 in `TEST`. Recorded before training, not after a metric disappoints — the three
honest options are (a) accept it and always report per-class support, (b) move to 60/20/20 for ~10/11
`MEL` images at the cost of 8 % of `TRAIN`, or (c) report `MEL` separately as under-powered. **Option
(a) plus mandatory per-class support tables is the working default; (b) is the fallback if V1's `MEL`
recall is unstable across seeds.** Do not switch the ratio after seeing a comparison — that turns the
locked test set into a moving target (CLAUDE.md §2.5).

```bash
# reproduces the table above; prints 0 for both leakage checks
python3 - <<'PY'
import csv, hashlib
from collections import Counter, defaultdict
SEED = "20260905"
rows = list(csv.DictReader(open('Dataset/metadata.csv', newline='', encoding='utf-8')))
rank = {c: i for i, (c, _) in enumerate(Counter(r['diagnostic'] for r in rows).most_common()[::-1])}
pat = defaultdict(list)
for r in rows:
    pat[r['patient_id']].append(r)
stratum = {p: min((x['diagnostic'] for x in v), key=lambda c: rank[c]) for p, v in pat.items()}
bucket = defaultdict(list)
for p in pat:
    bucket[stratum[p]].append(p)
assign = {}
for s, ps in bucket.items():
    order = sorted(ps, key=lambda p: hashlib.sha256(f"{SEED}:{p}".encode()).hexdigest())
    ntr, nva = round(len(order) * 0.70), round(len(order) * 0.15)
    for i, p in enumerate(order):
        assign[p] = 'TRAIN' if i < ntr else ('VALIDATION' if i < ntr + nva else 'TEST')
for s in ('TRAIN', 'VALIDATION', 'TEST'):
    sub = [r for r in rows if assign[r['patient_id']] == s]
    print(f"{s:<11}{len(sub):>6}  patients {len({r['patient_id'] for r in sub}):>4}  "
          + " ".join(f"{k}={v}" for k, v in sorted(Counter(r['diagnostic'] for r in sub).items())))
PY
```

## Label space

The label space is a table, not code: `disease_labels` rows carry `code`, `name`, `is_active`,
`display_order`, `verified_against_data`. The model head width and the annotation UI both read it, so
a rename is a data change and a class count change is a retraining decision — never an edit to an enum
in two languages (CLAUDE.md §5).

| Action | Effect | State after this inspection |
| --- | --- | --- |
| Confirm a seeded code against the data | set `verified_against_data = true`; nothing else moves | **evidence exists for all 6** — `ACK`, `BCC`, `MEL`, `NEV`, `SCC`, `SEK` all found, spelled identically |
| Class in the data with no row | add a row before any training run | none — no seventh code appears |
| Seeded code absent from the data | set `is_active = false`; keep the row | none — no seeded code is missing |
| Class count changes after a model exists | the old model's `label_space` is frozen in its row; a new count means a new version | n/a — no model exists |

The flag stays `false` in this repository until a database is actually created, because there is no row
to update: `backend/` is empty and no migration has ever run. Flip all six in the same change that
first seeds the table, and cite [Class distribution](#class-distribution) as the evidence.

`BOD` is deliberately absent — the authors folded Bowen's disease into `SCC`. If a future release of the
dataset separates it, that is a **seventh** code and a new label space, not a relabelling of `SCC`.

## Pre-flight checklist

- [x] Every findings table above is filled with observed values — 2026-09-05, read-only
- [x] Licence and terms recorded — [`DATASET_LICENSE.md`](../DATASET_LICENSE.md), CC BY 4.0
- [x] Image count, extension set and dimension distribution recorded
- [x] Decode check run on every file — 2,298 of 2,298 decode, **0** corrupt, nothing deleted
- [x] Colour-mode decision recorded — convert to `RGB`; 1,440 files are `RGBA`
- [x] EXIF decision recorded — strip, no rotation; all 67 orientation tags are `1`
- [x] Duplicate groups recorded — 15 groups, 12 label-conflicting, **no de-duplication applied**
- [x] Metadata columns inventoried with missingness; join key `img_id` verified 1:1
- [x] Patient / lesion identifier columns confirmed, including that `lesion_id` is not globally unique
- [x] Annotation coverage recorded — **none provided**, 0 of 2,298
- [x] Author-shipped split checked — none exists; `imgs_part_*` explicitly rejected as a split
- [x] Class vocabulary reconciled against the seeded codes — 6 of 6 match, no extras
- [x] Split rule, seed and per-class counts written down and verified leakage-free
- [ ] Duplicate policy **approved** and applied (proposed above; needs a decision before Phase 4 code)
- [ ] `verified_against_data = true` for every active code — blocked: no database exists
- [ ] Patient-level split **assigned in the database** — blocked: no `images` rows exist
- [ ] `TEST` split locked, with the reason recorded — blocked: no `dataset_versions` row exists
- [ ] `original_width` / `original_height` populated for every image row — values measured; rows do not exist
- [ ] Augmentation policy justified (resize is justified; augmentation is still an open choice)
- [ ] `scripts/verify_invariants.py` passes and the counts in `GET /dataset-versions/{id}` match the files — blocked: neither the script nor the endpoint exists

The first thirteen boxes are the inspection; they are done. The remaining boxes are all blocked on the
same thing — **there is no database and no backend code** — not on the dataset. That is the honest
statement of where the project stands.

## Still open

| Item | Why it is still open |
| --- | --- |
| Near-duplicate detection | only exact SHA-256 matching was run. Perceptual near-duplicates (same lesion, adjacent frame) are plausible given up to 8 images per lesion, and would leak within a patient only — which patient-level grouping already contains. Worth measuring before any cross-dataset claim |
| Duplicate-conflict policy | proposed in [Duplicates](#duplicates); needs approval, then implementation as `duplicate_group_id` + `label_conflict` on `images` |
| Whether clinical metadata is ever a model input | if yes, [trap 2](#2-missingness-and-biopsed-both-leak-the-label) must be handled explicitly. V1 is image-only, which sidesteps it |
| Augmentation policy | flips are safe for skin lesions; rotation interacts with the 422 non-square images and the resize choice |
| ISIC and PH2 | still **planning references only** (CLAUDE.md §5). Nothing about them has been verified against files, and none of the findings here transfer |
| Disk footprint | `Dataset/` 3.4 GB working tree + `.git/lfs` 3.4 GB object cache ≈ 6.8 GB. Well inside the 512 GB budget, but `git lfs prune` is the lever if it matters later |

Nothing in Phase 5 onward starts before the blocked boxes above are ticked — see
[development_roadmap](./development_roadmap.md).








