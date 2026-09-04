'use client';

/**
 * MedLoop AI — `PageHeader`: the one `<h1>` on the page, plus the trail that leads to it.
 *
 * Every screen renders exactly one of these, and it is the *only* place an `h1` appears — `Card`'s
 * heading levels start at `h2` for that reason. The outline of every page is therefore
 * `h1 → panel h2 → sub-heading h3`, with no skipped level, which is what makes heading navigation
 * usable at all.
 *
 * `title` is a string rather than a `ReactNode` on purpose: it is also the document title in most
 * cases, and a heading assembled out of elements cannot be reused as text.
 *
 * The `actions` slot sits on the same line on a wide window and wraps beneath on a narrow one. It is
 * for page-level controls — "New dataset version", "Refresh" — and not for anything destructive; a
 * destructive action belongs next to the thing it destroys, where the row it will remove is visible.
 */

import type { ReactElement, ReactNode } from 'react';

import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { cx } from '@/components/ui/cx';

export interface PageHeaderProps {
  readonly title: string;
  /** One or two sentences: what this screen is for, or the definition its figures depend on. */
  readonly description?: string;
  /** Page-level controls, right-aligned on `md` and up. */
  readonly actions?: ReactNode;
  /** Beside the title — a `<DemoBadge />`, a `<StatusPill />`, a version chip. */
  readonly meta?: ReactNode;
  /**
   * Replaces the generic last crumb for a detail route: `/data/datasets/7` → "PAD-UFES-20 v2".
   * Without it the trail ends at the route table's own label, never at a raw id.
   */
  readonly leafLabel?: string;
  /** Drop the trail. Only the dashboard, which is the root of it, should ever need this. */
  readonly hideBreadcrumbs?: boolean;
  readonly className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
  leafLabel,
  hideBreadcrumbs = false,
  className,
}: PageHeaderProps): ReactElement {
  return (
    <header className={cx('flex flex-col gap-2 pb-5', className)}>
      {hideBreadcrumbs ? null : <Breadcrumbs leafLabel={leafLabel} hideWhenShallow />}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-content-primary">{title}</h1>
            {meta}
          </div>
          {description === undefined ? null : (
            <p className="max-w-prose text-sm text-content-secondary">{description}</p>
          )}
        </div>
        {actions === undefined ? null : (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
