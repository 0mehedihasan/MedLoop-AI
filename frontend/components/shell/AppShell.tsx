'use client';

/**
 * MedLoop AI — `AppShell`: the frame every authenticated screen renders inside.
 *
 * It owns four things and nothing else: the skip link, the demo banner, the header, and the decision
 * about whether the current route may be rendered at all.
 *
 * ## Three session outcomes, all of them explicit
 *
 *  - **`loading`** — the frame renders with no navigation and a spinner. Drawing the nav first would
 *    mean drawing it for an unknown role and then rearranging it, and a nav that reflows under the
 *    pointer is how people click the wrong thing.
 *  - **`anonymous`** — replace to `/login`, carrying `?next=` so the intended screen is not lost. The
 *    redirect is an effect, not a render-time call, because navigating during render is a React error
 *    and, in a shell, an infinite one.
 *  - **`authenticated` but the role is not allowed** — refuse *in place*. No redirect: bouncing
 *    someone to the dashboard leaves them wondering whether the link is broken, and a redirect loop is
 *    one guard mistake away. `canAccess` fails closed on unknown paths, so a page added without a
 *    guard entry lands here too — which is the intended way to find that out.
 *
 * None of this is access control. The API declares the required role on every endpoint; this only
 * decides what to *offer* (`navigation.ts`).
 */

import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { DemoBanner } from './DemoBanner';
import { SideNav, SideNavStrip } from './SideNav';
import { TopBar } from './TopBar';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/states';
import { LinkButton } from '@/components/ui/Button';
import { ROUTES, canAccess, isActiveRoute, visibleNav } from '@/lib/navigation';
import type { NavArea } from '@/lib/navigation';
import { useSession } from '@/lib/session';

export interface AppShellProps {
  readonly children: ReactNode;
}

/**
 * The first focusable thing in the document. Visible only while focused, which is the whole point:
 * a keyboard user gets past the header without tabbing through it, and nobody else sees it.
 */
function SkipLink(): ReactElement {
  return (
    <a
      href="#main"
      className="absolute left-4 top-4 z-20 -translate-y-16 rounded-md border border-edge bg-surface-raised px-3 py-1.5 text-sm font-medium text-content-primary transition duration-fast focus:translate-y-0"
    >
      Skip to main content
    </a>
  );
}

export function AppShell({ children }: AppShellProps): ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const { status, role } = useSession();

  const anonymous = status === 'anonymous';
  useEffect(() => {
    if (!anonymous) return;
    const next = pathname === ROUTES.dashboard ? '' : `?next=${encodeURIComponent(pathname)}`;
    router.replace(`${ROUTES.login}${next}`);
  }, [anonymous, pathname, router]);

  const areas = visibleNav(role);
  const area: NavArea | undefined = areas.find((candidate) =>
    isActiveRoute(pathname, candidate.href),
  );
  const allowed = status === 'authenticated' && canAccess(pathname, role);

  return (
    <div className="flex min-h-dvh flex-col bg-surface-canvas">
      <SkipLink />
      <DemoBanner />
      <TopBar />
      {area === undefined ? null : <SideNavStrip area={area} />}
      <div className="flex flex-1 items-stretch">
        {area === undefined ? null : <SideNav area={area} />}
        <main id="main" className="min-w-0 flex-1 px-4 py-5 md:px-6">
          {status === 'loading' ? (
            <Spinner label="Reading your session" className="mx-auto mt-16" />
          ) : allowed ? (
            children
          ) : anonymous ? (
            // Rendered for the frame or two before the effect above navigates. Saying nothing here
            // would flash an empty page; saying "denied" would be a lie about a session that simply
            // has not been established yet.
            <Spinner label="Redirecting to sign in" className="mx-auto mt-16" />
          ) : (
            <EmptyState
              title="This section is not available for your role"
              description="Your account does not have access to this screen. If that is unexpected, an administrator can change your role — the API enforces it, so nothing here can be worked around from the browser."
              action={<LinkButton href={ROUTES.dashboard}>Back to the dashboard</LinkButton>}
            />
          )}
        </main>
      </div>
      <footer className="border-t border-edge px-4 py-2.5 text-xs text-content-muted md:px-6">
        MedLoop AI — local research prototype. Not a medical device and not a diagnostic tool. All
        images, models and logs stay on this machine.
      </footer>
    </div>
  );
}
