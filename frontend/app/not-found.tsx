/**
 * MedLoop AI — the 404 page.
 *
 * Rendered by `app/not-found.tsx`, which Next composes with the **root** layout only — not with
 * `(shell)`. So this page cannot assume navigation, a session, or that `SessionProvider` has resolved.
 * That is why it is a plain server component with one link and no header: an unknown URL is exactly
 * the case where reaching for `useSession()` would turn a missing page into a crash.
 *
 * The wording distinguishes the two ways someone arrives here, because the remedies differ. A typo is
 * self-explanatory. A screen that has not been built yet is a fact about this build, and saying so is
 * cheaper than letting someone conclude the app is broken.
 */

import type { ReactElement } from 'react';

import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/lib/navigation';

export default function NotFound(): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 py-10">
      <Card as="section" aria-label="Page not found" padding="lg" className="w-full max-w-md">
        <div className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-wide text-content-muted">404</p>
          <h1 className="text-lg font-semibold text-content-primary">This screen does not exist</h1>
          <p className="max-w-prose text-sm text-content-secondary">
            The address did not match any route in this build. Either the URL is mistyped, or it points
            at a screen that has not been implemented yet — several are still blocked behind the
            backend and the dataset-dependent phases.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <LinkButton href={ROUTES.dashboard} variant="primary">
              Back to the dashboard
            </LinkButton>
            <LinkButton href={ROUTES.data.root}>Data &amp; Admin</LinkButton>
          </div>
        </div>
      </Card>
    </div>
  );
}
