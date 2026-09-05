"""MedLoop AI — the Python half of the shared vocabulary (CLAUDE.md §4).

`frontend/types/domain.ts` is the other half. Every enum below is declared there too with
**byte-identical string values**; `backend/tests/test_enum_parity.py` and
`scripts/verify_invariants.py` both read the two files as text and fail if they drift. Adding a
member here without adding it there breaks the build, which is the point.

## Why `class X(str, Enum)` rather than `StrEnum`

`StrEnum` landed in Python 3.11 and CLAUDE.md §11.3 targets 3.11+, so it would be legal. Two things
argue against it.

The parity checker never *imports* this module — it has to run on a fresh clone before any backend
dependency is installed, so it reads the source. Its member pattern is anchored to exactly four
spaces of indentation with a **double-quoted** value, and its class pattern requires `str`,
`StrEnum` or `Enum` among the bases. The declaration form below is therefore part of the contract,
not a style preference: a member indented five spaces, or written with single quotes, is invisible
to the check and drifts in silence.

The second reason is narrower and practical: `(str, Enum)` also byte-compiles under 3.10, which is
what the verification sandbox runs. A file that cannot be compiled during a session cannot be
checked during that session.

## `.value` at every boundary

`(str, Enum)` members compare equal to their own string — `Role.ADMIN == "ADMIN"` is true — so a
member can go straight into a SQLAlchemy parameter or `json.dumps`. Use `.value` anyway when
building a string: under 3.11 `f"{Role.ADMIN}"` renders `Role.ADMIN`, and that difference between
interpreter versions is the one place the shortcut bites.

There is deliberately no `__all__`: it would be a second list of every name in this file, and a
second list is a thing that can disagree with the first.
"""

from __future__ import annotations

from collections.abc import Mapping
from enum import Enum

# ─────────────────────────────────────────────────────────────────────────────────────────
# People
# ─────────────────────────────────────────────────────────────────────────────────────────


class Role(str, Enum):
    """Who is asking. Checked server-side on every request; the client's copy is for UX only."""

    ADMIN = "ADMIN"
    ANNOTATOR = "ANNOTATOR"
    RESEARCHER = "RESEARCHER"


# ─────────────────────────────────────────────────────────────────────────────────────────
# Images — where a sample sits, and what a human did with it
#
# `images.split` and `images.review_status` are two columns on purpose (§4.1). A TRAIN image is
# never reviewed; an UNUSED image walks NOT_REVIEWED → IN_REVIEW → VALIDATED | SKIPPED. Collapsing
# them into one column loses information and makes the transition guards in `services/` unwriteable.
# ─────────────────────────────────────────────────────────────────────────────────────────


class ImageSplit(str, Enum):
    """Where the image sits in the experiment. `UNASSIGNED` is a staging state, not a split."""

    UNASSIGNED = "UNASSIGNED"
    TRAIN = "TRAIN"
    VALIDATION = "VALIDATION"
    TEST = "TEST"
    UNUSED = "UNUSED"


class ReviewStatus(str, Enum):
    """What a human did with the image. Orthogonal to :class:`ImageSplit`."""

    NOT_REVIEWED = "NOT_REVIEWED"
    IN_REVIEW = "IN_REVIEW"
    VALIDATED = "VALIDATED"
    SKIPPED = "SKIPPED"


class ImageLifecycle(str, Enum):
    """Custody, not experiment position: staged, assigned, consumed by training, or archived."""

    STAGING = "STAGING"
    ASSIGNED = "ASSIGNED"
    TRAINING_USED = "TRAINING_USED"
    ARCHIVED = "ARCHIVED"


class DataStatus(str, Enum):
    """The single flat vocabulary the UI filter and the statistics endpoints speak.

    Derived, never stored — see :func:`derive_data_status`, which is mirrored by
    `deriveDataStatus` in `frontend/types/domain.ts`.
    """

    STAGING = "STAGING"
    TRAIN = "TRAIN"
    VALIDATION = "VALIDATION"
    TEST = "TEST"
    UNUSED = "UNUSED"
    IN_REVIEW = "IN_REVIEW"
    VALIDATED = "VALIDATED"
    SKIPPED = "SKIPPED"
    TRAINING_USED = "TRAINING_USED"
    ARCHIVED = "ARCHIVED"


class DatasetStatus(str, Enum):
    """`LOCKED` is the one that carries a rule: §2.5 makes a locked version untouchable."""

    STAGING = "STAGING"
    ACTIVE = "ACTIVE"
    LOCKED = "LOCKED"
    ARCHIVED = "ARCHIVED"


# ─────────────────────────────────────────────────────────────────────────────────────────
# Annotation
# ─────────────────────────────────────────────────────────────────────────────────────────


class AnnotationType(str, Enum):
    """The shape drawn. Geometry is always normalised to `[0, 1]` against the original size (§4.3)."""

    BOUNDING_BOX = "BOUNDING_BOX"
    POLYGON = "POLYGON"
    ROUNDED_BOX = "ROUNDED_BOX"


class AnnotationSource(str, Enum):
    """Who drew a shape.

    `AI_LOCALIZATION` geometry is derived from a model's attribution map; `HUMAN` geometry was drawn
    by an annotator. Accepting an AI box **copies** it into a new `HUMAN` row — the AI row is never
    edited (§2.4).
    """

    HUMAN = "HUMAN"
    AI_LOCALIZATION = "AI_LOCALIZATION"


class SkipReason(str, Enum):
    """Why a reviewer declined. A skip never touches the HITL counter (§6.2)."""

    POOR_IMAGE_QUALITY = "POOR_IMAGE_QUALITY"
    UNCLEAR = "UNCLEAR"
    WRONG_IMAGE_TYPE = "WRONG_IMAGE_TYPE"
    DUPLICATE = "DUPLICATE"
    CANNOT_DETERMINE = "CANNOT_DETERMINE"
    OTHER = "OTHER"


# ─────────────────────────────────────────────────────────────────────────────────────────
# Models, batches, jobs
# ─────────────────────────────────────────────────────────────────────────────────────────


class ModelStatus(str, Enum):
    """Exactly one row may be `ACTIVE`, enforced by a partial unique index rather than by code."""

    ACTIVE = "ACTIVE"
    CANDIDATE = "CANDIDATE"
    REJECTED = "REJECTED"
    ARCHIVED = "ARCHIVED"


class TrainingBatchStatus(str, Enum):
    """The batch is *what to train on* — immutable membership, one open batch at a time (§8.4)."""

    CREATED = "CREATED"
    TRAINING = "TRAINING"
    EVALUATING = "EVALUATING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class TrainingJobStatus(str, Enum):
    """The job is *an attempt* at training a batch, and unlike the batch it may be retried (§9.1)."""

    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    EVALUATING = "EVALUATING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class HitlCycleStage(str, Enum):
    """Derived from the counter, the open batch and the newest candidate — never stored.

    `READY_FOR_RETRAINING` is what §8.4 requires when the threshold is lowered below a counter that
    has already passed it: the samples are not discarded and not renumbered, the stage simply reads
    as met.
    """

    NOT_READY = "NOT_READY"
    READY_FOR_RETRAINING = "READY_FOR_RETRAINING"
    TRAINING = "TRAINING"
    EVALUATING = "EVALUATING"
    CANDIDATE = "CANDIDATE"
    PROMOTED = "PROMOTED"
    REJECTED = "REJECTED"


# ─────────────────────────────────────────────────────────────────────────────────────────
# Settings vocabulary (§8.1)
# ─────────────────────────────────────────────────────────────────────────────────────────


class TrainingDevice(str, Enum):
    """The *configured* device. What the forward pass actually ran on is reported separately (§2.3).

    `AUTO` means MPS when it is genuinely usable and CPU otherwise; `ml/runtime/device.py` resolves
    it and reports the resolution rather than the request.
    """

    AUTO = "AUTO"
    MPS = "MPS"
    CPU = "CPU"


class PromotionMode(str, Enum):
    """Default is `MANUAL_APPROVAL`: a clinical-adjacent system should not self-deploy (§8.1)."""

    AUTOMATIC = "AUTOMATIC"
    MANUAL_APPROVAL = "MANUAL_APPROVAL"


class PromotionMetric(str, Enum):
    """Which figure `minimum_improvement` improves.

    Default is `MACRO_F1`: an improvement threshold is meaningless without naming the metric it
    applies to, and macro-F1 resists the class imbalance a skin-lesion dataset carries (§8.1).
    """

    ACCURACY = "ACCURACY"
    MACRO_F1 = "MACRO_F1"
    MACRO_PRECISION = "MACRO_PRECISION"
    MACRO_RECALL = "MACRO_RECALL"
    AUROC_MACRO = "AUROC_MACRO"


# ─────────────────────────────────────────────────────────────────────────────────────────
# Operations
# ─────────────────────────────────────────────────────────────────────────────────────────


class ServiceState(str, Enum):
    """A check that could not be performed reports `UNKNOWN`, never `ONLINE`."""

    ONLINE = "ONLINE"
    DEGRADED = "DEGRADED"
    OFFLINE = "OFFLINE"
    UNKNOWN = "UNKNOWN"


class LogLevel(str, Enum):
    """Severity on a `system_logs` row."""

    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class LogEvent(str, Enum):
    """The closed set of audited events (`docs/api_contract.md`).

    Not one of the eighteen enums CLAUDE.md §4 tabulates, but declared in both languages all the
    same — `GET /logs/events` returns these strings and the log filter offers them, so a new event
    added on one side only would produce a filter option that matches nothing, or a row the UI
    cannot name. The parity test covers every enum present on both sides, so this one is checked
    even though `scripts/verify_invariants.py` only asserts the eighteen.
    """

    AUTH_LOGIN = "AUTH_LOGIN"
    AUTH_LOGIN_FAILED = "AUTH_LOGIN_FAILED"
    AUTH_LOGOUT = "AUTH_LOGOUT"
    DATASET_UPLOADED = "DATASET_UPLOADED"
    DATASET_ASSIGNED = "DATASET_ASSIGNED"
    DATASET_MODIFIED = "DATASET_MODIFIED"
    DATASET_DELETED = "DATASET_DELETED"
    TEST_SET_LOCKED = "TEST_SET_LOCKED"
    ANNOTATION_SUBMITTED = "ANNOTATION_SUBMITTED"
    IMAGE_SKIPPED = "IMAGE_SKIPPED"
    HITL_BATCH_CREATED = "HITL_BATCH_CREATED"
    TRAINING_STARTED = "TRAINING_STARTED"
    TRAINING_COMPLETED = "TRAINING_COMPLETED"
    TRAINING_FAILED = "TRAINING_FAILED"
    CANDIDATE_CREATED = "CANDIDATE_CREATED"
    MODEL_PROMOTED = "MODEL_PROMOTED"
    MODEL_REJECTED = "MODEL_REJECTED"
    MODEL_ARCHIVED = "MODEL_ARCHIVED"
    LABEL_SPACE_CHANGED = "LABEL_SPACE_CHANGED"
    SETTINGS_CHANGED = "SETTINGS_CHANGED"
    ERROR = "ERROR"


class ServiceKey(str, Enum):
    """The six probes `GET /health` reports.

    The values are lower-case — the only enum in the contract whose values are not their own key.
    They are identifiers in a JSON payload rather than states a human reads, and the frontend keys
    its health rows off them, so the case is load-bearing and the parity check compares values.
    """

    FRONTEND = "frontend"
    API = "api"
    DATABASE = "database"
    ML_ENGINE = "ml_engine"
    STORAGE = "storage"
    TRAINING_WORKER = "training_worker"


# ─────────────────────────────────────────────────────────────────────────────────────────
# Derived status — one implementation per language (§4.1)
# ─────────────────────────────────────────────────────────────────────────────────────────

#: The tail of the precedence chain: once lifecycle and review status have had their say, the split
#: names the status. A dict rather than a chain of `if`s so that adding an `ImageSplit` member makes
#: `derive_data_status` raise `KeyError` loudly instead of falling through to a plausible default —
#: and `test_enum_parity.py` asserts the mapping is total over `ImageSplit`.
_SPLIT_DATA_STATUS: dict[ImageSplit, DataStatus] = {
    ImageSplit.TRAIN: DataStatus.TRAIN,
    ImageSplit.VALIDATION: DataStatus.VALIDATION,
    ImageSplit.TEST: DataStatus.TEST,
    ImageSplit.UNUSED: DataStatus.UNUSED,
    ImageSplit.UNASSIGNED: DataStatus.STAGING,
}


def derive_data_status(
    lifecycle: ImageLifecycle,
    review_status: ReviewStatus,
    split: ImageSplit,
) -> DataStatus:
    """Collapse `(lifecycle, review_status, split)` into the one flat :class:`DataStatus` (§4.1).

    Precedence, highest first::

        ARCHIVED > TRAINING_USED > VALIDATED > SKIPPED > IN_REVIEW
                 > split (TRAIN | VALIDATION | TEST | UNUSED) > STAGING

    Mirrored by `deriveDataStatus` in `frontend/types/domain.ts`. The two must agree for every one
    of the 4 x 4 x 5 = 80 input combinations, and `test_enum_parity.py` checks the whole
    cross-product against a second, differently-shaped statement of the same precedence.

    Why lifecycle outranks review status: an archived image that happens to carry a `VALIDATED`
    review is still archived, and a `TRAINING_USED` image's review has already been consumed —
    reporting it as `VALIDATED` would make it look available to the HITL pool when it is not.

    The signature takes three values rather than a row object so `ml/`, a repository, and a Pydantic
    schema can all call it without agreeing on a container type. The TypeScript side takes an object
    because that is the idiom there; the *precedence* is what has to match, not the calling
    convention.
    """
    if lifecycle is ImageLifecycle.ARCHIVED:
        return DataStatus.ARCHIVED
    if lifecycle is ImageLifecycle.TRAINING_USED:
        return DataStatus.TRAINING_USED

    if review_status is ReviewStatus.VALIDATED:
        return DataStatus.VALIDATED
    if review_status is ReviewStatus.SKIPPED:
        return DataStatus.SKIPPED
    if review_status is ReviewStatus.IN_REVIEW:
        return DataStatus.IN_REVIEW

    return _SPLIT_DATA_STATUS[split]


# ─────────────────────────────────────────────────────────────────────────────────────────
# Promotion metric ↔ metrics field (§9)
# ─────────────────────────────────────────────────────────────────────────────────────────

#: `PromotionMetric` names a *setting*; a metrics block keys the same figure in lower case. One
#: mapping, mirrored by `PROMOTION_METRIC_FIELD` in `domain.ts`, so the promotion arithmetic and the
#: comparison table cannot read different numbers out of the same evaluation row.
PROMOTION_METRIC_FIELD: dict[PromotionMetric, str] = {
    PromotionMetric.ACCURACY: "accuracy",
    PromotionMetric.MACRO_F1: "macro_f1",
    PromotionMetric.MACRO_PRECISION: "macro_precision",
    PromotionMetric.MACRO_RECALL: "macro_recall",
    PromotionMetric.AUROC_MACRO: "auroc_macro",
}


def read_promotion_metric(
    metrics: Mapping[str, object] | None,
    metric: PromotionMetric,
) -> float | None:
    """Read one figure out of a metrics block, or `None` — never `0.0` (§2.3).

    `model_evaluations.metrics` is `jsonb`, so what comes back is whatever was written: the key may
    be absent, or explicitly `null` for a figure that could not be computed (AUROC needs at least
    two classes present in the test split). Both cases are *unknown*, and a caller that received
    `0.0` would chart a missing measurement as a terrible one, or compute an improvement delta
    against a number nobody measured.

    `bool` is excluded explicitly because it is a subclass of `int` in Python, so `True` would
    otherwise sail through as `1.0`.
    """
    if metrics is None:
        return None
    value = metrics.get(PROMOTION_METRIC_FIELD[metric])
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)
