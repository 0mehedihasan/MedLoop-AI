/**
 * MedLoop AI — date-range resolution.
 *
 * Pure functions, no React. A preset is turned into an inclusive `from`/`to` pair here so that a
 * page can ask for "the last 7 days" without rendering a picker, and so the arithmetic is testable
 * without a DOM.
 *
 * ## The server only ever sees two dates
 *
 * `types/api.ts` states it: presets are resolved client-side, and the API receives `YYYY-MM-DD`
 * strings. That keeps timezone reasoning in exactly one place — this file — instead of spreading a
 * second opinion about "today" into the backend.
 *
 * ## Local calendar days, never UTC
 *
 * `toDateInput` (in `lib/format.ts`) reads `getFullYear/getMonth/getDate`, which are local. This is
 * not a stylistic preference. `toISOString().slice(0, 10)` is the obvious-looking alternative and it
 * is wrong east of Greenwich: at 02:00 in Dhaka (UTC+06:00) it returns *yesterday*, so a "Today"
 * filter would silently exclude everything the annotator had done that morning.
 *
 * ## Both ends are inclusive
 *
 * `LAST_7D` is today and the six days before it — seven days of data, not eight. The off-by-one is
 * the whole reason this is a named function rather than a subtraction at each call site.
 */

import { toDateInput } from './format';
import { DateRangePreset } from '@/types/api';
import type { DateRangeQuery } from '@/types/api';

export interface DateRange {
  readonly preset: DateRangePreset;
  /** Inclusive `YYYY-MM-DD`. Both absent for {@link DateRangePreset.ALL_TIME}. */
  readonly from?: string;
  readonly to?: string;
}

/** The default for every filter: no constraint, so nothing is hidden before the user asks. */
export const ALL_TIME: DateRange = { preset: DateRangePreset.ALL_TIME };

/** Copies then shifts, because `setDate` mutates and a shared `today` would drift under it. */
function shiftDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Resolve a preset against a reference day.
 *
 * `today` is injectable for the same reason `formatRelative` takes a `now`: a test that cannot fix
 * the clock tests nothing, and a server-rendered default has to be recomputable on the client.
 *
 * `CUSTOM` resolves to itself with no dates — it means "the user is choosing", and inventing a range
 * for it would put a filter on screen that nobody selected.
 */
export function resolvePreset(preset: DateRangePreset, today: Date = new Date()): DateRange {
  const day = toDateInput(today);
  switch (preset) {
    case DateRangePreset.TODAY:
      return { preset, from: day, to: day };
    case DateRangePreset.YESTERDAY: {
      const yesterday = toDateInput(shiftDays(today, -1));
      return { preset, from: yesterday, to: yesterday };
    }
    case DateRangePreset.LAST_7D:
      // −6, not −7: `to` is inclusive, so today counts as one of the seven.
      return { preset, from: toDateInput(shiftDays(today, -6)), to: day };
    case DateRangePreset.LAST_30D:
      return { preset, from: toDateInput(shiftDays(today, -29)), to: day };
    case DateRangePreset.CUSTOM:
      return { preset };
    case DateRangePreset.ALL_TIME:
    default:
      return ALL_TIME;
  }
}

/**
 * `true` when the range is coherent enough to send.
 *
 * A half-filled custom range is *not* an error — it is a user mid-edit — so it reports invalid and
 * the caller simply does not fetch. An inverted range (`from` after `to`) is a real mistake and is
 * reported as one rather than quietly swapped: swapping would answer a question nobody asked.
 */
export function isCompleteRange(range: DateRange): boolean {
  if (range.preset === DateRangePreset.ALL_TIME) return true;
  const { from, to } = range;
  if (from === undefined || to === undefined || from === '' || to === '') return false;
  return from <= to;
}

/** `from`/`to` are omitted rather than sent empty, so an absent bound stays absent (§4.1). */
export function toDateRangeQuery(range: DateRange): DateRangeQuery {
  if (!isCompleteRange(range) || range.preset === DateRangePreset.ALL_TIME) return {};
  return { from: range.from, to: range.to };
}

/** Human wording for a heading or an `aria-live` announcement — "01 Sep 2026 to 05 Sep 2026". */
export function describeRange(range: DateRange, formatDay: (iso: string) => string): string {
  if (range.preset === DateRangePreset.ALL_TIME) return 'All time';
  const { from, to } = range;
  if (from === undefined || to === undefined) return 'No range chosen';
  if (from === to) return formatDay(from);
  return `${formatDay(from)} to ${formatDay(to)}`;
}
