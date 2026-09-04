"""Explainability.

Module: ``gradcam`` — Grad-CAM against the backbone's last convolutional block. Blocked until a
trained artefact exists: an untrained network still produces a smooth, convincing heat-map, which
CLAUDE.md §2.3 forbids rendering. Import it directly; this package init stays import-free.
"""
