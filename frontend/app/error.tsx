'use client';

/**
 * MedLoop AI — the route error boundary.
 *
 * Catches a render or data error thrown below the root layout. It is deliberately *not* the place
 * where API failures are reported: those are values, handled by `ErrorState` inside the screen that
 * made the request, so the rest of the page survives. Anything that reaches here is a genuine bug —
 * a thrown exception during render — and the honest response is to say so and offer a retry.
 *
 * `reset()` re-renders the segment without a full reload, which is worth trying once: a transient
 * failure clears, and a real one comes straight back rather than being hidden by a page refresh that
 * also discards the console.
 *
 * `digest` is the only identifier a production build exposes — the message and stack are stripped
 * server-side — so it is printed. Without it a bug report about this screen has nothing to correlate
 * against the server log.
 */

import { useEffect } from 'react';
import type { ReactElement } from 'react';

import { Button, LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/lib/navigation';

export interface RouteErrorProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

export default function RouteError({ error, reset }: RouteErrorProps): ReactElement {
  useEffect(() => {
    // Local-only app: the console *is* the log sink. Nothing is transmitted anywhere (§2.1).
    console.error('[medloop] unhandled render error', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 py-10">
      <Card as="section" aria-label="Application error" padding="lg" className="w-full max-w-md">
        <div className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-wide text-status-danger">
            Unhandled error
          </p>
          <h1 className="text-lg font-semibold text-content-primary">This screen failed to render</h1>
          <p className="max-w-prose text-sm text-content-secondary">
            {error.message === '' ? 'No message was attached to the error.' : error.message}
          </p>
          {error.digest === undefined ? null : (
            <p className="font-mono text-xs text-content-muted">digest {error.digest}</p>
          )}
          <p className="max-w-prose text-xs text-content-muted">
            Nothing was sent anywhere. The full stack is in the browser console on this machine.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="primary" onClick={reset}>
              Try rendering again
            </Button>
            <LinkButton href={ROUTES.dashboard}>Back to the dashboard</LinkButton>
          </div>
        </div>
      </Card>
    </div>
  );
}
