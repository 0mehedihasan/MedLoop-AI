/**
 * MedLoop AI — the scale and tick maths shared by every chart in `components/charts/`.
 *
 * Pure functions, no React, no DOM. That is deliberate: this is the part of a chart that can be
 * *wrong* — an axis that does not start where it claims, a tick step that hides a plateau — so it is
 * kept where it can be read on one screen and, later, unit-tested without a renderer.
 *
 * ## Why there is no chart library here
 *
 * Recorded in CLAUDE.md §11.5: six chart types, all simple. What a library would mainly buy us is
 * responsive measurement, and we do not need it — every chart draws into a fixed coordinate space
 * and is scaled by the browser through `viewBox`, uniformly, so nothing is distorted and nothing has
 * to be measured before the first paint. The cost of that choice is that text scales with the chart;
 * the benefit is that a chart renders identically on the server, in a test, and in a print preview.
 *
 * ## The one rule the callers must keep
 *
 * A `y` axis for a *count* starts at zero. `niceTicks` is therefore usually called with `min = 0`,
 * and the charts that do not (a metric already living in `[0, 1]`, for instance) say so at the call
 * site. A truncated count axis exaggerates a difference, which in this project would be a claim
 * about a model.
 */

/** Screen space is y-down, so a range of `[bottom, top]` is the normal case, not an error. */
export type Range = readonly [number, number];

export interface Extent {
  readonly min: number;
  readonly max: number;
}

/** `null` for an empty input: an extent of nothing is not `{0, 0}`, and pretending otherwise draws an axis. */
export function extent(values: readonly number[]): Extent | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let seen = false;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    seen = true;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return seen ? { min, max } : null;
}

export interface Ticks extends Extent {
  /** Ascending, inclusive of both `min` and `max`. Always at least two entries. */
  readonly values: readonly number[];
  readonly step: number;
  /** Decimal places the labels need, derived from `step` so `0.25` never prints as `0.3`. */
  readonly digits: number;
}

/** 1, 2, 5, 10 … — the steps that read as round numbers at a glance. */
function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Rounds `[min, max]` outward to a whole number of pleasant steps.
 *
 * A degenerate domain is handled rather than guarded: every value identical is a real dataset (a
 * counter that has not moved), and it must produce a readable axis instead of a division by zero.
 */
export function niceTicks(min: number, max: number, target = 5): Ticks {
  const count = Math.max(2, Math.floor(target));
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : 0;
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) {
    // Widen by a unit the eye can accept: 1 for integers-ish, 10 % otherwise, never 0.
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad;
    hi += pad;
    if (min === 0 && max === 0) lo = 0;
  }
  const step = niceStep((hi - lo) / count);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  const values: number[] = [];
  // Multiply rather than accumulate: repeated addition of 0.1 drifts, and a drifted tick label is
  // the kind of defect nobody looks for.
  const steps = Math.round((end - start) / step);
  for (let index = 0; index <= steps; index += 1) {
    values.push(Number((start + index * step).toFixed(digits + 6)));
  }
  return { values, min: start, max: end, step, digits };
}

export type Scale = (value: number) => number;

/** Maps `domain` onto `range` linearly. A zero-width domain pins everything to the range midpoint. */
export function linear(domain: Extent, range: Range): Scale {
  const span = domain.max - domain.min;
  const [from, to] = range;
  if (span === 0) {
    const mid = (from + to) / 2;
    return () => mid;
  }
  const factor = (to - from) / span;
  return (value) => from + (value - domain.min) * factor;
}

export interface Band {
  /** Distance between the starts of two adjacent bands, including the gap. */
  readonly step: number;
  /** Drawn width of one band. */
  readonly width: number;
  readonly start: (index: number) => number;
  readonly centre: (index: number) => number;
}

/**
 * Categorical positions for bars and histogram bins.
 *
 * `padding` is the fraction of a step left as the gap, so `0` gives touching bars — which is right
 * for a histogram, where a gap would imply the bins are not contiguous, and wrong for a bar chart.
 */
export function band(count: number, range: Range, padding = 0.2): Band {
  const [from, to] = range;
  const safeCount = Math.max(1, Math.floor(count));
  const step = (to - from) / safeCount;
  const clamped = Math.min(Math.max(padding, 0), 0.9);
  const width = step * (1 - clamped);
  const offset = (step - width) / 2;
  return {
    step,
    width,
    start: (index) => from + index * step + offset,
    centre: (index) => from + index * step + step / 2,
  };
}

export interface Margin {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface Plot {
  readonly width: number;
  readonly height: number;
  readonly margin: Margin;
  /** Left, right, top and bottom edges of the drawable area, in the SVG's own coordinates. */
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly innerWidth: number;
  readonly innerHeight: number;
}

/** `y0` is the *bottom* and `y1` the top, matching how a value axis is read rather than how SVG counts. */
export function plot(width: number, height: number, margin: Margin): Plot {
  return {
    width,
    height,
    margin,
    x0: margin.left,
    x1: width - margin.right,
    y0: height - margin.bottom,
    y1: margin.top,
    innerWidth: Math.max(0, width - margin.left - margin.right),
    innerHeight: Math.max(0, height - margin.top - margin.bottom),
  };
}

/** `x,y x,y …` for a `<polyline>`. Coordinates are rounded: sub-pixel precision only inflates the DOM. */
export function points(pairs: readonly (readonly [number, number])[]): string {
  return pairs.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A donut segment, as a filled path from `fromTurn` to `toTurn` where a turn is a full revolution in
 * `[0, 1)` measured clockwise from twelve o'clock.
 *
 * Turns rather than radians because every caller has a *fraction* — `count / total` — and converting
 * it twice is where a chart ends up drawn anticlockwise.
 */
export function donutSegment(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  fromTurn: number,
  toTurn: number,
): string {
  const sweep = Math.min(Math.max(toTurn - fromTurn, 0), 1);
  // A full circle cannot be drawn as one arc — start and end coincide, so the arc collapses. Two
  // half-turns is the standard fix and keeps the caller from having to special-case "everything".
  if (sweep >= 1) {
    return [
      donutSegment(cx, cy, outer, inner, 0, 0.5),
      donutSegment(cx, cy, outer, inner, 0.5, 1),
    ].join(' ');
  }
  const a0 = fromTurn * Math.PI * 2 - Math.PI / 2;
  const a1 = toTurn * Math.PI * 2 - Math.PI / 2;
  const large = sweep > 0.5 ? 1 : 0;
  const ox0 = round(cx + outer * Math.cos(a0));
  const oy0 = round(cy + outer * Math.sin(a0));
  const ox1 = round(cx + outer * Math.cos(a1));
  const oy1 = round(cy + outer * Math.sin(a1));
  const ix1 = round(cx + inner * Math.cos(a1));
  const iy1 = round(cy + inner * Math.sin(a1));
  const ix0 = round(cx + inner * Math.cos(a0));
  const iy0 = round(cy + inner * Math.sin(a0));
  return [
    `M ${ox0} ${oy0}`,
    `A ${outer} ${outer} 0 ${large} 1 ${ox1} ${oy1}`,
    `L ${ix1} ${iy1}`,
    `A ${inner} ${inner} 0 ${large} 0 ${ix0} ${iy0}`,
    'Z',
  ].join(' ');
}

/** The categorical ramp, as Tailwind token names. Seven, then it repeats — see `tailwind.config.ts`. */
export const CATEGORICAL = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'] as const;

export type CategoricalKey = (typeof CATEGORICAL)[number];

export function categorical(index: number): CategoricalKey {
  return CATEGORICAL[index % CATEGORICAL.length] ?? 'c1';
}

/**
 * `fill-chart-c1`-style class for a ramp index.
 *
 * A lookup table, not a template string: Tailwind's extractor reads source text, so a class it never
 * sees written out is a class it never generates, and the chart renders in the browser's default
 * black. This is the single most common way a hand-rolled chart "works locally and not in a build".
 */
const FILL: Readonly<Record<CategoricalKey, string>> = {
  c1: 'fill-chart-c1',
  c2: 'fill-chart-c2',
  c3: 'fill-chart-c3',
  c4: 'fill-chart-c4',
  c5: 'fill-chart-c5',
  c6: 'fill-chart-c6',
  c7: 'fill-chart-c7',
};

const STROKE: Readonly<Record<CategoricalKey, string>> = {
  c1: 'stroke-chart-c1',
  c2: 'stroke-chart-c2',
  c3: 'stroke-chart-c3',
  c4: 'stroke-chart-c4',
  c5: 'stroke-chart-c5',
  c6: 'stroke-chart-c6',
  c7: 'stroke-chart-c7',
};

/** For legend swatches, which are HTML `<span>`s rather than SVG shapes. */
const BACKGROUND: Readonly<Record<CategoricalKey, string>> = {
  c1: 'bg-chart-c1',
  c2: 'bg-chart-c2',
  c3: 'bg-chart-c3',
  c4: 'bg-chart-c4',
  c5: 'bg-chart-c5',
  c6: 'bg-chart-c6',
  c7: 'bg-chart-c7',
};

export function fillClass(key: CategoricalKey): string {
  return FILL[key];
}

export function strokeClass(key: CategoricalKey): string {
  return STROKE[key];
}

export function bgClass(key: CategoricalKey): string {
  return BACKGROUND[key];
}

/**
 * The sequential ramp, for a matrix cell whose colour encodes *magnitude* rather than identity.
 *
 * Six steps, lightest first. A continuous interpolation would need a colour space and a hex literal
 * in a component, which the token rule forbids; six banded steps read a confusion matrix perfectly
 * well and keep every colour in `globals.css` where it can be checked for contrast.
 */
const SEQUENTIAL_BG = [
  'bg-chart-s1',
  'bg-chart-s2',
  'bg-chart-s3',
  'bg-chart-s4',
  'bg-chart-s5',
  'bg-chart-s6',
] as const;

/** `fraction` outside `[0, 1]` is clamped rather than rejected: a rounded share can land at 1.0000001. */
export function sequentialBg(fraction: number): string {
  const safe = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0;
  const index = Math.min(SEQUENTIAL_BG.length - 1, Math.floor(safe * SEQUENTIAL_BG.length));
  return SEQUENTIAL_BG[index] ?? SEQUENTIAL_BG[0];
}

/**
 * Whether a cell at `fraction` needs light text.
 *
 * The two darkest steps of the ramp take `content-inverse`; the rest take `content-primary`. Stated
 * as a threshold here rather than eyeballed per chart, because a matrix diagonal is exactly where
 * dark-on-dark text hides the largest numbers on the screen.
 */
export function sequentialNeedsInverseText(fraction: number): boolean {
  const safe = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0;
  return safe >= 4 / SEQUENTIAL_BG.length;
}
