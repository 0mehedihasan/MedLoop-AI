# ML pipeline

Scope: the `ml/` package — its seams, device policy, and the training / inference / explanation /
evaluation stages as designed. Read the status table before anything else.

See also: [architecture](./architecture.md) · [model_versioning](./model_versioning.md) · [dataset_workflow](./dataset_workflow.md) · [research_protocol](./research_protocol.md) · [development_roadmap](./development_roadmap.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §2.2 (dataset first), §2.3 (never fabricate), §2.8 (hardware).

## Status — IMPLEMENTED vs BLOCKED

**No model has been trained. No metric exists. No dataset is present.** Every number in this document
is either a configuration default or a budgeting estimate, and is labelled as such.

| Capability | State | Why |
| --- | --- | --- |
| Payload dataclasses (`ml/contracts/`) | **IMPLEMENTED** | a seam needs no data to be defined |
| Device resolution (`ml/core/device.py`) | **IMPLEMENTED** | a hardware fact, independent of the dataset |
| Seeding / determinism helper | **IMPLEMENTED** | policy + helper only; nothing to seed yet |
| Dataset loader, transforms, augmentation | **BLOCKED** | layout, extensions, dimensions, class names all unknown (CLAUDE.md §2.2, §5) |
| Model head / label-space binding | **BLOCKED** | class count unverified — `disease_labels.verified_against_data = false` |
| Training loop | **BLOCKED** | Phase 5 depends on Phase 4 inspection |
| Inference | **BLOCKED** | no weights exist; `POST /predictions/{id}/run` answers `409 MODEL_UNAVAILABLE` |
| Grad-CAM | **BLOCKED** | needs a trained model; an untrained network still yields a smooth, convincing heat-map — so none is produced at all (CLAUDE.md §2.3) |
| Coarse localisation | **BLOCKED** | derived from a Grad-CAM that does not exist |
| Evaluation / metrics | **BLOCKED** | needs a locked test split and a model |

Consequences that are already visible in the product: `ai_prediction` is `null` in `ReviewItem`,
`gradcam_url` is `null` so the XAI view is hidden entirely, and `GET /images/{id}/gradcam` returns
`404` rather than a synthesised placeholder.

## Tree

```text
ml/
├── contracts/      frozen dataclass payloads — no torch, no DB, no HTTP
├── core/
│   ├── device.py   AUTO → MPS | CPU resolution, reported honestly
│   ├── seed.py     seeding + determinism switches
│   └── config.py   typed hyperparameter container
├── classification/ backbone + head bound to the DB label space
├── xai/            Grad-CAM (target layer, hooks, normalisation)
├── localization/   CAM → threshold → region → coarse box
├── training/       loop, early stopping, checkpointing, progress callback
├── evaluation/     metric implementations
├── services/       the six seams the worker and API call
└── tests/          CPU-only unit tests, no dataset required
```

`ml/` never imports `backend/app/` (CLAUDE.md §3.1): the worker passes concrete paths and label codes
in, and gets plain dataclasses back. That is what makes the ML layer swappable and testable offline.

## The six service seams

| Seam | Entry point | Payloads |
| --- | --- | --- |
| Device | `services/device_service.resolve()` | `DeviceRequest → DeviceResolution` |
| Training | `services/training_service.train()` | `TrainingRequest → TrainingResult` |
| Classification | `services/classification_service.predict()` | `ClassificationRequest → ClassificationResult` |
| Explanation | `services/explanation_service.explain()` | `ExplanationRequest → ExplanationResult` |
| Localisation | `services/localization_service.localize()` | `LocalizationRequest → LocalizationResult` |
| Evaluation | `services/evaluation_service.evaluate()` | `EvaluationRequest → EvaluationResult` |

Payloads, condensed for documentation — the real file declares one field per line. Field names and
types are exact; every class is `@dataclass(frozen=True)`.

```text
# ml/contracts/payloads.py
Sample:                image_path: Path; label_code: str; group_key: str | None
BoxNorm:               x: float; y: float; w: float; h: float          # normalised [0,1]
EpochRecord:           epoch: int; train_loss: float; val_loss: float; lr: float; seconds: float
Hyperparameters:       architecture: str; input_size: int; batch_size: int; max_epochs: int;
                       learning_rate: float; weight_decay: float; early_stopping: bool; patience: int

DeviceRequest:         requested: str                                  # ∈ TrainingDevice
DeviceResolution:      requested: str; resolved: str; mps_available: bool; fallback_reason: str | None

TrainingRequest:       train: tuple[Sample, ...]; validation: tuple[Sample, ...];
                       label_space: tuple[str, ...]; hyperparameters: Hyperparameters;
                       device: str; seed: int; output_dir: Path
TrainingResult:        weights_path: Path; weights_sha256: str; epochs_trained: int;
                       epoch_history: tuple[EpochRecord, ...]; stopped_early: bool;
                       device_used: str; label_space: tuple[str, ...]

Prediction:            image_path: Path; predicted_code: str; confidence: float;
                       probabilities: Mapping[str, float]; inference_ms: int
ClassificationRequest: image_paths: tuple[Path, ...]; weights_path: Path;
                       label_space: tuple[str, ...]; device: str; batch_size: int
ClassificationResult:  items: tuple[Prediction, ...]; device_used: str

ExplanationRequest:    image_path: Path; weights_path: Path; label_space: tuple[str, ...];
                       target_code: str | None; target_layer: str; device: str; output_path: Path
ExplanationResult:     heatmap_path: Path; cam: FloatArray2D; target_code: str;
                       target_layer: str; cam_min: float; cam_max: float; device_used: str

LocalizationRequest:   cam: FloatArray2D; cam_threshold: float; min_region_area_frac: float;
                       padding_frac: float; image_size: tuple[int, int]
LocalizationResult:    box: BoxNorm | None; regions_found: int; region_area_frac: float;
                       threshold_used: float

EvaluationRequest:     samples: tuple[Sample, ...]; weights_path: Path; label_space: tuple[str, ...];
                       device: str; batch_size: int; human_regions: Mapping[str, BoxNorm] | None
EvaluationResult:      metrics: Mapping[str, float]; confusion_matrix: tuple[tuple[int, ...], ...];
                       per_class: Mapping[str, Mapping[str, float]]; sample_count: int;
                       device_used: str
```

`box: None` and `metrics: {}` are legal results and mean *not computable*, not *zero*. Callers must
render the absence, never a default.

## Device resolution

```text
settings.training_device (AUTO | MPS | CPU)
        │
        ▼
AUTO ──▶ torch.backends.mps.is_available()  ── true ──▶ resolved = MPS
        │                                   ── false ─▶ resolved = CPU, fallback_reason set
MPS  ──▶ available?  no ──▶ resolved = CPU, fallback_reason = "MPS requested but unavailable"
CPU  ──▶ resolved = CPU
```

**Reported ≠ requested.** `DeviceResolution` keeps both, and every row that records a computation
stores the *resolved* value: `training_jobs.device_requested` / `device_used`,
`ai_predictions.device`, `model_evaluations.device`. The UI shows what actually ran (CLAUDE.md §2.3).
A requested `MPS` that silently ran on CPU would make every timing and reproducibility claim wrong.

## Training pipeline

```text
worker claims job (QUEUED → RUNNING)
   │
   ├─1 resolve device                     → device_used written to the job row
   ├─2 read label space from disease_labels (via the worker's repository, not from ml/)
   ├─3 build Sample tuples from training_samples (human labels, frozen at batch creation)
   ├─4 group-aware split of the training portion  → validation never shares a patient with train
   ├─5 transforms + augmentation           BLOCKED: depends on real image statistics
   ├─6 epoch loop ──▶ EpochRecord per epoch ──▶ job.epoch_history + job.progress (0…1)
   │      └─ early stopping on validation loss when settings.early_stopping is true
   ├─7 checkpoint best epoch → storage/models/v{N}/weights.pt + sha256
   ├─8 job RUNNING → EVALUATING; evaluate on the locked TEST version
   ├─9 register the model as CANDIDATE with hyperparameters, loss history, artefact path
   └─10 job → COMPLETED; promotion decision is a separate step (never automatic here)
```

Failure at any step writes `error_message`, sets `FAILED`, and leaves the batch intact so the job can
be retried without re-cutting the batch.

## Inference pipeline

```text
image bytes ──▶ decode ──▶ resize to input_size ──▶ normalise ──▶ forward pass
   ──▶ softmax ──▶ (predicted_code, confidence, full probability vector)
   ──▶ insert one immutable ai_predictions row (device = resolved device)
```

One prediction row per `(image_id, model_id)`. Re-running under a new model version adds a row; it
never overwrites the old one, so agreement stays attributable to the version that produced it.

## Grad-CAM → threshold → region → coarse box

No detector is trained for v1 (CLAUDE.md §2.8). The AI region is derived from the explanation, which
also makes the XAI/localisation alignment question (RQ3) measurable on the same artefact.

```text
forward + backward on the target class
   │  hooks on the last convolutional block (target_layer)
   ▼
activations A_k , gradients G_k  ──▶ w_k = mean(G_k)  ──▶ CAM = ReLU(Σ w_k · A_k)
   ▼
bilinear upsample to (original_height, original_width)
   ▼
normalise to [0,1] using the CAM's own min/max      ── cam_min/cam_max recorded
   ▼
binary mask = CAM ≥ cam_threshold
   ▼
largest connected component ≥ min_region_area_frac  ── else box = None
   ▼
axis-aligned hull + padding_frac  ──▶ BoxNorm in [0,1]  ──▶ ai_predictions.localization
```

| Parameter | Proposed default | Fixed when | Effect |
| --- | --- | --- | --- |
| `target_layer` | last conv block of the configured backbone | Phase 7 | which spatial resolution the CAM has |
| `cam_threshold` | `0.5` | Phase 7 | larger ⇒ tighter, fewer regions |
| `min_region_area_frac` | `0.005` | Phase 7 | suppresses speckle; below it the box is `None` |
| `padding_frac` | `0.05` | Phase 7 | breathing room around the hull |
| `target_code` | predicted class | — | `None` ⇒ explain the argmax |

Defaults are proposals, not tuned values — nothing has been measured. `threshold_used` travels in the
result and is published in the UI beside the box, because a binary verdict without its threshold is
not interpretable (CLAUDE.md §2.3).

## Evaluation

Runs inside the worker, after training, on the **same locked test dataset version** for every model
version (CLAUDE.md §2.5). Writes one `model_evaluations` row per `(model, dataset_version, split)`.

| Group | Metrics | Requires |
| --- | --- | --- |
| Classification | accuracy, macro/per-class precision, recall, F1, AUROC, confusion matrix | labels + predictions |
| Localisation | IoU (human box vs AI box), localisation accuracy at an IoU cut-off | human annotations on test images |
| Segmentation | Dice | a segmentation model — later extension, not v1 |
| XAI | Grad-CAM ∩ human ROI overlap | a CAM and a human region for the same image |

Only computed keys are written. A metric that could not be computed is absent from `metrics` — never
`0.0`, never interpolated. `primary_promotion_metric` (default `MACRO_F1`) selects the key the
promotion criterion reads.

## Seeding and determinism

| Rule | Detail |
| --- | --- |
| One seed per job | `TrainingRequest.seed` is persisted in `models.hyperparameters`, so a run is re-describable |
| Seed everything | Python `random`, NumPy, `torch.manual_seed`; DataLoader workers get a derived per-worker seed |
| Deterministic where it is free | fixed shuffle order per epoch from the seed; sorted file listings — never rely on filesystem order |
| Honest about the rest | bit-wise determinism is **not** claimed on MPS; the policy is a reproducible *procedure*, not identical floats |
| Splits are deterministic | patient-level assignment is a stable hash of `group_key`; never reseed mid-run |

## Memory budget — 16 GB unified, EfficientNet-B0, 224 px

Estimates for planning only; nothing has been measured on this machine.

| Item | Estimate (illustrative) | Note |
| --- | --- | --- |
| Parameters | ~5.3 M | the backbone is chosen to be small on purpose |
| Weights + optimiser state | ~100 MB | Adam keeps two moments per parameter |
| Activations at `batch_size = 32`, 224² | low hundreds of MB | scales roughly linearly with batch size |
| Unified memory shared with the OS and browser | — | the GPU has no separate pool; close the dev server when training |

Levers, in order: drop `batch_size` to 16 → gradient accumulation to keep the effective size → 224 px
stays fixed (it defines the input contract) → `CPU` as the last resort. `num_workers` stays low (0–2)
and `pin_memory` is off, because pinned host memory buys nothing on unified memory. Mixed precision
is not assumed to work on MPS — verify before enabling, and record what was verified.

Nothing in this pipeline has run: `ml/` exposes seams, resolves devices, and refuses to invent the
rest. See the status table above and [development_roadmap](./development_roadmap.md) for the
unblocking order.
