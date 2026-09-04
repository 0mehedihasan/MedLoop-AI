/**
 * MedLoop AI — `Table`.
 *
 * A real `<table>` with `<caption>`, `<thead>`, `scope` on every header cell and `aria-sort` on the
 * sorted one. The screens this serves — the image list, the review queue, the model registry, the
 * system log — are all "many rows, several columns, one of which is a status", which is what a table
 * element is for. None of them is a layout grid.
 *
 * ## Column definitions, not children
 *
 * Rows are rendered from a `columns` array rather than by the caller writing `<tr><td>…`. Two reasons,
 * both practical: the component then knows its own column count, so the empty and error rows can span
 * the width correctly instead of every call site passing a `colSpan` that rots when a column is added;
 * and the header/cell pair for one column stays in one place, so alignment can never disagree between
 * `<th>` and `<td>`.
 *
 * ## This table never sorts
 *
 * `onSortChange` reports *intent*. The data is paginated by the API, and sorting the rows that
 * happen to be on the current page would present page 3 of an unsorted list as a sorted list — a
 * plausible-looking lie of exactly the kind §2.3 is about. The caller forwards the new sort to the
 * query and the server returns the correct page.
 *
 * ## No clickable rows
 *
 * A `<tr onClick>` is not reachable by keyboard and has no role; `jsx-a11y/no-static-element-interactions`
 * is an error in this project for that reason. A row that opens something carries a real link or
 * button in one of its cells. `selectedKey` exists only to *mark* the row a workspace is showing.
 */

import type { ReactElement, ReactNode } from 'react';

import { cx } from './cx';
import { SR_ONLY, VisuallyHidden } from './project';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  /** Matches a {@link Column.id}. */
  readonly column: string;
  readonly direction: SortDirection;
}

/**
 * What a click on a sortable header should produce. A new column starts `asc`, except for the numeric
 * and date columns where "most" or "newest" is the interesting end — the caller passes
 * `preferDesc` for those.
 */
export function nextSort(current: SortState | null, column: string, preferDesc = false): SortState {
  if (current === null || current.column !== column) {
    return { column, direction: preferDesc ? 'desc' : 'asc' };
  }
  return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

export interface Column<Row> {
  /** Stable identity, and the sort key sent to the API. Not the header text. */
  readonly id: string;
  readonly header: ReactNode;
  readonly cell: (row: Row) => ReactNode;
  /** Right-aligns and keeps figures in columns. Use for counts, confidences, durations. */
  readonly numeric?: boolean;
  /** Marks the cell as the row's header (`<th scope="row">`) — the identifying column. */
  readonly rowHeader?: boolean;
  readonly sortable?: boolean;
  /** Ask for `desc` on the first click. Right for dates and counts. */
  readonly sortDescFirst?: boolean;
  /** A CSS length, applied through `<colgroup>` so it cannot fight the cell padding. */
  readonly width?: string;
  /** For an actions column: the header text stays in the accessibility tree, out of sight. */
  readonly headerHidden?: boolean;
  readonly className?: string;
}

export interface TableProps<Row> {
  /** The table's accessible name. Required; `captionHidden` keeps it off screen. */
  readonly caption: string;
  readonly captionHidden?: boolean;
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string | number;
  readonly sort?: SortState | null;
  readonly onSortChange?: (next: SortState) => void;
  readonly density?: 'comfortable' | 'compact';
  /** Keeps the header visible in a scrolling container. The container owns the height. */
  readonly stickyHeader?: boolean;
  /** Rendered in one full-width cell when `rows` is empty — normally an `<EmptyState />`. */
  readonly emptyState?: ReactNode;
  /** Highlights the row a side panel or workspace is currently showing. */
  readonly selectedKey?: string | number | null;
  readonly className?: string;
}

const CELL_DENSITY: Readonly<Record<'comfortable' | 'compact', string>> = {
  comfortable: 'px-3 py-2.5',
  compact: 'px-2.5 py-1.5',
};

const ARIA_SORT: Readonly<Record<SortDirection, 'ascending' | 'descending'>> = {
  asc: 'ascending',
  desc: 'descending',
};

/** Up, down, and the neutral pair shown on a sortable column that is not currently sorted. */
const SORT_GLYPH: Readonly<Record<'asc' | 'desc' | 'none', string>> = {
  asc: 'M5 3 9 8H1z',
  desc: 'M5 13 1 8h8z',
  none: 'M5 2.5 8.2 6.5H1.8z M5 13.5 1.8 9.5h6.4z',
};

export function Table<Row>({
  caption,
  captionHidden = true,
  columns,
  rows,
  rowKey,
  sort = null,
  onSortChange,
  density = 'comfortable',
  stickyHeader = false,
  emptyState,
  selectedKey = null,
  className,
}: TableProps<Row>): ReactElement {
  const cellPad = CELL_DENSITY[density];
  return (
    <table className={cx('w-full border-collapse text-sm', className)}>
      <caption
        className={
          captionHidden ? SR_ONLY : 'px-3 pb-2 text-left text-xs text-content-secondary'
        }
      >
        {caption}
      </caption>
      {columns.some((column) => column.width !== undefined) ? (
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={column.width === undefined ? undefined : { width: column.width }} />
          ))}
        </colgroup>
      ) : null}
      <thead>
        <tr className="border-b border-edge">
          {columns.map((column) => (
            <HeaderCell
              key={column.id}
              column={column}
              sort={sort}
              onSortChange={onSortChange}
              cellPad={cellPad}
              sticky={stickyHeader}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="px-3 py-6">
              {emptyState}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <BodyRow
              key={rowKey(row)}
              row={row}
              columns={columns}
              cellPad={cellPad}
              selected={selectedKey !== null && rowKey(row) === selectedKey}
            />
          ))
        )}
      </tbody>
    </table>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Internals
 * ──────────────────────────────────────────────────────────────────────────────────────── */

interface HeaderCellProps<Row> {
  readonly column: Column<Row>;
  readonly sort: SortState | null;
  readonly onSortChange: ((next: SortState) => void) | undefined;
  readonly cellPad: string;
  readonly sticky: boolean;
}

/**
 * `aria-sort` goes on the `<th>` and the control inside it is a real `<button>` — the combination
 * screen readers actually announce. Putting `aria-sort` on the button instead is a common and silent
 * mistake: the attribute is only defined on a header cell.
 *
 * A column is only interactive when it is `sortable` *and* the caller supplied `onSortChange`; a
 * button that cannot change anything is worse than plain text.
 */
function HeaderCell<Row>({
  column,
  sort,
  onSortChange,
  cellPad,
  sticky,
}: HeaderCellProps<Row>): ReactElement {
  const active = sort !== null && sort.column === column.id;
  const interactive = column.sortable === true && onSortChange !== undefined;
  const glyph = active ? SORT_GLYPH[sort.direction] : SORT_GLYPH.none;

  const label =
    column.headerHidden === true ? (
      <VisuallyHidden>{column.header}</VisuallyHidden>
    ) : (
      column.header
    );

  return (
    <th
      scope="col"
      aria-sort={active ? ARIA_SORT[sort.direction] : column.sortable === true ? 'none' : undefined}
      className={cx(
        'bg-surface-panel text-xs font-medium text-content-secondary',
        sticky && 'sticky top-0 z-10 border-b border-edge',
        column.numeric === true ? 'text-right' : 'text-left',
        interactive ? 'p-0' : cellPad,
        column.className,
      )}
    >
      {interactive ? (
        <button
          type="button"
          onClick={() => onSortChange(nextSort(sort, column.id, column.sortDescFirst === true))}
          className={cx(
            'flex w-full items-center gap-1.5 font-medium transition duration-fast hover:text-content-primary',
            column.numeric === true ? 'justify-end' : 'justify-start',
            cellPad,
          )}
        >
          {label}
          <svg
            viewBox="0 0 10 16"
            aria-hidden="true"
            className={cx('h-3 w-2 shrink-0 fill-current', active ? 'opacity-100' : 'opacity-40')}
          >
            <path d={glyph} />
          </svg>
        </button>
      ) : (
        label
      )}
    </th>
  );
}

interface BodyRowProps<Row> {
  readonly row: Row;
  readonly columns: readonly Column<Row>[];
  readonly cellPad: string;
  readonly selected: boolean;
}

/**
 * The identifying column is a `<th scope="row">`, which is what lets a screen reader answer "which
 * image is this confidence for?" while moving across a row. Exactly one column should set
 * `rowHeader`; more than one makes the announcement longer, not clearer.
 */
function BodyRow<Row>({ row, columns, cellPad, selected }: BodyRowProps<Row>): ReactElement {
  return (
    <tr
      aria-selected={selected ? true : undefined}
      className={cx(
        'border-b border-edge-subtle transition duration-fast last:border-b-0',
        selected ? 'bg-status-info-soft' : 'hover:bg-surface-inset',
      )}
    >
      {columns.map((column) => {
        const cn = cx(
          cellPad,
          'align-top',
          column.numeric === true ? 'text-right' : 'text-left',
          column.className,
        );
        return column.rowHeader === true ? (
          <th key={column.id} scope="row" className={cx(cn, 'font-medium text-content-primary')}>
            {column.cell(row)}
          </th>
        ) : (
          <td key={column.id} className={cx(cn, 'text-content-secondary')}>
            {column.cell(row)}
          </td>
        );
      })}
    </tr>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * TableScroll
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface TableScrollProps {
  readonly children: ReactNode;
  /** Names the scrollable region. Reuse the table's caption text. */
  readonly label: string;
  /** A Tailwind max-height class, e.g. `max-h-[28rem]`. Required for `stickyHeader` to do anything. */
  readonly maxHeightClassName?: string;
  readonly className?: string;
}

/**
 * The scroll container for a wide or long table.
 *
 * `tabIndex={0}` and `role="region"` are not decoration: a scrollable box that cannot receive focus
 * cannot be scrolled with the arrow keys at all, so a keyboard-only user simply cannot reach the
 * right-hand columns. The label is what makes the resulting stop meaningful rather than a mystery.
 *
 * `stickyHeader` on {@link Table} needs a bounded height to stick *to*, which is what
 * `maxHeightClassName` provides.
 */
export function TableScroll({
  children,
  label,
  maxHeightClassName,
  className,
}: TableScrollProps): ReactElement {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cx('overflow-auto', maxHeightClassName, className)}
    >
      {children}
    </div>
  );
}
