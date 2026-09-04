'use client';

/**
 * MedLoop AI — `TopBar`: the three primary areas, and who is signed in.
 *
 * `NAV` is rendered directly, filtered by `visibleNav(role)`. There are exactly three entries and
 * adding a fourth is a navigation redesign, not a nav addition (§11.1) — so this component does not
 * try to be a generic menu system. No overflow menu, no "more" affordance, no collapsing: three items
 * fit at every width this app supports.
 *
 * The primary areas are drawn as filled pills while the sub-sections (`SideNav`, `TabLinks`) are drawn
 * as an underlined strip. That difference is doing work: at a glance you can tell which of the two
 * levels you are looking at, without reading either.
 *
 * ## The session block
 *
 * Name, role and a sign-out control. The role is shown because every screen in this app behaves
 * differently per role, and "why can't I see Training Management?" should be answerable from the
 * header rather than from the API's 403.
 *
 * Sign-out is a `<button>` and never a link: it changes server state.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { APP_VERSION } from '@/lib/env';
import { ROUTES, isActiveRoute, visibleNav } from '@/lib/navigation';
import { useSession } from '@/lib/session';
import { humaniseEnum } from '@/lib/format';

const AREA =
  'rounded-md px-3 py-1.5 text-sm font-medium transition duration-fast whitespace-nowrap';

export function TopBar(): ReactElement {
  const pathname = usePathname();
  const { status, user, role, signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const areas = visibleNav(role);

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-edge bg-surface-panel px-4 py-2">
      <Link
        href={ROUTES.dashboard}
        className="flex items-baseline gap-2 whitespace-nowrap text-sm font-semibold text-content-primary"
      >
        MedLoop AI
        {/* The version is here rather than in a footer because it is the first thing to quote in a
            bug report, and this header is on every screen. */}
        <span className="font-mono text-xs font-normal text-content-muted">v{APP_VERSION}</span>
      </Link>

      <nav aria-label="Primary" className="order-last w-full md:order-none md:w-auto">
        <ul className="flex items-center gap-1 overflow-x-auto">
          {areas.map((area) => {
            const active = isActiveRoute(pathname, area.href);
            return (
              <li key={area.key}>
                <Link
                  href={area.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    AREA,
                    active
                      ? 'bg-status-info-soft text-content-primary'
                      : 'text-content-secondary hover:bg-surface-inset hover:text-content-primary',
                  )}
                >
                  {area.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {status === 'authenticated' && user !== null ? (
          <>
            <span className="flex items-center gap-2 text-xs">
              <span className="font-medium text-content-primary">{user.display_name}</span>
              <Badge tone="neutral">{humaniseEnum(user.role)}</Badge>
            </span>
            <Button
              size="sm"
              variant="subtle"
              busy={signingOut}
              onClick={() => {
                setSigningOut(true);
                void signOut().finally(() => setSigningOut(false));
              }}
            >
              Sign out
            </Button>
          </>
        ) : null}
      </div>
    </header>
  );
}
