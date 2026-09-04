# Frontend

Scope: the Next.js app — its tree, routes, primitives, tokens, state model and the rules that keep it
from claiming more than the backend actually knows.

See also: [architecture](./architecture.md) · [backend](./backend.md) · [annotation_workflow](./annotation_workflow.md) · [authentication](./authentication.md) · [api_contract](./api_contract.md). Rules of record: [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) §10 (demo data), §11.1 (navigation), §11.2 (frontend conventions).

## Tree

```text
frontend/
├── app/                    App Router — one directory per route (table below)
│   ├── layout.tsx          shell: providers, nav, global demo banner
│   └── globals.css         design tokens as CSS custom properties
├── components/
│   ├── ui/                 primitives — the only place a button is styled
│   ├── charts/             hand-rolled SVG charts, no chart library
│   └── layout/             AppShell, TopBar, SectionNav, DemoBanner
├── features/               one directory per area: review, datasets, upload,
│                           statistics, training, models, logs
├── lib/
│   ├── navigation.ts       THE route declaration (nothing else declares a path)
│   ├── api-client.ts       fetch wrapper, bearer token, error-envelope decoding
│   ├── auth.ts             token storage + session bootstrap
│   ├── data-status.ts      deriveDataStatus — mirror of derive_data_status
│   ├── geometry.ts         normalised ↔ screen transforms
│   ├── format.ts           dates, percentages, counts, unknown-safe formatting
│   └── demo/demo-*.ts      DEMO DATA only, per CLAUDE.md §10
├── providers/              AuthProvider, SettingsProvider, ToastProvider
├── services/               one module per API area, mirrors ./api_contract.md
└── types/domain.ts         enum parity twin of backend/app/core/enums.py
```

## Routes

| Path | File | Purpose | Roles |
| --- | --- | --- | --- |
| `/login` | `app/login/page.tsx` | credential form; returns to the intended route | public |
| `/` | `app/page.tsx` | Dashboard: KPIs, HITL progress, model block, activity, health | any |
| `/data` | `app/data/page.tsx` | Data & Admin hub (section index) | ADMIN, ANNOTATOR |
| `/data/review` | `app/data/review/page.tsx` | Review Data — one image at a time | ADMIN, ANNOTATOR |
| `/data/datasets` | `app/data/datasets/page.tsx` | dataset list, archive | ADMIN |
| `/data/datasets/[id]` | `app/data/datasets/[id]/page.tsx` | versions, counts, split assignment, lock test | ADMIN |
| `/data/upload` | `app/data/upload/page.tsx` | register a local ingest path | ADMIN |
| `/data/statistics` | `app/data/statistics/page.tsx` | counts, time series, distributions | ADMIN, RESEARCHER |
| `/data/annotations` | `app/data/annotations/page.tsx` | agreement, correction, skip, confidence bins | ADMIN, RESEARCHER |
| `/data/training` | `app/data/training/page.tsx` | HITL status, batches, jobs, training settings | ADMIN |
| `/data/logs` | `app/data/logs/page.tsx` | audit log with filters | ADMIN |
| `/analyze` | `app/analyze/page.tsx` | Analyze Model: active model, versions, comparison | any |
| `/analyze/[modelId]` | `app/analyze/[modelId]/page.tsx` | one version: hyperparameters, loss, evaluations | any |

Exactly three primary nav areas — Dashboard, Data & Admin, Analyze Model. **Review Data is never a
top-level nav item** (CLAUDE.md §11.1).

## `lib/navigation.ts` — the single route declaration point

```ts
export interface NavItem { key: string; label: string; href: Route;
                           roles: Role[]; children?: NavItem[]; }
export const ROUTES = { login: '/login', dashboard: '/', data: '/data',
                        review: '/data/review', /* … */ } as const;
export type Route = (typeof ROUTES)[keyof typeof ROUTES];
export const NAV: NavItem[];                       // three top-level entries
export function isRouteAllowed(route: Route, role: Role): boolean;
```

- No page, link or redirect hard-codes a path string; every `href` comes from `ROUTES`.
- The nav tree, breadcrumbs, the section nav inside `/data`, and the client-side route guard all read
  the same array, so a new page appears in one place.
- Role visibility is declared here too — the guard and the nav can never disagree.

## UI primitives — `components/ui/`

| Primitive | Notes |
| --- | --- |
| `Button`, `IconButton` | real `<button>`; variants primary/secondary/ghost/danger; `loading` disables and announces |
| `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch` | always paired with `Label`; `aria-invalid` + `aria-describedby` on error |
| `FormField` | label + control + hint + error in one accessible unit |
| `Card`, `Panel`, `Toolbar` | flat surfaces, 1 px border, no shadow at rest |
| `DataTable` | column defs, sort, empty/loading/error slots, keyboard row focus |
| `Pagination` | `page`/`page_size`/`total` straight from the paginated envelope |
| `FilterBar`, `DateRangePicker` | resolves UI presets to `from`/`to` before calling the API |
| `Badge`, `StatusPill` | one colour role per enum member (`ModelStatus`, `ServiceState`, `DataStatus`) |
| `KpiTile` | value + label + optional delta; renders `—` for unknown, never `0` |
| `ProgressBar` | HITL progress; shows `count / threshold` from the API, never a literal |
| `Tabs`, `Dialog`, `ConfirmDialog`, `Drawer`, `Tooltip` | focus trap, `Esc` to close, restore focus on exit |
| `Toast` + `ToastProvider` | one queue, polite live region |
| `Skeleton`, `Spinner`, `EmptyState`, `ErrorState` | the four-state kit (below) |
| `DemoBadge` | mandatory on any surface rendering demo data (CLAUDE.md §10) |
| `Unavailable` | explicit "not computed yet" surface with the reason from the API |

Feature code composes primitives; it never re-styles one inline.

## The four mandatory states

Every data surface implements all four. A component that renders only the happy path is unfinished.

| State | Trigger | Rendering |
| --- | --- | --- |
| loading | request in flight | `Skeleton` matching the final layout, no spinner-on-blank |
| empty | `total === 0` | `EmptyState` naming the reason, e.g. no dataset loaded yet |
| error | error envelope or transport failure | `ErrorState` with `error.code`, message, retry |
| populated | data present | the real thing |

Two additional cases are treated as first-class, not as errors: `MODEL_UNAVAILABLE` (no active model
→ hide the prediction/XAI panel entirely) and `DATASET_NOT_AVAILABLE` (`501` → render the blocked
explanation, never a placeholder figure).

## Design tokens

Tokens live in `app/globals.css` as CSS custom properties on `:root` and are consumed by Tailwind
through the theme mapping — Tailwind utilities resolve to `var(--…)`, so there is one definition per
value and no hex literal in a component.

| Group | Roles (not values) |
| --- | --- |
| Colour · surface | `--bg` page, `--surface` card, `--surface-raised` overlay, `--border`, `--border-strong` |
| Colour · text | `--text` primary, `--text-muted` secondary, `--text-inverse` on accent |
| Colour · accent | `--accent`, `--accent-hover`, `--accent-fg` — one accent, used for the primary action only |
| Colour · status | `--ok`, `--warn`, `--danger`, `--info`, `--neutral` + a `-soft` background for each; enum members map onto these, nothing invents a colour |
| Colour · focus | `--focus-ring` — always visible, never `outline: none` |
| Spacing | 4 px base: `1 2 3 4 6 8 12 16 24` steps; no arbitrary pixel padding |
| Type | `12 / 14 / 16 / 20 / 24 / 30 px` with paired line heights; one sans stack, tabular numerals for metrics |
| Radii | `sm 4`, `md 6`, `lg 10`, `full` — cards `md`, pills `full` |
| Elevation | `0` flat + border (default), `1` subtle shadow for popovers, `2` for modals. No gradient washes, no glassmorphism |
| Motion | 120–200 ms, opacity and ≤ 4 px transforms only; every transition wrapped in `prefers-reduced-motion` |

Contrast for text is ≥ 4.5:1 against its own surface token. Status colour is never the sole carrier of
meaning — a status pill always has text.

## Charts — `components/charts/`

Hand-rolled SVG, six primitives, no dependency (CLAUDE.md §11.5). All accept `width`/`height` from a
`ResizeObserver` wrapper, render `<title>`/`<desc>` for screen readers, and take pre-computed data —
**no chart computes a metric**.

| Component | Props |
| --- | --- |
| `LineChart` | `series: Series[]`, `yDomain?`, `yFormat?`, `xTicks?`, `highlight?: string` |
| `BarChart` | `slices: Slice[]`, `orientation?: 'v' \| 'h'`, `valueFormat?` |
| `StackedBarChart` | `groups: { key, label, parts: Slice[] }[]`, `legend?: boolean` |
| `DonutChart` | `slices: Slice[]`, `centerLabel?`, `centerValue?` |
| `ConfusionMatrix` | `labels: string[]`, `matrix: number[][]`, `normalise?: boolean` |
| `Sparkline` | `points: Point[]`, `strokeRole?: 'accent' \| 'neutral'` |

```ts
type Point  = { t: string; v: number };                 // matches the API series shape
type Series = { key: string; label: string; points: Point[] };
type Slice  = { key: string; label: string; count: number };
```

An empty `series`/`slices` array renders the chart's own empty state — never an axis with invented
ticks.

## State management

Deliberately small: no Redux, no Zustand, no query cache library.

| Concern | Mechanism |
| --- | --- |
| Page data | fetched on the server where the route allows it, otherwise in a client component `useEffect` with an abort controller |
| Component state | plain `useState` / `useReducer` — the annotation canvas uses a reducer with an undo stack |
| Session | `AuthProvider` — user, role, token lifetime, `logout()` |
| Settings | `SettingsProvider` — training settings incl. the HITL threshold, refetched after a `PUT` |
| Notifications | `ToastProvider` — a single queue |
| Cross-page cache | none. A navigation refetches; correctness beats a stale KPI |

Only those three providers exist. A fourth needs a recorded reason (CLAUDE.md §11.4).

## Data fetching — `services/`

```ts
// services/review-service.ts  (shape; the contract is ./api_contract.md)
export async function getQueue(f: ReviewFilters): Promise<ReviewQueue>;
export async function claim(imageId: number): Promise<ReviewItem>;
export async function submit(imageId: number, body: SubmitBody): Promise<SubmitResult>;
export async function skip(imageId: number, body: SkipBody): Promise<SkipResult>;
```

- One module per API area (`auth`, `datasets`, `images`, `review`, `annotations`, `predictions`,
  `models`, `training`, `statistics`, `admin`, `logs`), each wrapping `lib/api-client.ts`.
- `api-client.ts` owns the base URL (`NEXT_PUBLIC_API_BASE_URL`), the bearer header, JSON decoding,
  and turning the error envelope into a typed `ApiError { code, message, details }`.
- Components never call `fetch` directly and never build a URL string.
- Every response type is declared in `types/domain.ts` or the service module — no `any`, no `!` to
  silence a genuine nullable (CLAUDE.md §11.2).

## Accessibility checklist

- Real `<button>`, `<a>`, `<label>`, `<table>` elements; no `div` with a click handler.
- Visible `--focus-ring` on every focusable element; focus order follows reading order.
- `aria-*` on custom widgets: tabs, dialogs, the tool palette, the canvas surface.
- Every annotation action has a keyboard path (see [annotation_workflow](./annotation_workflow.md)).
- Live regions for toasts and for queue advance ("image 248 of —"); `prefers-reduced-motion` disables
  transitions and nothing depends on animation to be understood.
- Contrast ≥ 4.5:1 for text; icons never the only label; forms announce errors.

## Responsive behaviour

Desktop-first — review work happens on a laptop — but nothing breaks below `md` (CLAUDE.md §11.2).

| Range | Behaviour |
| --- | --- |
| `< 640` | single column; nav collapses to a menu; canvas takes full width with the tool palette above it and the submit form below |
| `640–1024` | two columns; data tables scroll horizontally inside their card |
| `≥ 1024` | canvas + inspector side by side; charts at full size. Above `1280` only the gutters widen — no new content appears at large sizes |

## Demo data rules

Mock data is permitted only under all five conditions of CLAUDE.md §10: it lives in
`lib/demo/demo-*.ts`, opens with the `DEMO DATA` banner comment, exports carry `isDemo: true`, every
screen showing it renders `<DemoBadge />` plus the global banner while `NEXT_PUBLIC_DATA_SOURCE=demo`,
and `NEXT_PUBLIC_DATA_SOURCE=api` removes all of it with real empty states in its place — no mixing.

Forbidden even with a badge: any figure presented as a trained model's performance, any image that
could be mistaken for a clinical photograph, and any Grad-CAM-looking heat-map. Model performance
panels render an empty state ("no trained model — blocked on dataset"); the separate layout-preview
toggle watermarks its numbers `SYNTHETIC`. `scripts/verify_invariants.py` fails the build if a demo
file loses its banner or is imported outside the allowed wiring.
