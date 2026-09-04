"""Training configuration and the training seam.

Modules: ``hyperparameters`` (typed configuration + the 16 GB memory budget — implemented),
``service`` (``TorchTrainingService``: ``preflight`` implemented, ``train`` blocked on a dataset).
Import them directly; this package init stays import-free (see ``ml/__init__.py``).
"""
