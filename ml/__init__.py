"""MedLoop AI ML layer — interfaces, pure functions, and honest refusals.

No dataset has been supplied and no model has been trained (CLAUDE.md §2.2, §15). Everything in
this package is therefore one of two things:

* **Implemented** — genuinely dataset-independent: device resolution, seeding, normalised
  geometry, saliency-to-region derivation, metric arithmetic, training-request pre-flight
  validation and the promotion comparison.
* **Blocked** — dataset- or weights-dependent: loaders, transforms, the model heads, Grad-CAM,
  the training loop, inference and evaluation. Those raise
  :class:`~ml.errors.DatasetNotAvailableError` or :class:`~ml.errors.ModelUnavailableError`,
  naming the phase that unblocks them and the file to edit. They never return a placeholder.

Two import rules hold everywhere (CLAUDE.md §3.1; see ``ml/README.md``):

1. ``ml`` never imports ``backend.app`` or anything web-facing.
2. ``torch`` is imported **lazily, inside functions**, never at module import time, so this
   package imports cleanly on a machine without torch. ``ml/tests/test_no_torch_at_import.py``
   enforces both rules by parsing every module.

Subpackage ``__init__`` files stay import-free on purpose: ``ml.types`` depends on individual
modules (``ml.localization.geometry``, ``ml.evaluation.metrics_types``,
``ml.training.hyperparameters``), and a re-exporting package init would turn those dependencies
into an import cycle. Import the module, not the package.
"""

from __future__ import annotations

import logging

from ml.errors import (
    DatasetNotAvailableError,
    DeviceUnavailableError,
    InvalidGeometryError,
    MLError,
    ModelUnavailableError,
)

__version__ = "0.1.0"

# Library code must never configure logging for its host application.
logging.getLogger(__name__).addHandler(logging.NullHandler())

__all__ = [
    "DatasetNotAvailableError",
    "DeviceUnavailableError",
    "InvalidGeometryError",
    "MLError",
    "ModelUnavailableError",
    "__version__",
]
