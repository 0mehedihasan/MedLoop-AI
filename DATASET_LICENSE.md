# Dataset licence and attribution

This file covers the **third-party research data** stored under `Dataset/`.
It does **not** cover the MedLoop AI software, which is licensed separately under
[Apache-2.0](./LICENSE).

| | |
| --- | --- |
| Dataset | **PAD-UFES-20** |
| Version | 1, published 7 July 2020 |
| DOI | **[10.17632/zr7vgbcyr2.1](https://doi.org/10.17632/zr7vgbcyr2.1)** |
| Licence | **CC BY 4.0** |
| Institution | Universidade Federal do Espírito Santo (UFES), Brazil |
| Directory in this repository | `Dataset/` (`images/`, `metadata.csv`) |
| Relationship to this project | **third-party data, redistributed unmodified** |
| Owned by MedLoop AI | **no** |
| Covered by this repository's Apache-2.0 licence | **no** |

---

## Licence — Creative Commons Attribution 4.0 International

PAD-UFES-20 is released under **CC BY 4.0**
(<https://creativecommons.org/licenses/by/4.0/>), as stated on the
[Mendeley Data record](https://data.mendeley.com/datasets/zr7vgbcyr2/1).

CC BY 4.0 permits copying, redistribution and adaptation, including for commercial purposes,
**provided that** you:

1. **Give appropriate credit** — name the authors and the dataset (see [Citation](#citation)).
2. **Provide a link to the licence** — <https://creativecommons.org/licenses/by/4.0/>.
3. **Indicate if changes were made** — see [Changes made](#changes-made-in-this-repository).
4. **Impose no additional restrictions** — you may not add legal or technological terms that
   restrict others from doing anything the licence permits.

Because redistribution is permitted, this repository may lawfully carry a copy of the images. That
permission is conditional on the attribution above travelling with the copy — which is what this
file exists to do. Do not strip it, and do not relicense `Dataset/`.

**You are responsible for complying with the original terms.** Read the licence and the record
yourself; this summary is a convenience, not a substitute.

## Ownership

MedLoop AI **did not create, collect, annotate, label, or modify** this dataset. All rights, credit
and responsibility for the data remain with the original authors and their institution. This
repository stores a copy for local research use and claims no ownership over it.

The dataset was collected through the **Dermatological and Surgical Assistance Program** (*Programa
de Assistência Dermatológica e Cirúrgica*, PAD) at the Federal University of Espírito Santo — a
nonprofit programme providing free skin lesion treatment, particularly to low-income patients who
cannot afford private care.

## Citation

Cite the dataset by its DOI:

```bibtex
@misc{pacheco2020padufes20,
  title  = {PAD-UFES-20: a skin lesion dataset composed of patient data and
            clinical images collected from smartphones},
  author = {Pacheco, Andre G. C. and Lima, Gustavo R. and Salom{\~a}o, Amanda S. and
            Krohling, Breno and Biral, Igor P. and de Angelo, Gabriel G. and
            Alves Jr, F{\'a}bio C. R. and Esgario, Jos{\'e} G. M. and
            Simora, Alana C. and Castro, Pedro B. C. and Rodrigues, Felipe B. and
            Frasson, Patricia H. L. and Krohling, Renato A. and Knidel, Helder and
            Santos, Maria C. S. and Esp{\'i}rito Santo, Rachel B. and
            Macedo, Telma L. S. G. and Canuto, Tania R. P. and
            de Barros, Lu{\'i}z F. S.},
  year      = {2020},
  publisher = {Mendeley Data},
  version   = {1},
  doi       = {10.17632/zr7vgbcyr2.1},
  url       = {https://data.mendeley.com/datasets/zr7vgbcyr2/1}
}
```

Contributors, in the order listed on the record: Andre G. C. Pacheco, Gustavo R. Lima,
Amanda S. Salomão, Breno Krohling, Igor P. Biral, Gabriel G. de Angelo, Fábio C. R. Alves Jr,
José G. M. Esgario, Alana C. Simora, Pedro B. C. Castro, Felipe B. Rodrigues,
Patricia H. L. Frasson, Renato A. Krohling, Helder Knidel, Maria C. S. Santos,
Rachel B. Espírito Santo, Telma L. S. G. Macedo, Tania R. P. Canuto, Luíz F. S. de Barros.

| Resource | Location |
| --- | --- |
| Dataset record (canonical) | <https://data.mendeley.com/datasets/zr7vgbcyr2/1> |
| Dataset DOI | <https://doi.org/10.17632/zr7vgbcyr2.1> |
| Data article | *Data in Brief*, 2020 — same title and authors |
| Related article (per the record) | <https://doi.org/10.1016/j.compbiomed.2019.103545> |
| Preprint | <https://arxiv.org/abs/2007.00478> |
| Authors' project code | <https://github.com/labcin-ufes/PAD-UFES-20> |

Cite the dataset and the data article — **not this repository** — when you use the data.

## Ethics and consent (as stated by the original authors)

The data was collected through the PAD programme, managed by the Department of Specialized
Medicine at the Federal University of Espírito Santo, and was approved by:

| Approving body | Reference |
| --- | --- |
| University ethics committee | nº 500002/478 |
| Plataforma Brasil (Brazilian national research ethics platform) | nº 4.007.097 |

The authors state that all data was collected under patient consent and that patient privacy is
completely preserved. MedLoop AI relies on that approval and adds no data collection of its own.
This project has **no** separate ethics approval and must not be used to collect new patient data.

## Changes made in this repository

CC BY 4.0 requires that modifications be indicated. For completeness:

| Change | Detail |
| --- | --- |
| Directory rename | `Dataset ` → `Dataset` — removed a stray trailing space in the containing folder name |
| Image bytes | **unchanged** |
| Filenames | **unchanged** |
| `metadata.csv` — rows, columns, values | **unchanged** |
| Labels | **unchanged** |

Nothing else has been altered. The images and metadata are byte-for-byte as received.

## What this project does not claim

- No clinical validity, diagnostic accuracy, or fitness for medical use.
- No endorsement by, or affiliation with, the dataset authors, UFES, or the PAD programme.
- No ownership of, or exclusive rights to, any part of the dataset.

MedLoop AI is a **local research prototype**, not a medical device. See the project
[README](./README.md).

## Privacy

`Dataset/metadata.csv` contains de-identified records as published by the original authors: a
pseudonymous `patient_id`, a `lesion_id`, clinical and demographic fields, lesion measurements,
symptom flags, the `diagnostic` label, and the corresponding `img_id` — 26 columns in total.

- It contains **no** names, contact details, addresses, dates of birth, or record numbers.
- This project adds **no** identifiers of its own and generates **no** synthetic patient data.
- Do not attempt re-identification or cross-linkage with other datasets.
- Nothing under `Dataset/` is ever transmitted off the machine by this software
  (see `.claude/CLAUDE.md` §2.1).

## Composition, as documented by the authors

Six lesion types: three skin cancers — Basal Cell Carcinoma (`BCC`), Squamous Cell Carcinoma
(`SCC`), Melanoma (`MEL`) — and three skin diseases — Actinic Keratosis (`ACK`), Seborrheic
Keratosis (`SEK`), Nevus (`NEV`).

Bowen's disease (`BOD`) is *squamous cell carcinoma in situ*, so the authors clustered it into
`SCC`; that is why the record describes seven lesion types but the label space has six. All `BCC`,
`SCC` and `MEL` samples are biopsy-proven; the remainder may carry a clinical diagnosis agreed by a
group of dermatologists.

Images were captured on a variety of smartphones, so **image dimensions differ from file to file**.
Any code that assumes a fixed input size must resize explicitly.

## Integrity of the local copy

Recorded so drift can be detected later. Every figure was measured from the files in this
repository, and each matches the source record.

| Property | Measured here | Record states |
| --- | --- | --- |
| Images | **2,298** PNG | 2,298, all `.png` |
| `imgs_part_1` / `_2` / `_3` | 911 / 659 / 728 | — |
| Unique `patient_id` | **1,373** | 1,373 patients |
| Unique `lesion_id` | **1,641** | 1,641 skin lesions |
| Diagnostic classes | **6** — `BCC` 845, `ACK` 730, `NEV` 244, `SEK` 235, `SCC` 192, `MEL` 52 | six lesion types |
| Biopsy-proven (`biopsed = True`) | 1,342 of 2,298 (**58.4 %**) | approximately 58 % |
| `metadata.csv` columns | **26** | up to 26 features |
| `img_id` ↔ file correspondence | **1:1 exact** — 0 missing, 0 undeclared | each image references patient and lesion |
| Total image payload | 3,606,533,669 B (**3.36 GiB**) | 3.35 GB |
| `metadata.csv` size | 316,209 B (309 KiB), 2,298 data rows | 309 KB |
| `metadata.csv` SHA-256 | `14d145235cedb022548257acb0d84dcd949e2c916f65d2baa7c38ed5339e9527` | — |

Re-check at any time:

```bash
shasum -a 256 Dataset/metadata.csv
find Dataset/images -type f -name '*.png' | wc -l   # expect 2298
```

## Two licences, one repository

| Path | Licence | File |
| --- | --- | --- |
| everything except `Dataset/` | Apache-2.0 | [`LICENSE`](./LICENSE) |
| `Dataset/` | CC BY 4.0, © the dataset authors | **this file** |

Deleting `Dataset/` does not affect the software licence. Relicensing the software does not affect
the dataset. Neither licence may be applied to the other's files.
