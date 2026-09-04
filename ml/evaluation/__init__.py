"""Metric implementations and the evaluation seam.

Modules: ``metrics_types`` (frozen metric payloads), ``classification_metrics`` and
``localization_metrics`` (pure arithmetic — implemented), ``service``
(``MetricEvaluationService``: ``compare`` implemented, ``evaluate`` blocked on a dataset).
Import them directly; this package init stays import-free (see ``ml/__init__.py``).
"""
