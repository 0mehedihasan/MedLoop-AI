"""Input preprocessing.

Modules: ``spec`` (the declarative, torch-free ``PreprocessingSpec`` — implemented),
``transforms`` (the torchvision pipeline that implements a spec — blocked until the dataset has
been inspected, because the resize and augmentation policy must follow observed image statistics).
Import them directly; this package init stays import-free (see ``ml/__init__.py``).
"""
