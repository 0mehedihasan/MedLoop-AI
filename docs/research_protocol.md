# Research protocol

Scope: the questions this system exists to answer, the experimental design, the metric definitions, the
threats to validity, and the empty result tables that will hold the findings.

See also: [model_versioning](./model_versioning.md) · [hitl_workflow](./hitl_workflow.md) · [dataset_workflow](./dataset_workflow.md) · [ml_pipeline](./ml_pipeline.md) · [development_roadmap](./development_roadmap.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §2.3 (never fabricate), §2.5 (comparability), §14 (research frame).

## Status — no experiment has been run

**No dataset is present, no model has been trained, and no metric has been computed.** Every result
table below is an empty template; `—` means *not measured*. Nothing in this file may be filled in from
literature, from a similar project, or from an expectation (CLAUDE.md §2.3).

## Research questions and hypotheses

| RQ | Question | Hypothesis | Primary evidence |
| --- | --- | --- | --- |
| RQ1 | Does iterative human feedback improve classification across successive versions? | macro-F1 on the locked test set is non-decreasing from V1 → V2 → V3 → V4, with the largest gain at the first cycle | `model_evaluations` rows, same `(dataset_version_id, split='TEST')` |
| RQ2 | Does human-corrected localisation improve lesion localisation? | mean IoU between the AI box and the human region rises across versions | localisation metrics on test images that carry a human region |
| RQ3 | How closely does Grad-CAM align with human-annotated regions? | overlap is above chance but well below human–human agreement; alignment improves with accuracy | CAM ∩ human ROI on the same artefact |
| RQ4 | Can human-validated feedback support continuous local refinement on one machine? | the loop sustains cycles within the 16 GB / MPS envelope without a cloud step | job durations, device used, memory behaviour |
| RQ5 | Can confidence or uncertainty identify the samples most worth reviewing? | low-confidence samples show a higher correction rate than high-confidence ones | confidence-vs-correction bins; deferred until the core loop runs |

RQ5 is explicitly sequenced last: an active-learning claim built on an unvalidated loop measures the
loop's defects, not the sampling strategy.

## Design

```text
initial dataset ──split (patient level)──▶ TRAIN | VALIDATION | TEST
                                                          │
                                              lock TEST ──┘ one-way door, never grows
        ▼
V1 baseline ── train on TRAIN ── evaluate on locked TEST ──▶ ACTIVE
        │
        │ annotators review UNUSED images ─▶ VALIDATED ─▶ counter reaches the threshold
        ▼
batch 001 ──▶ V2 ── evaluate on the SAME locked TEST ──▶ promote | reject
batch 002 ──▶ V3 ── same test set
batch 003 ──▶ V4 ── same test set
```

| Element | Choice |
| --- | --- |
| Unit of analysis | the model version; each cycle contributes one paired comparison on identical test data |
| Controlled | test split, evaluation code, primary metric, seed policy, hardware |
| Varied | the training pool only — it grows by one HITL batch per cycle |
| Confirmed by construction | `model_evaluations` is keyed by `(model_id, dataset_version_id, split)`, so an incomparable pair cannot be tabulated (`comparable: false`) |
| Cycle size | `hitl_retraining_threshold` — a setting, recorded per batch as `threshold_at_creation`; a mid-experiment change is itself a documented event |

## Metric definitions

Every metric is computed by `ml/evaluation/` and stored in `model_evaluations.metrics`; only keys the
code actually computed are written (CLAUDE.md §2.3).

### Classification

| Metric | Definition | Note |
| --- | --- | --- |
| Accuracy | `correct / N` | reported but never alone — class imbalance makes it flattering |
| Precision (class `c`) | `TP_c / (TP_c + FP_c)` | undefined when the model predicts `c` never; omitted, not `0` |
| Recall (class `c`) | `TP_c / (TP_c + FN_c)` | undefined when `c` is absent from the test split |
| F1 (class `c`) | `2·P·R / (P + R)` | — |
| **Macro-F1** | unweighted mean of per-class F1 | the default `primary_promotion_metric`; unweighted so a rare class cannot be ignored |
| AUROC | one-vs-rest per class, macro-averaged over computable classes | needs the full probability vector, which `ai_predictions.probabilities` stores |
| Confusion matrix | counts, rows = truth, columns = prediction | ordered by `disease_labels.display_order`, never by alphabet |

### Localisation and XAI

| Metric | Definition | Note |
| --- | --- | --- |
| IoU | `area(A ∩ B) / area(A ∪ B)` on the axis-aligned hulls of the human shape and the AI box | one hull definition for both, from `hull()` in the geometry layer |
| Localisation accuracy @ τ | share of images with `IoU ≥ τ`, proposed `τ = 0.5` (illustrative) | τ travels with the number; a hit rate without its cut-off is not interpretable |
| Dice | `2·area(A ∩ B) / (area(A) + area(B))` | mask metric; only once segmentation exists — not v1 |
| CAM mass in ROI | `Σ CAM over the human region / Σ CAM over the image` | threshold-free, so it is the primary RQ3 figure |
| CAM ∩ ROI IoU | IoU of the thresholded CAM region against the human region | reported **with** `cam_threshold` |
| Pointing hit rate | share of images where the CAM argmax pixel lies inside the human region | coarse but threshold-free |

### HITL

| Metric | Definition | Note |
| --- | --- | --- |
| Agreement | stored `review_sessions.agreement` over sessions that had a prediction | `NULL` (no model existed) is excluded from the denominator |
| Correction rate | `1 − agreement`, same denominator | the RQ1 leading indicator between evaluations |
| Skip rate | `SKIPPED / (VALIDATED + SKIPPED)` | a data-quality signal, not a failure count |
| Annotation time | median and IQR of `time_spent_ms` | median, because the distribution is right-skewed by interruptions |
| Confidence-vs-correction | correction rate per confidence decile | the RQ5 instrument |

### Denominator rules

| Rule | Consequence |
| --- | --- |
| A metric states its denominator | "agreement over 412 reviews with a prediction", never a bare percentage |
| An empty denominator yields `—` | no `0%`, no `NaN`, no interpolation |
| Per-class figures list support | a class with 3 test images is reported with `support = 3`, not averaged into silence |
| Test-set size is reported with every metric | `model_evaluations.sample_count` travels with the numbers |

## Split protocol and leakage control

| Rule | Enforcement |
| --- | --- |
| Patient-level grouping | all images of one patient live in one split; lesion grouping applies within a patient (CLAUDE.md §5) |
| Deterministic assignment | stable hash of `group_key` — re-running produces the identical split |
| Validation is group-aware | carved from the training portion, never sharing a patient with train |
| Test is locked before any training | `POST /dataset-versions/{id}/lock-test`; later mutations are `409 DATASET_LOCKED` |
| Test never grows | HITL batches feed the training pool only; the yardstick is fixed for the whole experiment |
| Test is unreachable from review | `TEST` images never appear in the queue, so no human can annotate the test set |
| Duplicates cannot straddle splits | identical `file_sha256` groups are assigned together, or excluded and recorded |
| No re-splitting mid-experiment | a re-split invalidates every prior comparison; if it is unavoidable it becomes a new dataset version and a new baseline, stated as such |

Verification is mechanical, not a promise: after assignment, a query asserts that no `patient_ref`
appears in more than one split and that no duplicate digest group is split. A failure blocks training.

## Threats to validity

| Threat | Why it matters | Mitigation |
| --- | --- | --- |
| Single-rater labels | one annotator's systematic bias becomes ground truth | record the reviewer per session; report as a limitation; a second rater and κ is the upgrade |
| Label noise in the source data | caps achievable accuracy | duplicates with contradictory labels are found in inspection and recorded |
| Class imbalance | accuracy looks good while a rare class is never predicted | macro-F1 as the primary metric; per-class support always reported |
| Test-set staleness | repeated evaluation on one locked set invites implicit overfitting | count the evaluations per version; keep the promotion metric fixed; treat late gains sceptically |
| Anchoring on AI overlays | agreement is inflated if the annotator sees the AI first | overlays never seed the document, can be hidden, and today are absent entirely |
| Ordering effects | oldest-first queue order correlates with acquisition order | record queue position and review timestamp; check for drift in correction rate over time |
| Selection bias from skips | hard cases are skipped, so training data is easier than reality | skip rate and reasons are reported alongside every accuracy figure |
| Non-independent samples | multiple images per patient inflate effective N | patient-level splits; report patient counts beside image counts |
| Small test set | differences may be noise | report `sample_count`; a delta below `minimum_improvement` is not called an improvement |
| Mid-experiment setting changes | cycle sizes stop being comparable | `threshold_at_creation` per batch; every change is a `SETTINGS_CHANGED` audit row |
| MPS non-determinism | exact reruns can differ | the seed makes the procedure repeatable; bit-wise determinism is not claimed |

## Results — empty templates

### RQ1 · classification across versions

| Version | Batch | Test version | `N` | Accuracy | Macro-F1 | AUROC | Δ Macro-F1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V1 | — | — | — | — | — | — | — |
| V2 | — | — | — | — | — | — | — |
| V3 | — | — | — | — | — | — | — |
| V4 | — | — | — | — | — | — | — |

### Per-class (one table per version)

| Class | Support | Precision | Recall | F1 |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

### RQ2 · localisation

| Version | Images with a human region | Mean IoU | Median IoU | Loc. accuracy @ τ | τ |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

### RQ3 · Grad-CAM alignment

| Version | Images | CAM mass in ROI | CAM ∩ ROI IoU | `cam_threshold` | Pointing hit rate |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

### RQ4 · loop feasibility

| Cycle | Batch size | Job minutes | Device used | Peak memory | Reviews / hour |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

### RQ5 · confidence vs correction

| Confidence decile | Reviews | Correction rate |
| --- | --- | --- |
| — | — | — |

### HITL process

| Cycle | Validated | Skipped | Skip rate | Agreement | Correction rate | Median time |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — |

## Reporting integrity

- Never report a number the code did not compute. A figure with no `model_evaluations` row behind it
  does not exist.
- `—` means not measured. It is never rendered as `0`, `0%`, `N/A ≈ 0` or an interpolated point.
- Every metric carries its denominator, its test version and the device it ran on.
- A comparison across different test versions is refused, not caveated.
- Thresholds travel with their verdicts: `τ`, `cam_threshold`, `minimum_improvement`.
- Negative and null results are recorded here with the same prominence as gains — a rejected candidate
  is a finding, and `models.status = 'REJECTED'` keeps the evidence.
- Nothing in this file may be pre-filled with expected values, literature figures or demo data
  (CLAUDE.md §2.3, §10).
