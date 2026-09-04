/**
 * MedLoop AI — Spinner.
 *
 * Its own module because both `Button` (busy state) and `states.tsx` (`ErrorState`, inline loading)
 * need it, and a second copy of a spinner is exactly the duplicated logic §11.4 forbids.
 *
 * `prefers-reduced-motion` is handled globally in `app/globals.css`, which clamps every animation to
 * 0.01 ms. That freezes this arc into a static mark — so the accompanying text is not decoration, it
 * is the only signal some users will get. `label` is therefore required to be meaningful, and it is
 * announced through `role="status"`.
 */

import type { ReactElement } from 'react';

import { cx } from './cx';
import { VisuallyHidden } from './project';

export interface SpinnerProps {
  /** Announced to assistive technology. Say what is happening: "Loading review queue". */
  readonly label: string;
  readonly size?: 'sm' | 'md' | 'lg';
  /** Show `label` next to the arc instead of only to screen readers. */
  readonly showLabel?: boolean;
  readonly className?: string;
}

const SIZE: Readonly<Record<NonNullable<SpinnerProps['size']>, string>> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
};

export function Spinner({
  label,
  size = 'md',
  showLabel = false,
  className,
}: SpinnerProps): ReactElement {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cx('inline-flex items-center gap-2 text-content-secondary', className)}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cx('animate-spin', SIZE[size])}
        fill="none"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        {/* One quarter arc. `stroke-linecap` round keeps the frozen reduced-motion state legible. */}
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {showLabel ? <span className="text-xs">{label}</span> : <VisuallyHidden>{label}</VisuallyHidden>}
    </span>
  );
}
