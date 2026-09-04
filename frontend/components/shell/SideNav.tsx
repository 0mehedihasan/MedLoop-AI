'use client';

/**
 * MedLoop AI — `SideNav`: the sub-sections of the area you are currently in.
 *
 * The header carries the three primary areas (§11.1). This column carries the *children* of whichever
 * one is open, which today means Data & Admin and nothing else — Dashboard and Analyze Model have no
 * children, so the column is absent on those screens rather than present and empty.
 *
 * That split is the reason **Review Data can never appear as a top-level item**: it exists only inside
 * `NAV`'s Data & Admin `children`, and this component is the only thing that renders `children`.
 *
 * The list is already filtered by `visibleNav(role)` before it arrives, so an annotator does not see
 * Training Management at all. The filtering is about not offering dead links; it is not access
 * control, which lives in the API.
 *
 * `summary` is deliberately not rendered here — a 7-item sidebar with two lines each is a wall of
 * text. The summaries belong to the section index at `/data`, which is what `NavItem.summary`
 * documents.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';

import { cx } from '@/components/ui/cx';
import { TabLinks } from '@/components/ui/Tabs';
import { isActiveRoute } from '@/lib/navigation';
import type { NavArea } from '@/lib/navigation';

export interface SideNavProps {
  /** The open area, already role-filtered. Rendered only when it has children. */
  readonly area: NavArea;
}

const ITEM =
  'block rounded-md border-l-2 px-3 py-1.5 text-sm transition duration-fast';

export function SideNav({ area }: SideNavProps): ReactElement | null {
  const pathname = usePathname();
  const children = area.children ?? [];
  if (children.length === 0) return null;

  return (
    <nav
      aria-label={`${area.label} sections`}
      className="sticky top-0 hidden w-nav shrink-0 self-start border-r border-edge px-3 py-5 md:block"
    >
      <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-content-muted">
        {area.label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {children.map((item) => {
          const active = isActiveRoute(pathname, item.href);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  ITEM,
                  active
                    ? 'border-status-info bg-status-info-soft font-medium text-content-primary'
                    : 'border-transparent text-content-secondary hover:bg-surface-inset hover:text-content-primary',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The same children below `md`, where a 15 rem column would leave no room for the work.
 *
 * A hidden sidebar with no replacement would make Review Data unreachable on a narrow window, which
 * §11.2 forbids ("desktop-first, but nothing may break below `md`"). This is a horizontal scrolling
 * strip of the identical links — `TabLinks` already is a `<nav>` of links with `aria-current`, so the
 * two renderings make the same promise to a screen reader.
 *
 * Both are in the DOM at once, which would otherwise mean two identically-named landmarks. They carry
 * different accessible names for that reason, and only one is ever displayed.
 */
export function SideNavStrip({ area }: SideNavProps): ReactElement | null {
  const children = area.children ?? [];
  if (children.length === 0) return null;

  return (
    <TabLinks
      label={`${area.label} sections, compact`}
      items={children.map((item) => ({ href: item.href, label: item.label }))}
      className="px-4 md:hidden"
    />
  );
}
