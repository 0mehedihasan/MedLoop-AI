'use client';

/**
 * MedLoop AI — text entry: `Input`, `NumberInput`, `Textarea`.
 *
 * All three read the surrounding {@link FormField} through `useFieldAria`, so `id`,
 * `aria-describedby`, `aria-invalid` and `required` arrive without the call site repeating them. An
 * explicit `id` still wins, for the rare control whose id is fixed by something else.
 *
 * ## `NumberInput` and the empty-string problem
 *
 * `<input type="number">` reports `''` for both "the field is empty" and "the text is not a number"
 * (`'1e'`, `'--'`). Feeding that straight into a numeric state gives `NaN`, and `NaN` sent to the API
 * as a threshold is exactly the class of bug §8 exists to prevent. So `NumberInput` exposes
 * `onValueChange(value: number | null)` — `null` means "no usable number right now" — and keeps the
 * raw text in the DOM where the browser can go on validating it.
 *
 * Bounds are `min`/`max` attributes *and* nothing else: the server validates authoritatively
 * (CLAUDE.md §8.1), so this must not clamp, round or silently rewrite what was typed.
 */

import type { ComponentPropsWithRef, ReactElement } from 'react';

import { CONTROL_BASE, useFieldAria } from './Field';
import { cx } from './cx';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Input
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface InputProps extends Omit<ComponentPropsWithRef<'input'>, 'className'> {
  /** Forces the error styling when the invalid state is not owned by a `FormField`. */
  readonly invalid?: boolean;
  /** A short unit or code shown inside the control's trailing edge — "px", "%", "samples". */
  readonly suffix?: string;
  readonly className?: string;
}

export function Input({
  invalid = false,
  suffix,
  className,
  id,
  type = 'text',
  ...rest
}: InputProps): ReactElement {
  const field = useFieldAria();
  const input = (
    <input
      id={id ?? field.id}
      type={type}
      aria-describedby={rest['aria-describedby'] ?? field['aria-describedby']}
      aria-invalid={invalid ? true : (rest['aria-invalid'] ?? field['aria-invalid'])}
      required={rest.required ?? field.required}
      className={cx(CONTROL_BASE, 'h-9 px-2.5', suffix === undefined ? '' : 'pr-12', className)}
      {...rest}
    />
  );
  if (suffix === undefined) return input;
  return (
    <span className="relative block">
      {input}
      {/* Decorative: the unit is also in the field's label or hint, which is what gets announced. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-content-muted"
      >
        {suffix}
      </span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * NumberInput
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface NumberInputProps
  extends Omit<ComponentPropsWithRef<'input'>, 'className' | 'type' | 'value' | 'onChange'> {
  /** `null` renders an empty field — "not set", which is not the same as `0`. */
  readonly value: number | null;
  /** `null` when the field is empty or the text is not yet a number. */
  readonly onValueChange: (value: number | null) => void;
  readonly invalid?: boolean;
  readonly suffix?: string;
  readonly className?: string;
}

export function NumberInput({
  value,
  onValueChange,
  invalid = false,
  suffix,
  className,
  id,
  step = 1,
  ...rest
}: NumberInputProps): ReactElement {
  const field = useFieldAria();
  const input = (
    <input
      id={id ?? field.id}
      type="number"
      inputMode="decimal"
      step={step}
      value={value === null ? '' : String(value)}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        if (raw === '') {
          onValueChange(null);
          return;
        }
        const parsed = Number(raw);
        onValueChange(Number.isFinite(parsed) ? parsed : null);
      }}
      aria-describedby={rest['aria-describedby'] ?? field['aria-describedby']}
      aria-invalid={invalid ? true : (rest['aria-invalid'] ?? field['aria-invalid'])}
      required={rest.required ?? field.required}
      className={cx(
        CONTROL_BASE,
        'h-9 px-2.5 [font-variant-numeric:tabular-nums]',
        suffix === undefined ? '' : 'pr-12',
        className,
      )}
      {...rest}
    />
  );
  if (suffix === undefined) return input;
  return (
    <span className="relative block">
      {input}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-content-muted"
      >
        {suffix}
      </span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Textarea
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface TextareaProps extends Omit<ComponentPropsWithRef<'textarea'>, 'className'> {
  readonly invalid?: boolean;
  readonly className?: string;
}

/**
 * Used for the skip note and the reason attached to a settings change or a model rejection — text
 * that lands in an audit row, so it is never truncated or trimmed here.
 */
export function Textarea({
  invalid = false,
  className,
  id,
  rows = 3,
  ...rest
}: TextareaProps): ReactElement {
  const field = useFieldAria();
  return (
    <textarea
      id={id ?? field.id}
      rows={rows}
      aria-describedby={rest['aria-describedby'] ?? field['aria-describedby']}
      aria-invalid={invalid ? true : (rest['aria-invalid'] ?? field['aria-invalid'])}
      required={rest.required ?? field.required}
      className={cx(CONTROL_BASE, 'resize-y px-2.5 py-2 leading-relaxed', className)}
      {...rest}
    />
  );
}
