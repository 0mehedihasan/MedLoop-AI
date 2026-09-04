/**
 * MedLoop AI — `Alert`.
 *
 * A banner attached to a region: a locked dataset version refusing an edit, a candidate awaiting
 * approval, the global demo-mode notice, the "no trained model" note above a metrics panel.
 *
 * ## `role="alert"` is opt-in
 *
 * `role="alert"` is an *assertive* live region: it interrupts whatever a screen reader is saying. That
 * is right for a message that appears because the user just did something, and wrong for a banner
 * present on first paint — which would talk over the page title. So the default is a plain
 * `<div>` and `live` has to be requested. Field-level messages are not this component's job;
 * `FieldError` in `Field.tsx` already owns those.
 *
 * ## Tone
 *
 * The `Tone` union is imported from `Badge.tsx` rather than redeclared — one tone vocabulary for the
 * whole app. The *class* maps are local and intentionally different: a pill puts its text in the
 * status colour, while a paragraph of body text in `status-danger` is punishing to read, so the body
 * here stays `content-primary` and only the icon and border carry the tone.
 *
 * Every tone also has a distinct glyph and a spoken word, so the meaning survives both colour-vision
 * deficiency and a screen reader (§11.2: status is never colour-only).
 */

import type { ReactElement, ReactNode } from 'react';

import type { Tone } from './Badge';
import { IconButton } from './Button';
import { cx } from './cx';
import { CloseIcon } from './icons';
import { VisuallyHidden } from './project';

const SURFACE: Readonly<Record<Tone, string>> = {
  ok: 'border-status-ok-edge bg-status-ok-soft',
  warn: 'border-status-warn-edge bg-status-warn-soft',
  danger: 'border-status-danger-edge bg-status-danger-soft',
  info: 'border-status-info-edge bg-status-info-soft',
  neutral: 'border-status-neutral-edge bg-status-neutral-soft',
  unknown: 'border-status-unknown-edge bg-status-unknown-soft',
};

const ICON_COLOUR: Readonly<Record<Tone, string>> = {
  ok: 'text-status-ok',
  warn: 'text-status-warn',
  danger: 'text-status-danger',
  info: 'text-status-info',
  neutral: 'text-status-neutral',
  unknown: 'text-status-unknown',
};

/** 16×16 view box. Distinct silhouettes, not one circle recoloured six ways. */
const GLYPH: Readonly<Record<Tone, string>> = {
  ok: 'M6.6 12.2 2.8 8.4l1.3-1.3 2.5 2.5 5.3-5.3 1.3 1.3z',
  warn: 'M8 1 15.5 15H.5z M7.2 6h1.6v4.4H7.2z M7.2 11.4h1.6V13H7.2z',
  danger: 'M8 1 15.5 15H.5z M7.2 6h1.6v4.4H7.2z M7.2 11.4h1.6V13H7.2z',
  info: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.8 3h1.6v1.6H7.2zm0 2.8h1.6V12H7.2z',
  neutral: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-3 6h6v2H5z',
  unknown:
    'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM7.2 11.2h1.6v1.6H7.2zM8 3.6c1.5 0 2.6 1 2.6 2.3 0 1-.6 1.5-1.3 2-.4.3-.5.5-.5 1v.3H7.2v-.5c0-.9.4-1.4 1.1-1.9.5-.4.7-.6.7-1 0-.5-.4-.8-1-.8s-1 .4-1.1 1H5.4c.1-1.4 1.2-2.4 2.6-2.4z',
};

/** Spoken before the title, so the tone is not conveyed by colour and shape alone. */
const SPOKEN_TONE: Readonly<Record<Tone, string>> = {
  ok: 'Success',
  warn: 'Warning',
  danger: 'Error',
  info: 'Note',
  neutral: 'Note',
  unknown: 'Unknown state',
};

export interface AlertProps {
  readonly tone?: Tone;
  /** The one-line summary. Required — an alert with only body text has no shape to scan. */
  readonly title: ReactNode;
  /** Detail, if the title is not the whole message. */
  readonly children?: ReactNode;
  /** Buttons or links under the body. Keep to two. */
  readonly actions?: ReactNode;
  /**
   * Announce assertively. Set it for a message that appears in response to an action; leave it off
   * for a banner that is present when the page loads.
   */
  readonly live?: boolean;
  /** Provide to render the close control. The caller owns the dismissed state. */
  readonly onDismiss?: () => void;
  readonly dismissLabel?: string;
  readonly className?: string;
}

export function Alert({
  tone = 'info',
  title,
  children,
  actions,
  live = false,
  onDismiss,
  dismissLabel = 'Dismiss',
  className,
}: AlertProps): ReactElement {
  return (
    <div
      role={live ? 'alert' : undefined}
      className={cx(
        'flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm',
        SURFACE[tone],
        className,
      )}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className={cx('mt-0.5 h-4 w-4 shrink-0 fill-current', ICON_COLOUR[tone])}
      >
        <path d={GLYPH[tone]} />
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="font-medium text-content-primary">
          <VisuallyHidden>{SPOKEN_TONE[tone]}: </VisuallyHidden>
          {title}
        </p>
        {children === undefined ? null : (
          <div className="max-w-prose text-content-secondary">{children}</div>
        )}
        {actions === undefined ? null : (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">{actions}</div>
        )}
      </div>
      {onDismiss === undefined ? null : (
        <IconButton
          label={dismissLabel}
          size="sm"
          onClick={onDismiss}
          icon={<CloseIcon />}
        />
      )}
    </div>
  );
}
