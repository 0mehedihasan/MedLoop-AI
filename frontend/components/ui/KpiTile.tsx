/**
 * MedLoop AI — Figures: `KpiTile`, `DefinitionList`, `ProgressBar`.
 *
 * ## The one rule these three exist to enforce
 *
 * A figure the server did not send renders as {@link Unavailable}, never as `0`. `value` is therefore
 * `ReactNode | null` and `null` is not a formatting edge case — it is a different statement about the
 * world. "0 validated samples" is a measurement; "no active model, so there is no accuracy" is the
 * absence of one, and after rounding to one decimal place they look the same on screen (§2.3).
 *
 * Deltas are the same story. `delta === null` means "nothing to compare against" — a first model
 * version, or a candidate measured on a different locked test version, which the backend refuses to
 * compare at all (§9). It is not `0.000`.
 *
 * ## Trend arrows
 *
 * A KPI tile can show a delta, and the arrow direction is *not* the sign of the number: skip rate going
 * up is bad, macro-F1 going up is good. `higherIsBetter` decides the tone, and the sign decides the
 * arrow. Both are always accompanied by the signed figure, so nothing depends on reading the colour.
 */

import type { ReactElement, ReactNode } from 'react';

import { cx } from './cx';
import { SR_ONLY } from './project';
import { Unavailable } from './states';

export interface KpiTileProps {
  readonly label: string;
  /** Pre-formatted by `lib/format.ts`. `null` means the API omitted it. */
  readonly value: ReactNode | null;
  /** Shown in place of the value when it is `null`. Required then — "not measured" needs a reason. */
  readonly unavailableReason?: string;
  /** A unit or qualifier after the figure: "samples", "of 1,000", "px". */
  readonly suffix?: string;
  /** Signed change against the previous version. `null` means there is nothing to compare against. */
  readonly delta?: number | null;
  /** Pre-formatted delta text, e.g. `+0.021` or `+2.1 pp`. The component never formats numbers. */
  readonly deltaLabel?: string;
  /** `false` for skip rate, correction rate, loss — anything where up is worse. */
  readonly higherIsBetter?: boolean;
  /** One line under the figure: the definition, the window, the denominator. */
  readonly hint?: string;
  /** Top-right slot — a `<DemoBadge />` or a `<StatusPill />`. */
  readonly meta?: ReactNode;
  readonly className?: string;
}

/**
 * One figure, its label, and optionally how it moved. Sized for a four-across grid on a laptop and a
 * single column below `md`.
 *
 * The value is a `<p>` and not an `<output>`: nothing here is the result of a calculation the user just
 * asked for, and `<output>` is an implicit live region, which would make a dashboard of eight tiles
 * announce itself eight times on every poll.
 */
export function KpiTile({
  label,
  value,
  unavailableReason,
  suffix,
  delta = null,
  deltaLabel,
  higherIsBetter = true,
  hint,
  meta,
  className,
}: KpiTileProps): ReactElement {
  return (
    <div
      className={cx(
        'flex flex-col gap-1.5 rounded-md border border-edge bg-surface-raised p-4 shadow-panel',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-content-secondary">{label}</p>
        {meta}
      </div>
      {value === null ? (
        <Unavailable reason={unavailableReason ?? 'Not measured'} />
      ) : (
        <p className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold text-content-primary [font-variant-numeric:tabular-nums]">
            {value}
          </span>
          {suffix === undefined ? null : (
            <span className="text-xs text-content-muted">{suffix}</span>
          )}
        </p>
      )}
      {delta === null || value === null ? null : (
        <Delta value={delta} label={deltaLabel} higherIsBetter={higherIsBetter} />
      )}
      {hint === undefined ? null : (
        <p className="max-w-prose text-xs text-content-muted">{hint}</p>
      )}
    </div>
  );
}

interface DeltaProps {
  readonly value: number;
  readonly label: string | undefined;
  readonly higherIsBetter: boolean;
}

/**
 * Direction from the sign, tone from `higherIsBetter`, and the signed number always visible. An exact
 * `0` is neither an improvement nor a regression, so it gets the neutral treatment and a dash glyph
 * rather than a flat arrow that reads as "unchanged, and that is fine".
 */
function Delta({ value, label, higherIsBetter }: DeltaProps): ReactElement {
  const improved = higherIsBetter ? value > 0 : value < 0;
  const tone =
    value === 0 ? 'text-content-muted' : improved ? 'text-status-ok' : 'text-status-danger';
  const glyph = value === 0 ? 'M2 7h8v2H2z' : value > 0 ? 'M6 2l4 6H2z' : 'M6 10 2 4h8z';
  const spoken = value === 0 ? 'unchanged' : improved ? 'improved' : 'regressed';
  const text = label ?? (value > 0 ? `+${value}` : String(value));

  return (
    <p className={cx('flex items-center gap-1 text-xs font-medium', tone)}>
      <svg viewBox="0 0 12 12" aria-hidden="true" className="h-2.5 w-2.5 fill-current">
        <path d={glyph} />
      </svg>
      <span>
        {text} <span className="font-normal text-content-muted">({spoken})</span>
      </span>
    </p>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * DefinitionList
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface DefinitionItem {
  readonly term: string;
  /** `null` renders {@link Unavailable}, for the same reason as {@link KpiTile}. */
  readonly value: ReactNode | null;
  readonly unavailableReason?: string;
  /** Monospace the value — paths, hashes, version strings, label codes. */
  readonly mono?: boolean;
}

export interface DefinitionListProps {
  readonly items: readonly DefinitionItem[];
  /** `rows` stacks term above value; `columns` puts the term in a fixed left column. */
  readonly layout?: 'rows' | 'columns';
  readonly className?: string;
}

/**
 * A real `<dl>`. This is the metadata block on every detail surface — image provenance, model
 * hyperparameters, batch composition, a settings-change record — and those are term/value pairs, which
 * is what a description list is for. A two-column table would claim the values are comparable across
 * rows; they are not.
 */
export function DefinitionList({
  items,
  layout = 'columns',
  className,
}: DefinitionListProps): ReactElement {
  return (
    <dl
      className={cx(
        layout === 'columns'
          ? 'grid grid-cols-[minmax(7rem,max-content)_1fr] gap-x-4 gap-y-2 text-sm'
          : 'flex flex-col gap-3 text-sm',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.term} className={layout === 'columns' ? 'contents' : 'flex flex-col gap-0.5'}>
          <dt className="text-xs text-content-secondary">{item.term}</dt>
          <dd className={cx('text-content-primary', item.mono === true && 'font-mono text-xs')}>
            {item.value === null ? (
              <Unavailable reason={item.unavailableReason ?? 'Not recorded'} />
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * ProgressBar
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface ProgressBarProps {
  /** The accessible name — "Validated samples toward the retraining threshold". Always required. */
  readonly label: string;
  /** In the same unit as `max`. `null` is *indeterminate*: running, with no known fraction. */
  readonly value: number | null;
  readonly max: number;
  /** Human reading of the figure: "731 of 1,000". Announced instead of the raw number. */
  readonly valueText?: string;
  readonly labelHidden?: boolean;
  readonly tone?: 'info' | 'ok' | 'warn';
  readonly className?: string;
}

const BAR_TONE: Readonly<Record<'info' | 'ok' | 'warn', string>> = {
  info: 'bg-status-info',
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
};

/**
 * Used for the HITL counter against its threshold and for per-epoch training progress.
 *
 * An indeterminate bar draws **no fill** and says so in words. The usual answer — an animated sliver
 * sliding along the track — is unavailable here on principle and in practice: `prefers-reduced-motion`
 * flattens every animation globally (`globals.css`), so the sliver would freeze at whatever position
 * it started in and read as a real, small percentage.
 *
 * The fraction is clamped for *rendering only*. A `value` above `max` is a real condition — the
 * threshold can be lowered below the current count (§8.4) — so the bar fills to 100 % while the text
 * keeps saying `1,240 of 500`; the count is never rewritten to fit the bar.
 */
export function ProgressBar({
  label,
  value,
  max,
  valueText,
  labelHidden = false,
  tone = 'info',
  className,
}: ProgressBarProps): ReactElement {
  const safeMax = max > 0 ? max : 1;
  const fraction = value === null ? null : Math.min(1, Math.max(0, value / safeMax));
  const text = valueText ?? (value === null ? 'Progress unknown' : `${value} of ${max}`);

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className={labelHidden ? SR_ONLY : 'font-medium text-content-secondary'}>{label}</span>
        <span className="text-content-muted [font-variant-numeric:tabular-nums]">{text}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        // Omitted entirely when indeterminate — that is what the ARIA spec uses to mean "unknown".
        aria-valuenow={value === null ? undefined : value}
        aria-valuetext={text}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-inset"
      >
        {fraction === null ? null : (
          <span
            aria-hidden="true"
            className={cx('block h-full rounded-full transition-[width] duration-slow', BAR_TONE[tone])}
            style={{ width: `${(fraction * 100).toFixed(2)}%` }}
          />
        )}
      </div>
    </div>
  );
}
