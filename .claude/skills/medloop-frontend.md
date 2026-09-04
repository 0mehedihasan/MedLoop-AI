# MedLoop AI — Frontend

Read this when: doing any UI work. Extends `CLAUDE.md §11.1`, `§11.2`, `§10`. The HTTP shape you
render against is `docs/api_contract.md` — never guess a field name.

## Directory layout

```text
frontend/
├── app/                       App Router. Routing + layouts ONLY — no business logic.
│   ├── (auth)/login/page.tsx
│   ├── (app)/layout.tsx       shell: header, nav, session guard, demo banner
│   ├── (app)/page.tsx         Dashboard
│   ├── (app)/data/…           Data & Admin (protected)
│   ├── (app)/analyze/…        Analyze Model
│   ├── loading.tsx            per-segment loading state
│   └── error.tsx              per-segment error boundary
├── features/<area>/           screens + area-local components/hooks (the real work)
├── components/ui/             shared primitives, no domain knowledge
├── components/charts/         hand-rolled SVG charts, no chart library
├── lib/                       api client, navigation, formatting, derive*, demo/
└── types/domain.ts            enum + DTO mirror of the backend (parity-tested)
```

Rule: `app/` files stay under ~40 lines — they compose a feature screen and pass params. Anything
with state, fetching or layout logic lives in `features/<area>/`.

## Route map

| Area | Route | Guard | Screen |
| --- | --- | --- | --- |
| Login | `/login` | public | credential form, generic error copy |
| Dashboard | `/` | session | KPI tiles, HITL progress, model block, activity, service health |
| Data & Admin | `/data` | session + role | section index / redirect to Review Data |
| ├ Review Data | `/data/review` | session + role | the annotation workspace |
| ├ Dataset Management | `/data/datasets`, `/data/datasets/[id]` | session + role | datasets, versions, split assignment, lock-test |
| ├ Upload Data | `/data/upload` | ADMIN | local-path registration form |
| ├ Data Statistics | `/data/statistics` | session + role | counts, time series, distributions |
| ├ Annotation Statistics | `/data/annotations` | session + role | agreement, correction/skip rate, confidence bins |
| ├ Training Management | `/data/training` | ADMIN | HITL status, batches, jobs, training settings |
| └ System Logs | `/data/logs` | ADMIN | audit table with filters |
| Analyze Model | `/analyze`, `/analyze/compare` | session | model registry, metrics, loss history, comparison |

**Review Data is never a top-level nav item** (`§11.1`). It is a child of Data & Admin, always.

`frontend/lib/navigation.ts` is the single declaration site:

```ts
export const ROUTES = { dashboard: '/', login: '/login', data: { root: '/data',
  review: '/data/review', datasets: '/data/datasets', upload: '/data/upload', /* … */ },
  analyze: { root: '/analyze', compare: '/analyze/compare' } } as const;

export const NAV: NavArea[] = [ /* Dashboard, Data & Admin (children), Analyze Model */ ];
```

Do / don't:

| Do | Don't |
| --- | --- |
| `href={ROUTES.data.review}` | `href="/data/review"` anywhere outside `navigation.ts` |
| derive breadcrumbs and the active nav item from `NAV` | maintain a second list of sections |
| add a new route to `ROUTES` **and** `NAV` in one edit | add a page with no nav entry and no note in `TASKS.md` |

If a slug in existing code disagrees with this table, `navigation.ts` is the truth — fix the table.

## UI primitives (`components/ui/`)

No domain knowledge, no fetching, props interfaces exported, forwardRef where a ref is plausible.

| Group | Components |
| --- | --- |
| Actions | `Button`, `IconButton`, `LinkButton`, `ConfirmDialog` |
| Form | `Input`, `NumberInput`, `Select`, `Checkbox`, `RadioGroup`, `Textarea`, `Label`, `FormField`, `FieldError`, `DateRangePicker` |
| Structure | `Card`, `Panel`, `SectionHeader`, `Tabs`, `Modal`, `Drawer`, `Divider`, `Breadcrumbs` |
| Data | `Table`, `TableHeaderCell` (sortable), `Pagination`, `KpiTile`, `DefinitionList`, `ProgressBar` |
| Status | `Badge`, `StatusPill` (enum-driven), `Alert`, `Toast`, `Tooltip`, `ServiceStateDot` |
| States | `Skeleton`, `Spinner`, `EmptyState`, `ErrorState`, `Unavailable` |
| Project | `DemoBadge`, `SyntheticWatermark`, `VisuallyHidden` |

`StatusPill` maps enum members from `types/domain.ts` to a tone. One mapping table, one file — a
second colour lookup for the same enum is a defect.

## The four mandatory states

Every data surface renders all four (`§11.2`). A happy-path-only component is unfinished.

| State | Trigger | Where it lives | Copy rule |
| --- | --- | --- | --- |
| loading | request in flight / streaming | `app/**/loading.tsx` + `<Skeleton/>` inside the feature | skeletons mirror the final layout; no spinner-only full pages |
| empty | 200 with `total === 0` | `<EmptyState/>` in the feature screen | say *why* it is empty and the next action ("no validated samples yet") |
| error | non-2xx or thrown | `app/**/error.tsx` + `<ErrorState onRetry/>` | show `error.code` and `message` from the envelope, plus retry |
| populated | 200 with rows | the feature screen | — |

Two project-specific states on top of those:

- **unavailable** — the API omitted a figure (`"source": "unavailable"`, `ai_prediction: null`,
  `gradcam_url: null`). Render `<Unavailable reason/>`; never substitute `0`, `—` with a fake
  tooltip, or an empty heat-map. A null `gradcam_url` hides the XAI view entirely (`§2.3`).
- **blocked** — the capability is deliberately unimplemented (`501 DATASET_NOT_AVAILABLE`). Say
  "blocked on dataset", link the reason. Do not render a disabled-looking chart with zeroes.

## Charts (`components/charts/`)

Hand-rolled SVG, no Recharts/Plotly (`§11.5`). Six chart types cover the whole app:

| Component | Input shape (from `docs/api_contract.md`) | Used by |
| --- | --- | --- |
| `LineSeriesChart` | `{key,label,points:[{t,v}]}[]` | uploads/reviews over time, loss history |
| `BarChart` | `{key,label,slices:[{key,label,count}]}` | per-class counts |
| `StackedBarChart` | slices + series key | validated vs skipped per class |
| `DonutChart` | one distribution | split / status share |
| `HistogramChart` | confidence bins with a second rate axis | confidence-vs-correction (`§14`) |
| `ConfusionMatrixGrid` | `number[][]` + labels | model evaluation, when one exists |

Shared conventions:

```tsx
// components/charts/lib/scale.ts — linear/band scales, tick generation, path builders.
// Charts are pure: props in, <svg viewBox> out. No fetching, no window measurement on first paint.
<LineSeriesChart series={series} height={220} yFormat={formatPercent} ariaLabel="…" />
```

- `viewBox` + `preserveAspectRatio`, width 100% — resizes without a ResizeObserver.
- Every chart takes `ariaLabel` and renders a `<title>`; the same numbers are reachable as a table
  (a `<VisuallyHidden>` table or a "view as table" toggle) so the data is not colour-only.
- Empty series → `<EmptyState/>`, not an axis with no line.

## Design tokens and visual language

Tokens are Tailwind theme values + CSS custom properties in one place (`app/globals.css` +
`tailwind.config.ts`). Components consume token names, never raw hex.

| Token group | Contains | Rule |
| --- | --- | --- |
| surface | page, panel, raised, inset | flat fills only |
| text | primary, secondary, muted, inverse | contrast ≥ 4.5:1 against its surface |
| border | subtle, default, strong, focus | focus ring is a token, never removed |
| status | ok, warn, danger, info, neutral, unknown | drives `StatusPill`/`ServiceStateDot` |
| chart | a fixed categorical ramp + one sequential ramp | shared by all six charts |
| spacing/radius/shadow | scale steps | one shadow step; no layered glows |

Clinical restraint (`§11.2`), non-negotiable: no gradient washes, no glassmorphism/blur panels, no
cartoon medical iconography, no marketing hero aesthetics, no emoji in UI copy, no drop-shadowed
"AI" glow. Motion is 120–200 ms, opacity and ≤ 4 px transforms only. Numbers are monospaced-tabular
so columns align. Never colour a diagnosis red/green as if it were a verdict.

## Accessibility checklist (tick before reporting done)

- [ ] real `<button>` / `<a>` / `<label>`; no clickable `<div>`
- [ ] visible focus ring on every interactive element, keyboard reachable in DOM order
- [ ] every annotation action has a keyboard equivalent (see `medloop-annotation.md`)
- [ ] custom widgets carry `aria-*` + roles; canvas overlays expose state in text too
- [ ] form fields have `<label>`, `aria-describedby` for hints, `aria-invalid` + inline error text
- [ ] modals trap focus, restore it on close, close on `Escape`
- [ ] status is never colour-only — pair with text or an icon
- [ ] `prefers-reduced-motion` disables transitions
- [ ] text contrast ≥ 4.5:1; disabled controls still legible
- [ ] live regions (`aria-live="polite"`) for queue advance, save confirmations, job progress

## Responsive rules

Desktop-first — review work happens on a laptop — but **nothing may break below `md`** (`§11.2`).

| Breakpoint | Behaviour |
| --- | --- |
| ≥ `xl` | full layout: side nav + content + inspector column |
| `lg` | inspector column collapses under the canvas |
| `md` | side nav becomes a top bar; tables keep all columns, scroll horizontally in a wrapper |
| `< md` | single column, filters behind a `Drawer`, canvas full-width with tools in a bottom bar; no clipped content, no horizontal page scroll |

Tables never drop a column silently; if a column is hidden at a breakpoint it moves into an
expandable row detail.

## Demo data (`§10`) — all five conditions or not at all

1. lives in `frontend/lib/demo/`, filename `demo-*.ts`;
2. file opens with a banner comment containing the literal token `DEMO DATA`;
3. exported as named `DEMO_*` exports whose objects carry `isDemo: true`;
4. every screen rendering it shows `<DemoBadge/>`, and the shell shows a global demo banner while
   `NEXT_PUBLIC_DATA_SOURCE=demo`;
5. `NEXT_PUBLIC_DATA_SOURCE=api` removes all of it and real empty states appear — no mixing.

Forbidden even with a badge: any number presented as a trained model's performance, any image that
could be mistaken for a real clinical photograph, any Grad-CAM-looking heat-map. Demo imagery is
procedurally drawn, obviously synthetic and watermarked. Model performance panels render an empty
state ("no trained model — blocked on dataset"); the separate, explicitly labelled *layout preview*
toggle is the only place synthetic figures may appear, and they carry `SYNTHETIC` watermarking.

`scripts/verify_invariants.py` fails the build if a `lib/demo/*.ts` file loses its banner or demo
data is imported outside `lib/demo/` and the `features/**/demo` wiring (`§12`).

## Frontend failure modes to avoid

| Failure mode | Symptom | Fix |
| --- | --- | --- |
| Route string drift | two spellings of a path, dead nav item | only `navigation.ts` |
| Client-side business logic | component computing agreement or promotion eligibility | call the statistics/model endpoints |
| `any` or `!` to silence a nullable | type checks pass, runtime crashes on `null` prediction | model nullability from the contract |
| Enum drift | pill with no colour, filter with a missing option | edit `types/domain.ts` + `enums.py` together |
| Zero-as-unknown | dashboard shows `0` for an uncomputable metric | omit it and render `<Unavailable/>` |
