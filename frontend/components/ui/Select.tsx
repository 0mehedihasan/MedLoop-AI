'use client';

/**
 * MedLoop AI — `Select`.
 *
 * A native `<select>`. Not a listbox built from `<div>`s: the native control already has keyboard
 * navigation, type-ahead, a mobile picker and correct announcement, and every custom replacement in
 * this space re-implements three of those four and forgets the last one. The trade is that the popup
 * cannot be styled — which costs this app nothing, because the option text is the whole content.
 *
 * ## Enum-backed options
 *
 * Most selects here list an enum: a split, a review status, a device, a promotion metric. Build the
 * options with `optionsFromEnum` so the visible text comes from `humaniseEnum` and a new enum member
 * appears without anyone editing a label map — the same reason `StatusPill` derives its text.
 */

import type { ComponentPropsWithRef, ReactElement } from 'react';

import { CONTROL_BASE, useFieldAria } from './Field';
import { cx } from './cx';
import { humaniseEnum } from '@/lib/format';

export interface SelectOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

/**
 * Turn a const-object enum into options in declaration order.
 *
 * ```ts
 * optionsFromEnum(ImageSplit)                       // every member
 * optionsFromEnum(ImageSplit, [ImageSplit.TEST])    // minus the ones a guard forbids
 * ```
 */
export function optionsFromEnum<T extends string>(
  members: Readonly<Record<string, T>>,
  exclude: readonly T[] = [],
): readonly SelectOption<T>[] {
  return Object.values(members)
    .filter((value) => !exclude.includes(value))
    .map((value) => ({ value, label: humaniseEnum(value) }));
}

export interface SelectProps<T extends string = string>
  extends Omit<ComponentPropsWithRef<'select'>, 'className' | 'value' | 'onChange' | 'children'> {
  readonly options: readonly SelectOption<T>[];
  /** `''` is "nothing chosen", which is a real state for a filter — never a hidden default. */
  readonly value: T | '';
  readonly onValueChange: (value: T | '') => void;
  /** Label for the empty option. Omit it to force a choice; then `''` should never be passed in. */
  readonly placeholder?: string;
  readonly invalid?: boolean;
  readonly className?: string;
}

export function Select<T extends string = string>({
  options,
  value,
  onValueChange,
  placeholder,
  invalid = false,
  className,
  id,
  ...rest
}: SelectProps<T>): ReactElement {
  const field = useFieldAria();
  return (
    <span className="relative block">
      <select
        id={id ?? field.id}
        value={value}
        onChange={(event) => {
          // The DOM only knows strings, so narrowing back to `T` is an assertion by construction:
          // every `<option>` rendered below carries a value from `options`, plus possibly `''`.
          onValueChange(event.currentTarget.value as T | '');
        }}
        aria-describedby={rest['aria-describedby'] ?? field['aria-describedby']}
        aria-invalid={invalid ? true : (rest['aria-invalid'] ?? field['aria-invalid'])}
        required={rest.required ?? field.required}
        className={cx(CONTROL_BASE, 'h-9 cursor-pointer appearance-none pl-2.5 pr-8', className)}
        {...rest}
      >
        {placeholder === undefined ? null : <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {/*
        `appearance-none` removes the platform arrow, which is drawn back here as a real element
        rather than a `background-image` data URL: an inline SVG can use `fill-current` and inherit
        the token colour, whereas a data URL would need a hex literal baked into the class string.
      */}
      <svg
        viewBox="0 0 10 6"
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 h-1.5 w-2.5 -translate-y-1/2 fill-current text-content-muted"
      >
        <path d="M0 0l5 6 5-6z" />
      </svg>
    </span>
  );
}
