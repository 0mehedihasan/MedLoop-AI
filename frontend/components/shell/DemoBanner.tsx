/**
 * MedLoop AI — the global demo-mode banner (§10, condition 4).
 *
 * Present on every screen while `NEXT_PUBLIC_DATA_SOURCE=demo`, and gone entirely — not hidden, not
 * collapsed — when it is `api`. There is deliberately **no dismiss control**: the whole point of the
 * banner is that nobody can screenshot a number from this app and mistake it for a measurement, and a
 * banner you can close is a banner that is closed in every screenshot.
 *
 * It is not a `role="alert"`. It is present on first paint, so an assertive announcement would talk
 * over the page title on every navigation; the wording is instead the first thing in the document
 * after the skip link, which is where a screen-reader user meets it anyway.
 */

import type { ReactElement } from 'react';

import { IS_DEMO } from '@/lib/env';

export function DemoBanner(): ReactElement | null {
  if (!IS_DEMO) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 border-b border-status-warn-edge bg-status-warn-soft px-4 py-1.5 text-xs">
      <span className="font-medium text-status-warn">Demo mode</span>
      <span className="text-content-secondary">
        Every figure on screen is a fixture. No model has been trained, and nothing here is a
        measurement.
      </span>
      <span className="text-content-muted">
        Set <code className="font-mono text-content-primary">NEXT_PUBLIC_DATA_SOURCE=api</code> to
        remove all of it.
      </span>
    </div>
  );
}
