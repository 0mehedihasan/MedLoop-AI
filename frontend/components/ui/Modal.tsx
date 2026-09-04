'use client';

/**
 * MedLoop AI — `Modal`, `Drawer` and `ConfirmDialog`, all on one `<dialog>`.
 *
 * ## Why the native element
 *
 * `dialog.showModal()` puts the element in the browser's **top layer** and gives, for free and
 * correctly: a focus trap, `inert` on everything behind it, Escape as a close request, and a paint
 * order that no `z-index` can lose to. That last point is not theoretical here — the annotation
 * canvas owns a six-step stacking scale (`tailwind.config.ts`), and a hand-rolled overlay is exactly
 * the thing that ends up *underneath* a Grad-CAM layer on one screen and above it on another.
 *
 * This is the same argument `Button.tsx` makes for using a real `<button>`: the platform element
 * already implements the behaviour, and a re-implementation is a re-implementation of the bugs.
 *
 * ## Controlled, with `cancel` always prevented
 *
 * React owns `open`. The `cancel` event — Escape, or a platform close gesture — is **always**
 * `preventDefault()`ed, and then `onDismiss` is called so the *caller* sets `open` to false and an
 * effect performs the actual `close()`. Without that, the browser would close the dialog behind
 * React's back and the next render would disagree with the DOM. It also means a non-dismissible
 * dialog (`dismissible={false}`, for a write already in flight) simply ignores Escape.
 *
 * There is deliberately no click-outside-to-close. For a confirmation it would be wrong — a stray
 * click must not dismiss a decision — and for the rest, Escape and a visible close control are the
 * two paths that are actually announced to a keyboard or screen-reader user.
 *
 * ## Two things the top layer does not do
 *
 * It does not stop the page behind from scrolling, so `overflow: hidden` is applied to `<body>` for
 * as long as a dialog is open and the previous value is restored afterwards.
 *
 * It does not know which control should receive focus. The browser focuses the first focusable
 * descendant, which in a header-first layout is the close button — and in a destructive
 * confirmation would be whichever button happens to come first. `initialFocus` makes that explicit,
 * and `ConfirmDialog` points it at **Cancel**: the safe option is the one the keyboard lands on.
 *
 * ## One trap worth naming
 *
 * Never put a `display` utility on the `<dialog>` itself. The UA rule `dialog:not([open])` sets
 * `display: none`, and an author declaration beats the UA sheet regardless of specificity — so
 * `class="flex"` on a dialog leaves it *visible while closed*. Layout goes on an inner element.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactElement, ReactNode, RefObject, SyntheticEvent } from 'react';

import { Button, IconButton } from './Button';
import { cx } from './cx';
import { FormField } from './Field';
import { CloseIcon } from './icons';
import { Input } from './Input';

/** Repeated on the dialog and on its inner flex column, because the cap cannot be inherited. */
const SHELL_HEIGHT = 'max-h-[calc(100dvh-4rem)]';

const SURFACE =
  'border border-edge bg-surface-raised text-content-primary shadow-panel ' +
  // The UA caps a modal dialog's box; these release it so the width utilities below decide.
  'max-w-none p-0';

export type ModalSize = 'sm' | 'md' | 'lg';

const MODAL_WIDTH: Readonly<Record<ModalSize, string>> = {
  sm: 'w-[min(24rem,calc(100vw-2rem))]',
  md: 'w-[min(34rem,calc(100vw-2rem))]',
  lg: 'w-[min(52rem,calc(100vw-2rem))]',
};

const DRAWER_WIDTH: Readonly<Record<ModalSize, string>> = {
  sm: 'w-[min(20rem,calc(100vw-2rem))]',
  md: 'w-[min(28rem,calc(100vw-2rem))]',
  lg: 'w-[min(44rem,calc(100vw-2rem))]',
};

const HEADER = 'flex items-start justify-between gap-4 border-b border-edge-subtle px-4 py-3';
const BODY = 'min-h-0 flex-1 overflow-y-auto px-4 py-4';
const FOOTER =
  'flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle bg-surface-inset px-4 py-3';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The shared dialog mechanics
 * ──────────────────────────────────────────────────────────────────────────────────────── */

interface DialogMechanics {
  readonly ref: RefObject<HTMLDialogElement | null>;
  readonly onCancel: (event: SyntheticEvent<HTMLDialogElement>) => void;
}

function useDialogMechanics(
  open: boolean,
  dismissible: boolean,
  onDismiss: () => void,
  initialFocus: RefObject<HTMLElement | null> | undefined,
): DialogMechanics {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    if (open) {
      // `showModal()` throws if the dialog is already open, and React may re-run this effect for a
      // reason other than `open` flipping.
      if (!node.open) node.showModal();
      // After `showModal()`, never before: until then the element is `display: none` and focusing
      // anything inside it is a no-op that fails silently.
      initialFocus?.current?.focus();
    } else if (node.open) {
      node.close();
    }
  }, [open, initialFocus]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const onCancel = useCallback(
    (event: SyntheticEvent<HTMLDialogElement>): void => {
      // Always prevented — see the header note. The caller decides whether this becomes a close.
      event.preventDefault();
      if (dismissible) onDismiss();
    },
    [dismissible, onDismiss],
  );

  return { ref, onCancel };
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Modal
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface ModalProps {
  readonly open: boolean;
  /** Escape or the close control. The caller sets `open` to false; nothing closes itself. */
  readonly onDismiss: () => void;
  /** Becomes the dialog's accessible name. A heading, not a sentence. */
  readonly title: ReactNode;
  /** One line under the title, wired as the accessible description. */
  readonly description?: ReactNode;
  readonly children: ReactNode;
  /** Buttons, right-aligned. Put the safe action first so it is also first in the tab order. */
  readonly footer?: ReactNode;
  readonly size?: ModalSize;
  /**
   * `false` while a write is in flight: Escape is swallowed and the close control is not rendered,
   * so the user cannot walk away from a request whose outcome they still need to see.
   */
  readonly dismissible?: boolean;
  /** Focused once the dialog opens. Point it at the least destructive control. */
  readonly initialFocus?: RefObject<HTMLElement | null>;
  readonly closeLabel?: string;
  readonly className?: string;
}

export function Modal({
  open,
  onDismiss,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  initialFocus,
  closeLabel = 'Close',
  className,
}: ModalProps): ReactElement {
  const base = useId();
  const titleId = `${base}-title`;
  const descriptionId = `${base}-description`;
  const { ref, onCancel } = useDialogMechanics(open, dismissible, onDismiss, initialFocus);

  return (
    <dialog
      ref={ref}
      // No `role` and no `aria-modal`: `showModal()` already gives the element the dialog role and
      // modal semantics. Restating them by hand is how one of the two ends up wrong.
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      onCancel={onCancel}
      className={cx(SURFACE, SHELL_HEIGHT, MODAL_WIDTH[size], 'rounded-lg', className)}
    >
      <div className={cx('flex flex-col', SHELL_HEIGHT)}>
        <header className={HEADER}>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className="text-sm font-semibold">
              {title}
            </h2>
            {description === undefined ? null : (
              <p id={descriptionId} className="max-w-prose text-xs text-content-secondary">
                {description}
              </p>
            )}
          </div>
          {dismissible ? (
            <IconButton label={closeLabel} size="sm" onClick={onDismiss} icon={<CloseIcon />} />
          ) : null}
        </header>
        <div className={BODY}>{children}</div>
        {footer === undefined ? null : <footer className={FOOTER}>{footer}</footer>}
      </div>
    </dialog>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Drawer
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface DrawerProps extends Omit<ModalProps, 'size'> {
  readonly size?: ModalSize;
}

/**
 * The same dialog, pinned to the right edge and full height. For the image inspector and anything
 * else that is *alongside* the page rather than *instead of* it.
 *
 * The UA gives a modal dialog `inset: 0; margin: auto`, which centres it. `ml-auto mr-0 my-0` turns
 * that into a right-hand pin, and `max-h-none` releases the UA height cap so the panel can be the
 * full viewport. It is still a modal — the page behind is inert — because a half-modal drawer that
 * traps focus sometimes is worse than one that always does.
 */
export function Drawer({
  open,
  onDismiss,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  initialFocus,
  closeLabel = 'Close',
  className,
}: DrawerProps): ReactElement {
  const base = useId();
  const titleId = `${base}-title`;
  const descriptionId = `${base}-description`;
  const { ref, onCancel } = useDialogMechanics(open, dismissible, onDismiss, initialFocus);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      onCancel={onCancel}
      className={cx(
        SURFACE,
        DRAWER_WIDTH[size],
        'my-0 ml-auto mr-0 h-[100dvh] max-h-none rounded-none border-y-0 border-r-0',
        className,
      )}
    >
      <div className="flex h-[100dvh] flex-col">
        <header className={HEADER}>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className="text-sm font-semibold">
              {title}
            </h2>
            {description === undefined ? null : (
              <p id={descriptionId} className="max-w-prose text-xs text-content-secondary">
                {description}
              </p>
            )}
          </div>
          {dismissible ? (
            <IconButton label={closeLabel} size="sm" onClick={onDismiss} icon={<CloseIcon />} />
          ) : null}
        </header>
        <div className={BODY}>{children}</div>
        {footer === undefined ? null : <footer className={FOOTER}>{footer}</footer>}
      </div>
    </dialog>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * ConfirmDialog
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: ReactNode;
  /**
   * What the action will do, and — for anything in §2.5 or §7 territory — whether it can be undone.
   * "Archives 412 images. Nothing is deleted; they can be restored from the dataset version."
   */
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** `danger` for anything irreversible: locking a version, rejecting a candidate, archiving. */
  readonly tone?: 'primary' | 'danger';
  /**
   * Exact text the user must type before the action unlocks. Reserve it for the decisions a hard
   * rule protects — locking a test set (§2.5) is the archetype — and pass something they can read
   * off the screen, such as the dataset version name.
   */
  readonly confirmPhrase?: string;
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * A decision, with the consequence stated before the button that causes it.
 *
 * Focus lands on **Cancel**, which is also first in the DOM and first in the tab order. A dialog
 * that opens with a destructive action pre-focused turns a reflexive Enter into a data change.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  confirmPhrase,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactElement {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [typed, setTyped] = useState('');

  // Cleared on every open *and* close: a phrase left in the box from the previous confirmation
  // would unlock the next one before the user had read it.
  useEffect(() => {
    setTyped('');
  }, [open]);

  const locked = confirmPhrase !== undefined && typed.trim() !== confirmPhrase;

  return (
    <Modal
      open={open}
      onDismiss={onCancel}
      title={title}
      size="sm"
      // A confirmation with a request in flight is not dismissible: the result is the point.
      dismissible={!busy}
      initialFocus={cancelRef}
      footer={
        <>
          {/* Cancel first, so the safe control is also the first tab stop. */}
          <Button ref={cancelRef} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={locked}
            busy={busy}
            busyLabel={confirmLabel}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-content-secondary">
        <div className="max-w-prose">{children}</div>
        {confirmPhrase === undefined ? null : (
          <FormField
            label={`Type ${confirmPhrase} to confirm`}
            hint="The action stays disabled until this matches exactly."
          >
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </FormField>
        )}
      </div>
    </Modal>
  );
}
