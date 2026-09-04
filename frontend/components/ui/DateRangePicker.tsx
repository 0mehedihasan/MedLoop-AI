'use client';

/**
 * MedLoop AI — `DateRangePicker`.
 *
 * The filter behind `getDataStatistics`, `getAnnotationStatistics`, `listLogs` and `listImages` —
 * every query type in `types/api.ts` that extends `DateRangeQuery`.
 *
 * ## The arithmetic is not in here
 *
 * `lib/date-range.ts` owns every date decision: what "last 7 days" resolves to, whether a range is
 * complete, whether it is inverted, how one day is worded. This file is the control surface for
 * those functions and holds no calendar maths of its own, so the rules stay testable without a DOM
 * and cannot drift between this picker and a page that filters without one.
 *
 * ## Two native controls, not a calendar widget
 *
 * A `<select>` for the preset and an `<input type="date">` per bound, for the reason `Select.tsx`
 * gives at greater length: the platform controls already have keyboard navigation, a locale-aware
 * display format and correct announcement, and a hand-built calendar grid re-implements three of
 * those four and forgets the last. The cost — an unstylable popup — buys nothing here.
 *
 * ## An inverted range is reported, never repaired
 *
 * `from` after `to` puts a message under the field. It is not swapped, and the two inputs
 * deliberately do not constrain each other's `min`/`max`: cross-constraining makes one editing
 * order impossible and greys out days for reasons the user cannot see, whereas the message says
 * exactly what is wrong. Both inputs *are* capped at today, because a filter over the future
 * selects nothing.
 */

import type { ReactElement } from 'react';

import { cx } from './cx';
import { FormField } from './Field';
import { Input } from './Input';
import { Select } from './Select';
import type { SelectOption } from './Select';
import { describeRange, isInvertedRange, resolvePreset } from '@/lib/date-range';
import type { DateRange } from '@/lib/date-range';
import { toDateInput } from '@/lib/format';
import { DateRangePreset } from '@/types/api';

/**
 * Written out rather than built with `optionsFromEnum`, which is the exception to that helper's
 * rule. `humaniseEnum('last_7d')` yields "Last 7d" — a token, not a phrase a person reads in a
 * filter bar. Typing the map as a total `Record` keeps it honest: a new preset that nobody labels
 * is a compile error, not a blank option.
 */
const PRESET_LABEL: Readonly<Record<DateRangePreset, string>> = {
  all_time: 'All time',
  today: 'Today',
  yesterday: 'Yesterday',
  last_7d: 'Last 7 days',
  last_30d: 'Last 30 days',
  custom: 'Custom range',
};

/** Declaration order, so `ALL_TIME` — the no-constraint default — is first in the list. */
const PRESET_OPTIONS: readonly SelectOption<DateRangePreset>[] = Object.values(DateRangePreset).map(
  (value) => ({ value, label: PRESET_LABEL[value] }),
);

export interface DateRangePickerProps {
  readonly value: DateRange;
  /** Called with a whole new range. The caller holds the state and decides when to refetch. */
  readonly onChange: (range: DateRange) => void;
  /** Accessible name for the preset control. */
  readonly label?: string;
  readonly labelHidden?: boolean;
  /**
   * Latest selectable day as `YYYY-MM-DD`. Defaults to today, resolved at render — pass it
   * explicitly on a server-rendered page whose render could straddle local midnight.
   */
  readonly max?: string;
  readonly className?: string;
}

export function DateRangePicker({
  value,
  onChange,
  label = 'Date range',
  labelHidden = false,
  max,
  className,
}: DateRangePickerProps): ReactElement {
  const latest = max ?? toDateInput(new Date());
  const custom = value.preset === DateRangePreset.CUSTOM;
  const inverted = isInvertedRange(value);

  function choosePreset(next: DateRangePreset | ''): void {
    // `Select` types an empty option because most selects have one. This one does not: `ALL_TIME`
    // is the nameable "no constraint" choice, so there is nothing left for `''` to mean.
    if (next === '') return;
    if (next === DateRangePreset.CUSTOM) {
      // The dates already on screen carry over. Choosing "Custom range" is a request to edit the
      // window the user is looking at, not to clear the filter and start again.
      onChange({ preset: next, from: value.from, to: value.to });
      return;
    }
    onChange(resolvePreset(next));
  }

  function setBound(bound: 'from' | 'to', raw: string): void {
    // `<input type="date">` reports `''` for both "cleared" and "half-typed". Normalising to
    // `undefined` keeps one representation of absence — the one `toDateRangeQuery` omits.
    const next = raw === '' ? undefined : raw;
    onChange(
      bound === 'from'
        ? { preset: DateRangePreset.CUSTOM, from: next, to: value.to }
        : { preset: DateRangePreset.CUSTOM, from: value.from, to: next },
    );
  }

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <div className="flex flex-wrap items-start gap-3">
        <FormField label={label} labelHidden={labelHidden} className="w-44">
          <Select options={PRESET_OPTIONS} value={value.preset} onValueChange={choosePreset} />
        </FormField>
        {custom ? (
          <>
            <FormField label="From" className="w-44">
              <Input
                type="date"
                value={value.from ?? ''}
                max={latest}
                onChange={(event) => setBound('from', event.currentTarget.value)}
              />
            </FormField>
            <FormField
              label="To"
              className="w-44"
              error={inverted ? 'The end date is before the start date.' : null}
            >
              <Input
                type="date"
                value={value.to ?? ''}
                max={latest}
                onChange={(event) => setBound('to', event.currentTarget.value)}
              />
            </FormField>
          </>
        ) : null}
      </div>
      {/*
        Always mounted, never conditional. A live region created in the same commit as its content
        is not announced by most screen readers — the element has to exist before the text changes.
        This is the only place the resolved span is spoken: the select says "Last 7 days", and this
        says which seven days those are.
      */}
      <p aria-live="polite" className="text-xs text-content-muted">
        {describeRange(value)}
      </p>
    </div>
  );
}
