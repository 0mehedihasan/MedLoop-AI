/**
 * MedLoop AI — `StackedBarChart`: the composition of a total, per category.
 *
 * For "of the images in each split, how many are validated / skipped / not yet reviewed" and similar
 * questions where the parts and the whole both matter. A grouped bar chart answers "which is bigger";
 * a stack answers "what is this made of", which is the question the review pipeline actually poses.
 *
 * ## Input shape
 *
 * `Series[]`, the same type `LineSeriesChart` takes, with `points[].t` naming the category. One shape
 * for both charts means a statistics endpoint can be re-plotted without reshaping its payload.
 *
 * ## An absent contribution is not a zero
 *
 * A stack has to sum to something, so a series with no entry for a category simply contributes no
 * height. The transcript still prints `–` rather than `0` for that cell, because "this series
 * reported nothing here" and "this series reported zero" are different facts and only the drawing is
 * forced to conflate them.
 */

import type { ReactElement } from 'react';

import { EmptyState } from '@/components/ui/states';
import { Table } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { NO_VALUE, formatCount } from '@/lib/format';
import type { Series } from '@/types/domain';
import { ChartFrame, CategoryAxis, Legend, ValueAxis, ValueGrid } from './lib/frame';
import type { LegendItem } from './lib/frame';
import { band, bgClass, categorical, fillClass, linear, niceTicks, plot, round } from './lib/scale';

const WIDTH = 720;
const MARGIN = { top: 8, right: 12, bottom: 24, left: 40 } as const;

export interface StackedBarChartProps {
  readonly ariaLabel: string;
  readonly series: readonly Series[];
  /**
   * Category order. Supply it when the order is meaningful — splits read `TRAIN, VALIDATION, TEST`,
   * not alphabetically. Omitted, the union of the series' own categories is sorted.
   */
  readonly categories?: readonly string[];
  readonly categoryLabels?: Readonly<Record<string, string>>;
  readonly height?: number;
  readonly formatValue?: (value: number) => string;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly className?: string;
}

interface Row {
  readonly category: string;
  readonly values: readonly (number | undefined)[];
  readonly total: number;
}

export function StackedBarChart({
  ariaLabel,
  series,
  categories,
  categoryLabels,
  height = 220,
  formatValue = formatCount,
  emptyTitle = 'Nothing to break down yet',
  emptyDescription = 'This chart draws once at least one category has been recorded.',
  className,
}: StackedBarChartProps): ReactElement {
  const lookups = series.map((one) => new Map(one.points.map((point) => [point.t, point.v])));
  const resolved =
    categories ??
    [...new Set(series.flatMap((one) => one.points.map((point) => point.t)))].sort();

  const rows: readonly Row[] = resolved.map((category) => {
    const values = lookups.map((lookup) => lookup.get(category));
    return {
      category,
      values,
      // `reduce<number>` explicitly: over a `(number | undefined)[]` the accumulator would otherwise
      // widen to `number | undefined` from the element type, and the total is never absent.
      total: values.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    };
  });

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />;
  }

  const ticks = niceTicks(0, Math.max(...rows.map((row) => row.total), 0));
  const shelf = plot(WIDTH, height, MARGIN);
  const x = band(rows.length, [shelf.x0, shelf.x1], 0.3);
  const y = linear({ min: ticks.min, max: ticks.max }, [shelf.y0, shelf.y1]);
  const label = (category: string): string => categoryLabels?.[category] ?? category;

  const columns: readonly Column<Row>[] = [
    { id: 'category', header: 'Category', rowHeader: true, cell: (row) => label(row.category) },
    ...series.map((one, index) => ({
      id: one.key,
      header: one.label,
      numeric: true,
      cell: (row: Row) => {
        const value = row.values[index];
        return value === undefined ? NO_VALUE : formatValue(value);
      },
    })),
    { id: 'total', header: 'Total', numeric: true, cell: (row) => formatValue(row.total) },
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
      <CategoryAxis plot={shelf} band={x} labels={rows.map((row) => label(row.category))} />
      {rows.map((row, categoryIndex) => {
        // Accumulated from the baseline up, in series order, so the legend order matches the stack.
        let cursor = 0;
        return (
          <g key={row.category}>
            {row.values.map((value, seriesIndex) => {
              if (value === undefined || value <= 0) return null;
              const bottom = y(cursor);
              cursor += value;
              const top = y(cursor);
              return (
                <rect
                  key={series[seriesIndex]?.key ?? seriesIndex}
                  x={round(x.start(categoryIndex))}
                  y={round(top)}
                  width={round(x.width)}
                  height={round(Math.max(bottom - top, 1))}
                  className={fillClass(categorical(seriesIndex))}
                />
              );
            })}
          </g>
        );
      })}
    </ChartFrame>
  );
}
