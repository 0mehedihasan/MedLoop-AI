/**
 * MedLoop AI — the state primitives: `Skeleton`, `EmptyState`, `ErrorState`, `Unavailable`,
 * `Blocked`.
 *
 * `medloop-frontend.md` makes four states mandatory on every data surface — loading, empty, error,
 * populated — and adds two that are specific to this project. All six live here so that a feature
 * screen cannot invent a seventh way of saying "there is nothing to show".
 *
 * | State | Means | Never |
 * | --- | --- | --- |
 * | loading | a request is in flight | a spinner-only full page |
 * | empty | `200` with `total === 0` | "no data" with no reason and no next step |
 * | error | non-2xx, or the socket died | a bare "something went wrong" |
 * | unavailable | the API *omitted* a figure | substituting `0`, or a dash with a fake tooltip |
 * | blocked | the capability is deliberately unimplemented (`501`) | a greyed-out chart of zeroes |
 *
 * The distinction between the last three is the whole point of the file. "Failed", "not measured"
 * and "not built yet" are three different facts about a number, and a UI that renders them
 * identically is making a claim it cannot support (CLAUDE.md §2.3).
 */

import type { ReactElement, ReactNode } from 'react';

import { Button } from './Button';
import { cx } from './cx';
import { ApiError } from '@/lib/api-client';
import { ApiErrorCode } from '@/types/api';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Skeleton
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface SkeletonProps {
  /** Tailwind sizing for the block. Mirror the real element's box, not a generic grey bar. */
  readonly className?: string;
  /** Repeat the block, e.g. for `rows` of a table. */
  readonly count?: number;
  readonly label?: string;
}

/**
 * A placeholder whose *shape* matches the content it stands in for. The skill is explicit that
 * skeletons mirror the final layout, because a loading state that changes the page geometry when it
 * resolves makes every load feel like a reflow bug.
 *
 * One `role="status"` wraps the whole group so a screen reader hears "Loading…" once, not once per
 * bar. The pulse is an animation, so `prefers-reduced-motion` flattens it globally — which is why
 * it also carries a static background rather than relying on the animation to be visible.
 */
export function Skeleton({
  className,
  count = 1,
  label = 'Loading',
}: SkeletonProps): ReactElement {
  return (
    <span role="status" aria-live="polite" aria-label={label} className="contents">
      {Array.from({ length: count }, (_unused, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cx('block animate-pulse rounded bg-surface-inset', className ?? 'h-4 w-full')}
        />
      ))}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Shared frame
 * ──────────────────────────────────────────────────────────────────────────────────────── */

const FRAME =
  'flex flex-col items-start gap-2 rounded-md border border-dashed px-4 py-6 text-sm';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * EmptyState
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface EmptyStateProps {
  /** What is empty, in the caller's own words: "No validated samples yet". */
  readonly title: string;
  /** Why it is empty and what would change that. Required — "No data" alone is not a state. */
  readonly description: string;
  /** The next action, usually a `LinkButton` to the screen that would create the first row. */
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps): ReactElement {
  return (
    <div className={cx(FRAME, 'border-edge bg-surface-panel', className)}>
      <p className="font-medium text-content-primary">{title}</p>
      <p className="max-w-prose text-content-secondary">{description}</p>
      {action}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * ErrorState
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface ErrorStateProps {
  /** The thrown value. Anything that is not an {@link ApiError} is reported as such, not guessed. */
  readonly error: unknown;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly className?: string;
}

/**
 * Renders `code` and `message` from the error envelope. Both, not one: the message is written for a
 * human and may be reworded at any time, while the code is the stable identifier someone will search
 * the backend for. Showing only the prose makes a bug report unactionable.
 *
 * A transport failure is worded differently on purpose. "Cannot reach the API" and "the API refused
 * this" send someone to two different places, and this app runs against a backend that is very often
 * simply not started yet.
 */
export function ErrorState({
  error,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps): ReactElement {
  const known = error instanceof ApiError ? error : null;
  const code = known?.code ?? ApiErrorCode.INTERNAL_ERROR;
  const message =
    known?.message ??
    (error instanceof Error ? error.message : 'An unexpected error occurred in the browser.');

  return (
    <div
      role="alert"
      className={cx(
        FRAME,
        'border-status-danger-edge bg-status-danger-soft text-status-danger',
        className,
      )}
    >
      <p className="font-medium">
        {known?.isNetworkError === true ? 'The MedLoop API is not reachable' : 'The request failed'}
      </p>
      <p className="max-w-prose text-content-secondary">{message}</p>
      <p className="font-mono text-[0.6875rem] uppercase tracking-wide text-content-muted">
        {code}
        {known?.status === null || known?.status === undefined ? '' : ` · HTTP ${known.status}`}
      </p>
      {onRetry === undefined ? null : (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Unavailable
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface UnavailableProps {
  /** Why the figure is absent. "No active model", "not measured on this test version". */
  readonly reason: string;
  /** `inline` for a table cell or a KPI slot; `block` for a panel that would have held a chart. */
  readonly variant?: 'inline' | 'block';
  readonly className?: string;
}

/**
 * The API said nothing, so this says nothing — clearly. Used for `"source": "unavailable"`,
 * `ai_prediction: null` and any metric the server omitted.
 *
 * It must never be swapped for a `0`. `0.0%` accuracy and "no model has been evaluated" look
 * identical after rounding, and only one of them is a claim about a model (§2.3). A `null`
 * `gradcam_url` does not render this either — it hides the XAI view entirely, because an all-zero
 * attribution still draws a convincing heat-map.
 */
export function Unavailable({
  reason,
  variant = 'inline',
  className,
}: UnavailableProps): ReactElement {
  if (variant === 'inline') {
    return (
      <span
        className={cx('inline-flex items-baseline gap-1.5 text-content-muted', className)}
        title={reason}
      >
        <span aria-hidden="true">–</span>
        <span className="text-xs">{reason}</span>
      </span>
    );
  }
  return (
    <div className={cx(FRAME, 'border-edge bg-surface-inset', className)}>
      <p className="font-medium text-content-primary">Not available</p>
      <p className="max-w-prose text-content-secondary">{reason}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Blocked
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface BlockedProps {
  /** What cannot be done yet — "Model evaluation". */
  readonly title: string;
  /** The dependency, in plain words. Defaults to the §5 wording. */
  readonly reason?: string;
  /** Somewhere to go for the detail; omit it rather than link to a page that does not exist. */
  readonly action?: ReactNode;
  readonly className?: string;
}

/**
 * The response to `501 DATASET_NOT_AVAILABLE`: a capability that is deliberately unimplemented while
 * the dataset-dependent phases are blocked.
 *
 * Distinct from {@link Unavailable} because the remedy is different — one waits on a model run, the
 * other waits on a phase of work. And distinct from a disabled control showing zeroes, which would
 * imply the feature ran and found nothing.
 */
export function Blocked({
  title,
  reason = 'Blocked on dataset inspection — no dataset-dependent code may run until the real files have been inspected.',
  action,
  className,
}: BlockedProps): ReactElement {
  return (
    <div className={cx(FRAME, 'border-status-warn-edge bg-status-warn-soft', className)}>
      <p className="font-medium text-status-warn">{title} — not implemented yet</p>
      <p className="max-w-prose text-content-secondary">{reason}</p>
      {action}
    </div>
  );
}
