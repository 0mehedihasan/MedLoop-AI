'use client';

/**
 * MedLoop AI — Form scaffolding: `Label`, `FieldError`, `FormField`, and the context the controls
 * read to wire themselves up.
 *
 * ## Why a context and not props
 *
 * Every accessible control needs the same four things agreed with its label and its messages: an
 * `id`, an `aria-describedby` listing the hint and the error, `aria-invalid` when it is wrong, and
 * `required`. Passing those by hand at each call site is where accessibility quietly rots — one
 * screen forgets `aria-describedby` and the error is on screen but never announced.
 *
 * So {@link FormField} owns the ids and publishes them; `Input`, `NumberInput`, `Textarea`, `Select`
 * and the choice controls pick them up through {@link useFieldAria}. A control used *outside* a
 * `FormField` still works — it falls back to its own generated id — because the annotation toolbar
 * and the canvas inspector both have controls whose label is a tooltip, not a `<label>`.
 *
 * ## What this does not do
 *
 * No validation. Server-side validation is authoritative (CLAUDE.md §8.1) and the `error` string
 * here is display only — normally the `message` from a `VALIDATION_ERROR` envelope. A field that
 * turns red on its own while the server would have accepted the value teaches people to distrust
 * the form.
 */

import { createContext, useContext, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { cx } from './cx';
import { SR_ONLY, VisuallyHidden } from './project';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Context
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** Exactly the attributes a control has to spread onto its element. */
export interface FieldAria {
  readonly id: string;
  readonly 'aria-describedby': string | undefined;
  readonly 'aria-invalid': true | undefined;
  readonly required: boolean;
}

const FieldContext = createContext<FieldAria | null>(null);

/**
 * The look of a text-entry control, written once for `Input`, `NumberInput`, `Textarea` and
 * `Select`. Only colour, border and state live here; each control adds its own height or padding,
 * so no two variant maps ever fight over the same property.
 *
 * `aria-[invalid=true]` drives the red border, which means the visual error state cannot be set
 * without also setting the attribute a screen reader needs. Tailwind 3.4 supports the arbitrary
 * aria variant, so this needs no plugin.
 */
export const CONTROL_BASE =
  'w-full rounded border border-edge bg-surface-panel text-sm text-content-primary ' +
  'placeholder:text-content-muted transition duration-fast ' +
  'hover:border-edge-strong ' +
  'disabled:cursor-not-allowed disabled:border-edge-subtle disabled:bg-surface-inset disabled:text-content-muted ' +
  'aria-[invalid=true]:border-status-danger';

/**
 * Read the surrounding {@link FormField}, or synthesise a standalone identity. `useId` is called
 * unconditionally — hooks cannot be skipped — so the generated value is simply unused inside a
 * `FormField`.
 */
export function useFieldAria(): FieldAria {
  const generated = useId();
  const provided = useContext(FieldContext);
  return (
    provided ?? {
      id: generated,
      'aria-describedby': undefined,
      'aria-invalid': undefined,
      required: false,
    }
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Label
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface LabelProps {
  /** The control's `id`. Required: a label with no target is a paragraph. */
  readonly htmlFor: string;
  readonly children: ReactNode;
  readonly required?: boolean;
  /** Keep the label in the accessibility tree but off screen, for a visually obvious control. */
  readonly hidden?: boolean;
  readonly className?: string;
}

/**
 * A real `<label htmlFor>`, always. The asterisk is `aria-hidden` and paired with a spoken
 * "(required)" — a glyph a screen reader reads as "star" is not a state.
 */
export function Label({
  htmlFor,
  children,
  required = false,
  hidden = false,
  className,
}: LabelProps): ReactElement {
  return (
    <label
      htmlFor={htmlFor}
      className={cx(
        hidden ? SR_ONLY : 'flex items-center gap-1 text-xs font-medium text-content-secondary',
        className,
      )}
    >
      {children}
      {required ? (
        <>
          <span aria-hidden="true" className="text-status-danger">
            *
          </span>
          <VisuallyHidden>(required)</VisuallyHidden>
        </>
      ) : null}
    </label>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * FieldError
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface FieldErrorProps {
  /** Must match the id in the control's `aria-describedby`; {@link FormField} handles that. */
  readonly id?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * `role="alert"` so a message that appears after a failed submit is announced without the user
 * having to go looking for it. The glyph keeps it from being colour-only.
 */
export function FieldError({ id, children, className }: FieldErrorProps): ReactElement {
  return (
    <p
      id={id}
      role="alert"
      className={cx('flex items-start gap-1.5 text-xs text-status-danger', className)}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 fill-current">
        <path d="M6 0 12 11H0z M5.4 4h1.2v4H5.4z M5.4 8.8h1.2V10H5.4z" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * FormField
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface FormFieldProps {
  readonly label: string;
  /** One control. Anything that calls {@link useFieldAria} is wired automatically. */
  readonly children: ReactNode;
  /** Static help — units, the effect of the setting, the accepted range. */
  readonly hint?: string;
  /** Server-supplied message. `null` and `''` both mean "no error". */
  readonly error?: string | null;
  readonly required?: boolean;
  /** Use when the control's `id` is fixed elsewhere; otherwise the id is generated here. */
  readonly htmlFor?: string;
  readonly labelHidden?: boolean;
  readonly className?: string;
}

/**
 * Label, control, hint and error as one unit.
 *
 * The error id comes **first** in `aria-describedby`: when something is wrong, that is the sentence
 * that needs to be heard first, and the hint is context afterwards.
 */
export function FormField({
  label,
  children,
  hint,
  error,
  required = false,
  htmlFor,
  labelHidden = false,
  className,
}: FormFieldProps): ReactElement {
  const generated = useId();
  const id = htmlFor ?? generated;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasError = error !== undefined && error !== null && error !== '';
  const hasHint = hint !== undefined && hint !== '';

  const describedBy = [hasError ? errorId : null, hasHint ? hintId : null]
    .filter((value): value is string => value !== null)
    .join(' ');

  const aria: FieldAria = {
    id,
    'aria-describedby': describedBy === '' ? undefined : describedBy,
    'aria-invalid': hasError ? true : undefined,
    required,
  };

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} required={required} hidden={labelHidden}>
        {label}
      </Label>
      <FieldContext.Provider value={aria}>{children}</FieldContext.Provider>
      {hasHint ? (
        <p id={hintId} className="max-w-prose text-xs text-content-muted">
          {hint}
        </p>
      ) : null}
      {hasError ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
