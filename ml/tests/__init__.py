"""Unit tests for ``ml/`` — CPU-only, no dataset, no torch.

Run them with either runner::

    python3 -m unittest discover -s ml/tests -t .
    pytest ml/tests -q

``unittest.TestCase`` classes are used deliberately so the suite runs on a machine with no
third-party test dependency installed, while staying collectable by pytest.
"""
