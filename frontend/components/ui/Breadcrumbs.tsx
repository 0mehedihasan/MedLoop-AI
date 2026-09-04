'use client';

/**
 * MedLoop AI — `Breadcrumbs`.
 *
 * Renders whatever `breadcrumbsFor()` in `lib/navigation.ts` returns for the current pathname. The
 * trail is *derived from the route table*, never assembled by a page, so a section that gets renamed
 * or renested is renamed in one place (§11.1).
 *
 * ## Shape
 *
 * An ordered list inside a named `<nav>`. `<ol>` because the order is the meaning — "Data & Admin"
 * contains "Review Data", not the reverse — and a screen reader announcing "list, 3 items" tells the
 * user how deep they are before they read a word of it.
 *
 * The last crumb is the current page. `Crumb.href` is `null` for it, so it renders as plain text
 * carrying `aria-current="page"`: a link to the page you are already on is a dead control, and
 * users who navigate by links have to try it to find that out.
 *
 * The separator is a `<span aria-hidden>` between items rather than a CSS `::before`, because
 * generated content is read aloud by some screen reader / browser pairs and "slash" between every
 * crumb is noise. It is not part of any link's accessible name either way.
 *
 * ## Two exports
 *
 * {@link BreadcrumbTrail} renders a trail it is handed. {@link Breadcrumbs} is the router-aware
 * wrapper that derives one from `usePathname()`. Both live in this `'use client'` file, so both ship
 * as client components — the split is about *where the trail comes from*, not about the boundary. A
 * surface that already knows its own trail (a workspace that pushes state without navigating) uses
 * the former; every page uses the latter.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';

import { cx } from './cx';
import { breadcrumbsFor } from '@/lib/navigation';
import type { Crumb } from '@/lib/navigation';

export interface BreadcrumbTrailProps {
  readonly crumbs: readonly Crumb[];
  readonly className?: string;
}

export interface BreadcrumbsProps {
  /**
   * Replaces the last crumb's label. For a detail route the table can only know the *shape*
   * (`/data/datasets/7` → "Dataset"); the page knows it is "PAD-UFES-20 v2". Omit it and the
   * generic label from the route table stands — never a raw id.
   */
  readonly leafLabel?: string;
  /** Overrides `usePathname()` — for rendering the trail of a route other than the current one. */
  readonly pathname?: string;
  /** Hide the trail when it is only the root crumb. Off by default — a jumping trail is worse. */
  readonly hideWhenShallow?: boolean;
  readonly className?: string;
}

/** `/` at a size that reads as punctuation rather than as a division sign. */
const SEPARATOR = (
  <span aria-hidden="true" className="select-none px-1 text-content-muted">
    /
  </span>
);

export function BreadcrumbTrail({ crumbs, className }: BreadcrumbTrailProps): ReactElement | null {
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center text-xs text-content-secondary">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.href ?? 'current'}-${crumb.label}`} className="flex items-center">
              {index === 0 ? null : SEPARATOR}
              {crumb.href === null || last ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={cx(last && 'font-medium text-content-primary')}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="rounded-sm underline-offset-2 transition duration-fast hover:text-content-primary hover:underline"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Returns `null` rather than an empty `<nav>` when there is nothing to show, so no page has to
 * conditionally render it.
 */
export function Breadcrumbs({
  leafLabel,
  pathname,
  hideWhenShallow = false,
  className,
}: BreadcrumbsProps): ReactElement | null {
  // Called unconditionally; `pathname` overrides the result, it does not skip the hook.
  const current = usePathname();
  const crumbs = breadcrumbsFor(pathname ?? current, leafLabel);

  if (hideWhenShallow && crumbs.length <= 1) return null;

  return <BreadcrumbTrail crumbs={crumbs} className={className} />;
}
