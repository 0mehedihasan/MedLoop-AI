# MedLoop-AI
MedLoop AI: A Local Human-in-the-Loop Explainable Medical Imaging System for Interactive Annotation and Continuous Model Refinement
MedLoop AI
Full Project Title

MedLoop AI: A Local Human-in-the-Loop Explainable Medical Imaging System for Interactive Annotation and Continuous Model Refinement

Core Idea

MedLoop AI is a fully local medical image AI platform in which a lightweight AI model analyzes medical images, generates a disease prediction and visual explanation, and presents the result to a human annotator. The annotator can accept or correct the prediction and create a bounding box, polygon, or rounded box annotation.

Human validated data accumulate in a training pool. When the configured batch size is reached, for example 1,000 newly validated samples, the system automatically retrains a candidate model. The candidate is evaluated against the same locked test set and is deployed only when it meets the model promotion criteria.

The complete loop is:

Upload → Assign → Train → Predict → Explain → Human Review → Correct → Validate → Accumulate → Retrain → Evaluate → Version → Deploy → Repeat

---

## Dataset

MedLoop AI uses **PAD-UFES-20** as the dataset for the initial research prototype.

> **PAD-UFES-20 is third-party research data**, licensed **CC BY 4.0** and redistributed here
> unmodified. It was created, collected and labelled by its original authors at the Federal
> University of Espírito Santo (UFES), Brazil. MedLoop AI does not own it, did not modify it, and
> does not place it under this project's software licence.
> See **[DATASET_LICENSE.md](./DATASET_LICENSE.md)** before using or redistributing it.

### Local layout

```text
Dataset/
├── images/
│   ├── imgs_part_1/        911 PNG
│   ├── imgs_part_2/        659 PNG
│   └── imgs_part_3/        728 PNG
└── metadata.csv            2,298 rows × 26 columns
```

The directory structure is exactly as received from the source release. Filenames, labels and
metadata fields are unmodified.

### Contents

Every figure below was measured from the files in this repository.

| Property | Value |
| --- | --- |
| Images | 2,298 PNG (only format present) |
| Total image payload | 3.36 GiB |
| Largest single image | 22.52 MiB |
| Mean image size | 1.50 MiB |
| Unique patients (`patient_id`) | 1,373 |
| Unique lesions (`lesion_id`) | 1,641 |
| Diagnostic classes | 6 |
| Biopsy-proven | 1,342 / 2,298 (58.4 %) |
| `img_id` ↔ file correspondence | 1:1 exact (0 missing, 0 undeclared) |

| Code | Diagnosis | Images |
| --- | --- | --- |
| `BCC` | Basal Cell Carcinoma | 845 |
| `ACK` | Actinic Keratosis | 730 |
| `NEV` | Melanocytic Nevus | 244 |
| `SEK` | Seborrheic Keratosis | 235 |
| `SCC` | Squamous Cell Carcinoma | 192 |
| `MEL` | Melanoma | 52 |

Class counts are read from `metadata.csv`; they are **not** model outputs. The class distribution
is heavily imbalanced, which is why macro-averaged metrics are the default for model comparison.

### Git LFS

The 2,298 images are versioned through **Git LFS**. `metadata.csv` is deliberately kept in normal
Git so that any change to a clinical field or a label shows up in a reviewable diff.

`.gitattributes`:

```gitattributes
Dataset/**/*.png      filter=lfs diff=lfs merge=lfs -text
Dataset/metadata.csv  text eol=lf
```

The rule is scoped to `Dataset/` on purpose — project artwork at the repository root stays in
normal Git and does not consume LFS quota.

#### Getting the dataset

Install Git LFS **before** cloning, otherwise you receive 133-byte pointer files instead of images:

```bash
# macOS
brew install git-lfs
git lfs install

git clone https://github.com/0mehedihasan/MedLoop-AI.git
cd MedLoop-AI
git lfs pull            # only needed if you cloned before running `git lfs install`
```

Verify you have real images, not pointers:

```bash
find Dataset/images -name '*.png' | wc -l      # expect 2298
du -sh Dataset/images                          # expect ~3.4G, not ~300K
head -c 40 Dataset/images/imgs_part_1/*.png | head -1
# real PNG -> binary bytes;  pointer -> "version https://git-lfs.github.com/..."
```

**If you get pointer files and `git lfs pull` cannot resolve them**, the LFS objects are not hosted
on the remote — a full copy of this dataset is 3.36 GiB, which exceeds GitHub's 1 GiB free LFS
storage quota. In that case, obtain the dataset directly from the original source linked below and
place it at `Dataset/` using the layout above. The application reads the directory; it does not
care how the files got there.

#### Contributing near the dataset

```bash
git lfs install          # once per machine
git lfs ls-files | wc -l # 2298 when the images are committed
git lfs status           # shows which LFS files are staged
```

Never `git add` an image with Git LFS uninstalled — the clean filter will not run and Git will
store 3.36 GiB of raw binaries in history instead of pointers.

### Attribution

**PAD-UFES-20 is licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** Redistribution
is permitted; attribution is mandatory and must travel with any copy.

| Field | Value |
| --- | --- |
| Dataset | PAD-UFES-20, version 1, published 7 July 2020 |
| DOI | [10.17632/zr7vgbcyr2.1](https://doi.org/10.17632/zr7vgbcyr2.1) |
| Licence | CC BY 4.0 |
| Institution | Universidade Federal do Espírito Santo (UFES), Brazil |
| Programme | Dermatological and Surgical Assistance Program (PAD) |
| Ethics | University committee nº 500002/478 · Plataforma Brasil nº 4.007.097 |

Contributors, in record order: Andre G. C. Pacheco, Gustavo R. Lima, Amanda S. Salomão,
Breno Krohling, Igor P. Biral, Gabriel G. de Angelo, Fábio C. R. Alves Jr, José G. M. Esgario,
Alana C. Simora, Pedro B. C. Castro, Felipe B. Rodrigues, Patricia H. L. Frasson,
Renato A. Krohling, Helder Knidel, Maria C. S. Santos, Rachel B. Espírito Santo,
Telma L. S. G. Macedo, Tania R. P. Canuto, Luíz F. S. de Barros.

| Resource | Location |
| --- | --- |
| Dataset record (canonical) | <https://data.mendeley.com/datasets/zr7vgbcyr2/1> |
| Dataset DOI | <https://doi.org/10.17632/zr7vgbcyr2.1> |
| Data article | *Data in Brief*, 2020 — same title and authors |
| Related article (per the record) | <https://doi.org/10.1016/j.compbiomed.2019.103545> |
| Preprint | <https://arxiv.org/abs/2007.00478> |
| Authors' project code | <https://github.com/labcin-ufes/PAD-UFES-20> |

- Cite the **dataset DOI and the data article** — not this repository.
- You are responsible for complying with the original terms. Read the licence and the record
  yourself; [`DATASET_LICENSE.md`](./DATASET_LICENSE.md) is a convenience, not a substitute.
- The only change made here is a directory rename (`Dataset ` → `Dataset`, removing a stray trailing
  space). Image bytes, filenames, `metadata.csv` and labels are byte-for-byte as received.

### Two licences, one repository

| Path | Licence | File |
| --- | --- | --- |
| everything except `Dataset/` | Apache-2.0 | [`LICENSE`](./LICENSE) |
| `Dataset/` | CC BY 4.0, © the dataset authors | [`DATASET_LICENSE.md`](./DATASET_LICENSE.md) |

The project licence does not extend to the dataset, and the dataset licence does not extend to the
code. Neither may be applied to the other's files.

### Scope and limitations

- Nothing under `Dataset/` leaves the machine. There is no cloud storage, no external inference API
  and no telemetry anywhere in this project.
- `metadata.csv` contains de-identified records as published by the original authors. This project
  adds no identifiers and generates no synthetic patient data.
- **MedLoop AI is a local research prototype, not a medical device.** No clinical validation has
  been performed, and no diagnostic claim is made or implied.

---

1. Target Medical Problem
Initial domain

Skin lesion / skin disease image analysis

The first implementation should avoid MRI, CT and other computationally or annotation intensive modalities.

The system should initially support:

Disease classification
Lesion localization
Explainable prediction
Human annotation
Continuous model refinement

The project is deliberately designed to remain practical on your:

MacBook Air M5, 16 GB RAM, 512 GB SSD

2. Dataset Strategy
Primary dataset: PAD-UFES-20

PAD-UFES-20 is the initial dataset because it contains 2,298 clinical skin lesion images from 1,373 patients, with six diagnostic categories and clinical metadata. The images were acquired using smartphones.

The six classes are:

Code	Diagnosis
ACK	Actinic Keratosis
BCC	Basal Cell Carcinoma
MEL	Melanoma
NEV	Melanocytic Nevus
SCC	Squamous Cell Carcinoma
SEK	Seborrheic Keratosis

PAD-UFES-20 Dataset

Dataset split

PAD-UFES-20 should be divided at patient level:

PAD-UFES-20
│
├── Training
├── Validation
└── Locked Test

Patient level splitting is important because the dataset contains patient and lesion identifiers.

Secondary dataset: ISIC

ISIC can subsequently provide additional images for the Unused / HITL pool, particularly because its challenge datasets include lesion segmentation resources.

ISIC Challenge Data

3. Dataset Lifecycle

Every uploaded dataset initially enters:

STAGING

The Admin decides:

             Uploaded Data
                   ↓
                STAGING
                   ↓
       ┌───────────┼───────────┐
       ↓           ↓           ↓
     TRAIN        TEST       UNUSED
Train

Used for model training.

Test

Used for final objective evaluation.

Once designated as the official test set, it should be locked.

Unused

Available for human review.

UNUSED
   ↓
HITL REVIEW
   ↓
VALIDATED / SKIPPED
4. Initial AI Model
Classification

Use:

EfficientNet-B0

Initial configuration:

Input: 224 × 224 × 3
Classes: 6
Framework: PyTorch
Hardware: Apple MPS

This keeps the initial training workload reasonable for the M5 MacBook Air.

A ResNet-18 implementation can be retained as a baseline comparison.

5. AI Inference

For every reviewed image:

Image
  ↓
EfficientNet-B0
  ↓
Disease
  +
Confidence
  +
Grad-CAM
  +
Coarse localization

Example:

Prediction: Melanoma
Confidence: 91.4%
6. Explainable AI

The initial XAI technique is:

Grad-CAM

The annotator can switch between:

Original Image
Grad-CAM
AI Localization
Human Annotation
Overlay

The purpose is not only to display an attractive heatmap.

MedLoop should investigate whether:

The region considered important by the AI corresponds to the region identified by the human annotator.

7. AI Localization

For the first version, avoid training a large object detection model.

Instead:

Grad-CAM
   ↓
Activation threshold
   ↓
Relevant region
   ↓
Coarse Bounding Box

This provides an initial AI region that the annotator can correct.

Later, a dedicated detection or segmentation model can be introduced.

8. Data & Admin

Review Data and Admin are merged into one protected module.

Top-level application:

MedLoop AI
│
├── Dashboard
│
├── Data & Admin
│
└── Analyze Model

The Data & Admin section contains both annotation and administrative functionality.

9. Local Login

Initial local prototype credentials:

Username: admin
Password: MedLoop@2026

This is intended for the local prototype.

The final implementation should store a password hash rather than hard-code the password in application source code.

10. Data & Admin Sections
Data & Admin
│
├── Review Data
├── Dataset Management
├── Upload Data
├── Data Statistics
├── Annotation Statistics
├── Training Management
└── System Logs
11. Review Data

The annotator starts with:

UNUSED DATA

They can filter by:

Disease
AI confidence
Dataset
Upload date
Annotation status
Annotation type

Example:

Disease:       All
Confidence:    < 70%
Status:        Unused
Date:          Last 30 days

[ Apply Filters ]
12. Review Interface

The system presents one image at a time.

┌─────────────────────────────────────────────┐
│ Image 247 / 4827                     SKIP   │
├─────────────────────────────────────────────┤
│                                             │
│              MEDICAL IMAGE                  │
│                                             │
│          ┌─────────────────┐                │
│          │                 │                │
│          │     LESION      │                │
│          │                 │                │
│          └─────────────────┘                │
│                                             │
├─────────────────────────────────────────────┤
│ AI PREDICTION                               │
│                                             │
│ Disease: Melanoma                          │
│ Confidence: 91.4%                           │
│                                             │
│ [ Grad-CAM ] [ AI BBox ]                   │
├─────────────────────────────────────────────┤
│ HUMAN ANNOTATION                            │
│                                             │
│ Disease: [ Melanoma ▼ ]                    │
│                                             │
│ [ Bounding Box ]                            │
│ [ Polygon ]                                 │
│ [ Round Box ]                               │
│                                             │
│             [ SUBMIT ]                      │
│             [ SKIP ]                        │
└─────────────────────────────────────────────┘
13. Annotation Tools
Bounding Box

For simple localization.

(x_min, y_min)
      ┌─────────────┐
      │   lesion    │
      └─────────────┘
                  (x_max, y_max)
Polygon

For irregular lesion boundaries.

Round Box

For quick approximate localization.

The internal representation can be normalized into a bounding or polygon representation.

14. Submit

When the annotator selects Submit:

Human label
      +
Human annotation
      +
AI prediction
      +
AI confidence
      +
Model version
      +
Timestamp
      ↓
Stored
      ↓
Status = VALIDATED
      ↓
HITL Training Pool
      ↓
Counter +1
      ↓
NEXT IMAGE

The next image appears automatically.

15. Skip

Skip means:

Not validated for training.

SKIP
 ↓
Status = SKIPPED
 ↓
Optional reason
 ↓
NEXT IMAGE

Possible reasons:

Poor image quality
Unclear
Wrong image type
Duplicate
Cannot determine
Other
16. Automatic Review Queue

The annotator never needs to repeatedly return to the dataset page.

Image 1
 ↓ Submit
Image 2
 ↓ Skip
Image 3
 ↓ Submit
Image 4
 ↓ Submit
...

The process continues until the filtered queue is exhausted.

17. HITL Training Pool

Validated data enter:

HITL Training Pool

The system tracks:

New validated samples since last training

Example:

731 / 1000
18. Automatic Retraining

When:

New validated samples >= 1000

the system automatically:

Create Batch
      ↓
Prepare training data
      ↓
Train candidate model
      ↓
Evaluate candidate
      ↓
Compare with active model
      ↓
Register candidate
      ↓
Deploy if qualified

During development, Admin should be able to configure:

100
250
500
1000
Custom

For the final experiment:

1,000 samples per retraining cycle

19. Model Promotion

A newly trained model must not automatically replace the active model.

Example:

V3 ACTIVE
   ↓
1000 validated samples
   ↓
Train V4 Candidate
   ↓
Evaluate V4
   ↓
Compare V3 vs V4

If:

V4 > V3

then:

V4 → ACTIVE

If:

V4 ≤ V3

then:

V4 → REJECTED
V3 → remains ACTIVE

This provides basic model governance.

20. Model Versioning

Every training cycle produces a version.

V1
 ↓
V2
 ↓
V3
 ↓
V4
 ↓
...

Each version records:

Version
Training dataset
HITL batch
Training date
Hyperparameters
Epochs
Metrics
Loss
Status
Model path
21. Analyze Model

The second main application area is:

Analyze Model

It provides the research and performance view.

Current model
MODEL V4
ACTIVE

Accuracy
Precision
Recall
F1
AUROC
IoU
Dice

Only applicable metrics should be displayed depending on the task.

22. Model Version Comparison

Users can compare:

V1 vs V2
V2 vs V3
V3 vs V4

Example:

Metric	V1	V2	V3	V4
Accuracy	88.1%	90.4%	92.7%	94.1%
Precision	87.3%	89.8%	91.5%	93.7%
Recall	86.9%	90.1%	91.9%	92.8%
F1	87.1%	89.9%	91.7%	93.2%

The values above are illustrative.

23. Loss Analysis

Store:

Training loss
Validation loss
Epoch
Learning rate

for every training run.

This lets you inspect:

V1 loss
V2 loss
V3 loss
V4 loss
24. Admin Dataset Statistics

Admin can see:

Total Images
Train
Validation
Test
Unused
Validated
Skipped
Time filters
Today
Yesterday
Last 7 days
Last 30 days
Custom date range

Statistics:

Images uploaded
Images reviewed
Annotations submitted
Images skipped
Human corrections
Retraining events
25. Annotation Statistics

Track:

AI accepted
AI corrected
Skipped
Human AI disagreement

Example:

AI Agreement Rate
Human Correction Rate
Skip Rate
26. Disease Statistics

Admin can inspect:

Disease
Number of images
Reviewed
Validated
Skipped
Correction rate

This can reveal classes where the model struggles.

27. Confidence Analysis

One particularly valuable analysis:

AI Confidence
      ↓
Human Correction Rate

For example:

Confidence 90 to 100%
→ Low correction rate

Confidence 50 to 60%
→ High correction rate

This provides a foundation for future uncertainty based active learning.

28. Explanation Alignment

MedLoop can compare:

Grad-CAM
    vs
Human BBox / Polygon

For example:

AI explanation region
          +
Human ROI
          ↓
Spatial overlap
          ↓
IoU

This provides a quantitative XAI experiment.

29. Admin Data Upload

Admin can upload:

Images
Labels
Annotations
Metadata

Then choose:

TRAIN
TEST
UNUSED

The system records:

Dataset name
Upload date
Image count
Classes
Source
Assignment
30. Test Set Protection

The official test set should be:

TEST
 ↓
LOCKED

It should never participate in:

HITL review
Retraining
Training augmentation
Human correction
Model training

The same locked test set should be used for comparing successive model versions.

This is essential for demonstrating genuine model improvement.

31. Local Architecture
                       MACBOOK AIR M5
                              │
                ┌─────────────┴─────────────┐
                │                           │
             Browser                   Local Storage
                │                           │
                ▼                           │
         React / Next.js                    │
                │                           │
                ▼                           │
             FastAPI                        │
                │                           │
       ┌────────┼─────────┐                 │
       ▼        ▼         ▼                 │
    PyTorch  PostgreSQL  Worker             │
       │                    │               │
       ▼                    ▼               │
    Inference            Training           │
       │                    │               │
       ├── Classification   │               │
       ├── Grad-CAM         │               │
       └── Localization     │               │
                            │               │
                            └───────────────┘

Everything runs locally.

No cloud inference.

No online annotation service.

No cloud database.

No medical images sent externally.

32. Recommended Technology Stack
Layer	Technology
Frontend	React / Next.js
Backend	FastAPI
AI	PyTorch
Initial model	EfficientNet-B0
XAI	Grad-CAM
Database	PostgreSQL
Annotation	HTML Canvas / Konva.js
Image processing	OpenCV + Pillow
Charts	Recharts / Plotly
Local acceleration	Apple MPS
Storage	Local filesystem
Authentication	Local database
Deployment	Localhost
33. Storage Architecture

Because your SSD is 512 GB, avoid copying datasets for every model version.

Use:

One physical image
      +
Database references
      +
Dataset/version metadata

Example:

image_001.jpg

Dataset:
PAD-UFES

Split:
TRAIN

Used by:
V1
V2
V3
V4

The image itself is stored only once.

34. Recommended Folder Structure
MedLoopAI/
│
├── frontend/
│
├── backend/
│
├── ml/
│   ├── classification/
│   ├── xai/
│   ├── localization/
│   ├── training/
│   └── evaluation/
│
├── data/
│   ├── train/
│   ├── validation/
│   ├── test/
│   ├── unused/
│   ├── validated/
│   └── skipped/
│
├── annotations/
│
├── models/
│   ├── v1/
│   ├── v2/
│   ├── v3/
│   └── v4/
│
├── training_batches/
│
└── logs/
35. Database Architecture

Core tables:

users
datasets
images
annotations
ai_predictions
review_sessions
training_batches
models
model_evaluations
system_logs
Image
id
dataset_id
file_path
split
status
label
uploaded_at
AI Prediction
id
image_id
model_id
predicted_class
confidence
bbox
gradcam_path
created_at
Human Annotation
id
image_id
annotator_id
annotation_type
label
coordinates
created_at
Training Batch
id
batch_number
sample_count
created_at
status
Model
id
version
training_batch_id
model_path
metrics
status
created_at
36. Local Roles

Initially:

Admin

Can:

Upload data
Assign Train/Test/Unused
Manage datasets
Review data
View statistics
Manage training
Manage models
View logs
Annotator

Can:

Review images
See AI prediction
See Grad-CAM
Correct disease
Draw BBox
Draw Polygon
Use Round Box
Submit
Skip
Researcher

Can:

Analyze model
Compare versions
Inspect performance
Inspect training history
Analyze HITL improvement

For your first implementation, Admin and Annotator can be the same authenticated local account if you want to keep the system simple.

37. Research Experiment

This is the central scientific experiment.

Baseline
PAD-UFES-20
      ↓
Patient-level split
      ↓
Train
      ↓
V1

Evaluate V1 on the locked test set.

HITL Cycle 1
Unused images
      ↓
Human review
      ↓
1000 validated samples
      ↓
Retrain
      ↓
V2

Evaluate V2 on the same test set.

HITL Cycle 2
1000 additional validated samples
      ↓
Retrain
      ↓
V3
HITL Cycle 3
1000 additional validated samples
      ↓
Retrain
      ↓
V4

Then compare:

V1 → V2 → V3 → V4
38. Main Research Questions
RQ1

Does iterative human feedback improve medical image classification performance over successive model versions?

RQ2

Does human corrected localization improve lesion localization?

RQ3

How closely does Grad-CAM align with human annotated regions?

RQ4

Can human validated feedback support continuous local model refinement?

RQ5

Can confidence or uncertainty identify samples that are more valuable for human review?

RQ5 can be added after the core system works.

39. Evaluation Metrics
Classification
Accuracy
Precision
Recall
F1
AUROC
Confusion Matrix
Localization
IoU
Localization accuracy
Segmentation

Later:

Dice
IoU
HITL
Human AI agreement
Correction rate
Skip rate
Annotation time
XAI
Grad-CAM / Human ROI overlap
Continuous learning
V1 performance
V2 performance
V3 performance
V4 performance
40. MVP

The first working version should contain only:

✓ PAD-UFES-20
✓ Patient-level split
✓ EfficientNet-B0
✓ Classification
✓ Grad-CAM
✓ Coarse AI BBox
✓ Human BBox
✓ Polygon
✓ Round Box
✓ Submit
✓ Skip
✓ Automatic next image
✓ Local authentication
✓ Data upload
✓ Train/Test/Unused assignment
✓ HITL data pool
✓ Configurable batch size
✓ Automatic retraining
✓ Model versioning
✓ Fixed test evaluation
✓ Model comparison
✓ Admin statistics
✓ Local deployment
41. Later Extensions

Once the MVP is stable:

Active Learning
        ↓
Uncertainty Ranking
        ↓
Segmentation Model
        ↓
Dedicated Detection Model
        ↓
Multiple Annotators
        ↓
Inter-Annotator Agreement
        ↓
Advanced XAI
        ↓
Advanced Model Governance

Do not build these before the fundamental loop works.

42. Final System Loop
                     ┌─────────────────────┐
                     │    ADMIN UPLOAD     │
                     └──────────┬──────────┘
                                ↓
                          STAGING DATA
                                ↓
                ┌───────────────┼───────────────┐
                ↓               ↓               ↓
              TRAIN           TEST            UNUSED
                │               │               │
                ↓               │               ↓
          INITIAL TRAINING      │          HUMAN REVIEW
                │               │               │
                ↓               │        ┌──────┴──────┐
              MODEL V1          │        ↓             ↓
                │               │     SUBMIT         SKIP
                │               │        │
                │               │        ↓
                │               │   VALIDATED DATA
                │               │        │
                │               │    Counter
                │               │        │
                │               │      1000
                │               │        │
                │               │        ↓
                │               │   AUTO RETRAIN
                │               │        │
                │               │        ↓
                │               │  CANDIDATE MODEL
                │               │        │
                │               └────────┤
                │                        ↓
                │                   FIXED TEST
                │                        │
                │                        ↓
                │                  MODEL COMPARISON
                │                   /           \
                │              BETTER          WORSE
                │                 ↓               ↓
                │              DEPLOY          REJECT
                │                 │
                └─────────────────┘
                          │
                          ↓
                     MODEL V2/V3/V4
                          │
                          ↓
                    ANALYZE MODEL
                          │
              ┌───────────┼────────────┐
              ↓           ↓            ↓
           Metrics       Loss       Versions
              │           │            │
              └───────────┼────────────┘
                          ↓
                   RESEARCH ANALYSIS
Final Project Definition

MedLoop AI is a fully local Human-in-the-Loop Explainable Medical Imaging platform that combines lightweight medical image classification, Grad-CAM based explainability, interactive human annotation, controlled dataset management, automatic batch based retraining, model versioning, and fixed test set evaluation. The system creates a continuous feedback loop in which AI predictions are reviewed and corrected by humans, validated annotations accumulate into training batches, and improved model versions are automatically generated, evaluated, and selectively deployed.

Final identity

Name: MedLoop AI

Title: MedLoop AI: A Local Human-in-the-Loop Explainable Medical Imaging System for Interactive Annotation and Continuous Model Refinement

Initial dataset: PAD-UFES-20

HITL expansion: ISIC

Initial model: EfficientNet-B0

XAI: Grad-CAM

Human annotation: Bounding Box + Polygon + Round Box

Core modules: Dashboard + Data & Admin + Analyze Model

Retraining: Every 1,000 newly validated samples

Deployment: Local only

Hardware target: MacBook Air M5, 16 GB RAM, 512 GB SSD

Primary research contribution: Measuring whether iterative human feedback produces measurable improvement across successive AI model versions.