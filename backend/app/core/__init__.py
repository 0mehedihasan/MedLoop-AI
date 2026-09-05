"""Cross-cutting primitives with no dependency on any other layer.

`enums.py` (the shared vocabulary, §4), and — as phase 3 proceeds — `config.py`, `errors.py`,
`security.py`, `pagination.py`, `status.py`, `audit.py`.

Nothing in this package may import from `app.api`, `app.services`, `app.repositories` or `app.models`.
It is the bottom of the stack, which is what lets `enums.py` be imported by a test that has no
third-party package installed at all.
"""
