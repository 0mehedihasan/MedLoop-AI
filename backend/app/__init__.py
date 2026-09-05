"""MedLoop AI backend — the FastAPI application package.

Layered `api → services → repositories → database`, single-direction (CLAUDE.md §3.1). A route never
imports a repository; a service never imports a route; `ml/` never imports anything from here.

Deliberately empty of code: importing `app` must not start a database connection, read a setting or
touch the filesystem, so that `app.core.enums` can be imported by a test with no dependencies
installed.
"""
