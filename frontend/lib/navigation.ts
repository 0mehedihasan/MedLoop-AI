/**
 * MedLoop AI — the single declaration site for routes, navigation and route guards.
 *
 * Two rules from CLAUDE.md §11.1 are enforced *structurally* here rather than by review:
 *
 *   1. No page hard-codes a path string. Every `href` comes from {@link ROUTES}.
 *   2. **Review Data is never a top-level nav item.** It is a child of Data & Admin, always —
 *      see {@link NAV}, where it is unreachable except through that area's `children`.
 *
 * Guards are declared as explicit role allow-lists taken from `.claude/skills/medloop-security.md`
 * §"Roles and permission matrix". `medloop-frontend.md` writes some of these as "session + role";
 * the security skill is the authority on *which* roles, so the concrete lists below come from it.
 *
 * These guards exist so the UI does not offer dead buttons. **They are not access control** — the
 * API declares `require_role` on every endpoint, and a hidden button protects nothing.
 */

import { Role } from '@/types/domain';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Routes
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export const ROUTES = {
  dashboard: '/',
  login: '/login',
  data: {
    root: '/data',
    review: '/data/review',
    datasets: '/data/datasets',
    /** Dynamic segment. A function, so no caller concatenates an id onto a literal. */
    dataset: (id: number | string) => `/data/datasets/${id}`,
    upload: '/data/upload',
    statistics: '/data/statistics',
    annotations: '/data/annotations',
    training: '/data/training',
    logs: '/data/logs',
  },
  analyze: {
    root: '/analyze',
    compare: '/analyze/compare',
  },
} as const;

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Guards
 *
 * `ALL_ROLES` means "any authenticated user", which is different from `PUBLIC`. Writing it as a
 * list rather than a `session` flag keeps one comparison in {@link canAccess} instead of two
 * branches, and makes a future role addition a one-line change here.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export const ALL_ROLES: readonly Role[] = [Role.ADMIN, Role.ANNOTATOR, Role.RESEARCHER];
const ADMIN_ONLY: readonly Role[] = [Role.ADMIN];
const REVIEWERS: readonly Role[] = [Role.ADMIN, Role.ANNOTATOR];
const ANALYSTS: readonly Role[] = [Role.ADMIN, Role.RESEARCHER];

/** `null` roles ⇒ public. Only `/login` uses it. */
export interface RouteGuard {
  /** Matched as an exact path or as a path prefix followed by `/`. */
  readonly pattern: string;
  readonly roles: readonly Role[] | null;
}

/**
 * Ordered **most specific first**: {@link guardFor} returns the first match, so `/data/logs` is
 * resolved by its own entry and never by the broader `/data` one. Reordering this array changes
 * who can see what, which is why it is a single flat list rather than a nested structure.
 */
export const ROUTE_GUARDS: readonly RouteGuard[] = [
  { pattern: ROUTES.login, roles: null },
  { pattern: ROUTES.data.review, roles: REVIEWERS },
  { pattern: ROUTES.data.datasets, roles: ADMIN_ONLY },
  { pattern: ROUTES.data.upload, roles: ADMIN_ONLY },
  { pattern: ROUTES.data.training, roles: ADMIN_ONLY },
  { pattern: ROUTES.data.logs, roles: ADMIN_ONLY },
  { pattern: ROUTES.data.statistics, roles: ALL_ROLES },
  { pattern: ROUTES.data.annotations, roles: ALL_ROLES },
  { pattern: ROUTES.data.root, roles: ALL_ROLES },
  { pattern: ROUTES.analyze.root, roles: ANALYSTS },
  { pattern: ROUTES.dashboard, roles: ALL_ROLES },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Navigation tree
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  /** Shown under the label in the section index; not rendered in the sidebar. */
  readonly summary: string;
}

export interface NavArea extends NavItem {
  /** Present only on Data & Admin. The three primary areas are exactly the entries of {@link NAV}. */
  readonly children?: readonly NavItem[];
}

/**
 * Exactly three primary areas (§11.1). Do not add a fourth without changing that section first —
 * the header renders `NAV` directly, so an addition here *is* a navigation redesign.
 */
export const NAV: readonly NavArea[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: ROUTES.dashboard,
    summary: 'Loop status, review progress, model state and service health.',
  },
  {
    key: 'data',
    label: 'Data & Admin',
    href: ROUTES.data.root,
    summary: 'Datasets, review, statistics, training and audit.',
    children: [
      {
        key: 'review',
        label: 'Review Data',
        href: ROUTES.data.review,
        summary: 'Annotate and validate images against the model prediction.',
      },
      {
        key: 'datasets',
        label: 'Dataset Management',
        href: ROUTES.data.datasets,
        summary: 'Versions, split assignment and test-set locking.',
      },
      {
        key: 'upload',
        label: 'Upload Data',
        href: ROUTES.data.upload,
        summary: 'Register a local image directory for staging.',
      },
      {
        key: 'statistics',
        label: 'Data Statistics',
        href: ROUTES.data.statistics,
        summary: 'Counts, growth over time and class distribution.',
      },
      {
        key: 'annotations',
        label: 'Annotation Statistics',
        href: ROUTES.data.annotations,
        summary: 'Agreement, correction rate, skip reasons and confidence bins.',
      },
      {
        key: 'training',
        label: 'Training Management',
        href: ROUTES.data.training,
        summary: 'HITL threshold, batches, jobs and training settings.',
      },
      {
        key: 'logs',
        label: 'System Logs',
        href: ROUTES.data.logs,
        summary: 'The audit trail, filterable by event, level and actor.',
      },
    ],
  },
  {
    key: 'analyze',
    label: 'Analyze Model',
    href: ROUTES.analyze.root,
    summary: 'Model registry, evaluations on the locked test set, version comparison.',
  },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** Trailing slashes are stripped so `/data/` and `/data` resolve to the same guard and nav item. */
function normalise(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

/**
 * True when `pathname` is `pattern` itself or a descendant of it. Deliberately *not* a
 * `startsWith`: that would make `/datasets-archive` a child of `/datasets`.
 */
function matchesPattern(pathname: string, pattern: string): boolean {
  const path = normalise(pathname);
  if (path === pattern) return true;
  if (pattern === '/') return false;
  return path.startsWith(`${pattern}/`);
}

/** The first — therefore most specific — matching guard, or `null` for an unknown path. */
export function guardFor(pathname: string): RouteGuard | null {
  return ROUTE_GUARDS.find((guard) => matchesPattern(pathname, guard.pattern)) ?? null;
}

/**
 * Whether `role` may see `pathname`. An **unknown** path returns `false`: a route with no declared
 * guard is a mistake, and failing closed turns that mistake into a visible 404-ish refusal rather
 * than an accidentally public page.
 */
export function canAccess(pathname: string, role: Role | null): boolean {
  const guard = guardFor(pathname);
  if (guard === null) return false;
  if (guard.roles === null) return true;
  if (role === null) return false;
  return guard.roles.includes(role);
}

export function isPublicRoute(pathname: string): boolean {
  return guardFor(pathname)?.roles === null;
}

/**
 * Active-state test for a nav link. The Dashboard is special-cased to an exact match, because
 * `'/'` is a prefix of every route and would otherwise always highlight.
 */
export function isActiveRoute(pathname: string, href: string): boolean {
  if (href === ROUTES.dashboard) return normalise(pathname) === ROUTES.dashboard;
  return matchesPattern(pathname, href);
}

/** `NAV` filtered to what `role` may actually reach. Areas whose every child is denied disappear. */
export function visibleNav(role: Role | null): readonly NavArea[] {
  return NAV.filter((area) => canAccess(area.href, role)).map((area) => {
    if (area.children === undefined) return area;
    const children = area.children.filter((child) => canAccess(child.href, role));
    return { ...area, children };
  });
}

/** A breadcrumb trail. `href` is `null` on the last crumb — the current page is not a link. */
export interface Crumb {
  readonly label: string;
  readonly href: string | null;
}

/**
 * Derived from {@link NAV}, never from a second list of sections (§11.1's do/don't table). An
 * unrecognised trailing segment — a dataset id, say — becomes a final crumb labelled by the caller
 * through `leafLabel`, so `/data/datasets/12` reads `Data & Admin / Dataset Management / <name>`.
 */
export function breadcrumbsFor(pathname: string, leafLabel?: string): readonly Crumb[] {
  const path = normalise(pathname);
  const crumbs: Crumb[] = [];

  for (const area of NAV) {
    if (!isActiveRoute(path, area.href)) continue;
    const child = area.children?.find((candidate) => isActiveRoute(path, candidate.href));
    const isAreaLeaf = child === undefined && path === area.href;
    crumbs.push({ label: area.label, href: isAreaLeaf ? null : area.href });
    if (child !== undefined) {
      const isChildLeaf = path === child.href && leafLabel === undefined;
      crumbs.push({ label: child.label, href: isChildLeaf ? null : child.href });
    }
    break;
  }

  if (leafLabel !== undefined) crumbs.push({ label: leafLabel, href: null });
  return crumbs;
}

