/**
 * MedLoop AI — `Pagination`.
 *
 * Driven by the API's own envelope. {@link PageMeta} is `Paginated<T>` minus its items, so the props
 * cannot drift from `types/api.ts`: rename `total` on the server, change the type there, and this file
 * stops compiling.
 *
 * ## What it renders and why
 *
 * A `<nav>` with an accessible name, a range summary ("26–50 of 812 images"), and previous/next
 * buttons. There is **no numbered page strip**. The lists here are long and unordered by anything a
 * human remembers — page 14 of the image list means nothing to anyone — so the strip would be a row of
 * fourteen indistinguishable targets. Direct access to a page comes from filtering, not from counting.
 *
 * The range is announced through a polite live region, because after pressing Next the only thing that
 * changed for a screen-reader user is the range text; without it the button appears to do nothing.
 *
 * Page size is a `<select>`. Changing it must send the caller back to page 1 — staying on page 7 while
 * the page size triples shows a different slice of data under the same page number, which reads as data
 * loss. That reset belongs to whoever owns the query, so it is stated on the prop rather than done
 * here; this component holds no state.
 */

import type { ReactElement } from 'react';

import { Button } from './Button';
import { Select } from './Select';
import { cx } from './cx';
import { formatCount } from '@/lib/format';
import { PAGE_SIZE_DEFAULT } from '@/types/api';
import type { Paginated } from '@/types/api';

/** The API envelope without its payload. */
export type PageMeta = Omit<Paginated<unknown>, 'items'>;

export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50, 100];

export interface PaginationProps {
  readonly meta: PageMeta;
  readonly onPageChange: (page: number) => void;
  /**
   * Omit to hide the page-size control — right when the caller pins the size. The handler **must**
   * also reset the page to 1; see this file's header.
   */
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly pageSizeOptions?: readonly number[];
  /** Plural noun for the summary line: "images", "log entries", "annotations". */
  readonly noun?: string;
  /** Disables both controls while a request is in flight, without unmounting them. */
  readonly busy?: boolean;
  readonly className?: string;
}

export function Pagination({
  meta,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  noun = 'items',
  busy = false,
  className,
}: PaginationProps): ReactElement {
  const size = meta.page_size > 0 ? meta.page_size : PAGE_SIZE_DEFAULT;
  // `total === 0` has to read as an empty range, not as "1–0".
  const first = meta.total === 0 ? 0 : (meta.page - 1) * size + 1;
  const last = Math.min(meta.page * size, meta.total);
  const hasPrevious = meta.page > 1;
  const hasNext = meta.page < meta.pages;

  return (
    <nav
      aria-label="Pagination"
      className={cx(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-content-secondary',
        className,
      )}
    >
      <p aria-live="polite">
        {meta.total === 0
          ? `No ${noun}`
          : `${formatCount(first)}–${formatCount(last)} of ${formatCount(meta.total)} ${noun}`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange === undefined ? null : (
          <label className="flex items-center gap-2">
            <span>Per page</span>
            <Select
              value={String(size)}
              onValueChange={(next) => {
                if (next === '') return;
                onPageSizeChange(Number(next));
              }}
              options={pageSizeOptions.map((option) => ({
                value: String(option),
                label: String(option),
              }))}
              disabled={busy}
              className="h-7 w-[4.5rem] text-xs"
            />
          </label>
        )}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={() => onPageChange(meta.page - 1)}
            disabled={busy || !hasPrevious}
          >
            Previous
          </Button>
          <Button size="sm" onClick={() => onPageChange(meta.page + 1)} disabled={busy || !hasNext}>
            Next
          </Button>
        </div>
      </div>
    </nav>
  );
}
