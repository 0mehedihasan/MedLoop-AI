/**
 * MedLoop AI — Status: `Badge`, `StatusPill`, `ServiceStateDot`.
 *
 * ## One tone table, and what is deliberately *not* in it
 *
 * {@link TONE_BY_STATUS} is the single lookup from a domain enum value to a colour tone
 * (`medloop-frontend.md`: "a second colour lookup for the same enum is a defect"). It is typed as
 * `Record<StatusValue, Tone>`, so TypeScript requires every distinct member of every listed enum to
 * appear exactly once — a new enum member fails the type check instead of rendering colourless, and
 * a duplicate key is a syntax error rather than a silent last-wins.
 *
 * Three families are kept out on purpose:
 *
 *  - **Disease labels.** A diagnosis is never coloured with a status tone; red/green would present
 *    it as a verdict (CLAUDE.md §11.2). Classes draw from the categorical chart ramp.
 *  - **`AnnotationSource`.** Human and AI geometry already have their own colours on the canvas.
 *    Adding them here would be exactly the second lookup the rule forbids.
 *  - **Configuration and taxonomy** — `Role`, `TrainingDevice`, `PromotionMode`,
 *    `PromotionMetric`, `AnnotationType`, `SkipReason`. These are not states; a tone would imply
 *    that one setting is healthier than another. Render them with {@link Badge}.
 */

import type { ReactElement, ReactNode } from 'react';

import { cx } from './cx';
import { humaniseEnum } from '@/lib/format';
import { ServiceState } from '@/types/domain';
import type {
  DataStatus,
  DatasetStatus,
  HitlCycleStage,
  ImageLifecycle,
  ImageSplit,
  LogLevel,
  ModelStatus,
  ReviewStatus,
  TrainingBatchStatus,
  TrainingJobStatus,
} from '@/types/domain';

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'unknown';

/** Every enum whose members {@link StatusPill} can render. */
export type StatusValue =
  | ImageSplit
  | ReviewStatus
  | ImageLifecycle
  | DataStatus
  | DatasetStatus
  | ModelStatus
  | TrainingBatchStatus
  | TrainingJobStatus
  | HitlCycleStage
  | ServiceState
  | LogLevel;

/**
 * Overlapping values across enums resolve to one key, which is safe here because every collision
 * carries the same meaning: `COMPLETED` is `ok` whether it describes a batch or a job, `ARCHIVED` is
 * `neutral` whether it describes an image, a dataset or a model.
 *
 * Two assignments are judgement calls and are written down so they are not "fixed" later:
 *
 *  - `LOCKED` is `warn`, not `ok`. A locked test version refuses mutations (§2.5); someone about to
 *    reassign a split needs to notice the constraint before the API refuses them.
 *  - `READY_FOR_RETRAINING` is `warn`, not `info`. It is the one loop stage that cannot progress
 *    without a human action, and `warn` is this palette's "you are needed here".
 */
export const TONE_BY_STATUS: Readonly<Record<StatusValue, Tone>> = {
  // ImageSplit
  UNASSIGNED: 'neutral',
  TRAIN: 'info',
  VALIDATION: 'info',
  TEST: 'info',
  UNUSED: 'neutral',
  // ReviewStatus
  NOT_REVIEWED: 'neutral',
  IN_REVIEW: 'info',
  VALIDATED: 'ok',
  SKIPPED: 'warn',
  // ImageLifecycle
  STAGING: 'neutral',
  ASSIGNED: 'info',
  TRAINING_USED: 'neutral',
  ARCHIVED: 'neutral',
  // DatasetStatus
  ACTIVE: 'ok',
  LOCKED: 'warn',
  // ModelStatus
  CANDIDATE: 'info',
  REJECTED: 'danger',
  // TrainingBatchStatus / TrainingJobStatus
  CREATED: 'neutral',
  QUEUED: 'neutral',
  RUNNING: 'info',
  TRAINING: 'info',
  EVALUATING: 'info',
  COMPLETED: 'ok',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  // HitlCycleStage
  NOT_READY: 'neutral',
  READY_FOR_RETRAINING: 'warn',
  PROMOTED: 'ok',
  // ServiceState
  ONLINE: 'ok',
  DEGRADED: 'warn',
  OFFLINE: 'danger',
  UNKNOWN: 'unknown',
  // LogLevel
  DEBUG: 'neutral',
  INFO: 'info',
  WARNING: 'warn',
  ERROR: 'danger',
  CRITICAL: 'danger',
};

/** Soft fill + matching edge + accessible foreground. One row per tone, used by pill and badge. */
const TONE_CLASS: Readonly<Record<Tone, string>> = {
  ok: 'border-status-ok-edge bg-status-ok-soft text-status-ok',
  warn: 'border-status-warn-edge bg-status-warn-soft text-status-warn',
  danger: 'border-status-danger-edge bg-status-danger-soft text-status-danger',
  info: 'border-status-info-edge bg-status-info-soft text-status-info',
  neutral: 'border-status-neutral-edge bg-status-neutral-soft text-status-neutral',
  unknown: 'border-status-unknown-edge bg-status-unknown-soft text-status-unknown',
};

const DOT_CLASS: Readonly<Record<Tone, string>> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  danger: 'bg-status-danger',
  info: 'bg-status-info',
  neutral: 'bg-status-neutral',
  unknown: 'bg-status-unknown',
};

const SHAPE = 'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs font-medium';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Badge
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface BadgeProps {
  readonly children: ReactNode;
  /** Defaults to `neutral`, which is the right answer for a taxonomy value. */
  readonly tone?: Tone;
  /** Monospace, for identifiers and codes — a label code, a model version, a batch number. */
  readonly mono?: boolean;
  readonly className?: string;
}

/** A tone-agnostic chip. Use it for anything that is not a *state*; see this file's header. */
export function Badge({
  children,
  tone = 'neutral',
  mono = false,
  className,
}: BadgeProps): ReactElement {
  return (
    <span className={cx(SHAPE, TONE_CLASS[tone], mono && 'font-mono', className)}>{children}</span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * StatusPill
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface StatusPillProps {
  readonly status: StatusValue;
  /** Overrides the humanised text. The tone still comes from `status`. */
  readonly label?: string;
  readonly className?: string;
}

/**
 * The pill always carries text, which is what satisfies "status is never colour-only" — the dot is
 * a secondary cue, not the signal. Text comes from `humaniseEnum`, so a new enum member reads as
 * `Ready for retraining` without anyone writing a label map.
 */
export function StatusPill({ status, label, className }: StatusPillProps): ReactElement {
  const tone = TONE_BY_STATUS[status];
  return (
    <span className={cx(SHAPE, TONE_CLASS[tone], className)}>
      <span aria-hidden="true" className={cx('h-1.5 w-1.5 rounded-full', DOT_CLASS[tone])} />
      {label ?? humaniseEnum(status)}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * ServiceStateDot
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface ServiceStateDotProps {
  readonly state: ServiceState;
  /** The service name — "Database", "Training worker". Always announced, even when hidden. */
  readonly label: string;
  /** Hide the visible text for a dense row. The `title` and `aria-label` still carry it. */
  readonly showLabel?: boolean;
  readonly className?: string;
}

/**
 * A dot alone would be colour-only, so the visible label is on by default and the accessible name
 * always includes both the service and its state.
 *
 * `UNKNOWN` gets a hollow ring rather than a filled dot: "we could not check" must not look like a
 * quieter version of "it is fine" (§2.3 — a check that could not run reports `UNKNOWN`, never
 * `ONLINE`).
 */
export function ServiceStateDot({
  state,
  label,
  showLabel = true,
  className,
}: ServiceStateDotProps): ReactElement {
  const tone = TONE_BY_STATUS[state];
  const text = `${label}: ${humaniseEnum(state)}`;
  return (
    <span
      className={cx('inline-flex items-center gap-2 text-xs text-content-secondary', className)}
      title={text}
      aria-label={text}
      role="img"
    >
      <span
        aria-hidden="true"
        className={cx(
          'h-2 w-2 shrink-0 rounded-full',
          state === ServiceState.UNKNOWN
            ? 'border-2 border-status-unknown bg-transparent'
            : DOT_CLASS[tone],
        )}
      />
      {showLabel ? <span>{label}</span> : null}
    </span>
  );
}
