/**
 * MedLoop AI — `BarChart`: one count per category.
 *
 * The workhorse for class distributions (how many images carry each disease label), skip reasons and
 * per-class metrics. Vertical bars with the label beneath, because every category name in this project
 * is short — a disease code or a humanised enum — and rotated axis labels are the first thing that
 * makes a chart look homemade.
 *
 * ## Colour carries identity, never judgement
 *
 * Bars draw from the categorical ramp (`tailwind.config.ts`: Okabe–Ito, colour-vision safe) and never
 * from `status.*`. A melanoma bar rendered in the danger red would be presenting a diagnosis as a
 * verdict about the patient, which is not something a count is entitled to say. `uniform` collapses
 * the ramp to a single accent for the case where the categories are ordered rather than nominal.
 *
 * ## Zero-height bars
 *
 * A category with a count of zero still gets a label and a 1 px stub, so it is visibly *present and
 * empty* rather than absent. "No SCC images have been uploaded" and "SCC is not a class here" are
 * different statements, and the second one would be wrong.
 */

import type { ReactElement } from 'react';

import { EmptyState } from '@/components/ui/states';
import { Table } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { formatCount, formatPercent } from '@/lib/format';
import type { DistributionSlice } from '@/types/domain';
import { ChartFrame, CategoryAxis, ValueAxis, ValueGrid } from './lib/frame';
import { band, categorical, fillClass, linear, niceTicks, plot, round } from './lib/scale';

const WIDTH = 720;
const MARGIN = { top: 8, right: 12, bottom: 24, left: 40 } as const;

export interface BarChartProps {
  readonly ariaLabel: string;
  readonly slices: readonly DistributionSlice[];
  readonly height?: number;
  /** One accent for every bar. Right when the categories are a scale, wrong when they are names. */
  readonly uniform?: boolean;
  readonly formatValue?: (value: number) => string;
  /** Adds a share-of-total column to the transcript. Off for metrics, on for counts. */
  readonly showShare?: boolean;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly className?: string;
}

export function BarChart({
  ariaLabel,
  slices,
  height = 220,
  uniform = false,
  formatValue = formatCount,
  showShare = true,
  emptyTitle = 'No categories to show',
  emptyDescription = 'This chart draws once at least one category has been recorded.',
  className,
}: BarChartProps): ReactElement {
  if (slices.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />;
  }

  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const ticks = niceTicks(0, Math.max(...slices.map((slice) => slice.count), 0));
  const shelf = plot(WIDTH, height, MARGIN);
  const x = band(slices.length, [shelf.x0, shelf.x1], 0.3);
  const y = linear({ min: ticks.min, max: ticks.max }, [shelf.y0, shelf.y1]);

  const columns: readonly Column<DistributionSlice>[] = [
    { id: 'label', header: 'Category', rowHeader: true, cell: (row) => row.label },
    { id: 'count', header: 'Count', numeric: true, cell: (row) => formatValue(row.count) },
    ...(showShare
      ? [
          {
            id: 'share',
            header: 'Share',
            numeric: true,
            // `total === 0` is a real state (every category present, none populated). Dividing would
            // print `NaN%`, so the share is simply not claimed.
            cell: (row: DistributionSlice) =>
              total === 0 ? '—' : formatPercent(row.count / total),
          },
        ]
      : []),
  ];

  return (
    <ChartFrame
      ariaLabel={ariaLabel}
      width={WIDTH}
      height={height}
      className={className}
      transcript={
        <Table
          caption={`${ariaLabel} — values`}
          captionHidden
          density="compact"
          columns={columns}
          rows={slices}
          rowKey={(row) => row.key}
        />
      }
    >
      <ValueGrid plot={shelf} ticks={ticks} scale={y} />
      <ValueAxis plot={shelf} ticks={ticks} scale={y} format={formatValue} />
      <CategoryAxis plot={shelf} band={x} labels={slices.map((slice) => slice.label)} />
      {slices.map((slice, index) => {
        const top = y(slice.count);
        // `Math.max(…, 1)`: see the header note on zero-height bars.
        const drawn = Math.max(shelf.y0 - top, 1);
        return (
          <rect
            key={slice.key}
            x={round(x.start(index))}
            y={round(shelf.y0 - drawn)}
            width={round(x.width)}
            height={round(drawn)}
            className={fillClass(uniform ? 'c1' : categorical(index))}
          />
        );
      })}
    </ChartFrame>
  );
}
