/**
 * MedLoop AI — `DonutChart`: shares of one total.
 *
 * Reserved for the few places where the whole is genuinely a single population — the split of a
 * dataset version, the validated/skipped/pending breakdown of a review queue. Anything with more than
 * a handful of slices belongs in a `BarChart`; a donut with nine wedges is a lookup table drawn badly.
 *
 * ## The hole holds the total
 *
 * The centre carries the count, which is the number people actually want, and it removes the need for
 * a tooltip to answer "out of how many". Shares are printed in the legend beside each label rather
 * than on the wedges, where they would need leader lines and would collide.
 *
 * ## Rounding is not hidden
 *
 * Wedge angles come from the raw counts, so they always sum to the full circle. The printed shares are
 * rounded independently and may therefore total 99.9 % or 100.1 %. That is the honest artefact of
 * rounding; forcing the last slice to absorb the remainder would put a number on screen that is not
 * the one the division produced.
 */

import type { ReactElement } from 'react';

import { EmptyState } from '@/components/ui/states';
import { Table } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { formatCount, formatPercent } from '@/lib/format';
import type { DistributionSlice } from '@/types/domain';
import { ChartFrame, Legend } from './lib/frame';
import type { LegendItem } from './lib/frame';
import { bgClass, categorical, donutSegment, fillClass } from './lib/scale';

const SIZE = 200;
const OUTER = 88;
const INNER = 56;

export interface DonutChartProps {
  readonly ariaLabel: string;
  readonly slices: readonly DistributionSlice[];
  /** Printed in the hole under the total. "images", "samples", "annotations". */
  readonly totalLabel?: string;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly className?: string;
}

export function DonutChart({
  ariaLabel,
  slices,
  totalLabel = 'total',
  emptyTitle = 'Nothing to break down yet',
  emptyDescription = 'This chart draws once at least one of these categories has a count.',
  className,
}: DonutChartProps): ReactElement {
  const total = slices.reduce((sum, slice) => sum + Math.max(slice.count, 0), 0);

  // An all-zero distribution is not a chart. Drawing a full ring in one colour would say "100 % of
  // nothing is this category", which is worse than saying there is nothing yet.
  if (slices.length === 0 || total === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />;
  }

  const columns: readonly Column<DistributionSlice>[] = [
    { id: 'label', header: 'Category', rowHeader: true, cell: (row) => row.label },
    { id: 'count', header: 'Count', numeric: true, cell: (row) => formatCount(row.count) },
    {
      id: 'share',
      header: 'Share',
      numeric: true,
      cell: (row) => formatPercent(row.count / total),
    },
  ];

  const legend: readonly LegendItem[] = slices.map((slice, index) => ({
    key: slice.key,
    label: slice.label,
    swatch: bgClass(categorical(index)),
    value: formatPercent(slice.count / total),
  }));

  let cursor = 0;

  return (
    <ChartFrame
      ariaLabel={ariaLabel}
      width={SIZE}
      height={SIZE}
      className={className}
      legend={<Legend items={legend} className="flex-col items-start gap-y-1" />}
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
      {slices.map((slice, index) => {
        const share = Math.max(slice.count, 0) / total;
        const from = cursor;
        cursor += share;
        if (share <= 0) return null;
        return (
          <path
            key={slice.key}
            d={donutSegment(SIZE / 2, SIZE / 2, OUTER, INNER, from, cursor)}
            className={fillClass(categorical(index))}
            // A hairline in the surface colour separates adjacent wedges without adding a colour.
            stroke="rgb(var(--surface-raised))"
            strokeWidth={1}
          />
        );
      })}
      <text
        x={SIZE / 2}
        y={SIZE / 2 - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-content-primary text-[18px] font-semibold"
      >
        {formatCount(total)}
      </text>
      <text
        x={SIZE / 2}
        y={SIZE / 2 + 14}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-content-muted text-[10px] uppercase tracking-wide"
      >
        {totalLabel}
      </text>
    </ChartFrame>
  );
}
