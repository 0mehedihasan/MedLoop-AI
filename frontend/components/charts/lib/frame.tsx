/**
 * MedLoop AI — the frame every chart draws inside: `ChartFrame`, the axes, and the legend.
 *
 * ## Every chart carries its numbers
 *
 * `transcript` is required, not optional. A heat-map or a line is a *summary* of a table, and this
 * project has to be able to answer "what exactly is that value" without a tooltip — for a screen
 * reader, for a printout, and for the researcher who is about to quote the figure. So each chart
 * renders a real `<table>` inside a `<details>` beneath itself. Collapsed by default because a page
 * of expanded tables is unreadable; present in the DOM always, because a number that only exists on
 * hover does not exist.
 *
 * ## No measurement, no `ResizeObserver`
 *
 * The SVG has a fixed `viewBox` and `width: 100%`, so the browser scales it uniformly. Text scales
 * with the chart, which is the price; in exchange a chart renders identically on the server, in a
 * test and in a print preview, and there is no first-paint reflow. See `scale.ts`.
 *
 * ## `role="img"`
 *
 * Without it, assistive technology walks the shapes. With it, the chart is one node with one name —
 * and the detail lives in the transcript, which is a far better reading experience than sixty
 * unlabelled `<rect>` elements.
 */

import type { ReactElement, ReactNode } from 'react';

import { cx } from '@/components/ui/cx';
import type { Band, Plot, Scale, Ticks } from './scale';
import { round } from './scale';

export interface ChartFrameProps {
  /** The chart's accessible name — what it shows, not "chart". Also the hover tooltip. */
  readonly ariaLabel: string;
  readonly width: number;
  readonly height: number;
  /** The SVG body. Drawn in the coordinate space `width × height` describes. */
  readonly children: ReactNode;
  readonly legend?: ReactNode;
  /** The same data as a `<table>`. Required — see the header note. */
  readonly transcript: ReactNode;
  readonly transcriptLabel?: string;
  readonly className?: string;
}

export function ChartFrame({
  ariaLabel,
  width,
  height,
  children,
  legend,
  transcript,
  transcriptLabel = 'Show the numbers',
  className,
}: ChartFrameProps): ReactElement {
  return (
    <figure className={cx('flex flex-col gap-2', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
        {children}
      </svg>
      {legend}
      <details className="group">
        <summary className="w-fit cursor-pointer rounded text-xs text-content-secondary underline decoration-edge-strong underline-offset-2 hover:text-content-primary focus-visible:outline-none focus-visible:ring focus-visible:ring-edge-focus">
          {transcriptLabel}
        </summary>
        <div className="pt-2">{transcript}</div>
      </details>
    </figure>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Axes
 *
 * Shared so that two charts on one screen cannot disagree about where a gridline sits or how
 * a tick is labelled — which is the specific way hand-rolled charts start looking homemade.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** 10 px in the chart's own coordinates. Uniform scaling means this is a *relative* size. */
const TICK_TEXT = 'fill-content-muted text-[10px] font-mono';

export interface AxisProps {
  readonly plot: Plot;
  readonly ticks: Ticks;
  /** The value → screen mapping for the axis being drawn. */
  readonly scale: Scale;
}

/**
 * Horizontal rules at every value tick.
 *
 * `stroke-edge-subtle`, never the text colour: a gridline that competes with the data is worse than
 * no gridline. The zero line is the one exception — it is a real boundary, so it is drawn stronger.
 */
export function ValueGrid({ plot, ticks, scale }: AxisProps): ReactElement {
  return (
    <g aria-hidden="true">
      {ticks.values.map((value) => {
        const y = round(scale(value));
        const zero = value === 0;
        return (
          <line
            key={value}
            x1={plot.x0}
            x2={plot.x1}
            y1={y}
            y2={y}
            className={zero ? 'stroke-edge' : 'stroke-edge-subtle'}
            strokeWidth={1}
          />
        );
      })}
    </g>
  );
}

export interface ValueAxisProps extends AxisProps {
  /** Defaults to the tick's own decimal places, which `niceTicks` already worked out. */
  readonly format?: (value: number) => string;
}

/** The labelled value axis, on the left. Labels sit outside `plot.x0`, in the left margin. */
export function ValueAxis({ plot, ticks, scale, format }: ValueAxisProps): ReactElement {
  const label = format ?? ((value: number) => value.toFixed(ticks.digits));
  return (
    <g aria-hidden="true">
      {ticks.values.map((value) => (
        <text
          key={value}
          x={plot.x0 - 6}
          y={round(scale(value))}
          textAnchor="end"
          dominantBaseline="middle"
          className={TICK_TEXT}
        >
          {label(value)}
        </text>
      ))}
    </g>
  );
}

export interface CategoryAxisProps {
  readonly plot: Plot;
  readonly band: Band;
  readonly labels: readonly string[];
  /**
   * Draw every nth label. Thirteen dates in a 720-wide chart fit; ninety do not, and overlapping
   * labels are less useful than fewer of them. The caller decides because only it knows the count.
   */
  readonly every?: number;
}

/** The category axis, along the bottom, plus the baseline rule the bars stand on. */
export function CategoryAxis({ plot, band, labels, every = 1 }: CategoryAxisProps): ReactElement {
  const step = Math.max(1, Math.floor(every));
  return (
    <g aria-hidden="true">
      <line
        x1={plot.x0}
        x2={plot.x1}
        y1={plot.y0}
        y2={plot.y0}
        className="stroke-edge"
        strokeWidth={1}
      />
      {labels.map((text, index) =>
        index % step === 0 ? (
          <text
            key={`${text}-${index}`}
            x={round(band.centre(index))}
            y={plot.y0 + 14}
            textAnchor="middle"
            className={TICK_TEXT}
          >
            {text}
          </text>
        ) : null,
      )}
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Legend
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface LegendItem {
  readonly key: string;
  readonly label: string;
  /** A `bg-chart-*` class. A literal, because Tailwind cannot see a computed one (`scale.ts`). */
  readonly swatch: string;
  /** Optional trailing figure — a count or share — so the legend doubles as a small summary. */
  readonly value?: string;
}

export interface LegendProps {
  readonly items: readonly LegendItem[];
  readonly className?: string;
}

/**
 * A `<ul>`, not a row of `<span>`s: it is a list, and a screen reader announcing "list, four items"
 * is doing something useful. `aria-hidden` is deliberately *not* set — unlike the axes, the legend is
 * the only place the series names appear next to their colours.
 */
export function Legend({ items, className }: LegendProps): ReactElement {
  return (
    <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5 text-xs text-content-secondary">
          <span className={cx('h-2 w-2 shrink-0 rounded-sm', item.swatch)} aria-hidden="true" />
          {item.label}
          {item.value === undefined ? null : (
            <span className="font-mono text-content-muted">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
