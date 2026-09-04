# MedLoop AI — Research protocol and claims

Read this when: writing metrics, designing an experiment, or wording anything about performance.
Extends `CLAUDE.md §2.3`, `§14`. **No dataset has been supplied and no model has been trained, so no
result exists yet.** This file exists to keep that sentence honest.

## Research questions (verbatim, `§14`)

> **RQ1** Does iterative human feedback improve classification performance across successive versions?
> **RQ2** Does human-corrected localisation improve lesion localisation?
> **RQ3** How closely does Grad-CAM align with human-annotated regions?
> **RQ4** Can human-validated feedback support continuous local refinement?
> **RQ5** Can confidence/uncertainty identify samples most worth reviewing? *(after the core loop works)*

| RQ | Measured by | Rows it reads | State |
| --- | --- | --- | --- |
| RQ1 | classification metrics per version on the **same** locked test version | `model_evaluations` | not measurable — no model |
| RQ2 | IoU / localisation accuracy per version, human boxes as reference | `annotations`, `model_evaluations` | not measurable |
| RQ3 | overlap of thresholded Grad-CAM with the derived human box | `ai_predictions`, `annotations` | not measurable |
| RQ4 | whether successive cycles complete and produce evaluable candidates | `training_batches`, `training_jobs`, `models` | loop not yet exercised |
| RQ5 | correction rate binned by AI confidence | `ai_predictions.confidence`, `review_sessions.agreement` | not measurable |

The research contribution is **the whole loop**, not the classifier (`§1`). A change that improves
accuracy but breaks traceability is the wrong change.

## Metric definitions, grouped

Every metric has exactly one implementation, in `ml/evaluation/` (`medloop-ml.md`). Anything not
computed is **omitted**, never zero-filled.

| Group | Metric | Definition / reporting rule |
| --- | --- | --- |
| Classification | accuracy | correct / total; always reported with `n_samples` |
| | precision, recall, F1 | per class, plus macro and weighted means |
| | **macro-F1** | unweighted mean of per-class F1; the promotion default (`§8.1`) |
| | AUROC | one-vs-rest, macro-averaged; omitted if a class has no positive or no negative |
| | confusion matrix | raw counts, row = truth, column = prediction, label order recorded |
| Localisation | IoU | axis-aligned boxes derived per `§4.3` so all three tools compare identically |
| | localisation accuracy | fraction with IoU ≥ τ_loc — **τ_loc is published with the number** |
| | Dice | only once real segmentation masks exist; never approximated from boxes |
| HITL | agreement rate | `mean(review_sessions.agreement)` over rows where a prediction existed (`NULL` excluded) |
| | correction rate | `1 − agreement rate`, same denominator |
| | skip rate | skipped / reviewed, broken down by `SkipReason` |
| | annotation time | median and IQR of `time_spent_ms`; medians, because a coffee break skews the mean |
| XAI | Grad-CAM ∩ human ROI | IoU (and containment) of the thresholded CAM region vs the derived human box |
| Continuous learning | per-version series | the metric above, per model version, on the identical locked test version |

Denominators are part of the metric. "Agreement 82 %" without the number of reviewed images with a
prediction is not a result.

## Version protocol

```text
initial TRAIN split ──────────────► V1   (baseline)
HITL batch 001 (threshold samples) ► V2
HITL batch 002 ────────────────────► V3
HITL batch 003 ────────────────────► V4

                 ┌──────────────────────────────────────────┐
   every version │  evaluated on the SAME locked test        │  ← dataset_versions row, is_test_locked
                 │  dataset version — no exceptions (§2.5)   │
                 └──────────────────────────────────────────┘
```

- Batch size is `hitl_retraining_threshold` from settings, and every batch records
  `threshold_at_creation` — so a version's sample count stays interpretable even if the setting later
  changes (`§8.4`).
- Comparison across versions is valid **only** on identical test data; the code enforces it and
  `GET /models/comparison` returns `comparable: false` with a reason otherwise
  (`medloop-model-versioning.md`).
- Report per version: batch id, `threshold_at_creation`, training dataset version, epochs, seed,
  device actually used, and the metric set. A number without its provenance is not reproducible.
- Need a different test set? New dataset version, and re-evaluate every version you want to compare.

## Confounds and controls (write these down before claiming RQ1)

V2 differs from V1 in **several** ways at once: more samples, human-corrected labels, possibly more
epochs, and a different class balance in the added data.

| Confound | Control that isolates the effect |
| --- | --- |
| more data vs better labels | a version trained on the same *count* of validated samples with the AI's own labels kept (no correction) |
| training-length differences | identical hyperparameters and seed across versions; both recorded |
| class balance shift from what annotators happened to review | report per-class counts added per batch alongside per-class F1 |
| test-set drift | impossible by construction if the locked version rule holds — state that it held |
| annotator learning effect | annotation time and correction rate over review order, reported not corrected |

Without at least the first control, the honest claim is "performance changed across versions after
human review", not "human correction caused the improvement".

## Confidence vs correction rate (`RQ5` groundwork)

`GET /statistics/annotations` bins predictions by confidence and reports the correction rate per bin:

```text
bin = confidence decile (or 10 % bands)
rate = corrections in bin / reviewed-with-prediction in bin
```

```text
ILLUSTRATIVE SHAPE ONLY — NOT MEASURED, NO MODEL EXISTS
confidence band   correction rate      (these two columns are placeholders for layout,
0.90–1.00         ILLUSTRATIVE          not observations; see §2.3 and §10)
0.50–0.60         ILLUSTRATIVE
```

- Bins with a small denominator are shown **with** their `n`, or suppressed — never smoothed.
- The expected monotone relationship is a hypothesis to test, not a result to assume. A flat or
  inverted curve is a finding about calibration and must be reported as such.
- Link to future work: if low-confidence samples really do carry a higher correction rate, ranking
  the queue by uncertainty becomes an active-learning strategy (`§14` RQ5, "later extensions").
  Until measured, the queue stays filter-driven and first-in-first-out — do **not** ship uncertainty
  sampling and then measure it on the data it selected.

## Grad-CAM ∩ human ROI experiment (`RQ3`)

```text
prediction ─► Grad-CAM ─► normalise ─► threshold τ ─► region R_ai
human annotation ─► deriveBoundingBox() ─► R_human          (§4.3, one definition)
                    ↓
        IoU(R_ai, R_human)  +  containment(R_ai ⊂ R_human)  +  centre distance
```

- τ is a **published parameter** carried on every `LocalizationResult`; sweeping τ and reporting the
  curve is stronger than one number, and hiding τ makes the result unreproducible (`§2.3`).
- Report the pair count and how many predictions had **no** CAM region (`box = None`). Excluding them
  silently biases the overlap upward.
- Only images with both a prediction and a human annotation are eligible; the join is `image_id`,
  and the model version on the review session says which model's attention was measured (`§6.3`).
- Overlap is an *alignment* measurement, not evidence that the CAM explains the decision.

## What may and may not be claimed

| Claim | Allowed? | Condition |
| --- | --- | --- |
| "implements a local human-in-the-loop pipeline with versioned retraining" | yes | describe only components that exist in the repo |
| "V2 scores higher than V1 on macro-F1" | yes | both evaluated on the same locked test version, numbers computed by `ml/evaluation/` |
| "human feedback improved the model" | conditional | requires the controls above; otherwise say "performance changed after review cycles" |
| "Grad-CAM aligns with clinician attention" | conditional | one annotator in a prototype is not clinician consensus; report `n`, τ and the annotator count |
| "Grad-CAM explains the prediction" | **no** | CAM is a coarse attribution, not a causal explanation |
| "accuracy of X %" | only when computed | with dataset version, test-set size and version id attached |
| "generalises to other populations/devices" | **no** | single-source data cannot support it |
| "clinically useful / diagnostic / validated" | **never** | not a medical device, not a diagnostic tool (`§1`) |
| "state of the art" | **no** | no benchmark comparison is planned or run |
| any number when no model exists | **never** | see the phrasing table below (`§2.3`, `§10`) |

## Fabrication is a defect, not a rounding error

Forbidden anywhere — code, comments, docs, commit messages, UI, chat: invented accuracy, loss curves,
confusion matrices, Grad-CAM heat-maps, IoU or confidence values presented as model output (`§2.3`).
Demo data is permitted only under `§10`, and layout-preview figures are watermarked `SYNTHETIC`.

| Don't write | Write instead |
| --- | --- |
| "MedLoop achieves 94 % accuracy" | "No model has been trained; accuracy is not yet measurable." |
| "Expected accuracy ≈ 90 %" | "No target is claimed; the baseline will be reported once V1 is trained on inspected data." |
| "Grad-CAM aligns well with human ROIs" | "Alignment is measured as IoU between the thresholded CAM and the derived human box; no measurement exists yet." |
| "Results pending" (with a filled table) | omit the table; render the empty state "no trained model — blocked on dataset" |
| "The model struggles with class X" | "Per-class F1 will show this once an evaluation exists." |
| "82 % agreement" | "Agreement over `n` reviewed images with a prediction: not yet available." |
| a chart with plausible curves | `<EmptyState/>`, or a `SYNTHETIC`-watermarked layout preview (`§10`) |

Never report a number the code did not compute (`§14`). When asked for results, state what is
implemented, what is blocked, and what the missing input is — that answer is complete and true.
