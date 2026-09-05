'use client';

/**
 * MedLoop AI — the pieces both statistics screens share.
 *
 * Two screens, one filter, one lookup rule, one demo switch. Keeping them here rather than in either
 * screen stops "Data Statistics fetches on a half-typed custom range but Annotation Statistics does
 * not" from ever becoming true.
 */

import { useMemo, useState } from 'react';

import { isCompleteRange, isInvertedRange, toDateRangeQuery, ALL_TIME } from '@/lib/date-range';
import type { DateRange } from '@/lib/date-range';
import type { DateRangeQuery } from '@/types/api';
import type { Distribution, Series } from '@/types/domain';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The filter
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface RangeFilter {
  readonly range: DateRange;
  readonly setRange: (next: DateRange) => void;
  /** What to send. `{}` for all-time or for a range the user has not finished. */
  readonly query: DateRangeQuery;
  /** `false` while a custom range is half-typed — the caller must not fetch, and must not error. */
  readonly complete: boolean;
  /** `from` after `to`. A real mistake, and the only case that earns a message. */
  readonly inverted: boolean;
}

/**
 * The date filter as state plus a query bag.
 *
 * `from`/`to` are returned as separate primitives by design: `useApiQuery` compares `deps` by
 * identity, and `toDateRangeQuery` builds a fresh object every render, so passing the bag itself as a
 * dependency would refetch on every keystroke anywhere on the page. Call sites spread
 * `[filter.query.from, filter.query.to]`.
 */
export function useRangeFilter(initial: DateRange = ALL_TIME): RangeFilter {
  const [range, setRange] = useState<DateRange>(initial);
  const complete = isCompleteRange(range);
  const inverted = isInvertedRange(range);
  const query = useMemo(() => toDateRangeQuery(range), [range]);
  return { range, setRange, query, complete, inverted };
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Reading a payload
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Find one distribution by key, or `null`.
 *
 * `null` rather than an empty `Distribution`, because the two mean different things and the screens
 * render them differently: a distribution the server *omitted* is `Unavailable` ("this figure was not
 * returned"), while one that came back with no slices is an `EmptyState` ("nothing has been counted
 * yet"). Substituting an empty list for an absent key would collapse that distinction and quietly
 * assert that a count of zero was measured (§2.3).
 */
export function pickDistribution(
  distributions: readonly Distribution[],
  key: string,
): Distribution | null {
  return distributions.find((distribution) => distribution.key === key) ?? null;
}

/** Same rule as {@link pickDistribution}, for series. */
export function pickSeries(series: readonly Series[], key: string): Series | null {
  return series.find((entry) => entry.key === key) ?? null;
}

/** The subset of `keys` that is actually present, in the order given. Absent keys are dropped. */
export function pickSeriesList(
  series: readonly Series[],
  keys: readonly string[],
): readonly Series[] {
  return keys
    .map((key) => pickSeries(series, key))
    .filter((entry): entry is Series => entry !== null);
}

/** Total of a distribution's slices. Used only for a caption; never to fill in a missing figure. */
export function sumSlices(distribution: Distribution | null): number {
  if (distribution === null) return 0;
  return distribution.slices.reduce((total, slice) => total + slice.count, 0);
}

/**
 * Why a figure is missing, in the words the UI is allowed to use.
 *
 * Every statistics screen needs this exact sentence in several places — any panel whose input is a
 * model output. Writing it once means a future build that *does* have a model has one string to find,
 * and no screen can drift into implying a model exists (§2.3, §10).
 */
export const NO_MODEL_REASON =
  'No model has been trained on this machine, so there is no prediction to compare against.';

/** For a figure the response simply did not carry, which is not the same as "no model". */
export const NOT_RETURNED_REASON = 'The API did not return this figure for the selected range.';
