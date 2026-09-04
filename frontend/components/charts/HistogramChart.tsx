/**
 * MedLoop AI — `HistogramChart`: the distribution of a continuous quantity over fixed bins.
 *
 * The intended subjects are prediction confidence and annotation time. Both are questions about
 * *shape*: a confidence histogram piled against 1.0 is a differently-behaved model from one spread
 * across the middle, and no single summary statistic shows that.
 *
 * ## Bins arrive pre-computed
 *
 * This component does not bin anything. The counts come from the API, because the bin edges are part
 * of the result — two screens that silently chose different bin widths would show two different
 * distributions of the same data, and the one on screen would win. `edges` therefore has exactly
 * `counts.length + 1` entries, and a mismatch is reported rather than papered over.
 *
 * ## No gaps between bars
 *
 * `band(…, 0)`: histogram bars touch. A gap implies the bins are not contiguous, which would be a
 * claim about the data rather than a styling choice.
 */

import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/states';
import { Table } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { formatCount, formatPercent } from '@/lib/format';
import { ChartFrame, CategoryAxis, ValueAxis, ValueGrid } from './lib/frame';
import { band, fillClass, linear, niceTicks, plot, round } from './lib/scale';

const WIDTH = 720;
const MARGIN = { top: 8, right: 12, bottom: 24, left: 40 } as const;

export interface HistogramChartProps {
  readonly ariaLabel: string;
  /** `counts.length + 1` values, ascending. `edges[i]` and `edges[i + 1]` bound bin `i`. */
  readonly edges: readonly number[];
  readonly counts: readonly number[];
  readonly height?: number;
  /** How a bin edge is written. Defaults to a fraction, which suits confidence. */
  readonly formatEdge?: (value: number) => string;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly className?: string;
}

interface Row {
  readonly index: number;
  readonly range: string;
  readonly count: number;
}

export function HistogramChart({
  ariaLabel,
  edges,
  counts,
  height = 220,
  formatEdge = (value) => formatPercent(value, 0),
  emptyTitle = 'No distribution yet',
  emptyDescription = 'This chart draws once there are values to bin.',
  className,
}: HistogramChartProps): ReactElement {
  // Surfaced, not thrown and not silently trimmed: a bin count that disagrees with its edges means
  // the payload and the chart disagree about what the data *is*, and quietly drawing the overlap
  // would produce a plausible histogram of something nobody measured.
  if (edges.length !== counts.length + 1) {
    return (
      <Alert tone="danger" title="This histogram cannot be drawn" className={className}>
        The response carried {counts.length} bins but {edges.length} edges. A histogram needs exactly
        one more edge than bins, so nothing is plotted rather than guessing which end to trim.
      </Alert>
    );
  }

  if (counts.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />;
  }

  const total = counts.reduce((sum, count) => sum + count, 0);
  const ticks = niceTicks(0, Math.max(...counts, 0));
  const shelf = plot(WIDTH, height, MARGIN);
  const x = band(counts.length, [shelf.x0, shelf.x1], 0);
  const y = linear({ min: ticks.min, max: ticks.max }, [shelf.y0, shelf.y1]);

  const rows: readonly Row[] = counts.map((count, index) => ({
    index,
    range: `${formatEdge(edges[index] ?? 0)} – ${formatEdge(edges[index + 1] ?? 0)}`,
    count,
  }));

  const columns: readonly Column<Row>[] = [
    { id: 'range', header: 'Bin', rowHeader: true, cell: (row) => row.range },
    { id: 'count', header: 'Count', numeric: true, cell: (row) => formatCount(row.count) },
    {
      id: 'share',
      header: 'Share',
      numeric: true,
      cell: (row) => (total === 0 ? '—' : formatPercent(row.count / total)),
    },
  ];

  // One label per bin is unreadable past a dozen bins, and the edges are the useful landmarks
  // anyway — so the axis is labelled at every nth *left* edge plus the final right edge.
  const every = Math.ceil(counts.length / 10);

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
          rows={rows}
          rowKey={(row) => row.index}
        />
      }
    >
      <ValueGrid plot={shelf} ticks={ticks} scale={y} />
      <ValueAxis plot={shelf} ticks={ticks} scale={y} format={formatCount} />
      <CategoryAxis
        plot={shelf}
        band={x}
        labels={counts.map((_, index) => formatEdge(edges[index] ?? 0))}
        every={every}
      />
      {/* The closing edge, which no bin's left side reports. */}
      <text
        x={shelf.x1}
        y={shelf.y0 + 14}
        textAnchor="end"
        className="fill-content-muted text-[10px] font-mono"
        aria-hidden="true"
      >
        {formatEdge(edges[edges.length - 1] ?? 0)}
      </text>
      {counts.map((count, index) => {
        const top = y(count);
        const drawn = count === 0 ? 0 : Math.max(shelf.y0 - top, 1);
        // Unlike a bar chart, an empty histogram bin draws nothing: the bin is already visible as a
        // gap between its neighbours, and a stub would read as a count of one.
        if (drawn === 0) return null;
        return (
          <rect
            key={index}
            x={round(x.start(index))}
            y={round(shelf.y0 - drawn)}
            width={round(x.width)}
            height={round(drawn)}
            className={fillClass('c1')}
            stroke="rgb(var(--surface-raised))"
            strokeWidth={0.5}
          />
        );
      })}
    </ChartFrame>
  );
}
