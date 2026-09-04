# Authentication

Scope: who can log in, how the password is stored, how the bearer token is issued and verified, what
each role may do, and the limitations that are deliberate.

See also: [backend](./backend.md) · [frontend](./frontend.md) · [database](./database.md) · [local_deployment](./local_deployment.md) · [api_contract](./api_contract.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §4 (`Role`), §11.1 (routes), §11.3 (hashing, no secret literals), §11.5 (dependency decisions).

## Prototype credentials

| Field | Value |
| --- | --- |
| Username | `admin` |
| Password | `MedLoop@2026` |
| Role | `ADMIN` |
| Status | **PROTOTYPE ONLY** — single-user local research build |

Rules that make that safe enough for a laptop and unsafe for anything else:

- The password is **never a literal in application source**. The seed script hashes it and inserts only
  `password_hash` + `password_salt`; nothing in `backend/app/` can reproduce it.
- It is the *initial* credential. `scripts/create_user.py --change-password` replaces it, and the seed
  refuses to run twice.
- The API binds to `127.0.0.1` only (`MEDLOOP_API_HOST`), so the account is not reachable off the
  machine.
- Before this system holds real patient data, this credential is rotated and the upgrade seams below
  are taken — that is a precondition, not a suggestion.

## Users

`users` holds `username` (`UQ`), `display_name`, `role`, `password_hash`, `password_salt`,
`is_active`, `last_login_at`. There is no self-registration endpoint and no sessions table.

| `Role` | Intent |
| --- | --- |
| `ADMIN` | everything: data, splits, training, promotion, settings, audit |
| `ANNOTATOR` | review and annotate; no dataset, training or settings authority |
| `RESEARCHER` | read analytics and model results; never writes data |

Deactivation is `is_active = false`, never a row delete: annotations, review sessions and audit rows
must keep pointing at a real user (CLAUDE.md §2.4).

## Password hashing

```python
# backend/app/core/security.py
class PasswordHasher(Protocol):
    def hash(self, password: str) -> tuple[str, str]: ...          # (hash_hex, salt_hex)
    def verify(self, password: str, hash_hex: str, salt_hex: str) -> bool: ...
```

| Parameter | Value | Why |
| --- | --- | --- |
| Algorithm | PBKDF2-HMAC-SHA256 (`hashlib.pbkdf2_hmac`) | stdlib — the auth path installs and tests with zero third-party wheels (CLAUDE.md §11.5) |
| Iterations | `600 000`, from `MEDLOOP_PBKDF2_ITERATIONS` | cost is configuration, so it can be raised without a code change |
| Salt | 16 bytes per user from `secrets.token_bytes` | stored beside the hash; never shared, never derived from the username |
| Derived key | 32 bytes, hex-encoded | — |
| Comparison | `hmac.compare_digest` | constant time |
| Upgrade seam | Argon2id behind the same protocol | swap the implementation, re-hash on next successful login |

The protocol is what makes the swap cheap: `auth_service` depends on the interface, so a future
Argon2id implementation is a new class and one wiring line, not an audit of every call site.

## Login and token

```text
POST /auth/login {username, password}
   │  load user by username        ── missing user? still run a dummy verify (no timing oracle)
   │  verify password              ── invalid? 401 UNAUTHENTICATED, message identical to unknown user
   │  is_active = false            ── 401 as well; existence is never disclosed
   ▼
issue token, stamp users.last_login_at, audit AUTH_LOGIN
   → {token, expires_at, user}
```

The token is a stdlib HMAC token — JWT-shaped, no JWT dependency:

```text
payload = b64url({"sub": user_id, "u": username, "role": "ADMIN", "iat": …, "exp": …})
sig     = HMAC-SHA256(MEDLOOP_SECRET_KEY, payload)
token   = f"{payload}.{b64url(sig)}"
```

| Property | Detail |
| --- | --- |
| Key | `MEDLOOP_SECRET_KEY`; startup fails fast if unset — no generated fallback, which would silently invalidate tokens on restart |
| Lifetime | `MEDLOOP_TOKEN_TTL_MINUTES`, default `720` (a recorded engineering choice, not a security claim) |
| Verification | signature first with `compare_digest`, then `exp`, then load the user and re-check `is_active` and `role` |
| Role is re-read | the claim is a hint; authorisation uses the freshly loaded row, so a demotion takes effect on the next request |
| Transport | `Authorization: Bearer <token>` on everything except `/health` and `/auth/login` |
| Failure | any of the above → `401 UNAUTHENTICATED`, uniform envelope |

## Client session — and its two known limitations

`providers/AuthProvider` holds the user and expiry in React state; `lib/auth.ts` persists the token so
a page reload does not log the researcher out mid-review, and `lib/api-client.ts` is the only place the
header is attached. `GET /auth/session` re-hydrates on boot; a `401` from any call clears the session
and redirects to `/login` with the intended route preserved.

| Limitation | Consequence | Upgrade path |
| --- | --- | --- |
| The token is readable by JavaScript | script injection in the app could exfiltrate it | serve the API same-origin behind a local reverse proxy, move the token into an `httpOnly`, `SameSite=Strict` cookie, add a CSRF token for unsafe methods |
| The token is stateless | `POST /auth/logout` clears the client and audits `AUTH_LOGOUT`, but a copied token stays valid until `exp` | add `users.token_version` to the payload and bump it on logout / password change — one column, one comparison |

Both are recorded here rather than hidden because the schema has **no sessions table**: with nothing
server-side to delete, "logout" cannot mean revocation, and pretending otherwise would be the kind of
false assurance this project forbids (CLAUDE.md §2.3).

## Capability matrix

One row per capability. `✓` = permitted, `—` = `403 FORBIDDEN`.

| Capability | ADMIN | ANNOTATOR | RESEARCHER |
| --- | --- | --- | --- |
| Log in, read own session, view the dashboard | ✓ | ✓ | ✓ |
| Read the review queue, claim / release an image | ✓ | ✓ | — |
| Submit an annotation, skip an image | ✓ | ✓ | — |
| Archive an annotation (`DELETE /annotations/{id}`) | ✓ | ✓ | — |
| Browse images and image detail | ✓ | ✓ | ✓ |
| Register an ingest path (`POST /uploads`) | ✓ | — | — |
| Create or archive a dataset / version | ✓ | — | — |
| Assign splits, lock the test split | ✓ | — | — |
| Run inference (`POST /predictions/{id}/run`) | ✓ | — | — |
| Start or cancel a training job | ✓ | — | — |
| Promote, reject or archive a model | ✓ | — | — |
| Read models, evaluations, comparison | ✓ | ✓ | ✓ |
| Read statistics and annotation analytics | ✓ | — | ✓ |
| Read training settings | ✓ | — | ✓ |
| Change training settings (`PUT /admin/settings/training`) | ✓ | — | — |
| Read the audit log | ✓ | — | — |
| Create users or change roles | ✓ (script only) | — | — |

The matrix is the same on both sides of the wire: `NAV[].roles` in `lib/navigation.ts` mirrors the
`require_role(...)` guards, and `isRouteAllowed` reads that array so the nav and the guard cannot
disagree.

## Where the guard lives

| Layer | Mechanism | Authority |
| --- | --- | --- |
| Backend route | `user = Depends(require_role(Role.ADMIN, …))` in `api/*.py` | **the boundary** — every rule is enforced here |
| Backend service | ownership checks (e.g. the claim holder is the submitter) | authoritative |
| Frontend route | `isRouteAllowed(route, role)` in the shell plus a per-page check | UX only |
| Frontend nav | `NAV[].roles` hides what the role cannot use | UX only |

Client-side guards remove dead ends; they are not security. A hand-typed URL renders an `ErrorState`
because the API answered `403`, not because the router decided so. Nothing reads a role from a request
body or a query parameter.

## Audit

| Event | Level | Recorded |
| --- | --- | --- |
| `AUTH_LOGIN` | `INFO` | user id, username, `at` |
| `AUTH_LOGIN_FAILED` | `WARNING` | attempted username only — never the password, never a hash of it |
| `AUTH_LOGOUT` | `INFO` | user id |

`audit_service` is the only writer of `system_logs` (see [backend](./backend.md)). Failed logins are
recorded but not counted against a lockout: there is no rate limiter, and the mitigation today is that
the port is loopback-only. A counter on `AUTH_LOGIN_FAILED` per username is the upgrade seam.

## Deliberate absences

| Not implemented | Reason |
| --- | --- |
| OAuth / OIDC / SSO / external IdP | one researcher, one machine, no network exposure; an IdP would add a cloud dependency this project rules out |
| MFA | no remote attack surface to protect |
| Self-registration and email flows | there is no mail transport and no user-facing signup; accounts are provisioned deliberately |
| Sessions table / server-side revocation | see the limitation table above |
| Password-complexity policy | the hasher cost is the control; complexity rules would be theatre for a local single-user build |

Each of these becomes required the moment the system is exposed beyond `127.0.0.1` — which is exactly
why [local_deployment](./local_deployment.md) documents that it never is.

## Adding a user

```bash
python3 scripts/create_user.py --username reviewer1 --role ANNOTATOR \
        --display-name "Reviewer One"          # prompts for the password; never read from argv
python3 scripts/create_user.py --username admin --change-password
python3 scripts/create_user.py --username reviewer1 --deactivate
```

The password is prompted, never passed as an argument (shell history), and the script writes only the
hash and salt. Note that user management is intentionally outside the HTTP API: `api_contract.md`
exposes no user endpoints and its audited-event list has no user-management member, so adding either is
a contract change first — the six-step procedure in [backend](./backend.md) applies.
