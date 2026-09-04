'use client';

/**
 * MedLoop AI — the Data & Admin section index (`/data`).
 *
 * One of the three primary areas (§11.1), and the only one that is a *list of screens* rather than a
 * screen. It exists because Review Data is deliberately not a top-level nav item: something has to
 * be the parent that leads to it.
 *
 * ## It is generated, not written
 *
 * The tiles come from `visibleNav(role)` — the same function the sidebar calls. A second,
 * hand-written list of sections here is the exact failure §11.1 forbids: the two would drift, and the
 * index would keep advertising a screen after a guard changed. The wording under each label is the
 * `summary` field on `NavItem`, which is documented as belonging to this page and is not rendered in
 * the sidebar. So the sidebar says *where*, and this says *what for*.
 *
 * ## No query, no four states
 *
 * This page reads the route table and the session. Nothing else. It has no loading, empty or error
 * state of its own because it fetches nothing — the shell has already resolved the session before a
 * child renders, and `AppShell` owns the `loading`, `anonymous` and wrong-role outcomes. Adding a
 * skeleton here would be theatre.
 *
 * ## The whole tile is the target
 *
 * A `<Link>` fills the card and owns its padding, rather than the card wrapping a link around four
 * words of label. `Card` still supplies the surface, so there is no second copy of the border and
 * shadow tokens anywhere.
 */

import Link from 'next/link';
import type { ReactElement } from 'react';

import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/states';
import { LinkButton } from '@/components/ui/Button';
import { ROUTES, visibleNav } from '@/lib/navigation';
import type { NavArea, NavItem } from '@/lib/navigation';
import { useSession } from '@/lib/session';

/**
 * The children of the Data & Admin entry, or an empty list when the role can reach none of them.
 *
 * Found by `href` rather than by index or by `key`, because `ROUTES.data.root` is the thing this file
 * is about and the array's order is not a contract.
 */
function dataChildren(areas: readonly NavArea[]): readonly NavItem[] {
  return areas.find((area) => area.href === ROUTES.data.root)?.children ?? [];
}

/**
 * `h2` because `PageHeader` owns the page's single `h1` — the outline stays `h1 → h2` with no skipped
 * level, which is the rule `Card.tsx` states and the reason its heading level is a prop.
 *
 * The arrow is `aria-hidden`: the link text already says where it goes, and "right arrow" announced
 * after every label is noise.
 */
function SectionTile({ item }: { readonly item: NavItem }): ReactElement {
  return (
    <Card as="li" padding="none" className="transition duration-fast hover:border-edge-strong">
      <Link href={item.href} className="flex h-full flex-col gap-1 p-4">
        <span className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-content-primary">{item.label}</h2>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 fill-none stroke-content-muted stroke-2">
            <path d="M6 3.5 10.5 8 6 12.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="text-xs text-content-secondary">{item.summary}</span>
      </Link>
    </Card>
  );
}

export default function DataSectionPage(): ReactElement {
  const { role } = useSession();
  const children = dataChildren(visibleNav(role));

  return (
    <>
      <PageHeader
        title="Data & Admin"
        description="Everything that changes the state of the loop: what data exists, what a human has said about it, what has been trained on it, and who did any of it."
      />

      {children.length === 0 ? (
        // Unreachable for the three current roles — every one of them can see at least the two
        // statistics screens. It is here because the list is derived from the guard table, and a
        // guard change must not produce a page that renders nothing at all.
        <EmptyState
          title="No screens in this section are available for your role"
          description="Data & Admin is reachable, but every screen inside it is restricted. An administrator can change your role; the API enforces it either way."
          action={<LinkButton href={ROUTES.dashboard}>Back to the dashboard</LinkButton>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {children.map((item) => (
              <SectionTile key={item.key} item={item} />
            ))}
          </ul>
          {/*
            Said once, plainly. Without it the absence of Training Management reads as a broken build
            rather than as a permission — and the alternative, listing screens with a padlock on them,
            is the dead affordance §11.1's guards exist to prevent.
          */}
          <p className="text-xs text-content-muted">
            Screens your role cannot open are not listed here.
          </p>
        </div>
      )}
    </>
  );
}
