"""Single-image inference.

Module: ``service`` — ``TorchInferenceService``. ``describe()`` is implemented (it is the
``GET /health`` ``ml_engine`` probe and must answer honestly); ``predict``, ``explain`` and
``localize`` raise ``ModelUnavailableError`` while no trained artefact exists.
Import it directly; this package init stays import-free (see ``ml/__init__.py``).
"""
