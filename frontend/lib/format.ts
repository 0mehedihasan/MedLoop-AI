/**
 * MedLoop AI — display formatting.
 *
 * The one rule this module exists to enforce: **a missing value is never formatted as zero.**
 * Every function takes `number | null | undefined` and returns {@link NO_VALUE} for the absent
 * case, because "0.0% accuracy" and "not measured" look identical once a chart or a table has
 * rounded them, and only one of those two is a claim about a model (CLAUDE.md §2.3).
 *
 * Locale is fixed to `en-GB`, not the visitor's. A researcher pasting a figure into a paper needs
 * the same decimal separator every time, and `Intl` defaults would otherwise vary by machine.
 */

/** En dash, not a hyphen and not "N/A" — it reads as "nothing here" without asserting a reason. */
export const NO_VALUE = '–';

const LOCALE = 'en-GB';

function isAbsent(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Numbers
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** Thousands-separated integer. Used for every count in the app. */
export function formatCount(value: number | null | undefined): string {
  if (isAbsent(value)) return NO_VALUE;
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(value);
}

/**
 * A `0 … 1` ratio as a percentage. `digits` defaults to 1: metrics are reported to one decimal
 * place throughout, and a second decimal implies a precision the test-set size does not support.
 */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (isAbsent(value)) return NO_VALUE;
  return `${new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value * 100)}%`;
}

/** A metric already on a `0 … 1` scale, shown as a decimal (`0.842`) for tables that compare them. */
export function formatMetric(value: number | null | undefined, digits = 3): string {
  if (isAbsent(value)) return NO_VALUE;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Model confidence. Same shape as {@link formatPercent}; named separately so intent is greppable. */
export function formatConfidence(value: number | null | undefined): string {
  return formatPercent(value, 1);
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Dates and durations
 *
 * Every timestamp from the API is ISO-8601 with an offset. An unparseable string returns
 * {@link NO_VALUE} rather than `Invalid Date`, which is what `toLocaleString` would otherwise put
 * on screen.
 * ──────────────────────────────────────────────────────────────────────────────────────── */

function parse(iso: string | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso === '') return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `05 Sep 2026` — month as text, so `05/09` vs `09/05` can never be misread. */
export function formatDate(iso: string | null | undefined): string {
  const date = parse(iso);
  if (date === null) return NO_VALUE;
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** `05 Sep 2026, 14:32` — 24-hour, because an audit row with `2:32` and no meridiem is useless. */
export function formatDateTime(iso: string | null | undefined): string {
  const date = parse(iso);
  if (date === null) return NO_VALUE;
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** `14:32:05`. For the log table, where the date is already a column. */
export function formatTime(iso: string | null | undefined): string {
  const date = parse(iso);
  if (date === null) return NO_VALUE;
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/** `YYYY-MM-DD` in **local** time, which is the form every date query parameter takes. */
export function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * A millisecond span as `1.4 s` / `2 m 05 s` / `1 h 12 m`. Annotation time is measured in seconds,
 * training in hours, and one function has to read sensibly across both.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (isAbsent(ms) || ms < 0) return NO_VALUE;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes} m ${`${seconds}`.padStart(2, '0')} s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${`${minutes % 60}`.padStart(2, '0')} m`;
}

/**
 * `3 minutes ago` / `in 2 hours`. `now` is injectable so this is testable without freezing time,
 * and so a server-rendered value can be recomputed on the client without a hydration mismatch.
 */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  const date = parse(iso);
  if (date === null) return NO_VALUE;
  const deltaSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const steps: readonly [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.348],
    ['month', 12],
  ];
  let value = deltaSeconds;
  for (const [unit, span] of steps) {
    if (Math.abs(value) < span) return rtf.format(Math.round(value), unit);
    value /= span;
  }
  return rtf.format(Math.round(value), 'year');
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Text
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `NOT_REVIEWED` → `Not reviewed`. Used for every enum member the UI shows, so a label never needs
 * a hand-written map — and a new enum member therefore cannot arrive on screen as `undefined`.
 *
 * Deliberately not title case: `Not Reviewed` reads like a proper noun.
 */
export function humaniseEnum(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return NO_VALUE;
  const words = value.toLowerCase().split('_');
  const [first, ...rest] = words;
  if (first === undefined) return NO_VALUE;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
}

/** Middle-truncates a long identifier or path so both ends stay readable in a fixed-width cell. */
export function truncateMiddle(value: string, max = 40): string {
  if (value.length <= max) return value;
  const keep = Math.floor((max - 1) / 2);
  return `${value.slice(0, keep)}…${value.slice(value.length - keep)}`;
}

/** `1.4 MB`. Binary units, because that is what the filesystem reports. */
export function formatBytes(bytes: number | null | undefined): string {
  if (isAbsent(bytes) || bytes < 0) return NO_VALUE;
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/** `1024 × 768`, or {@link NO_VALUE} when either dimension is unknown. */
export function formatPixelSize(
  width: number | null | undefined,
  height: number | null | undefined,
): string {
  if (isAbsent(width) || isAbsent(height)) return NO_VALUE;
  return `${formatCount(width)} × ${formatCount(height)}`;
}

