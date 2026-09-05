'use client';

/**
 * MedLoop AI — `/data/statistics`, the Data Statistics screen.
 *
 * ## What this screen may and may not say
 *
 * Every figure here is a **count of rows**, never a measurement of a model: how many images were
 * registered, where they sit, what a human did with them. That is why it is allowed to render numbers
 * behind a demo badge at all (§10) — a count describes fixture state, while an accuracy would describe
 * a model that does not exist on this machine (§15).
 *
 * ## An omitted distribution is not an empty one
 *
 * `pickDistribution` returns `null` for a key the payload did not carry, and each panel renders that
 * as `Unavailable` — "the API did not return this" — rather than as an empty chart, which would read
 * as "nothing has been counted". §2.3: the two are different facts and must not look alike.
 *
 * ## The range filter disappears in demo mode
 *
 * The fixture is one fixed window and no request is made, so a picker would be a control that silently
 * does nothing. It is removed and replaced by a line stating the window, which is the same rule the
 * review canvas follows for a missing Grad-CAM layer: an inert control is worse than no control.
 */

import type { ReactElement } from 'react';

import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { LineSeriesChart } from '@/components/charts/LineSeriesChart';
import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/Button';
import { Card, Panel } from '@/components/ui/Card';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { DefinitionList, KpiTile } from '@/components/ui/KpiTile';
import type { DefinitionItem } from '@/components/ui/KpiTile';
import { EmptyState, ErrorState, Skeleton, Unavailable } from '@/components/ui/states';
import { getDataStatistics } from '@/lib/api';
import { describeRange, formatDay } from '@/lib/date-range';
import { DEMO_DATA_STATISTICS } from '@/lib/demo/demo-statistics';
import type { DemoDataStatistics } from '@/lib/demo/demo-statistics';
import { IS_DEMO } from '@/lib/env';
import { formatCount } from '@/lib/format';
import { ROUTES } from '@/lib/navigation';
import { useApiQuery } from '@/lib/use-query';
import type { DatasetCounts, Distribution, Series } from '@/types/domain';

import { NOT_RETURNED_REASON, pickDistribution, pickSeriesList, useRangeFilter } from './lib';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The KPI row
 * ──────────────────────────────────────────────────────────────────────────────────────── */

interface CountTile {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly hint?: string;
}

/**
 * Six tiles out of the ten-way partition, chosen because each answers a question a researcher asks
 * without reading a chart. The remaining four buckets are not hidden — the donut below carries every
 * one of them, and its table transcript names them all.
 *
 * `0` is printed as `0` here and nowhere else in this file: these are counts that *were* computed, so
 * zero is a measurement. An absent figure would be `Unavailable`, never a zero (§2.3).
 */
function countTiles(counts: DatasetCounts): readonly CountTile[] {
  return [
    { key: 'total', label: 'Images registered', value: counts.total },
    {
      key: 'validated',
      label: 'Validated',
      value: counts.validated,
      hint: 'Eligible for the HITL pool.',
    },
    { key: 'skipped', label: 'Skipped', value: counts.skipped, hint: 'Never batched automatically.' },
    {
      key: 'unused',
      label: 'Awaiting review',
      value: counts.unused,
      hint: 'Split UNUSED and untouched.',
    },
    {
      key: 'test',
      label: 'Locked test set',
      value: counts.test,
      hint: 'Never reviewed, never retrained on.',
    },
    {
      key: 'training_used',
      label: 'Consumed by training',
      value: counts.training_used,
      hint: 'Claimed by a training batch.',
    },
  ];
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Small pieces
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * A distribution slot.
 *
 * Three outcomes, three renderings: the key was missing (`Unavailable`), the key was present with no
 * slices (the chart's own `EmptyState`), or there is something to draw. Collapsing the first two into
 * one blank chart is the §2.3 mistake this component exists to prevent.
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

/** Skeleton for the whole screen. Mirrors the populated layout so nothing jumps when data lands. */
function StatisticsSkeleton(): ReactElement {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24 rounded-lg" count={6} label="Loading counts" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-lg" count={2} label="Loading distributions" />
      </div>
      <Skeleton className="h-72 rounded-lg" label="Loading the activity series" />
    </div>
  );
}

/**
 * The window the payload actually covers, in words.
 *
 * Reads the *response*, not the picker: `null` bounds mean the server applied no constraint, which is
 * a different sentence from "the user chose all time". `describeRange` answers the second question and
 * is used for the filter caption; this one answers the first.
 */
function payloadWindow(from: string | null, to: string | null): string {
  if (from === null || to === null) return 'all recorded dates';
  if (from === to) return formatDay(from);
  return `${formatDay(from)} to ${formatDay(to)}`;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The screen
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export function DataStatisticsView(): ReactElement {
  const filter = useRangeFilter();
  // Destructured, because `useApiQuery` compares `deps` by identity and `filter.query` is a fresh
  // object every render — passing the bag itself would refetch on every keystroke on the page.
  const { from, to } = filter.query;
  const query = useApiQuery((signal) => getDataStatistics({ from, to }, signal), {
    ready: !IS_DEMO && filter.complete,
    deps: [from, to],
  });

  // `DemoDataStatistics` is `Omit<DataStatistics, 'source'>`, and a live `DataStatistics` satisfies it.
  // Typing the variable that way is deliberate: it makes `stats.source` a compile error, so no screen
  // can start reading provenance from the payload instead of from `IS_DEMO` (§10 condition 5).
  const stats: DemoDataStatistics | null = IS_DEMO ? DEMO_DATA_STATISTICS.statistics : query.data;

  const byStatus = stats === null ? null : pickDistribution(stats.distributions, 'data_status');
  const bySplit = stats === null ? null : pickDistribution(stats.distributions, 'split');
  const byLabel = stats === null ? null : pickDistribution(stats.distributions, 'label_code');
  const byDataset = stats === null ? null : pickDistribution(stats.distributions, 'dataset');
  const activity =
    stats === null ? [] : pickSeriesList(stats.series, ['ingested', 'validated', 'skipped']);

  return (
    <div className="space-y-6">
      {IS_DEMO ? (
        <Alert tone="info" title="Fixture window — the range filter is not rendered">
          These counts come from a fixed demo fixture covering{' '}
          {payloadWindow(stats?.from ?? null, stats?.to ?? null)}. No request is made, so a date picker
          here would be a control that changes nothing.
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
        <StatisticsSkeleton />
      ) : query.error !== null && stats === null ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : stats === null ? (
        <EmptyState
          title="Nothing has been counted yet"
          description={
            filter.complete
              ? 'No images are registered for this range, so there is no distribution to draw.'
              : 'Pick a start and an end date, and the counts for that window will load.'
          }
          action={<LinkButton href={ROUTES.data.upload}>Upload data</LinkButton>}
        />
      ) : (
        <PopulatedStatistics
          stats={stats}
          byStatus={byStatus}
          bySplit={bySplit}
          byLabel={byLabel}
          byDataset={byDataset}
          activity={activity}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Populated
 * ──────────────────────────────────────────────────────────────────────────────────────── */

interface PopulatedStatisticsProps {
  readonly stats: DemoDataStatistics;
  readonly byStatus: Distribution | null;
  readonly bySplit: Distribution | null;
  readonly byLabel: Distribution | null;
  readonly byDataset: Distribution | null;
  readonly activity: readonly Series[];
}

function PopulatedStatistics({
  stats,
  byStatus,
  bySplit,
  byLabel,
  byDataset,
  activity,
}: PopulatedStatisticsProps): ReactElement {
  const datasetItems: readonly DefinitionItem[] =
    byDataset === null
      ? []
      : byDataset.slices.map((slice) => ({
          term: slice.label,
          value: formatCount(slice.count),
          mono: true,
        }));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {countTiles(stats.counts).map((tile) => (
          <KpiTile
            key={tile.key}
            label={tile.label}
            value={formatCount(tile.value)}
            hint={tile.hint}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Derived data status"
          description="One bucket per image. The status is derived by precedence — archived, then consumed by training, then validated, skipped, in review, and only then the split — so the buckets sum to the total and never double-count."
        >
          <DistributionSlot distribution={byStatus}>
            {(distribution) => (
              <DonutChart
                ariaLabel="Images by derived data status"
                slices={distribution.slices}
                totalLabel="images"
                emptyTitle="No images in this range"
                emptyDescription="Register images and this breakdown fills in."
              />
            )}
          </DistributionSlot>
        </Panel>

        <Panel
          title="Split"
          description="The raw split column, which is orthogonal to review status. UNUSED here is the whole review pool, including images already validated or skipped."
        >
          <DistributionSlot distribution={bySplit}>
            {(distribution) => (
              <BarChart
                ariaLabel="Images by split"
                slices={distribution.slices}
                emptyTitle="No splits assigned"
                emptyDescription="Assign splits on a dataset version and this chart fills in."
              />
            )}
          </DistributionSlot>
        </Panel>
      </div>

      <Panel
        title="Publisher label"
        description="The label that arrived with the data, counted per code. These codes come from the configurable label space, not from an enum in the source, so a dataset with different classes changes this axis without a code change."
      >
        <DistributionSlot distribution={byLabel}>
          {(distribution) => (
            <BarChart
              ariaLabel="Images by publisher label code"
              slices={distribution.slices}
              emptyTitle="No labels recorded"
              emptyDescription="Images can carry no publisher label at all; a human label is recorded separately, under Annotation Statistics."
            />
          )}
        </DistributionSlot>
      </Panel>

      <Panel
        title="Registration and review over time"
        description={`One point per ${stats.granularity}. A day with no activity is absent rather than zero, so the line breaks there and the table prints a dash — a gap is "nothing was recorded", which is not the same as "zero happened".`}
      >
        {activity.length === 0 ? (
          <Unavailable reason={NOT_RETURNED_REASON} variant="block" />
        ) : (
          <LineSeriesChart
            ariaLabel="Images registered, validated and skipped over time"
            series={activity}
            emptyTitle="No dated activity in this range"
            emptyDescription="Register or review images and the series appears."
          />
        )}
      </Panel>

      <Panel
        title="Datasets"
        description="Images per dataset, so a range that spans two imports is visibly two imports."
        actions={<LinkButton href={ROUTES.data.datasets} size="sm">Manage datasets</LinkButton>}
      >
        {byDataset === null ? (
          <Unavailable reason={NOT_RETURNED_REASON} variant="block" />
        ) : datasetItems.length === 0 ? (
          <EmptyState
            title="No datasets in this range"
            description="A dataset appears here once it holds at least one registered image."
          />
        ) : (
          <DefinitionList items={datasetItems} layout="rows" />
        )}
      </Panel>



    </div>
  );
}
