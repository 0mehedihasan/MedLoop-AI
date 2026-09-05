#!/usr/bin/env python3
"""MedLoop AI — the guard against CLAUDE.md §2 quietly eroding.

Every rule here exists because the failure it catches is *silent*. A hard-coded threshold still
trains. A cloud SDK import still builds. A drifted enum still type-checks on one side. A Tailwind
alpha modifier outside the configured scale compiles to nothing and ships an opaque black rectangle
over the lesion under review. None of these announce themselves, so something has to look.

Design constraints, in order of importance:

1. **No dependencies, no network, no database, no `node_modules`.** This must run on a fresh clone,
   in CI, and inside a sandbox. Standard library only.
2. **A rule that cries wolf gets deleted.** Every check below carries its own exemptions, and the
   exemptions are reasoned in comments rather than being a bare list of paths. A false positive
   costs more than the bug, because it teaches people to skip the script.
3. **Absent is not the same as broken.** `backend/` does not exist yet. A check whose subject is
   missing reports SKIP and says what would make it run — it does not fail, and it does not pass
   quietly either.

Exit code 0 means every rule either passed or was honestly skipped. Exit code 1 means a rule failed.

    python3 scripts/verify_invariants.py           # human output
    python3 scripts/verify_invariants.py --quiet    # failures only
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ─────────────────────────────────────────────────────────────────────────────────────────
# Result plumbing
# ─────────────────────────────────────────────────────────────────────────────────────────


@dataclass
class Result:
    """One rule's verdict. `skipped` is a third state on purpose — see the module docstring."""

    name: str
    ok: bool
    skipped: bool = False
    detail: str = ""
    failures: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        if self.skipped:
            return "SKIP"
        return "PASS" if self.ok else "FAIL"


def rel(path: Path) -> str:
    """Repo-relative, so output is copy-pasteable regardless of where the clone lives."""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def plural(count: int, word: str) -> str:
    """"1 modifier", "0 modifiers". A summary line that reads wrong invites doubt about the count."""
    return f"{count} {word}" if count == 1 else f"{count} {word}s"



# ─────────────────────────────────────────────────────────────────────────────────────────
# Source enumeration
# ─────────────────────────────────────────────────────────────────────────────────────────

#: Directories no rule ever reads. Build output and vendored code are not ours to police, and
#: `Dataset/` is 3.3 GiB of PNG that would dominate the runtime for zero findings.
PRUNE = {
    ".git",
    ".next",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "out",
    "dist",
    "build",
    "storage",
    "Dataset",
}

TEXT_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".sql", ".json", ".md"}


def sources(*, suffixes: set[str] | None = None, under: str | None = None) -> list[Path]:
    """Every text file we are willing to read, pruned depth-first so `node_modules` is never walked."""
    wanted = TEXT_SUFFIXES if suffixes is None else suffixes
    base = ROOT if under is None else ROOT / under
    if not base.exists():
        return []
    found: list[Path] = []
    stack = [base]
    while stack:
        current = stack.pop()
        for entry in sorted(current.iterdir()):
            if entry.is_dir():
                if entry.name not in PRUNE:
                    stack.append(entry)
            elif entry.suffix in wanted:
                found.append(entry)
    return found


def read(path: Path) -> str:
    """Lossy on purpose: a decoding error in a source file is not this script's job to report."""
    return path.read_text(encoding="utf-8", errors="replace")


# ─────────────────────────────────────────────────────────────────────────────────────────
# §2.6 — the HITL threshold is configuration, never a literal
# ─────────────────────────────────────────────────────────────────────────────────────────

#: Words that make a line *about* the retraining threshold. `1000` on its own is meaningless —
#: `ms < 1000`, `max_epochs: 1..1000` and `train: 1000` images are all legitimate and all present in
#: this repository. The violation is `1000` standing in for the setting, so both halves must match.
#:
#: Matched against the line with `_` removed and case folded, because the same field is
#: `validated_since_last_training` over the wire and `validatedSinceLastTraining` in a local
#: variable, and a snake_case-only pattern misses the second one. Hence `validatedsince`.
THRESHOLD_WORDS = re.compile(r"hitl|threshold|retrain|validatedsince", re.IGNORECASE)
THRESHOLD_LITERAL = re.compile(r"(?<![\d.])1[_,]?000(?![\d.])")


#: `1000` is allowed to exist as a literal in exactly four kinds of place.
THRESHOLD_EXEMPT_PREFIXES = (
    ".claude/",  # the rule is *stated* there, quoting the number it forbids
    "docs/",  # ditto
    "TASKS.md",
    "README.md",
    "frontend/lib/demo/",  # §10 fixture payloads carry the default as *data*, which is the point
    "scripts/verify_invariants.py",  # this file has to spell out the pattern it rejects
)


COMMENT_STARTS = ("//", "#", "*", "/*", "--", '"""', "'''")


def strip_comment(line: str) -> str:
    """Cut a line down to code.

    Deliberately crude: it truncates at the first `//` or `#`, so a URL inside a string literal
    would be clipped too. That costs nothing here — this is only used by the threshold rule and the
    alpha-modifier rule, and a line that both contains a URL and hard-codes the retraining threshold
    is not a shape worth protecting.

    It does *not* understand a Python docstring: the triple-quoted opener is invisible to it, so a
    prose line inside one looks like code. Prose that quotes the number therefore has to say
    "default" to stay quiet, which is how such a sentence reads anyway — and `scripts/`, `docs/` and
    `.claude/` are exempt outright.
    """

    stripped = line.strip()
    if stripped.startswith(COMMENT_STARTS):
        return ""
    for marker in ("//", "#"):
        index = line.find(marker)
        if index != -1:
            line = line[:index]
    return line


def check_threshold_literal() -> Result:
    """Flag `1000` only where the same line of code also names the threshold.

    Known limit, stated rather than papered over: the rule is line-scoped, so
    `return count >= 1000` inside a function called `readyToRetrain` is invisible to it. Widening it
    to every `>= 1000` comparison would flag the millisecond arithmetic that legitimately exists
    here, and a rule that cries wolf gets deleted. Naming the variable after the setting — which the
    surrounding code already does — brings it back into range.
    """
    failures: list[str] = []
    for path in sources(suffixes={".ts", ".tsx", ".py", ".sql"}):
        name = rel(path)
        if name.startswith(THRESHOLD_EXEMPT_PREFIXES):
            continue
        for number, raw in enumerate(read(path).splitlines(), start=1):
            code = strip_comment(raw)
            if not THRESHOLD_LITERAL.search(code):
                continue
            if not THRESHOLD_WORDS.search(code.replace("_", "")):
                continue
            # The one legal declaration site: the settings default itself. A comparison never
            # says "default", so this exemption cannot hide `if counter >= 1000`.
            if "default" in code.lower():
                continue
            failures.append(f"{name}:{number}: {code.strip()}")

    return Result(
        name="§2.6 no hard-coded HITL threshold",
        ok=not failures,
        detail="`1000` is the default value of a setting, never a training condition",
        failures=failures,
    )


# ─────────────────────────────────────────────────────────────────────────────────────────
# §2.1 — local only
# ─────────────────────────────────────────────────────────────────────────────────────────

#: Package names that would move a medical image, a metric or a keystroke off this machine.
#: Matched against *import specifiers only*, never against free text: `segment` is a variable name in
#: `LineSeriesChart`, and a substring scan would report the chart as a analytics SDK.
FORBIDDEN_PACKAGES = {
    "firebase",
    "firebase-admin",
    "@firebase",
    "@supabase",
    "@supabase/supabase-js",
    "aws-sdk",
    "@aws-sdk",
    "boto3",
    "botocore",
    "@azure",
    "azure-storage-blob",
    "@google-cloud",
    "google-cloud-storage",
    "cloudinary",
    "openai",
    "anthropic",
    "@sentry",
    "sentry-sdk",
    "posthog-js",
    "posthog",
    "mixpanel",
    "mixpanel-browser",
    "@segment/analytics-next",
    "analytics-node",
    "@vercel/analytics",
    "@vercel/speed-insights",
    "react-ga",
    "react-ga4",
}

#: Hostnames, matched as domain suffixes against URL literals. `download.pytorch.org` is *not* here:
#: fetching ImageNet weights is an inbound one-off, not an image leaving the machine. It is still
#: worth a mention in any report that adds it.
FORBIDDEN_HOSTS = (
    "firebaseio.com",
    "firebaseapp.com",
    "supabase.co",
    "amazonaws.com",
    "blob.core.windows.net",
    "storage.googleapis.com",
    "googleapis.com",
    "google-analytics.com",
    "googletagmanager.com",
    "cloudinary.com",
    "api.openai.com",
    "api.anthropic.com",
    "sentry.io",
    "posthog.com",
    "mixpanel.com",
    "segment.io",
)

IMPORT_TS = re.compile(r"""(?:from|import|require\()\s*['"]([^'"]+)['"]""")
IMPORT_PY = re.compile(r"^\s*(?:from|import)\s+([A-Za-z_][\w.]*)")
URL_HOST = re.compile(r"https?://([A-Za-z0-9.\-]+)")


def forbidden_package(specifier: str) -> str | None:
    """Match a whole package name or a scoped/dotted prefix, never a substring.

    `@aws-sdk/client-s3` matches `@aws-sdk`; `boto3.session` matches `boto3`; `my-firebase-helper`
    matches nothing, because the separator check requires the name to end at a boundary.
    """
    for name in FORBIDDEN_PACKAGES:
        if specifier == name or specifier.startswith((f"{name}/", f"{name}.")):
            return name
    return None


def check_local_only() -> Result:
    failures: list[str] = []

    for path in sources(suffixes={".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"}):
        name = rel(path)
        text = read(path)
        pattern = IMPORT_PY if path.suffix == ".py" else IMPORT_TS
        for number, raw in enumerate(text.splitlines(), start=1):
            for specifier in pattern.findall(raw):
                hit = forbidden_package(specifier)
                if hit is not None:
                    failures.append(f"{name}:{number}: imports {specifier!r} ({hit} is forbidden)")
            # Hostnames are checked on every file kind, including comments: a URL in a comment is
            # usually a note to a future self about wiring it up, which is worth catching early.
            for host in URL_HOST.findall(raw):
                for banned in FORBIDDEN_HOSTS:
                    if host == banned or host.endswith(f".{banned}"):
                        failures.append(f"{name}:{number}: references {host}")

    # Declared dependencies matter even when nothing imports them yet.
    for manifest in (ROOT / "frontend" / "package.json", ROOT / "package.json"):
        if not manifest.exists():
            continue
        text = read(manifest)
        for specifier in re.findall(r'"((?:@[^"/]+/)?[a-z0-9][a-z0-9.\-]*)"\s*:', text):
            hit = forbidden_package(specifier)
            if hit is not None:
                failures.append(f"{rel(manifest)}: declares dependency {specifier!r}")

    for requirements in sources(suffixes={".txt"}, under="backend"):
        if requirements.name not in {"requirements.txt", "requirements-dev.txt"}:
            continue
        for number, raw in enumerate(read(requirements).splitlines(), start=1):
            package = re.split(r"[=<>!\[;\s]", raw.strip(), maxsplit=1)[0]
            hit = forbidden_package(package) if package else None
            if hit is not None:
                failures.append(f"{rel(requirements)}:{number}: requires {package!r}")

    return Result(
        name="§2.1 local only — no cloud SDK, no telemetry, no external host",
        ok=not failures,
        detail="medical images never leave the machine",
        failures=failures,
    )


# ─────────────────────────────────────────────────────────────────────────────────────────
# §4 — the shared vocabulary is declared twice and must agree byte for byte
# ─────────────────────────────────────────────────────────────────────────────────────────

#: The enums CLAUDE.md §4 names. Hard-coded rather than parsed out of the table on purpose: the table
#: is the contract, so adding a member here should be a deliberate edit that shows up in a diff, not
#: something a markdown reflow can quietly change.
CONTRACT_ENUMS = (
    "Role",
    "ImageSplit",
    "ReviewStatus",
    "ImageLifecycle",
    "DataStatus",
    "DatasetStatus",
    "AnnotationType",
    "AnnotationSource",
    "SkipReason",
    "ModelStatus",
    "TrainingBatchStatus",
    "TrainingJobStatus",
    "HitlCycleStage",
    "TrainingDevice",
    "PromotionMode",
    "PromotionMetric",
    "ServiceState",
    "LogLevel",
)

TS_ENUM = re.compile(
    r"export const (?P<name>\w+) = \{(?P<body>.*?)\} as const;",
    re.DOTALL,
)
TS_MEMBER = re.compile(r"^\s*(?P<key>\w+)\s*:\s*'(?P<value>[^']*)'\s*,?\s*$")

PY_ENUM = re.compile(
    r"^class (?P<name>\w+)\((?:[^)]*\b(?:str|StrEnum|Enum)\b[^)]*)\):(?P<body>(?:\n(?:[ \t].*)?)*)",
    re.MULTILINE,
)
PY_MEMBER = re.compile(r'^\s{4}(?P<key>[A-Z][A-Z0-9_]*)\s*(?::\s*str\s*)?=\s*"(?P<value>[^"]*)"')


def parse_ts_enums(text: str) -> dict[str, dict[str, str]]:
    """`export const X = { KEY: 'VALUE' } as const;` → `{"X": {"KEY": "VALUE"}}`.

    A member whose value is not a plain single-quoted string is skipped rather than guessed at: the
    parity check then reports it as missing on the TypeScript side, which is the safe direction to
    be wrong in.
    """
    found: dict[str, dict[str, str]] = {}
    for match in TS_ENUM.finditer(text):
        members: dict[str, str] = {}
        for line in match.group("body").splitlines():
            member = TS_MEMBER.match(line)
            if member is not None:
                members[member.group("key")] = member.group("value")
        found[match.group("name")] = members
    return found


def parse_py_enums(text: str) -> dict[str, dict[str, str]]:
    """`class X(str, Enum): KEY = "VALUE"` → `{"X": {"KEY": "VALUE"}}`.

    The class pattern requires `str`, `StrEnum` or `Enum` among the bases, so a plain dataclass or a
    Pydantic model living in the same module is not mistaken for part of the contract. Members are
    matched at exactly four spaces of indentation, which keeps a nested class's members out.
    """
    found: dict[str, dict[str, str]] = {}
    for match in PY_ENUM.finditer(text):
        members: dict[str, str] = {}
        for line in match.group("body").splitlines():
            member = PY_MEMBER.match(line)
            if member is not None:
                members[member.group("key")] = member.group("value")
        found[match.group("name")] = members
    return found


#: Named once so the SKIP result and the enforcing result cannot drift apart in the output.
PARITY = "§4 enum parity — enums.py ↔ domain.ts"


def check_enum_parity() -> Result:
    ts_path = ROOT / "frontend" / "types" / "domain.ts"
    py_path = ROOT / "backend" / "app" / "core" / "enums.py"

    # Absent is not broken. The Python half is unwritten as of 2026-09-05, and a rule that failed
    # for that reason would be red on every run and therefore ignored on the run that mattered.
    for path in (py_path, ts_path):
        if not path.exists():
            return Result(
                name=PARITY,
                ok=True,
                skipped=True,
                detail=f"{rel(path)} does not exist — write it and this rule starts enforcing",
            )

    ts = parse_ts_enums(read(ts_path))
    py = parse_py_enums(read(py_path))
    failures: list[str] = []

    for name in CONTRACT_ENUMS:
        left, right = ts.get(name), py.get(name)
        if left is None:
            failures.append(f"{rel(ts_path)}: {name} is not declared")
        if right is None:
            failures.append(f"{rel(py_path)}: {name} is not declared")
        if left is None or right is None:
            continue
        # The key is a language convention; the *value* is what crosses the wire, so a value
        # mismatch under a shared key is the defect that actually breaks a request.
        for key in sorted(set(left) | set(right)):
            ts_value, py_value = left.get(key), right.get(key)
            if ts_value is None:
                failures.append(f"{name}.{key}: only in Python (= {py_value!r})")
            elif py_value is None:
                failures.append(f"{name}.{key}: only in TypeScript (= {ts_value!r})")
            elif ts_value != py_value:
                failures.append(
                    f"{name}.{key}: {ts_value!r} in TypeScript, {py_value!r} in Python"
                )

    return Result(
        name=PARITY,
        ok=not failures,
        detail=f"{len(CONTRACT_ENUMS)} enums declared twice with byte-identical values",
        failures=failures,
    )


# ─────────────────────────────────────────────────────────────────────────────────────────
# §10 — demo fixtures are named, labelled and self-declaring
# ─────────────────────────────────────────────────────────────────────────────────────────

#: §10 condition 2 says the file "opens with" the banner. Eight lines is generous enough for a boxed
#: header and tight enough that a `DEMO DATA` string four hundred lines down cannot satisfy the rule.
BANNER_WINDOW = 8


def check_demo_fixtures() -> Result:
    demo_dir = ROOT / "frontend" / "lib" / "demo"
    if not demo_dir.exists():
        return Result(
            name="§10 demo fixtures are named, labelled and self-declaring",
            ok=True,
            skipped=True,
            detail="frontend/lib/demo/ does not exist",
        )

    failures: list[str] = []
    files = sorted(demo_dir.glob("*.ts"))
    for path in files:
        name = rel(path)
        text = read(path)
        if not path.name.startswith("demo-"):
            failures.append(f"{name}: condition 1 — the file name must match demo-*.ts")
        if not any("DEMO DATA" in line for line in text.splitlines()[:BANNER_WINDOW]):
            failures.append(
                f"{name}: condition 2 — no `DEMO DATA` banner in the first {BANNER_WINDOW} lines"
            )
        # Condition 3 is what lets a screen tell a fixture from a payload at runtime rather than by
        # reading an import list, so a fixture module that exports nothing marked is a real gap.
        if "isDemo: true" not in text:
            failures.append(f"{name}: condition 3 — no export carries `isDemo: true`")

    return Result(
        name="§10 demo fixtures are named, labelled and self-declaring",
        ok=not failures,
        detail=f"{plural(len(files), 'fixture file')} checked for the name, the banner and `isDemo: true`",
        failures=failures,
    )


#: Where a fixture may be imported from. Structural rather than a list of files, because the list of
#: feature views grows and a rule that has to be edited to add a screen gets edited wrongly.
#:
#: `app/**` is the route layer and `features/**` is the feature layer; both are allowed to choose a
#: fixture over the API at their own boundary, which is exactly where `IS_DEMO` is read. Everything
#: else — `components/**`, `lib/**`, `types/**` — is shared, and a demo import there would bury a
#: fixture inside a primitive where `NEXT_PUBLIC_DATA_SOURCE=api` could no longer remove it
#: (§10 condition 5). CLAUDE.md §12 words this as "`lib/demo/` and `features/**/demo` wiring"; the
#: measured shape is wider, and this is the honest version of the same intent.
DEMO_IMPORT_ALLOWED = ("frontend/app/", "frontend/features/", "frontend/lib/demo/")

#: Matches `@/lib/demo/demo-x` and `../../lib/demo/demo-x` alike. Deliberately anchored on the
#: directory, not on the `demo-` prefix: renaming a fixture must not silently leave the rule behind.
DEMO_SPECIFIER = re.compile(r"(?:^|/)lib/demo/")


def check_demo_confinement() -> Result:
    failures: list[str] = []
    for path in sources(suffixes={".ts", ".tsx"}, under="frontend"):
        name = rel(path)
        if name.startswith(DEMO_IMPORT_ALLOWED):
            continue
        for number, raw in enumerate(read(path).splitlines(), start=1):
            # Import specifiers only. `lib/session.tsx` names `lib/demo/demo-session.ts` in a
            # docblock explaining that the signature lives there and nowhere else — a text scan
            # would report the file that documents the rule as the file that breaks it.
            for specifier in IMPORT_TS.findall(raw):
                if DEMO_SPECIFIER.search(specifier):
                    failures.append(f"{name}:{number}: imports {specifier!r}")

    return Result(
        name="§10 demo data stays out of shared code",
        ok=not failures,
        detail="fixtures are read at the route and feature boundary, never inside a primitive",
        failures=failures,
    )


# ─────────────────────────────────────────────────────────────────────────────────────────
# TASKS.md §C.4 — an alpha modifier outside the configured scale compiles to nothing, silently
# ─────────────────────────────────────────────────────────────────────────────────────────
#
# `fill-annotation-human/12` type-checked, linted and shipped an opaque black rectangle over the
# lesion under review, because `12` was not in Tailwind 3's opacity scale and an unmatched class
# simply produces no CSS. Nothing in the toolchain says a word. This rule is the only thing that
# would have caught it, which is why it reads the *configured* scale from `tailwind.config.ts`
# instead of assuming the default — the three real steps must not be flagged.

#: Tailwind 3's built-in scale: 0, then every fifth step to 100.
DEFAULT_OPACITY = {"0", *(str(step) for step in range(5, 101, 5))}

#: Colour utilities that accept `/<alpha>`. `ring-offset` precedes `ring` so the alternation does not
#: match the shorter name first and leave `-offset` dangling.
ALPHA_UTILITIES = (
    "bg", "text", "border", "divide", "ring-offset", "ring", "fill", "stroke",
    "outline", "shadow", "accent", "caret", "decoration", "placeholder", "from", "via", "to",
)
ALPHA_MODIFIER = re.compile(
    r"\b(?:" + "|".join(ALPHA_UTILITIES) + r")-[a-z][a-z0-9-]*/(?P<alpha>\d+)\b"
)

OPACITY_BLOCK = re.compile(r"\bopacity:\s*\{(?P<body>[^}]*)\}")
OPACITY_KEY = re.compile(r"['\"]?(\d+)['\"]?\s*:")


def configured_opacity(config: Path) -> set[str]:
    """Default scale ∪ every numeric key of every `opacity: { … }` block in the config.

    The union is deliberate. A config that *replaces* `theme.opacity` rather than extending it would
    make this over-permissive, so the rule would miss a violation — the safe direction. Treating the
    replacement case strictly would instead flag valid classes on the common `extend` config, and a
    rule that cries wolf gets deleted.
    """
    allowed = set(DEFAULT_OPACITY)
    if config.exists():
        for block in OPACITY_BLOCK.finditer(read(config)):
            allowed.update(OPACITY_KEY.findall(block.group("body")))
    return allowed


def check_alpha_modifiers() -> Result:
    config = ROOT / "frontend" / "tailwind.config.ts"
    if not config.exists():
        return Result(
            name="alpha modifiers are inside the configured opacity scale",
            ok=True,
            skipped=True,
            detail="frontend/tailwind.config.ts does not exist",
        )

    allowed = configured_opacity(config)
    failures: list[str] = []
    checked = 0
    for path in sources(suffixes={".ts", ".tsx", ".css"}, under="frontend"):
        name = rel(path)
        for number, raw in enumerate(read(path).splitlines(), start=1):
            # Comments are stripped first, and that is load-bearing rather than tidy: the incident
            # is *quoted* in `ShapeNode.tsx` and twice in `tailwind.config.ts` as the reason the
            # scale was extended. Scanning prose would report the documentation as the defect.
            for match in ALPHA_MODIFIER.finditer(strip_comment(raw)):
                checked += 1
                alpha = match.group("alpha")
                if alpha not in allowed:
                    failures.append(
                        f"{name}:{number}: {match.group(0)} — /{alpha} is not in the configured "
                        f"opacity scale, so this class compiles to nothing"
                    )

    return Result(
        name="alpha modifiers are inside the configured opacity scale",
        ok=not failures,
        detail=f"{plural(checked, 'modifier')} checked against {len(allowed)} configured steps",
        failures=failures,
    )


# ─────────────────────────────────────────────────────────────────────────────────────────
# §12 — a document CLAUDE.md sends you to must exist
# ─────────────────────────────────────────────────────────────────────────────────────────
#
# CLAUDE.md is read first, every session, and §0 step 2 turns its pointers into instructions. A
# pointer at a file that was renamed or never written does not fail loudly; it just means a session
# skips the skill it was told to read and proceeds on assumptions. That is the failure this catches.

DOC_PATH = re.compile(r"\bdocs/([a-z0-9_]+)\.md\b")
SKILL_PATH = re.compile(r"\.claude/skills/([a-z0-9-]+)\.md\b")
SKILL_TICKED = re.compile(r"`(medloop-[a-z0-9-]+)\.md`")

#: The §13 closing paragraph names its files bare — `` `architecture` ``, not ``` `docs/architecture.md` ```
#: — so it needs its own pass. Bounded to the paragraph so a backticked identifier elsewhere in the
#: document is never mistaken for a filename.
REFERENCE_PARAGRAPH = re.compile(
    r"Reference documentation lives in `docs/`(?P<body>.*?)\n[ \t]*\n", re.DOTALL
)
BARE_TICKED = re.compile(r"`([a-z][a-z0-9_]*)`")


def check_referenced_docs() -> Result:
    claude = ROOT / ".claude" / "CLAUDE.md"
    if not claude.exists():
        return Result(
            name="§12 every file CLAUDE.md points at exists",
            ok=True,
            skipped=True,
            detail=".claude/CLAUDE.md does not exist",
        )

    text = read(claude)
    wanted: dict[str, str] = {}
    for name in DOC_PATH.findall(text):
        wanted[f"docs/{name}.md"] = "an explicit path"
    for name in SKILL_PATH.findall(text):
        wanted[f".claude/skills/{name}.md"] = "an explicit path"
    for name in SKILL_TICKED.findall(text):
        wanted[f".claude/skills/{name}.md"] = "the §13 skill index"

    paragraph = REFERENCE_PARAGRAPH.search(text)
    if paragraph is not None:
        for name in BARE_TICKED.findall(paragraph.group("body")):
            wanted[f"docs/{name}.md"] = "the §13 reference list"

    failures = [
        f"{path}: named in CLAUDE.md by {why}, but no such file exists"
        for path, why in sorted(wanted.items())
        if not (ROOT / path).exists()
    ]
    note = "" if paragraph is not None else "; §13's reference paragraph was not found, so only explicit paths were checked"
    return Result(
        name="§12 every file CLAUDE.md points at exists",
        ok=not failures,
        detail=f"{len(wanted)} referenced files resolved{note}",
        failures=failures,
    )


# ─────────────────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────────────────

#: Order is the order of §2, so the output reads like the rule book rather than like a file listing.
CHECKS = (
    check_local_only,
    check_threshold_literal,
    check_enum_parity,
    check_demo_fixtures,
    check_demo_confinement,
    check_alpha_modifiers,
    check_referenced_docs,
)

#: Every failure line is shown. Truncating the list would hide the tail of a systematic breakage,
#: which is precisely the shape this script exists to make visible.
def report(results: list[Result], *, quiet: bool) -> None:
    for result in results:
        if quiet and result.ok:
            continue
        print(f"{result.status:4}  {result.name}")
        if result.detail and not quiet:
            print(f"      {result.detail}")
        for failure in result.failures:
            print(f"      ✗ {failure}")

    failed = [one for one in results if not one.ok]
    skipped = [one for one in results if one.skipped]
    if quiet and not failed:
        return
    print()
    summary = (
        f"{len(results) - len(failed) - len(skipped)} passed, "
        f"{len(failed)} failed, {len(skipped)} skipped"
    )
    print(summary)
    if skipped:
        print("A skipped rule is a rule with nothing to check yet — see its line for what it wants.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the CLAUDE.md §2 invariants.")
    parser.add_argument("--quiet", action="store_true", help="print failures only")
    args = parser.parse_args()

    results = [check() for check in CHECKS]
    report(results, quiet=args.quiet)
    return 1 if any(not one.ok for one in results) else 0


if __name__ == "__main__":
    sys.exit(main())












