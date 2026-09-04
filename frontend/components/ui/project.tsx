/**
 * MedLoop AI — the three project-specific primitives.
 *
 * These exist because of CLAUDE.md §10 and §2.3, not because of a design system. `DemoBadge` and
 * `SyntheticWatermark` are the visible half of the demo-data contract: the invariant script checks
 * that fixtures are declared correctly, and these two make sure a reader of the *screen* can tell.
 *
 * Neither is decorative, so neither is `aria-hidden`. A screen-reader user has exactly the same
 * need to know that a figure is fabricated.
 */

import type { ReactElement, ReactNode } from 'react';

import { cx } from './cx';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * VisuallyHidden
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface VisuallyHiddenProps {
  readonly children: ReactNode;
  /** Render as something other than `<span>` — `caption` and `th` both come up in the charts. */
  readonly as?: 'span' | 'div' | 'caption' | 'th' | 'p';
}

/**
 * The class list, exported because a few elements have to hide *themselves* rather than wrap their
 * text — a `<label>` for a control whose purpose is already obvious from context, for instance.
 * Written once here so the technique cannot drift into a `display:none` copy somewhere else.
 */
export const SR_ONLY =
  'absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 [clip-path:inset(50%)] [margin:-1px]';

/**
 * Off-screen but present in the accessibility tree. Used for the table transcript every chart
 * carries (`medloop-frontend.md`: "the same numbers are reachable as a table"), so the data is
 * never colour-only.
 *
 * `clip-path` plus a 1 px box rather than `display: none`, which would remove it from the tree, or
 * a negative text-indent, which breaks inside a table.
 */
export function VisuallyHidden({ children, as = 'span' }: VisuallyHiddenProps): ReactElement {
  const className = SR_ONLY;
  switch (as) {
    case 'div':
      return <div className={className}>{children}</div>;
    case 'caption':
      return <caption className={className}>{children}</caption>;
    case 'th':
      return <th className={className}>{children}</th>;
    case 'p':
      return <p className={className}>{children}</p>;
    case 'span':
      return <span className={className}>{children}</span>;
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * DemoBadge
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface DemoBadgeProps {
  /** Overrides the default text. Keep it short; the point is recognition, not explanation. */
  readonly label?: string;
  readonly className?: string;
}

/**
 * Condition 4 of §10: every screen that renders a fixture shows this. It is intentionally the same
 * shape everywhere — a reader learns the mark once.
 *
 * The tone is `warn`, not `info`: "this is not real" is a caution, and `info` is the app's ordinary
 * accent, which would let the badge fade into the furniture.
 */
export function DemoBadge({ label = 'Demo data', className }: DemoBadgeProps): ReactElement {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded border border-status-warn-edge bg-status-warn-soft',
        'px-1.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-wide text-status-warn',
        className,
      )}
    >
      {/* A shape as well as a colour: status is never colour-only. */}
      <svg viewBox="0 0 8 8" aria-hidden="true" className="h-2 w-2 fill-current">
        <path d="M4 0 8 8H0z" />
      </svg>
      {label}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * SyntheticWatermark
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface SyntheticWatermarkProps {
  readonly children: ReactNode;
  /** The repeated word. `SYNTHETIC` is the §10 wording and should rarely change. */
  readonly text?: string;
  readonly className?: string;
}

/**
 * Diagonal repeated text across whatever it wraps. Reserved for the *layout preview* toggle — the
 * only place §10 allows a figure that looks like a metric — and for procedurally drawn imagery.
 *
 * The overlay is `pointer-events-none` so it cannot block a control underneath, and the same word
 * is announced once to assistive technology; repeating it 40 times in the accessibility tree would
 * make the panel unusable with a screen reader.
 */
export function SyntheticWatermark({
  children,
  text = 'SYNTHETIC',
  className,
}: SyntheticWatermarkProps): ReactElement {
  const stripe = `${text} · `.repeat(8);
  return (
    <div className={cx('relative isolate', className)}>
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden select-none"
      >
        <div className="absolute left-1/2 top-1/2 w-[220%] -translate-x-1/2 -translate-y-1/2 -rotate-[24deg] space-y-6 opacity-[0.13]">
          {[0, 1, 2, 3, 4].map((row) => (
            <p
              key={row}
              className="whitespace-nowrap font-mono text-lg font-semibold uppercase tracking-[0.35em] text-content-primary"
            >
              {stripe}
            </p>
          ))}
        </div>
      </div>
      <VisuallyHidden>
        {text} — illustrative layout only. Not produced by a trained model.
      </VisuallyHidden>
    </div>
  );
}
