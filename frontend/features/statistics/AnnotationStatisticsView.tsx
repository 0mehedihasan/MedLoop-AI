'use client';

/**
 * MedLoop AI — `/data/annotations`, the Annotation Statistics screen.
 *
 * ## What a human did, never what a model did
 *
 * Everything on the left-hand side of this screen is a property of a *review session*: how many were
 * reviewed, how often a reviewer skipped, how long a decision took, which shape they drew, which label
 * they chose. Those are rows a human wrote, so they are countable today.
 *
 * Everything on the right-hand side is a property of a *comparison* between a human and a model —
 * agreement rate, correction rate, the agreement matrix, the confidence bins behind RQ5. No model has
 * been trained on this machine (§15), so there is no prediction to agree with and nothing to have been
 * corrected. Those panels render {@link Blocked} with the reason spelled out, never a plausible
 * percentage (§2.3, §10).
 *
 * ## Three absences, three renderings
 *
 * `agreement_rate` absent from the payload is `Unavailable` with {@link NO_MODEL_REASON} — the figure
 * was not measured, and the reason is that there is nothing to measure it against. `confidence_bins`
 * empty and `agreement_matrix` null are `Blocked`, because those are whole *capabilities* waiting on a
 * model rather than single figures waiting on a range. A distribution the API simply omitted is
 * `Unavailable` with {@link NOT_RETURNED_REASON}. Collapsing any of these into an empty chart would
 * assert that zero was measured.
 */

import type { ReactElement } from 'react';

import { BarChart } from '@/components/charts/BarChart';
import { ConfusionMatrixGrid } from '@/components/charts/ConfusionMatrixGrid';
import { DonutChart } from '@/components/charts/DonutChart';
import { HistogramChart } from '@/components/charts/HistogramChart';
import { LineSeriesChart } from '@/components/charts/LineSeriesChart';
import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/Button';
import { Card, Panel } from '@/components/ui/Card';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { KpiTile } from '@/components/ui/KpiTile';
import { Table } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { Blocked, EmptyState, ErrorState, Skeleton, Unavailable } from '@/components/ui/states';
import { getAnnotationStatistics } from '@/lib/api';
import { describeRange } from '@/lib/date-range';
import { DEMO_ANNOTATION_STATISTICS } from '@/lib/demo/demo-statistics';
import type { DemoAnnotationStatistics } from '@/lib/demo/demo-statistics';
import { IS_DEMO } from '@/lib/env';
import { formatCount, formatDuration, formatPercent } from '@/lib/format';
import { ROUTES } from '@/lib/navigation';
import { useApiQuery } from '@/lib/use-query';
import type { ConfidenceBin, Distribution, Series } from '@/types/domain';

import { NO_MODEL_REASON, NOT_RETURNED_REASON, pickDistribution, pickSeriesList, useRangeFilter } from './lib';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Small pieces
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * A distribution slot. Same three-way rule as the Data Statistics screen: an omitted key is
 * `Unavailable`, a present-but-empty one is the chart's own `EmptyState`, and only a populated one
 * draws.
 */
function DistributionSlot({
  distribution,
  children,
}: {
  readonly distribution: Distribution | null;
  readonly children: (distribution: Distribution) => ReactElement;
}): ReactElement {
  if (distribution === null) return <Unavailable reason={NOT_RETURNED_REASON} variant="block" />;
  return children(distribution);
}

/** Mirrors the populated layout, so the KPI row and the panels do not jump when data lands. */
function AnnotationSkeleton(): ReactElement {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24 rounded-lg" count={5} label="Loading review figures" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-lg" count={4} label="Loading distributions" />
      </div>
    </div>
  );
}

/**
 * Bin edges for the histogram.
 *
 * `HistogramChart` wants `counts.length + 1` ascending edges, while the payload carries a
 * `{lower, upper}` pair per bin. Taking every `lower` plus the final `upper` is only correct if the
 * bins are contiguous — which the endpoint guarantees, and which the chart re-checks by comparing
 * lengths and rendering its own `danger` alert rather than drawing something plausible.
 */
function binEdges(bins: readonly ConfidenceBin[]): readonly number[] {
  if (bins.length === 0) return [];
  const last = bins[bins.length - 1];
  if (last === undefined) return [];
  return [...bins.map((bin) => bin.lower), last.upper];
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The screen
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export function AnnotationStatisticsView(): ReactElement {
  const filter = useRangeFilter();
  // Primitives, not `filter.query`: `useApiQuery` compares `deps` by identity and the bag is rebuilt
  // every render, so passing it would refetch on every keystroke on the page.
  const { from, to } = filter.query;
  const query = useApiQuery((signal) => getAnnotationStatistics({ from, to }, signal), {
    ready: !IS_DEMO && filter.complete,
    deps: [from, to],
  });

  // `Omit<AnnotationStatistics, 'source'>`, so `stats.source` is a compile error and no screen can
  // start reading provenance from the payload instead of from `IS_DEMO` (§10 condition 5).
  const stats: DemoAnnotationStatistics | null = IS_DEMO
    ? DEMO_ANNOTATION_STATISTICS.statistics
    : query.data;

  return (
    <div className="space-y-6">
      {IS_DEMO ? (
        <Alert tone="info" title="Fixture window — the range filter is not rendered">
          These figures come from a fixed demo fixture. No request is made, so a date picker here would
          be a control that changes nothing.
        </Alert>
      ) : (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <DateRangePicker value={filter.range} onChange={filter.setRange} />
            <p className="text-sm text-content-muted">
              {filter.complete
                ? `Showing ${describeRange(filter.range)}`
                : 'Choose both ends of the range to load figures.'}
              {query.refetching ? ' — updating' : ''}
            </p>
          </div>
        </Card>
      )}

      {filter.inverted ? (
        <Alert tone="danger" title="The end of the range is before the start" live>
          Nothing was requested. Swapping the two dates silently would answer a question you did not
          ask, so the range is left exactly as typed.
        </Alert>
      ) : null}

      {query.loading && stats === null ? (
        <AnnotationSkeleton />
      ) : query.error !== null && stats === null ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : stats === null ? (
        <EmptyState
          title="No reviews in this range"
          description={
            filter.complete
              ? 'Nothing was reviewed between these dates, so there is no annotation to summarise.'
              : 'Pick a start and an end date, and the review figures for that window will load.'
          }
          action={<LinkButton href={ROUTES.data.review}>Review data</LinkButton>}
        />
      ) : (
        <PopulatedAnnotations stats={stats} />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Populated
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The KPI row.
 *
 * Five tiles, and three of them are expected to read `Unavailable` on this build. That is the point:
 * `reviewed_total`, `skip_rate` and the median decision time are counted from review rows, while
 * agreement and correction are comparisons against a prediction that does not exist. A screen that
 * hid the empty two would hide the fact that RQ3 is still blocked.
 */
function AnnotationKpis({ stats }: { readonly stats: DemoAnnotationStatistics }): ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <KpiTile label="Reviewed" value={formatCount(stats.reviewed_total)} hint="Validated plus skipped." />
      <KpiTile
        label="Skip rate"
        value={stats.skip_rate === undefined ? null : formatPercent(stats.skip_rate)}
        unavailableReason={NOT_RETURNED_REASON}
        hint="Share of reviews that ended in a skip."
      />
      <KpiTile
        label="Median time per review"
        value={
          stats.median_time_spent_ms === undefined ? null : formatDuration(stats.median_time_spent_ms)
        }
        unavailableReason={NOT_RETURNED_REASON}
        hint="Median, not mean — one interrupted session would drag a mean."
      />
      <KpiTile
        label="AI / human agreement"
        value={stats.agreement_rate === undefined ? null : formatPercent(stats.agreement_rate)}
        unavailableReason={NO_MODEL_REASON}
      />
      <KpiTile
        label="Correction rate"
        value={stats.correction_rate === undefined ? null : formatPercent(stats.correction_rate)}
        unavailableReason={NO_MODEL_REASON}
      />
    </div>
  );
}

/**
 * RQ5: is a model's confidence a useful signal for *which* samples deserve a human?
 *
 * The panel needs two model outputs per image — a confidence to bin by, and a predicted class to
 * decide whether the human corrected it. Neither exists here, so the whole panel is `Blocked` rather
 * than an empty histogram: an empty histogram would say "we binned the confidences and found none",
 * and no confidence was ever produced to bin.
 */
function ConfidenceBins({ bins }: { readonly bins: readonly ConfidenceBin[] }): ReactElement {
  if (bins.length === 0) {
    return <Blocked title="Confidence bins" reason={NO_MODEL_REASON} />;
  }

  const columns: readonly Column<ConfidenceBin>[] = [
    {
      id: 'range',
      header: 'Confidence',
      rowHeader: true,
      cell: (bin) => `${formatPercent(bin.lower, 0)} – ${formatPercent(bin.upper, 0)}`,
    },
    { id: 'reviewed', header: 'Reviewed', numeric: true, cell: (bin) => formatCount(bin.reviewed) },
    { id: 'corrected', header: 'Corrected', numeric: true, cell: (bin) => formatCount(bin.corrected) },
    {
      id: 'correction_rate',
      header: 'Correction rate',
      numeric: true,
      cell: (bin) => formatPercent(bin.correction_rate),
    },
  ];

  return (
    <div className="space-y-4">
      <HistogramChart
        ariaLabel="Reviewed images by model confidence"
        edges={binEdges(bins)}
        counts={bins.map((bin) => bin.reviewed)}
      />
      <Table
        caption="Reviewed and corrected counts per confidence bin"
        captionHidden
        columns={columns}
        rows={bins}
        rowKey={(bin) => bin.lower}
        density="compact"
      />
    </div>
  );
}

function PopulatedAnnotations({
  stats,
}: {
  readonly stats: DemoAnnotationStatistics;
}): ReactElement {
  const byType = pickDistribution(stats.distributions, 'annotation_type');
  const byHumanLabel = pickDistribution(stats.distributions, 'human_label');
  const bySkipReason = pickDistribution(stats.distributions, 'skip_reason');
  const byAnnotator = pickDistribution(stats.distributions, 'annotator');
  const activity: readonly Series[] = pickSeriesList(stats.series, ['validated', 'skipped']);

  return (
    <div className="space-y-6">
      <AnnotationKpis stats={stats} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Human label"
          description="What the reviewer chose, over validated images only. Deliberately a different record from the publisher's label — where the two diverge is the question, so they are never merged."
        >
          <DistributionSlot distribution={byHumanLabel}>
            {(distribution) => (
              <BarChart
                ariaLabel="Validated images by human label"
                slices={distribution.slices}
                emptyTitle="No human labels yet"
                emptyDescription="A label is recorded when a reviewer validates an image."
              />
            )}
          </DistributionSlot>
        </Panel>

        <Panel
          title="Annotation type"
          description="Which shape the reviewer drew. All three are stored as coordinates normalised to the original image, so a rounded box and a polygon are comparable."
        >
          <DistributionSlot distribution={byType}>
            {(distribution) => (
              <DonutChart
                ariaLabel="Annotations by shape type"
                slices={distribution.slices}
                totalLabel="annotations"
                emptyTitle="Nothing drawn yet"
                emptyDescription="Validate an image with a region and this breakdown fills in."
              />
            )}
          </DistributionSlot>
        </Panel>

        <Panel
          title="Skip reason"
          description="Why a reviewer declined to label. A skipped image never joins a training batch automatically, so this is the shape of what the loop is choosing not to learn from."
        >
          <DistributionSlot distribution={bySkipReason}>
            {(distribution) => (
              <BarChart
                ariaLabel="Skips by reason"
                slices={distribution.slices}
                emptyTitle="Nothing skipped"
                emptyDescription="Every reviewed image in this range ended in a label."
              />
            )}
          </DistributionSlot>
        </Panel>

        <Panel
          title="Annotator"
          description="Reviews per person, counting validations and skips together. Volume only — this is not a quality measure and must not be read as one."
        >
          <DistributionSlot distribution={byAnnotator}>
            {(distribution) => (
              <BarChart
                ariaLabel="Reviews by annotator"
                slices={distribution.slices}
                emptyTitle="No reviewers yet"
                emptyDescription="An annotator appears here after their first submitted review."
              />
            )}
          </DistributionSlot>
        </Panel>
      </div>

      <Panel
        title="Review activity over time"
        description="Validations and skips per day. A day with no reviews is absent rather than zero, so the line breaks and the transcript prints a dash."
      >
        {activity.length === 0 ? (
          <Unavailable reason={NOT_RETURNED_REASON} variant="block" />
        ) : (
          <LineSeriesChart
            ariaLabel="Images validated and skipped over time"
            series={activity}
            emptyTitle="No dated reviews in this range"
            emptyDescription="Review images and the series appears."
          />
        )}
      </Panel>

      <Panel
        title="Human label vs AI label"
        description="Rows are what the human chose, columns what the model predicted, over reviewed images only. This is a disagreement map, not a model evaluation — a model is scored on the locked test set, which is never reviewed."
      >
        {stats.agreement_matrix === null ? (
          <Blocked title="Agreement matrix" reason={NO_MODEL_REASON} />
        ) : (
          <ConfusionMatrixGrid
            ariaLabel="Human label against AI predicted label"
            labels={stats.agreement_matrix.labels}
            matrix={stats.agreement_matrix.rows}
          />
        )}
      </Panel>

      <Panel
        title="Correction rate by model confidence"
        description="Whether low-confidence predictions are the ones humans actually correct — RQ5. Bins and the correction rate inside each are computed by the API; the client never derives a rate."
      >
        <ConfidenceBins bins={stats.confidence_bins} />
      </Panel>
    </div>
  );
}
