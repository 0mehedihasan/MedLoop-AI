"""Classifier backbones bound to the database label space.

Modules: ``efficientnet_b0`` (primary), ``resnet18`` (optional baseline), ``factory``
(architecture registry). Every forward path is blocked until weights exist; the modules carry the
intended implementation in their docstrings so a later session implements rather than invents.
Import them directly; this package init stays import-free (see ``ml/__init__.py``).
"""
