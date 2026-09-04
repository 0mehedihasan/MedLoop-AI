/**
 * MedLoop AI — `LineSeriesChart`: one or more value series over an ordered category axis (dates).
 *
 * Used for review throughput over time and for per-epoch training loss. Both are "did this go up or
 * down", which is the one question a line answers better than a table — and the table is still there
 * underneath, because the exact figure is what gets quoted.
 *
 * ## A gap is drawn as a gap
 *
 * Series are unioned onto a single sorted category axis, so a series missing a date has *no point*
 * there rather than a zero. That distinction matters: "nobody reviewed anything on Sunday" and "the
 * counter was zero on Sunday" look identical on a line that bridges the gap, and only one of them is
 * a fact we have. Missing points break the polyline into segments; the transcript prints `–`.
 *
 * ## Markers
 *
 * Drawn when the axis is short enough for them to be distinguishable. On a ninety-day axis they
 * merge into the line and only cost DOM nodes, so they are dropped — the line is the signal there.
 */

import type { ReactElement } from 'react';

import { EmptyState } from '@/components/ui/states';
import { Table } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { NO_VALUE, formatCount } from '@/lib/format';
import type { Series } from '@/types/domain';
import {
  ChartFrame,
  CategoryAxis,
  Legend,
  ValueAxis,
  ValueGrid,
  type LegendItem,
} from './lib/frame';
import {
  band,
  bgClass,
  categorical,
  linear,
  niceTicks,
  plot,
  points as toPoints,
  round,
  strokeClass,
} from './lib/scale';

const WIDTH = 720;
const MARGIN = { top: 8, right: 12, bottom: 24, left: 40 } as const;

/** Above this many categories, markers stop helping. */
const MARKER_LIMIT = 32;

export interface LineSeriesChartProps {
  readonly ariaLabel: string;
  readonly series: readonly Series[];
  readonly height?: number;
  /** Formats both the axis labels and the transcript cells. Counts by default. */
  readonly formatValue?: (value: number) => string;
  /** Shortens the category label — a full ISO date is too wide for a tick. */
  readonly formatCategory?: (t: string) => string;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly className?: string;
}

/** The union of every series' categories, ascending. ISO dates sort correctly as strings. */
function categoriesOf(series: readonly Series[]): readonly string[] {
  const seen = new Set<string>();
  for (const one of series) for (const point of one.points) seen.add(point.t);
  return [...seen].sort();
}

/** `MM-DD` from an ISO date; anything else is left alone rather than truncated blindly. */
function shortDate(t: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(5, 10) : t;
}

interface TranscriptRow {
  readonly category: string;
  readonly values: readonly (number | undefined)[];
}

export function LineSeriesChart({
  ariaLabel,
  series,
  height = 220,
  formatValue = formatCount,
  formatCategory = shortDate,
  emptyTitle = 'Nothing to plot yet',
  emptyDescription = 'This chart draws once the range contains at least one recorded day.',
  className,
}: LineSeriesChartProps): ReactElement {
  const categories = categoriesOf(series);
  const lookups = series.map((one) => new Map(one.points.map((point) => [point.t, point.v])));

  if (categories.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />;
  }

  const values = series.flatMap((one) => one.points.map((point) => point.v));
  // Zero-based: these are counts, and a truncated count axis overstates a difference (§2.3).
  const ticks = niceTicks(0, Math.max(...values, 0));
  const shelf = plot(WIDTH, height, MARGIN);
  const x = band(categories.length, [shelf.x0, shelf.x1], 0);
  const y = linear({ min: ticks.min, max: ticks.max }, [shelf.y0, shelf.y1]);
  const markers = categories.length <= MARKER_LIMIT;

  const rows: readonly TranscriptRow[] = categories.map((category) => ({
    category,
    values: lookups.map((lookup) => lookup.get(category)),
  }));

  const columns: readonly Column<TranscriptRow>[] = [
    { id: 'category', header: 'Date', rowHeader: true, cell: (row) => row.category },
    ...series.map((one, index) => ({
      id: one.key,
      header: one.label,
      numeric: true,
      cell: (row: TranscriptRow) => {
        const value = row.values[index];
        return value === undefined ? NO_VALUE : formatValue(value);
      },
    })),
  ];

  const legend: readonly LegendItem[] = series.map((one, index) => ({
    key: one.key,
    label: one.label,
    swatch: bgClass(categorical(index)),
  }));

  return (
    <ChartFrame
      ariaLabel={ariaLabel}
      width={WIDTH}
      height={height}
      className={className}
      legend={<Legend items={legend} />}
      transcript={
        <Table
          caption={`${ariaLabel} — values`}
          captionHidden
          density="compact"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.category}
        />
      }
    >
      <ValueGrid plot={shelf} ticks={ticks} scale={y} />
      <ValueAxis plot={shelf} ticks={ticks} scale={y} format={formatValue} />
      <CategoryAxis
        plot={shelf}
        band={x}
        labels={categories.map(formatCategory)}
        every={Math.ceil(categories.length / 12)}
      />
      {series.map((one, index) => {
        const lookup = lookups[index];
        if (lookup === undefined) return null;
        const stroke = strokeClass(categorical(index));
        // Contiguous runs only: a gap must not be bridged. See the header note.
        const runs: (readonly [number, number])[][] = [];
        let run: (readonly [number, number])[] = [];
        categories.forEach((category, position) => {
          const value = lookup.get(category);
          if (value === undefined) {
            if (run.length > 0) runs.push(run);
            run = [];
            return;
          }
          run.push([x.centre(position), y(value)]);
        });
        if (run.length > 0) runs.push(run);

        return (
          <g key={one.key}>
            {runs.map((segment, segmentIndex) =>
              segment.length === 1 ? null : (
                <polyline
                  key={segmentIndex}
                  points={toPoints(segment)}
                  fill="none"
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className={stroke}
                />
              ),
            )}
            {/*
              Markers on every point while the axis is short. A single-point run is always marked,
              whatever the axis length: it has no line to belong to, so without a dot it is invisible.
            */}
            {runs
              .filter((segment) => markers || segment.length === 1)
              .flat()
              .map(([cx, cy], pointIndex) => (
                <circle
                  key={pointIndex}
                  cx={round(cx)}
                  cy={round(cy)}
                  r={2.5}
                  className={`${stroke} fill-surface-raised`}
                  strokeWidth={1.5}
                />
              ))}
          </g>
        );
      })}
    </ChartFrame>
  );
}
