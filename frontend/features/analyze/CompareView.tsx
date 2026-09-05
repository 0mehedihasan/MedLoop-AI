'use client';

/**
 * MedLoop AI — `/analyze/compare`.
 *
 * ## The refusal is the feature
 *
 * `GET /models/comparison` can answer `comparable: false` with a `reason`, and §9 is explicit about
 * what the UI does then: **render the refusal, not the numbers.** Two models measured on different
 * locked test versions are not a comparison, and a table that showed their figures side by side with a
 * warning above it would still be read as a comparison — the numbers are the loudest thing on the
 * screen. So the `false` branch renders the server's sentence and nothing else. There is no "show
 * anyway".
 *
 * ## Ascending, because the loop runs forwards
 *
 * Rows are ordered oldest version first. RQ1 asks whether successive human feedback improves the
 * model, and the answer is read left to right as the loop progressing. Newest-first is right for a
 * registry, where the question is "what is current"; it is wrong for a trend.
 *
 * ## The delta is against the previous version, and only where both sides measured it
 *
 * The tiles under the table compare the newest selected version with the one before it. A missing
 * baseline metric produces no delta rather than a delta of zero — "unchanged" is a claim about two
 * measurements, one of which does not exist (§2.3).
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { BarChart } from '@/components/charts/BarChart';
import { Alert } from '@/components/ui/Alert';
import { StatusPill } from '@/components/ui/Badge';
import { Card, Panel, SectionHeader } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Choice';
import { Table, TableScroll } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { Blocked, EmptyState, ErrorState, Skeleton, Unavailable } from '@/components/ui/states';
import { compareModels, getTrainingSettings, listModels } from '@/lib/api';
import { DEMO_ANALYZE } from '@/lib/demo/demo-analyze';
import { IS_DEMO } from '@/lib/env';
import { formatCount, formatDateTime, formatMetric } from '@/lib/format';
import { useApiQuery } from '@/lib/use-query';
import type { DistributionSlice, Model, ModelComparison, ModelComparisonRow, PromotionMetric } from '@/types/domain';

import { METRIC_SPECS, MetricTiles, NOT_COMPUTED_REASON, NO_MODEL_REASON, metricValue } from './lib';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The comparison table
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** One metric column. Built from {@link METRIC_SPECS} so the five never drift out of order. */
function metricColumn(spec: (typeof METRIC_SPECS)[number]): Column<ModelComparisonRow> {
  return {
    id: spec.key,
    header: spec.label,
    numeric: true,
    width: '8rem',
    cell: (row) => {
      const value = row.metrics[spec.key];
      return value === null ? <Unavailable reason={NOT_COMPUTED_REASON} /> : formatMetric(value);
    },
  };
}

const COMPARISON_COLUMNS: readonly Column<ModelComparisonRow>[] = [
  {
    id: 'version',
    header: 'Version',
    rowHeader: true,
    width: '6rem',
    cell: (row) => <span className="font-mono text-xs">{row.version}</span>,
  },
  {
    id: 'status',
    header: 'Status',
    width: '9rem',
    cell: (row) => <StatusPill status={row.status} />,
  },
  {
    id: 'trained_at',
    header: 'Trained',
    width: '11rem',
    cell: (row) =>
      row.trained_at === null ? (
        <Unavailable reason="No training timestamp was recorded for this version." />
      ) : (
        <span className="whitespace-nowrap">{formatDateTime(row.trained_at)}</span>
      ),
  },
  ...METRIC_SPECS.map(metricColumn),
  {
    id: 'mean_iou',
    header: 'Mean IoU',
    numeric: true,
    width: '8rem',
    cell: (row) =>
      row.localization === null || row.localization.mean_iou === null ? (
        <Unavailable reason="This evaluation carried no localisation figures." />
      ) : (
        formatMetric(row.localization.mean_iou)
      ),
  },
  {
    // Last and always present: every figure to its left is uninterpretable without knowing how many
    // samples produced it.
    id: 'sample_count',
    header: 'Samples',
    numeric: true,
    width: '7rem',
    cell: (row) => formatCount(row.sample_count),
  },
];

export interface ComparisonBodyProps {
  readonly comparison: ModelComparison;
  /** The metric promotion is decided on. Highlighted in the tiles, never recomputed. */
  readonly primary?: PromotionMetric | null;
}

/**
 * The comparison with no network attached, so the §10 preview and the live screen cannot diverge.
 *
 * The `comparable: false` branch returns early. That is not a formatting choice — everything below it
 * would be a figure the server has just said is not comparable.
 */
export function ComparisonBody({ comparison, primary = null }: ComparisonBodyProps): ReactElement {
  if (!comparison.comparable) {
    return (
      <Alert tone="warn" title="These versions are not comparable">
        {comparison.reason ??
          'The server refused the comparison without giving a reason. Nothing is shown rather than guessing which figures would have been valid.'}
      </Alert>
    );
  }

  // Ascending: the loop reads forwards. `GET /models/comparison` does not promise an order.
  const rows = [...comparison.rows].sort((a, b) => a.model_id - b.model_id);
  const newest = rows[rows.length - 1];
  const previous = rows.length >= 2 ? rows[rows.length - 2] : undefined;

  if (newest === undefined) {
    return (
      <EmptyState
        title="The comparison came back with no versions"
        description="The server accepted the request and returned an empty row set. Pick at least two evaluated versions."
      />
    );
  }

  const primarySpec =
    primary === null ? null : (METRIC_SPECS.find((spec) => spec.metric === primary) ?? null);

  /**
   * The primary metric per version. Only drawn when every selected version measured it — a bar chart
   * with a gap in it reads as a drop to zero, which is the §2.3 failure with a chart attached.
   */
  const slices: readonly DistributionSlice[] =
    primarySpec === null
      ? []
      : rows
          .map((row) => ({
            key: String(row.model_id),
            label: row.version,
            count: metricValue(row.metrics, primarySpec.metric),
          }))
          .filter((slice): slice is DistributionSlice => slice.count !== null);
  const everyVersionMeasured = slices.length === rows.length;

  return (
    <div className="space-y-6">
      <Panel
        title={`${formatCount(rows.length)} versions on one locked test set`}
        description={
          comparison.test_dataset_version_id === null
            ? 'The server did not name the test dataset version, so treat the figures as provisional.'
            : `All figures measured on test dataset version #${String(comparison.test_dataset_version_id)}. That is what makes the rows comparable at all (§9).`
        }
        bodyPadding="none"
      >
        <TableScroll label="Model comparison" maxHeightClassName="max-h-[32rem]">
          <Table
            caption="Model versions compared on the same locked test set, oldest first"
            captionHidden
            columns={COMPARISON_COLUMNS}
            rows={rows}
            rowKey={(row) => row.model_id}
            density="compact"
            stickyHeader
          />
        </TableScroll>
      </Panel>

      <section aria-labelledby="compare-latest">
        <SectionHeader
          title={
            previous === undefined
              ? `${newest.version} in detail`
              : `${newest.version} against ${previous.version}`
          }
          titleId="compare-latest"
          description={
            previous === undefined
              ? 'Only one version was selected, so there is nothing to difference against.'
              : 'The signed change on each metric. A metric absent from either side shows no delta rather than a zero.'
          }
        />
        <div className="mt-3">
          <MetricTiles
            metrics={newest.metrics}
            primary={primary}
            baseline={previous?.metrics ?? null}
            baselineLabel={previous?.version}
          />
        </div>
      </section>

      {primarySpec === null ? null : (
        <Panel
          title={`${primarySpec.label} by version`}
          description={
            everyVersionMeasured
              ? `${primarySpec.hint} This is the figure the promotion rule reads, version by version.`
              : 'Not drawn: at least one selected version did not measure this metric, and a bar chart with a missing bar reads as a drop to zero.'
          }
        >
          {everyVersionMeasured ? (
            <BarChart
              ariaLabel={`${primarySpec.label} for each compared version`}
              slices={slices}
              uniform
              showShare={false}
              formatValue={(value) => formatMetric(value)}
              height={200}
            />
          ) : (
            <Unavailable
              variant="block"
              reason={`One or more of the selected versions has no ${primarySpec.label} on this evaluation, so the series is incomplete and is not drawn.`}
            />
          )}
        </Panel>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The screen
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** Only an evaluated version can be compared: without `test_metrics` there is nothing to line up. */
function comparable(model: Model): boolean {
  return model.test_metrics !== null && model.test_dataset_version_id !== null;
}

export function CompareView(): ReactElement {
  const modelsQuery = useApiQuery((signal) => listModels(undefined, signal), { ready: !IS_DEMO });
  const models: readonly Model[] | null = IS_DEMO ? DEMO_ANALYZE.models : modelsQuery.data;

  /**
   * `null` means "nothing chosen yet", which is different from "nothing selected". Before the list
   * arrives there is no default to compute, and after it arrives every evaluated version is selected
   * — the comparison someone opening this screen is almost always after.
   */
  const [chosen, setChosen] = useState<readonly number[] | null>(null);

  const evaluated = useMemo(
    () => (models ?? []).filter(comparable).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [models],
  );

  const selected = useMemo(
    () => chosen ?? evaluated.map((model) => model.id),
    [chosen, evaluated],
  );

  const toggle = useCallback(
    (id: number): void => {
      setChosen((current) => {
        const base = current ?? evaluated.map((model) => model.id);
        return base.includes(id) ? base.filter((entry) => entry !== id) : [...base, id];
      });
    },
    [evaluated],
  );

  /**
   * Keyed on the id list, so unticking a version re-asks the server instead of filtering rows the
   * previous answer happened to contain — the `comparable` verdict is about the set, not the rows.
   */
  const ids = selected.join(',');
  const comparison = useApiQuery((signal) => compareModels({ model_ids: selected }, signal), {
    deps: [ids],
    ready: !IS_DEMO && selected.length >= 2,
  });

  /**
   * Best effort. The promotion metric only decides which tile is *marked*, so a settings read that
   * fails costs a highlight, not the screen.
   */
  const settings = useApiQuery((signal) => getTrainingSettings(signal), { ready: !IS_DEMO });
  const primary: PromotionMetric | null =
    settings.data?.settings.primary_promotion_metric ?? null;

  if (models === null) {
    return (
      <Card>
        {modelsQuery.error !== null ? (
          <ErrorState
            error={modelsQuery.error}
            onRetry={() => void modelsQuery.refetch()}
            retryLabel="Read the registry again"
          />
        ) : (
          <Skeleton className="h-64 rounded-lg" label="Loading the model registry" />
        )}
      </Card>
    );
  }

  if (evaluated.length === 0) {
    // The §10 layout preview is composed by the route, not from here: it must be reachable whether or
    // not a version exists, and importing it here would make the two modules mutually dependent.
    return <Blocked title="Model comparison" reason={NO_MODEL_REASON} />;
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Versions to compare"
        description="Only versions with an evaluation on a locked test set can be compared. The server refuses the comparison if the selected versions were measured on different test data."
      >
        <div className="flex flex-col gap-2">
          {evaluated.map((model) => (
            <Checkbox
              key={model.id}
              label={`${model.version} — ${model.architecture}`}
              description={`Test dataset version #${String(model.test_dataset_version_id ?? 0)}`}
              checked={selected.includes(model.id)}
              onChange={() => toggle(model.id)}
            />
          ))}
        </div>
      </Panel>

      {selected.length < 2 ? (
        <EmptyState
          title="Pick at least two versions"
          description="A comparison needs two sides. One version on its own is an evaluation, and that is on the analyse screen."
        />
      ) : comparison.error !== null ? (
        <Card>
          <ErrorState
            error={comparison.error}
            onRetry={() => void comparison.refetch()}
            retryLabel="Ask for the comparison again"
          />
        </Card>
      ) : comparison.data === null ? (
        <Card>
          <Skeleton className="h-72 rounded-lg" label="Loading the comparison" />
        </Card>
      ) : (
        <ComparisonBody comparison={comparison.data} primary={primary} />
      )}
    </div>
  );
}
