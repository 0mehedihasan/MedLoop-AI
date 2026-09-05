'use client';

/**
 * MedLoop AI — the pieces `/analyze` and `/analyze/compare` share.
 *
 * ## One place that decides how a metric is shown
 *
 * `ClassificationMetrics` has five nullable fields, and every one of them is `null` for a reason the
 * user needs: the metric was not computed on this evaluation. Rendering `null` as `0.000` would be the
 * §2.3 failure in its purest form — a confident-looking number that no forward pass produced. So the
 * tiles come from here, `null` reaches `<Unavailable />`, and no screen gets to decide otherwise.
 *
 * ## The primary metric is highlighted, not recomputed
 *
 * Promotion compares one metric, named by `primary_promotion_metric` in the settings. This module can
 * mark which tile that is, so the number the decision actually rests on is visible — but it never
 * evaluates the criterion. `candidate − active >= minimum_improvement` is the server's arithmetic
 * (§9), and a client that repeated it would eventually disagree with the machine that decides.
 *
 * ## A localisation figure is meaningless without its threshold
 *
 * `localization_accuracy` is "the fraction of samples whose IoU clears a threshold", so §2.3 requires
 * publishing the threshold beside it. When `iou_threshold` is `null` the accuracy is shown as
 * unavailable rather than as a bare percentage, because a fraction over an unknown cut-off is not a
 * measurement anyone can interpret.
 */

import type { ReactElement, ReactNode } from 'react';

import { KpiTile } from '@/components/ui/KpiTile';
import type { DefinitionItem } from '@/components/ui/KpiTile';
import { formatCount, formatMetric, formatPercent } from '@/lib/format';
import { PromotionMetric } from '@/types/domain';
import type { ClassificationMetrics, LocalizationMetrics } from '@/types/domain';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Wording
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The one sentence this area is allowed to use for an absent model.
 *
 * `features/statistics/lib.ts` owns the same idea for the statistics screens; this one is phrased for
 * a registry rather than a chart, which is why it is a second constant and not an import — the two
 * screens are answering different questions ("nothing to compare against" versus "nothing is
 * registered").
 */
export const NO_MODEL_REASON =
  'No training run has completed on this machine, so no model version exists to analyse. Every figure on this screen is produced by an evaluation of a real model against the locked test set — until one runs, there is nothing to show.';

/** A metric the evaluation did not carry. Distinct from "no model at all". */
export const NOT_COMPUTED_REASON = 'This metric was not computed for this evaluation.';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Classification metrics
 * ──────────────────────────────────────────────────────────────────────────────────────── */

interface MetricSpec {
  readonly key: keyof ClassificationMetrics;
  readonly metric: PromotionMetric;
  readonly label: string;
  readonly hint: string;
}

/**
 * The five metrics, each tied to the `PromotionMetric` member that names it.
 *
 * The pairing is what lets a screen highlight the metric promotion currently depends on without a
 * second mapping from enum member to field name living somewhere else.
 */
export const METRIC_SPECS: readonly MetricSpec[] = [
  {
    key: 'accuracy',
    metric: PromotionMetric.ACCURACY,
    label: 'Accuracy',
    hint: 'Correct predictions over all test samples. Flattered by class imbalance.',
  },
  {
    key: 'macro_f1',
    metric: PromotionMetric.MACRO_F1,
    label: 'Macro F1',
    hint: 'Unweighted mean of the per-class F1 scores, so a rare class counts as much as a common one.',
  },
  {
    key: 'macro_precision',
    metric: PromotionMetric.MACRO_PRECISION,
    label: 'Macro precision',
    hint: 'Unweighted mean of per-class precision.',
  },
  {
    key: 'macro_recall',
    metric: PromotionMetric.MACRO_RECALL,
    label: 'Macro recall',
    hint: 'Unweighted mean of per-class recall.',
  },
  {
    key: 'auroc_macro',
    metric: PromotionMetric.AUROC_MACRO,
    label: 'AUROC (macro)',
    hint: 'Threshold-free separability, averaged over classes.',
  },
];

export interface MetricTilesProps {
  readonly metrics: ClassificationMetrics;
  /** Which tile carries the promotion decision. `null` when the setting has not been read. */
  readonly primary?: PromotionMetric | null;
  /** Same metrics from the version being compared against, for the signed delta. */
  readonly baseline?: ClassificationMetrics | null;
  readonly baselineLabel?: string;
}

/**
 * The five metrics as tiles.
 *
 * A delta is rendered only when *both* sides carried the metric. A missing baseline is not a delta of
 * zero, and "unchanged" is a claim about two measurements — one of which does not exist.
 */
export function MetricTiles({
  metrics,
  primary = null,
  baseline = null,
  baselineLabel,
}: MetricTilesProps): ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {METRIC_SPECS.map((spec) => {
        const value = metrics[spec.key];
        const before = baseline === null ? null : baseline[spec.key];
        const delta = value === null || before === null ? null : value - before;
        return (
          <KpiTile
            key={spec.key}
            label={spec.label}
            value={value === null ? null : formatMetric(value)}
            unavailableReason={NOT_COMPUTED_REASON}
            hint={
              primary === spec.metric
                ? `${spec.hint} This is the metric promotion is currently decided on.`
                : spec.hint
            }
            delta={delta}
            deltaLabel={
              delta === null
                ? undefined
                : `${delta > 0 ? '+' : ''}${formatMetric(delta)}${baselineLabel === undefined ? '' : ` vs ${baselineLabel}`}`
            }
            meta={primary === spec.metric ? <PrimaryChip /> : undefined}
          />
        );
      })}
    </div>
  );
}

/** A quiet marker, not a status: which metric the promotion rule reads is configuration, not health. */
function PrimaryChip(): ReactElement {
  return (
    <span className="rounded-sm border border-edge bg-surface-inset px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-content-secondary">
      Promotion metric
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Localisation metrics
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Localisation as definition rows, with the threshold published beside the accuracy it defines.
 *
 * Returned as data rather than as an element so the caller can put it in a `DefinitionList` of its
 * own choosing — the compare screen wants it in a column, the detail screen in a panel.
 */
export function localizationItems(
  localization: LocalizationMetrics | null,
): readonly DefinitionItem[] {
  if (localization === null) {
    return [
      {
        term: 'Localisation',
        value: null,
        unavailableReason:
          'This evaluation carried no localisation figures. IoU needs a human annotation and an AI region for the same image.',
      },
    ];
  }
  const threshold = localization.iou_threshold;
  return [
    {
      term: 'Mean IoU',
      value: localization.mean_iou === null ? null : formatMetric(localization.mean_iou),
      unavailableReason: NOT_COMPUTED_REASON,
    },
    {
      term:
        threshold === null
          ? 'Localisation accuracy'
          : `Localisation accuracy (IoU ≥ ${formatMetric(threshold, 2)})`,
      value:
        localization.localization_accuracy === null || threshold === null
          ? null
          : formatPercent(localization.localization_accuracy * 100),
      unavailableReason:
        threshold === null
          ? 'The IoU threshold was not reported, and a pass rate over an unknown cut-off cannot be read.'
          : NOT_COMPUTED_REASON,
    },
    {
      term: 'Samples with both regions',
      value: formatCount(localization.sample_count),
    },
  ];
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Small helpers
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** `null`-safe metric lookup by `PromotionMetric`, for the one figure a decision rests on. */
export function metricValue(
  metrics: ClassificationMetrics,
  metric: PromotionMetric,
): number | null {
  const spec = METRIC_SPECS.find((candidate) => candidate.metric === metric);
  if (spec === undefined) return null;
  return metrics[spec.key];
}

export interface FieldRowProps {
  readonly term: string;
  readonly children: ReactNode;
}

/** A one-off definition row for a panel that is not a full `DefinitionList`. */
export function FieldRow({ term, children }: FieldRowProps): ReactElement {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="text-content-secondary">{term}</span>
      <span className="text-content-primary">{children}</span>
    </div>
  );
}
