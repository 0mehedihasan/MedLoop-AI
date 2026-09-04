# MedLoop AI — ML engine

Read this when: touching PyTorch, devices, Grad-CAM, localisation, training or metrics. Extends
`CLAUDE.md §2.2`, `§2.3`, `§2.8`, `§3.1`. **No dataset has been supplied and no model has been
trained** — anything dataset-dependent stays unimplemented and says so (see `medloop-dataset.md`).

## Layout and the import wall

```text
ml/
├── interfaces.py        the six Protocols + their dataclass payloads (single declaration site)
├── errors.py            DatasetNotAvailableError, ModelArtefactError — ML owns these types
├── devices.py           resolve_device(): TrainingDevice → ResolvedDevice
├── classification/      efficientnet_b0.py (primary), resnet18.py (optional baseline)
├── xai/                 gradcam.py (target-layer hook, CAM normalisation)
├── localization/        from_cam.py (threshold → region → coarse box)
├── training/            loop.py, schedule.py, seeding.py
├── evaluation/          metrics.py, confusion.py, localization_metrics.py
└── data/                transforms + loaders — BLOCKED until inspection (§2.2)
```

`ml/` never imports `backend/app/**`, never opens a DB session, never sees a request or a token
(`§3.1`). It takes paths, tensors, plain dataclasses and returns dataclasses. The backend translates
`ml.errors.DatasetNotAvailableError` into `501 DATASET_NOT_AVAILABLE` in its one exception handler.

## Model and input contract

| Item | Value | Note |
| --- | --- | --- |
| Primary architecture | **EfficientNet-B0** | ImageNet-pretrained backbone, new head |
| Optional baseline | **ResNet-18** | comparison only; same head/interface |
| Input | **224 × 224 × 3** | resize/crop decided at inspection time, not guessed |
| Head width | `len(disease_labels)` read from the DB | never a hard-coded `6` (`§5`) |
| Normalisation | fixed constants recorded with the model row | must match at train and inference |
| Device | Apple **MPS**, CPU fallback | never CUDA-only code paths (`§2.8`) |

## Device resolution — report the actual device

```python
# ml/devices.py — frozen dataclass
class ResolvedDevice:
    requested: str                # "AUTO" | "MPS" | "CPU"  (TrainingDevice member)
    actual: str                   # "mps" | "cpu"           what torch really got
    fallback_reason: str | None    # "MPS_UNAVAILABLE" | "OP_UNSUPPORTED_ON_MPS" | None
def resolve_device(requested: TrainingDevice) -> ResolvedDevice: ...
```

| Requested | MPS available | `actual` | `fallback_reason` |
| --- | --- | --- | --- |
| `AUTO` | yes | `mps` | `None` |
| `AUTO` | no | `cpu` | `MPS_UNAVAILABLE` |
| `MPS` | no | `cpu` | `MPS_UNAVAILABLE` — surfaced in the UI, not swallowed |
| `CPU` | — | `cpu` | `None` |

`ResolvedDevice.actual` is persisted on the prediction row, the job row and the log line. Reporting
the *configured* device is a `§2.3` violation: a run that fell back to CPU while the UI says "MPS"
makes every timing number wrong.

## The six Protocol interfaces

All in `ml/interfaces.py` as `@runtime_checkable` Protocols, so the backend depends on the seam and
not on torch. Every payload below is a `@dataclass(frozen=True)`.

| Protocol | Key methods | Payload | State |
| --- | --- | --- | --- |
| `Classifier` | `build(num_classes)`, `load(weights)`, `forward(batch)` | tensors | implementable now |
| `InferenceService` | `predict_image(path)` | `InferenceResult` | needs a trained artefact |
| `GradCAMService` | `explain(path, target_class)` | `GradCAMResult` | needs a trained artefact |
| `LocalizationService` | `localize(cam)` | `LocalizationResult` | pure, testable on synthetic CAMs |
| `TrainingService` | `train(request)` | `TrainingResult` | needs a dataset |
| `EvaluationService` | `evaluate(model, dataset_version)` | `EvaluationResult` | needs a locked test set |

```python
class ClassificationResult:
    label_code: str; confidence: float               # softmax max, 0..1
    probabilities: Mapping[str, float]               # every label in the label space
    model_version: str; device: str                  # device == ResolvedDevice.actual

class GradCAMResult:
    cam: NDArray[np.float32]        # (H, W) normalised 0..1 against its own max
    target_layer: str; target_class: str; device: str
    artefact_path: Path | None      # PNG under storage/gradcam/; None ⇒ nothing to show

class LocalizationResult:
    box: NormalizedBox | None       # {x, y, w, h} in [0,1]; None ⇒ no defensible region
    activation_threshold: float     # the τ actually used — published with the box (§2.3)
    coverage_ratio: float           # fraction of pixels above τ
    source: str = "GRADCAM_THRESHOLD"

class InferenceResult:
    classification: ClassificationResult; duration_ms: int; device: str
    gradcam: GradCAMResult | None; localization: LocalizationResult | None

class EpochRecord: epoch: int; train_loss: float; val_loss: float | None; lr: float; seconds: float

class TrainingResult:
    artefact_path: Path; epochs: Sequence[EpochRecord]; stopped_early: bool
    hyperparameters: Mapping[str, object]; seed: int; device: str

class EvaluationResult:
    dataset_version_id: int; model_version: str; n_samples: int
    metrics: Mapping[str, float]                 # only metrics actually computed
    per_class: Mapping[str, Mapping[str, float]]
    confusion_matrix: Sequence[Sequence[int]]; labels: Sequence[str]
```

## Localisation without a detector (V1)

```text
image ─► EfficientNet-B0 ─► logits ─► target class
              └─► Grad-CAM at the last conv block  ─► normalise CAM to 0..1
                  ─► activation threshold τ (configurable, persisted with the result)
                  ─► binarise ─► largest connected region
                  ─► extent, normalised by original W,H ─► coarse BOUNDING_BOX in [0,1]
                  ─► the annotator corrects it
```

Why no detector at V1 (`§2.8`): a detector needs box supervision the dataset may not have, costs
more than the loop is worth on a 16 GB laptop, and `RQ3` asks whether the *classifier's own*
attention matches human ROIs. A detector/segmenter is a later extension behind the same seam.

Hard rules for this chain:
- τ is a named parameter, recorded on the result and rendered in the UI. Never an undocumented `0.5`.
- A degenerate CAM (all-zero, uniform, region under a minimum area) yields `box = None` and no
  artefact — an all-zero gradient still draws a convincing heat-map, which is what `§2.3` forbids.
- No artefact ⇒ `GET /images/{id}/gradcam` returns `404` and the UI hides the XAI view. Never
  synthesise a placeholder.
- The AI box is written as an `AnnotationSource.AI_LOCALIZATION` geometry, never into a human
  annotation row (`§2.4`).

## Unimplemented ≠ approximated

```python
def train(self, request: TrainingRequest) -> TrainingResult:
    raise DatasetNotAvailableError(
        "Training requires an inspected dataset; see .claude/skills/medloop-dataset.md")
```

| Situation | Correct behaviour | Forbidden |
| --- | --- | --- |
| no dataset | raise `DatasetNotAvailableError` | return zeros, random values, or a stub loss curve |
| no trained artefact | service raises; API answers `409 MODEL_UNAVAILABLE` | load a random-init model and call the output a prediction |
| metric not computable | omit the key from `metrics` | write `0.0` |
| CAM unavailable | `gradcam = None` | an empty or smoothed heat-map |

A stub returning plausible numbers is worse than an exception: it propagates into the statistics
endpoints and then into the thesis.

## Metric definitions (one implementation, in `ml/evaluation/`)

| Metric | Definition | Notes |
| --- | --- | --- |
| accuracy | correct / total | reported with `n_samples`; meaningless alone under class imbalance |
| precision / recall / F1 | per class, plus **macro** (unweighted mean) and weighted averages | macro-F1 is `primary_promotion_metric` (`§8.1`) |
| AUROC | one-vs-rest per class, macro-averaged | needs ≥ 1 positive and 1 negative per class, else omit |
| confusion matrix | raw counts, row = truth, column = prediction | label order recorded alongside |
| IoU | intersection / union of axis-aligned boxes | boxes derived per `§4.3` for polygon/rounded box |
| localisation accuracy | fraction with IoU ≥ τ_loc | **publish τ_loc** with the number |
| Dice | 2·overlap / (a + b) | only once real segmentation masks exist |
| Grad-CAM ∩ ROI overlap | IoU / containment of thresholded CAM vs human ROI | the `RQ3` measurement |

Metrics take arrays, not DB rows. `EvaluationService` is the only caller that knows about a dataset
version. Never round before storing; format for display in the frontend.

## Determinism and seeding

```python
# ml/training/seeding.py
def seed_everything(seed: int) -> None:   # random, numpy, torch, torch.mps; DataLoader worker_init_fn
```

- The seed is a hyperparameter: recorded in `TrainingResult`, persisted on the model row, printed in
  the job log. A run you cannot re-seed is not an experiment.
- `torch.use_deterministic_algorithms(True)` where the op supports it; log when it cannot be honoured.
- Fixed patient-level split from a stored seed (`medloop-dataset.md`), never a fresh shuffle per run.
- Honest limitation for `docs/ml_pipeline.md`: MPS kernels are not guaranteed bit-identical across
  devices or torch versions — report torch version + device instead of claiming reproducibility.

## 16 GB memory budget

| Guideline | Value / rule |
| --- | --- |
| Batch size | default `32` at 224² for B0; it is a setting (`§8.1`), lower it before touching the model |
| Concurrency | **one** training job at a time, enforced by the job table, plus inference in the API |
| Eval / inference | `torch.inference_mode()`; never build a graph for a forward-only pass |
| DataLoader | 2–4 workers, `pin_memory=False` on MPS; stream from disk, never cache decoded images in RAM |
| Cleanup | drop references and `torch.mps.empty_cache()` between epochs and after a job |
| Model size | B0 (~5 M params) and R18 (~11 M) only; large ViTs/UNets are out of envelope (`§2.8`) |
| Artefacts | weights to `storage/models/vN/`; CAM PNGs to `storage/gradcam/`; never inside the repo |

## ML failure modes

| Failure mode | Symptom | Fix |
| --- | --- | --- |
| configured device reported | logs say MPS while the run was CPU-slow | persist `ResolvedDevice.actual` |
| hard-coded `num_classes=6` | head silently wrong after label-space edit | read `disease_labels` |
| silent CPU fallback | 10× slower epochs, no explanation | surface `fallback_reason` |
| synthetic stand-ins | plausible metrics with no dataset | raise `DatasetNotAvailableError` |
| undocumented τ | a box no one can reproduce | carry `activation_threshold` on the result |
| train/inference transform drift | good val metrics, poor real predictions | one transform module, recorded per model |
