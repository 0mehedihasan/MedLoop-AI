/**
 * MedLoop AI — Actions: `Button`, `IconButton`, `LinkButton`.
 *
 * One file because all three share the variant and size tables, and a second copy of those tables
 * is how a "secondary" button ends up meaning two different things on two screens.
 *
 * ## Real elements, always
 *
 * `Button` is a `<button>`; `LinkButton` is a Next `<Link>`. Nothing here is a clickable `<div>` —
 * that is enforced by `jsx-a11y/no-static-element-interactions` as an *error*, and the reason is
 * behavioural, not stylistic: only the real elements get Enter/Space handling, focus order and the
 * right role for free.
 *
 * ## Refs
 *
 * React 19 passes `ref` to function components as an ordinary prop, so these extend
 * `ComponentPropsWithRef` instead of wrapping in `forwardRef`. The skill's requirement ("forwardRef
 * where a ref is plausible") is about the *capability*, and this is the current way to provide it.
 *
 * ## Busy
 *
 * `busy` keeps the button mounted, disables it, and swaps the leading slot for a `Spinner`. It does
 * not replace the label: a button whose text disappears mid-click moves the cursor target and loses
 * the screen-reader context. `aria-busy` carries the state.
 */

import Link from 'next/link';
import type { ComponentPropsWithRef, ReactElement, ReactNode } from 'react';

import { cx } from './cx';
import { Spinner } from './Spinner';

/**
 * `primary` is the single strong action on a screen. `danger` is for the irreversible ones —
 * archiving, rejecting a candidate, locking a test set — and is the only place the danger token
 * appears on a control.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Shared by all three components; every property a variant map governs is listed exactly once. */
const BASE =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded border ' +
  'font-medium transition duration-fast ' +
  'disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed';

const VARIANT: Readonly<Record<ButtonVariant, string>> = {
  primary:
    'border-status-info bg-status-info text-content-inverse hover:border-status-info-strong hover:bg-status-info-strong active:bg-status-info-strong',
  secondary:
    'border-edge bg-surface-panel text-content-primary hover:bg-surface-inset active:bg-surface-inset',
  subtle:
    'border-transparent bg-transparent text-content-secondary hover:bg-surface-inset hover:text-content-primary',
  danger:
    'border-status-danger bg-status-danger text-content-inverse hover:border-status-danger-strong hover:bg-status-danger-strong active:bg-status-danger-strong',
};

const SIZE: Readonly<Record<ButtonSize, string>> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-11 px-4 text-sm',
};

/** Square, so an icon sits on the optical centre rather than in a text box. */
const ICON_SIZE: Readonly<Record<ButtonSize, string>> = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
};

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Button
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface ButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'className'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Request in flight. Disables the control and shows a spinner without unmounting the label. */
  readonly busy?: boolean;
  /** Announced while `busy`. Defaults to a generic phrase; prefer something specific. */
  readonly busyLabel?: string;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly fullWidth?: boolean;
  readonly className?: string;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  busyLabel = 'Working',
  leading,
  trailing,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      // Explicit `type`: a bare <button> inside a form defaults to `submit`, which has caused a
      // "Cancel" control to save a settings form more than once in more than one codebase.
      type={type}
      disabled={disabled === true || busy}
      aria-busy={busy || undefined}
      className={cx(BASE, VARIANT[variant], SIZE[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {busy ? <Spinner label={busyLabel} size="sm" /> : leading}
      {children}
      {busy ? null : trailing}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * IconButton
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'className'> {
  /** Mandatory, and not optional-with-a-default: an unlabelled icon control is unusable. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly className?: string;
}

/**
 * `label` becomes `aria-label` **and** the `title`, so the affordance is discoverable by hover as
 * well as by screen reader. Toolbar buttons in the annotation canvas are the main consumer, and
 * every one of them also has a keyboard shortcut declared in `shortcuts.ts` — the icon is never the
 * only route to the action.
 */
export function IconButton({
  label,
  icon,
  variant = 'subtle',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: IconButtonProps): ReactElement {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(BASE, VARIANT[variant], ICON_SIZE[size], 'p-0', className)}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * LinkButton
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface LinkButtonProps extends Omit<ComponentPropsWithRef<typeof Link>, 'className'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly fullWidth?: boolean;
  readonly className?: string;
}

/**
 * Navigation that *looks* like a button. It stays an `<a>` because it changes the URL: middle-click,
 * ⌘-click and "copy link" all have to keep working, and a `<button>` with `router.push` breaks all
 * three silently.
 *
 * `href` comes from `ROUTES` in `lib/navigation.ts`. A literal path at a call site is a defect.
 */
export function LinkButton({
  variant = 'secondary',
  size = 'md',
  leading,
  trailing,
  fullWidth = false,
  className,
  children,
  ...rest
}: LinkButtonProps): ReactElement {
  return (
    <Link
      className={cx(BASE, VARIANT[variant], SIZE[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {leading}
      {children}
      {trailing}
    </Link>
  );
}
