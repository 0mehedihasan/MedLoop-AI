'use client';

/**
 * MedLoop AI — one evaluation, in full.
 *
 * ## Presentational core, fetching wrapper
 *
 * {@link EvaluationBody} takes an evaluation and draws it. {@link EvaluationDetail} takes a model id,
 * reads `GET /models/{id}/evaluations`, and hands the newest one to the body. The split exists because
 * the §10 layout preview needs the body with a hand-typed evaluation and no network at all — and
 * because a second copy of "how an evaluation is laid out" would drift from this one.
 *
 * ## The newest evaluation, not the only one
 *
 * A model can be re-evaluated: a locked test version can be superseded, an evaluation can be re-run
 * after a metric is added. The endpoint returns the list, this component shows the most recent and says
 * how many others exist, because silently rendering one of several as *the* result hides that a
 * comparison might be reading a different row.
 *
 * ## Every panel here can be empty, and each empty means something different
 *
 * No model → `Blocked` (upstream, in `AnalyzeView`). Model but no evaluation → `EmptyState`: it was
 * registered and never measured. Evaluation but no `per_class` → the metrics were computed and the
 * breakdown was not. Evaluation but no `localization` → there was no human ROI to compare an AI region
 * against. Four different facts, four different renderings (§2.3). A single "no data" for all of them
 * would be the shortest path to a reader assuming the worst one.
 */

import type { ReactElement } from 'react';

import { Card, Panel, SectionHeader } from '@/components/ui/Card';
import { ConfusionMatrixGrid } from '@/components/charts/ConfusionMatrixGrid';
import { DefinitionList } from '@/components/ui/KpiTile';
import { Table } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, Skeleton, Unavailable } from '@/components/ui/states';
import { listModelEvaluations } from '@/lib/api';
import { formatCount, formatDateTime, formatMetric } from '@/lib/format';
import { useApiQuery } from '@/lib/use-query';
import type { ModelEvaluation, PerClassMetrics, PromotionMetric } from '@/types/domain';

import { MetricTiles, NOT_COMPUTED_REASON, localizationItems } from './lib';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Per-class table
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `support` is last and always present, because every other cell in the row is uninterpretable
 * without it: an F1 of 0.44 over five samples and an F1 of 0.44 over five hundred are not the same
 * claim, and the rare-class rows are exactly the ones a reader of this table cares about.
 */
const PER_CLASS_COLUMNS: readonly Column<PerClassMetrics>[] = [
  {
    id: 'label_code',
    header: 'Class',
    rowHeader: true,
    cell: (row) => <span className="font-mono text-xs">{row.label_code}</span>,
  },
  {
    id: 'precision',
    header: 'Precision',
    numeric: true,
    cell: (row) =>
      row.precision === null ? (
        <Unavailable reason={NOT_COMPUTED_REASON} />
      ) : (
        formatMetric(row.precision)
      ),
  },
  {
    id: 'recall',
    header: 'Recall',
    numeric: true,
    cell: (row) =>
      row.recall === null ? <Unavailable reason={NOT_COMPUTED_REASON} /> : formatMetric(row.recall),
  },
  {
    id: 'f1',
    header: 'F1',
    numeric: true,
    cell: (row) =>
      row.f1 === null ? <Unavailable reason={NOT_COMPUTED_REASON} /> : formatMetric(row.f1),
  },
  {
    id: 'support',
    header: 'Support',
    numeric: true,
    cell: (row) => formatCount(row.support),
  },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The body
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface EvaluationBodyProps {
  readonly evaluation: ModelEvaluation;
  /** The metric promotion is decided on, highlighted rather than recomputed. `null` when unread. */
  readonly primary?: PromotionMetric | null;
  /** How many evaluations this model has. Shown when it is more than one. */
  readonly totalEvaluations?: number;
}

/**
 * An evaluation with no network attached, so the §10 preview and the live screen cannot diverge.
 *
 * The provenance line comes first. `dataset_version_label` and `device` are not footnotes: two numbers
 * are comparable only if they were measured on the same locked test version (§9), and §2.3 requires
 * naming the device the forward pass ran on rather than the one that was configured.
 */
export function EvaluationBody({
  evaluation,
  primary = null,
  totalEvaluations,
}: EvaluationBodyProps): ReactElement {
  const superseded = totalEvaluations !== undefined && totalEvaluations > 1;

  return (
    <div className="space-y-6">
      <Panel
        title={`Evaluation of ${evaluation.model_version}`}
        description={
          superseded
            ? `The most recent of ${formatCount(totalEvaluations)} evaluations of this version. Older runs are kept; they are not shown here.`
            : 'Measured against the locked test set. Every figure below comes from this one run.'
        }
      >
        <DefinitionList
          layout="columns"
          items={[
            { term: 'Test dataset version', value: evaluation.dataset_version_label, mono: true },
            { term: 'Samples evaluated', value: formatCount(evaluation.sample_count) },
            { term: 'Device', value: evaluation.device, mono: true },
            { term: 'Evaluated at', value: formatDateTime(evaluation.created_at) },
          ]}
        />
      </Panel>

      <section aria-labelledby="analyze-classification">
        <SectionHeader
          title="Classification"
          titleId="analyze-classification"
          description="Macro averages weight every class equally, so a rare class counts as much as a common one. Accuracy does not."
        />
        <div className="mt-3">
          <MetricTiles metrics={evaluation.metrics} primary={primary} />
        </div>
      </section>

      <Panel
        title="Per class"
        description="Where the macro averages come from. A class with little support moves them a long way."
      >
        {evaluation.per_class.length === 0 ? (
          <EmptyState
            title="No per-class breakdown in this evaluation"
            description="The run recorded the macro metrics without the per-class rows. The breakdown appears for evaluations that persist it; the macro figures above are unaffected."
          />
        ) : (
          <Table
            caption={`Per-class metrics for ${evaluation.model_version}`}
            captionHidden
            columns={PER_CLASS_COLUMNS}
            rows={evaluation.per_class}
            rowKey={(row) => row.label_code}
            density="compact"
          />
        )}
      </Panel>

      <Panel
        title="Confusion matrix"
        description="Rows are the true class, columns the predicted one. The off-diagonal cells are the errors worth naming."
      >
        <ConfusionMatrixGrid
          ariaLabel={`Confusion matrix for ${evaluation.model_version}`}
          labels={evaluation.confusion_matrix?.labels ?? []}
          matrix={evaluation.confusion_matrix?.rows ?? []}
          emptyTitle="No confusion matrix in this evaluation"
          emptyDescription="The run did not persist a matrix. Nothing is drawn rather than reconstructing one from the per-class rows, which cannot be done."
        />
      </Panel>

      <Panel
        title="Localisation"
        description="IoU between the model's region and the annotator's, over the images that have both."
      >
        <DefinitionList items={localizationItems(evaluation.localization)} />
      </Panel>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The fetching wrapper
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface EvaluationDetailProps {
  readonly modelId: number;
  readonly modelVersion: string;
  readonly primary?: PromotionMetric | null;
}

/**
 * The four states for one model's evaluations, keyed on `modelId` so selecting a different version in
 * the registry re-reads rather than showing the previous version's numbers under a new heading.
 */
export function EvaluationDetail({
  modelId,
  modelVersion,
  primary = null,
}: EvaluationDetailProps): ReactElement {
  const query = useApiQuery((signal) => listModelEvaluations(modelId, signal), {
    deps: [modelId],
  });

  if (query.error !== null) {
    return (
      <Card>
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          retryLabel="Read the evaluations again"
        />
      </Card>
    );
  }

  if (query.data === null) {
    return (
      <Card>
        <Skeleton className="h-72 rounded-lg" label={`Loading the evaluation of ${modelVersion}`} />
      </Card>
    );
  }

  // Newest first is not guaranteed by the endpoint, so the choice of "most recent" is made here.
  const newest = [...query.data].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  if (newest === undefined) {
    return (
      <Card>
        <EmptyState
          title={`${modelVersion} has not been evaluated`}
          description="The version is registered but no evaluation against the locked test set has been recorded for it. Until one is, there is no metric to show — and a candidate cannot be compared or promoted without one (§2.7)."
        />
      </Card>
    );
  }

  return (
    <EvaluationBody
      evaluation={newest}
      primary={primary}
      totalEvaluations={query.data.length}
    />
  );
}
