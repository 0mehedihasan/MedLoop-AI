'use client';

/**
 * MedLoop AI — `Checkbox` and `RadioGroup`.
 *
 * Both wrap **native inputs**. The radio group in particular: `<input type="radio">` elements sharing
 * a `name` give arrow-key navigation, a single tab stop for the group and correct announcement
 * ("2 of 3") for free, and that behaviour is what a `role="radiogroup"` of `<div>`s has to
 * reimplement by hand. `name` is therefore required, not optional.
 *
 * Each control carries **its own label**, so neither belongs inside a `FormField` — that would
 * produce two labels for one control. `RadioGroup` uses `<fieldset>`/`<legend>`, which is the only
 * correct way to give a set of radios one accessible name.
 *
 * The visible box is the native input, restyled with `accent-color` rather than hidden behind a
 * drawn square. A hidden input plus a fake box is where the focus ring, the high-contrast-mode
 * rendering and the indeterminate state all get lost.
 */

import { useId } from 'react';
import type { ComponentPropsWithRef, ReactElement, ReactNode, RefObject } from 'react';

import { FieldError } from './Field';
import { cx } from './cx';
import { SR_ONLY } from './project';

/**
 * `accent-status-info` tints the native box with the app's single accent — `accentColor` in Tailwind
 * reads the same colour scale, so this is still a token and not a literal. No focus class: the ring
 * is the global `:focus-visible` rule in `globals.css`, which is deliberately not per-component.
 */
const NATIVE_CONTROL =
  'mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-status-info disabled:cursor-not-allowed';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Checkbox
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface CheckboxProps
  extends Omit<ComponentPropsWithRef<'input'>, 'className' | 'type' | 'children'> {
  readonly label: ReactNode;
  /** Secondary line under the label — the consequence of ticking it. */
  readonly description?: string;
  /** Table "select all" when only some rows are selected. Not a third value, a display state. */
  readonly indeterminate?: boolean;
  readonly className?: string;
}

export function Checkbox({
  label,
  description,
  indeterminate = false,
  className,
  ref,
  disabled,
  ...rest
}: CheckboxProps): ReactElement {
  const describedBy = useId();
  return (
    <label
      className={cx(
        'flex items-start gap-2 text-sm',
        disabled === true ? 'cursor-not-allowed text-content-muted' : 'cursor-pointer',
        className,
      )}
    >
      <input
        type="checkbox"
        disabled={disabled}
        aria-describedby={description === undefined ? rest['aria-describedby'] : describedBy}
        // `indeterminate` is a DOM property with no attribute, so it can only be set on the node.
        // The caller's own ref is still honoured — dropping it would make focus management
        // impossible from a parent.
        ref={(node) => {
          if (node !== null) node.indeterminate = indeterminate;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref !== null && ref !== undefined) {
            (ref as RefObject<HTMLInputElement | null>).current = node;
          }
        }}
        className={NATIVE_CONTROL}
        {...rest}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-content-primary">{label}</span>
        {description === undefined ? null : (
          <span id={describedBy} className="max-w-prose text-xs text-content-muted">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * RadioGroup
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface RadioOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface RadioGroupProps<T extends string = string> {
  /** The group's accessible name. Rendered as a `<legend>`. */
  readonly legend: string;
  /** Shared `name` for the inputs — this is what makes them one group in the browser. */
  readonly name: string;
  /** `''` means nothing is selected yet, which a required group should reject on submit. */
  readonly value: T | '';
  readonly onValueChange: (value: T) => void;
  readonly options: readonly RadioOption<T>[];
  readonly orientation?: 'vertical' | 'horizontal';
  readonly hint?: string;
  readonly error?: string | null;
  readonly disabled?: boolean;
  readonly legendHidden?: boolean;
  readonly className?: string;
}

export function RadioGroup<T extends string = string>({
  legend,
  name,
  value,
  onValueChange,
  options,
  orientation = 'vertical',
  hint,
  error,
  disabled = false,
  legendHidden = false,
  className,
}: RadioGroupProps<T>): ReactElement {
  const base = useId();
  const hintId = `${base}-hint`;
  const errorId = `${base}-error`;
  const hasHint = hint !== undefined && hint !== '';
  const hasError = error !== undefined && error !== null && error !== '';
  const describedBy = [hasError ? errorId : null, hasHint ? hintId : null]
    .filter((entry): entry is string => entry !== null)
    .join(' ');

  return (
    <fieldset
      className={cx('flex flex-col gap-2', className)}
      disabled={disabled}
      aria-describedby={describedBy === '' ? undefined : describedBy}
      aria-invalid={hasError ? true : undefined}
    >
      <legend
        className={
          legendHidden ? SR_ONLY : 'mb-1 text-xs font-medium text-content-secondary'
        }
      >
        {legend}
      </legend>
      <div
        className={cx(
          'flex gap-x-5 gap-y-2',
          orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap',
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cx(
              'flex items-start gap-2 text-sm',
              option.disabled === true || disabled
                ? 'cursor-not-allowed text-content-muted'
                : 'cursor-pointer',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onValueChange(option.value)}
              className={NATIVE_CONTROL}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-content-primary">{option.label}</span>
              {option.description === undefined ? null : (
                <span className="max-w-prose text-xs text-content-muted">{option.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {hasHint ? (
        <p id={hintId} className="max-w-prose text-xs text-content-muted">
          {hint}
        </p>
      ) : null}
      {hasError ? <FieldError id={errorId}>{error}</FieldError> : null}
    </fieldset>
  );
}
