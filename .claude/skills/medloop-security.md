# MedLoop AI — Security, auth and file safety

Read this when: touching auth, roles, sessions, file paths, uploads or the audit log. Extends
`CLAUDE.md §2.1`, `§11.3`. Auth endpoint shapes: `docs/api_contract.md` → Auth.

## Password hashing

```python
# core/security.py
class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...                    # returns an encoded string
    def verify(self, password: str, encoded: str) -> bool: ...    # constant-time
    def needs_rehash(self, encoded: str) -> bool: ...             # params drifted from current policy

# Default implementation — stdlib only, zero third-party dependencies (§11.3)
ITERATIONS = 600_000            # PBKDF2-HMAC-SHA256
SALT_BYTES = 16                 # per user, from secrets.token_bytes
ENCODED    = "pbkdf2_sha256$<iterations>$<b64 salt>$<b64 derived key>"
```

| Rule | Why |
| --- | --- |
| algorithm prefix in the encoded string | `argon2id$…` can coexist later; `verify` dispatches on the prefix (`§11.3` upgrade seam) |
| `hmac.compare_digest` for the final comparison | no early-exit timing signal |
| verify a dummy hash when the user does not exist | otherwise response time leaks which usernames are real |
| one generic failure message | `401 UNAUTHENTICATED`, never "no such user" / "wrong password" |
| `needs_rehash` → re-hash inside the successful login transaction | iteration count and algorithm upgrade transparently |
| the hasher is injected, not imported directly by services | swapping to Argon2id touches one wiring line |

**No password literal anywhere in application source.** The bootstrap script in `scripts/` takes the
initial admin password from an environment variable or an interactive prompt, stores only the hash,
and never echoes it. Any default credential documented for the prototype must be flagged as
"change on first run", and the value must not appear in code, logs or committed files.

## Token sessions — and their documented limitation

| Property | Choice |
| --- | --- |
| Format | opaque bearer token: base64url payload (`user_id`, `issued_at`, `expires_at`) + HMAC-SHA256 tag |
| Secret | `MEDLOOP_SECRET_KEY`, generated at bootstrap into local config; never committed, never logged |
| Transport | `Authorization: Bearer <token>` on everything except `/health` and `/auth/login` |
| Lifetime | a fixed short window (engineering default, recorded in `docs/authentication.md`); `expires_at` is returned to the client |
| Storage (client) | kept in memory / `sessionStorage`, never a cookie — so there is no CSRF surface |
| Validation | signature, then expiry, then `user.is_active`; any failure → `401 UNAUTHENTICATED` |

Limitations to state plainly in `docs/authentication.md` rather than paper over — this is a **local,
single-user research prototype** (`§1`):

- **No server-side revocation before expiry.** `POST /auth/logout` is a client-side discard plus an
  `AUTH_LOGOUT` audit row. Rotating `MEDLOOP_SECRET_KEY` invalidates every token at once; a
  per-user `tokens_not_before` timestamp is the documented upgrade if real revocation is needed.
- **No refresh-token rotation, no device list, no MFA.** Out of scope for one local account.
- **`sessionStorage` is readable by any script on the origin.** The mitigations are that the app runs
  on localhost, ships no third-party scripts, and would need a strict CSP before that changes.
- **Throttling still matters:** count `AUTH_LOGIN_FAILED` per username and delay repeated failures,
  even with one user, so the audit log shows brute-force attempts.

## Roles and permission matrix

`Role ∈ {ADMIN, ANNOTATOR, RESEARCHER}` (`§4`). Enforcement is **server-side** in
`api/deps.py::require_role`; the frontend guard exists only so the UI does not offer dead buttons.

| Capability | ADMIN | ANNOTATOR | RESEARCHER |
| --- | :--: | :--: | :--: |
| View dashboard, service health | ✅ | ✅ | ✅ |
| Review queue: claim / submit / skip | ✅ | ✅ | ❌ |
| Create / delete annotations | ✅ | ✅ | ❌ |
| Browse images, predictions, Grad-CAM | ✅ | ✅ | ✅ |
| Register an upload (local path) | ✅ | ❌ | ❌ |
| Create datasets / versions, assign splits | ✅ | ❌ | ❌ |
| Lock a test set | ✅ | ❌ | ❌ |
| Read training settings | ✅ | ❌ | ✅ |
| **Write** training settings (incl. the threshold) | ✅ | ❌ | ❌ |
| Start / cancel a training job | ✅ | ❌ | ❌ |
| Promote / reject / archive a model | ✅ | ❌ | ❌ |
| Analyze Model, comparisons, loss history | ✅ | ❌ | ✅ |
| Data & Annotation statistics | ✅ | ✅ (own work) | ✅ |
| System logs / settings history | ✅ | ❌ | ❌ |

Route protection for the Data & Admin area (`§11.1`):

| Route | Server guard |
| --- | --- |
| `/data/*` (all) | authenticated session required |
| `/data/review` | `ADMIN`, `ANNOTATOR` |
| `/data/datasets`, `/data/upload`, `/data/training`, `/data/logs` | `ADMIN` |
| `/data/statistics`, `/data/annotations` | `ADMIN`, `ANNOTATOR`, `RESEARCHER` |
| `/analyze/*` | `ADMIN`, `RESEARCHER` |

The API is the boundary. A hidden button is not access control: every endpoint declares its own
`require_role`, and a missing declaration is a defect even if no UI reaches it.

## Path-traversal-safe file resolution

Resolve **first**, then assert containment. Never string-compare or `startswith` on unresolved paths.

```python
# core/paths.py
def resolve_under(root: Path, *parts: str | Path) -> Path:
    base = root.resolve(strict=True)                 # storage root must exist
    target = base.joinpath(*parts).resolve(strict=False)   # collapses .. and follows symlinks
    if target != base and base not in target.parents:      # equivalently: not target.is_relative_to(base)
        raise PermissionDeniedError("path escapes the storage root")
    return target
```

| Rule | Detail |
| --- | --- |
| clients send ids, not paths | `GET /images/{id}/file` looks the path up in the DB; the browser never supplies a filename |
| every read goes through `resolve_under(settings.storage_root, …)` | including Grad-CAM artefacts, model weights, batch manifests, logs |
| symlinks are resolved before the check | `resolve()` does this; a symlink pointing outside the root therefore fails |
| the stored path is validated on read, not only on write | a row edited by hand cannot become a file-read primitive |
| no user string is ever interpolated into a shell command | use library calls; if a subprocess is unavoidable, pass an argument list |
| missing file ⇒ `404` | never a directory listing, never an error containing the absolute path |

## Upload path allow-listing

`POST /uploads` registers a **local directory** for staging; no bytes stream through the API and
nothing is copied (`docs/api_contract.md` → Uploads).

```python
roots = [Path(r).expanduser().resolve() for r in settings.allowed_ingest_roots]   # MEDLOOP_ALLOWED_INGEST_ROOTS
p = Path(body.image_directory).expanduser().resolve(strict=True)
if not any(p == r or r in p.parents for r in roots):
    raise ValidationRuleError("image_directory is outside the allowed ingest roots")
if not p.is_dir() or not os.access(p, os.R_OK):
    raise ValidationRuleError("image_directory is not a readable directory")
```

- An empty allow-list means **no ingest is permitted**, not "anything goes".
- The source directory is treated as read-only: never write, rename, move or delete inside it
  (`medloop-dataset.md`).
- The response is always `STAGING` with `inspection = {"state": "BLOCKED", "reason":
  "DATASET_NOT_AVAILABLE"}` until the inspection procedure has been run — the endpoint records intent
  and refuses to guess at structure.

## File type and content validation

| Check | Rule |
| --- | --- |
| extension allow-list | decided at inspection time from the real files, stored in config — not guessed |
| magic bytes | sniff the header; a `.png` that decodes as something else is rejected, not "fixed" |
| decoder verification | `PIL.Image.open(...).verify()` before use; corrupt files are listed, never deleted |
| decompression bombs | cap `Image.MAX_IMAGE_PIXELS`; reject dimensions above a configured maximum |
| `Content-Type` | never trusted; there is no multipart upload path in the first place |
| filenames | never echoed into a response header or a shell; never used to derive a label without evidence |

## Input validation is server-authoritative

Client validation is UX only (`§8.1`). Every rule is re-checked server-side: enum membership,
normalised geometry bounds `[0,1]` (`§4.3`), pagination caps (`page_size ≤ 200`), date ranges,
threshold ranges (`§8.1`), and state transitions (`§4.2`). An invalid value raises
`422 VALIDATION_ERROR`; it never silently degrades to a default.

## Audit log

Written only by `core/audit.py::log_event`, inside the transaction that caused the change. The event
vocabulary is closed (`docs/api_contract.md` → Logs):

```text
AUTH_LOGIN · AUTH_LOGIN_FAILED · AUTH_LOGOUT · DATASET_UPLOADED · DATASET_ASSIGNED
DATASET_MODIFIED · DATASET_DELETED · TEST_SET_LOCKED · ANNOTATION_SUBMITTED · IMAGE_SKIPPED
HITL_BATCH_CREATED · TRAINING_STARTED · TRAINING_COMPLETED · TRAINING_FAILED
CANDIDATE_CREATED · MODEL_PROMOTED · MODEL_REJECTED · SETTINGS_CHANGED · ERROR
```

Each row: `at`, `level`, `event`, `actor_id`/`actor_username`, `entity_type`, `entity_id`, `message`,
`metadata`. Settings changes record key, old value, new value and optional reason (`§8.4`).

**Never logged:** passwords, password hashes, tokens, `MEDLOOP_SECRET_KEY`, image bytes or base64,
Grad-CAM arrays, whole request bodies, full geometry payloads, stack traces in a response body.
Prefer ids and counts. Absolute ingest paths may name a patient-identifying folder — log the dataset
id and a relative descriptor instead.

## Local-only network posture (`§2.1`)

| Surface | Setting |
| --- | --- |
| API bind | `127.0.0.1:8000` — never `0.0.0.0`, never a LAN address |
| Frontend bind | `localhost:3000` |
| CORS | exact-origin allow-list (`http://localhost:3000`, `http://127.0.0.1:3000`), no wildcard, no `allow_credentials` (bearer, not cookies), methods and headers enumerated |
| Outbound | none at runtime. No telemetry (`NEXT_TELEMETRY_DISABLED=1`), no CDN fonts/scripts, no error reporting service, no model-hub download at inference time |
| Tunnels | no ngrok/Cloudflare/SSH forwarding of these ports |
| Database | local PostgreSQL over loopback or a unix socket |
| Guard | `scripts/verify_invariants.py` fails on a forbidden cloud SDK or hostname (`§12`) |

## Security failure modes

| Failure mode | Symptom | Fix |
| --- | --- | --- |
| role check only in the UI | a crafted request performs an admin action | `require_role` on every endpoint |
| `startswith` containment check | `/storage-evil` passes a check against `/storage` | resolve, then `is_relative_to` |
| client-supplied filename | arbitrary file read | ids only; DB holds the path |
| distinct auth error messages | username enumeration | one generic `401` |
| secret in the repo or a log line | credential leak in git history | env/bootstrap only, never echoed |
| `0.0.0.0` bind "to test on my phone" | medical images exposed on the LAN (`§2.1` breach) | loopback only |
| wildcard CORS | any local page can call the API with the user's token | exact-origin allow-list |
| empty ingest allow-list treated as permissive | any directory on the disk becomes ingestible | empty ⇒ deny |
