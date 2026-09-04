'use client';

/**
 * MedLoop AI — the dashboard (`/`).
 *
 * The one screen everybody opens first, so it answers four questions and refuses to answer a fifth:
 * how much data is here, where the HITL cycle stands, what the services are doing, what happened
 * recently — and *not* how good the model is, because there is no model.
 *
 * ## The model panel is a refusal on purpose
 *
 * §10 forbids a placeholder percentage even behind a demo badge, and §15 records that `ml/` has
 * interfaces and device resolution and nothing else. So the performance panel renders {@link Blocked}
 * with the reason spelled out. A greyed-out chart of zeroes would be the same claim in a quieter
 * font.
 *
 * ## Demo vs API
 *
 * `IS_DEMO` decides once, at the top. In demo mode the query never runs (`ready: false`), so there is
 * no request to abort and no chance of a fixture and a live payload being on screen together
 * (§10 condition 5). In API mode the fixtures are unreachable — the import survives, but the branch
 * that reads it cannot be taken.
 *
 * ## Review activity has no chart yet
 *
 * The series renders as the table transcript that `components/charts/` is required to carry anyway.
 * When `LineSeriesChart` lands it goes *above* this table, not instead of it.
 */

import type { ReactElement } from 'react';

import { PageHeader } from '@/components/shell/PageHeader';
import { ServiceStateDot, StatusPill } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Card';
import { DefinitionList, KpiTile, ProgressBar } from '@/components/ui/KpiTile';
import { DemoBadge } from '@/components/ui/project';
import { Table } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { Blocked, EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { getDashboardStatistics } from '@/lib/api';
import { DEMO_DASHBOARD } from '@/lib/demo/demo-dashboard';
import type { DemoDashboardStatistics } from '@/lib/demo/demo-dashboard';
import { IS_DEMO } from '@/lib/env';
import { formatCount, formatDateTime, formatPercent, formatRelative } from '@/lib/format';
import { ROUTES } from '@/lib/navigation';
import { useApiQuery } from '@/lib/use-query';
import type { ActivityEntry, HitlStatus, SeriesPoint } from '@/types/domain';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * KPI row
 * ──────────────────────────────────────────────────────────────────────────────────────── */

interface KpiSpec {
  readonly label: string;
  readonly value: number | undefined;
  readonly kind: 'count' | 'fraction';
  readonly hint: string;
  /** Shown when the API omitted the figure. §2.3: an absent measurement is not a zero. */
  readonly absent: string;
}

function kpiSpecs(stats: DemoDashboardStatistics): readonly KpiSpec[] {
  const { kpis } = stats;
  return [
    {
      label: 'Images',
      value: kpis.total_images,
      kind: 'count',
      hint: 'One physical copy each; splits are references, not copies.',
      absent: 'No image table to count',
    },
    {
      label: 'Pending review',
      value: kpis.pending_review,
      kind: 'count',
      hint: 'Split UNUSED and not yet reviewed. TEST never enters the queue.',
      absent: 'Queue size not computed',
    },
    {
      label: 'Validated',
      value: kpis.validated,
      kind: 'count',
      hint: 'The only status eligible for the HITL pool.',
      absent: 'No review sessions to count',
    },
    {
      label: 'Skipped',
      value: kpis.skipped,
      kind: 'count',
      hint: 'Never joins a training batch automatically.',
      absent: 'No review sessions to count',
    },
    {
      label: 'Annotations',
      value: kpis.annotations,
      kind: 'count',
      hint: 'Human geometry, stored separately from every AI prediction.',
      absent: 'No annotation table to count',
    },
    {
      label: 'AI / human agreement',
      value: kpis.agreement_rate,
      kind: 'fraction',
      hint: 'Share of reviews where the human label matched the prediction.',
      absent: 'No model has predicted anything, so there is nothing to agree with',
    },
  ];
}

function KpiRow({ stats, demo }: { readonly stats: DemoDashboardStatistics; readonly demo: boolean }): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {kpiSpecs(stats).map((spec) => (
        <KpiTile
          key={spec.label}
          label={spec.label}
          value={
            spec.value === undefined
              ? null
              : spec.kind === 'count'
                ? formatCount(spec.value)
                : formatPercent(spec.value)
          }
          unavailableReason={spec.absent}
          hint={spec.hint}
          meta={demo && spec.value !== undefined ? <DemoBadge label="Demo" /> : undefined}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * HITL panel
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `threshold` comes from the payload, never from a literal (§2.6), and `threshold_met` comes from the
 * server rather than being re-derived from the two counts — lowering the threshold below the current
 * count must read as met immediately (§8.4), and only the server knows the current setting.
 */
function HitlPanel({ hitl, demo }: { readonly hitl: HitlStatus; readonly demo: boolean }): ReactElement {
  const counted = formatCount(hitl.validated_since_last_training);
  const target = formatCount(hitl.threshold);

  return (
    <Panel
      id="hitl"
      title="HITL cycle"
      description="Validated samples accumulate until the configured threshold is reached. The threshold is a setting, not a constant."
      meta={
        <span className="flex items-center gap-2">
          <StatusPill status={hitl.stage} />
          {demo ? <DemoBadge /> : null}
        </span>
      }
      actions={<LinkButton href={ROUTES.data.training} size="sm">Training management</LinkButton>}
    >
      <div className="flex flex-col gap-4">
        <ProgressBar
          label="Validated samples toward the retraining threshold"
          value={hitl.validated_since_last_training}
          max={hitl.threshold}
          valueText={`${counted} of ${target}`}
          tone={hitl.threshold_met ? 'warn' : 'info'}
        />
        <DefinitionList
          items={[
            {
              term: 'Threshold',
              value: `${target} validated samples`,
            },
            {
              term: 'Remaining',
              value: hitl.threshold_met ? 'Met — ready for retraining' : `${formatCount(hitl.remaining)} to go`,
            },
            {
              term: 'Current batch',
              value:
                hitl.current_batch === null
                  ? null
                  : `Batch ${String(hitl.current_batch.batch_number).padStart(3, '0')} · ${formatCount(hitl.current_batch.sample_count)} samples`,
              unavailableReason: 'No batch has been created',
            },
            {
              term: 'Current job',
              value: hitl.current_job === null ? null : <StatusPill status={hitl.current_job.status} />,
              unavailableReason: 'No training job has been queued',
            },
            {
              term: 'Last training',
              value: hitl.last_training_at === null ? null : formatDateTime(hitl.last_training_at),
              unavailableReason: 'Training has never run on this machine',
            },
          ]}
        />
      </div>
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Review activity
 * ──────────────────────────────────────────────────────────────────────────────────────── */

interface ActivityRow {
  readonly t: string;
  readonly values: readonly (number | undefined)[];
}

/**
 * Pivots the series into one row per date. A date present in one series and missing from another
 * yields `undefined` for that cell, which renders as a dash rather than a `0` — the same distinction
 * the rest of the app makes between "measured zero" and "not measured".
 */
function pivot(series: readonly { readonly points: readonly SeriesPoint[] }[]): readonly ActivityRow[] {
  const dates = new Set<string>();
  for (const one of series) {
    for (const point of one.points) dates.add(point.t);
  }
  const byDate = series.map((one) => new Map(one.points.map((point) => [point.t, point.v])));
  return [...dates].sort().map((t) => ({ t, values: byDate.map((lookup) => lookup.get(t)) }));
}

function ReviewActivityPanel({
  stats,
  demo,
}: {
  readonly stats: DemoDashboardStatistics;
  readonly demo: boolean;
}): ReactElement {
  const series = stats.review_activity;
  const rows = pivot(series);

  const columns: readonly Column<ActivityRow>[] = [
    { id: 't', header: 'Date', cell: (row) => row.t, rowHeader: true, width: '9rem' },
    ...series.map((one, index) => ({
      id: one.key,
      header: one.label,
      numeric: true,
      cell: (row: ActivityRow): ReactElement | string => {
        const value = row.values[index];
        return value === undefined ? <span className="text-content-muted">–</span> : formatCount(value);
      },
    })),
  ];

  return (
    <Panel
      id="review-activity"
      title="Review activity"
      description={
        stats.from === null || stats.to === null
          ? 'Daily review outcomes.'
          : `Daily review outcomes, ${stats.from} to ${stats.to}.`
      }
      meta={demo ? <DemoBadge /> : undefined}
      bodyPadding="none"
    >
      <Table
        caption="Review outcomes per day"
        captionHidden
        columns={columns}
        rows={rows}
        rowKey={(row) => row.t}
        density="compact"
        emptyState={
          <EmptyState
            title="No review activity in this window"
            description="Nothing has been validated or skipped in the reported period. The counts appear here as soon as the first review is submitted."
            action={<LinkButton href={ROUTES.data.review} size="sm">Open the review queue</LinkButton>}
          />
        }
      />
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Recent activity
 * ──────────────────────────────────────────────────────────────────────────────────────── */

const ACTIVITY_COLUMNS: readonly Column<ActivityEntry>[] = [
  {
    id: 'at',
    header: 'When',
    width: '11rem',
    rowHeader: true,
    cell: (row) => (
      <span title={formatDateTime(row.at)} className="whitespace-nowrap">
        {formatRelative(row.at)}
      </span>
    ),
  },
  {
    id: 'event',
    header: 'Event',
    width: '14rem',
    cell: (row) => <span className="font-mono text-xs text-content-secondary">{row.event}</span>,
  },
  {
    id: 'actor',
    header: 'Actor',
    width: '10rem',
    cell: (row) =>
      row.actor_username === null ? (
        <span className="text-content-muted">system</span>
      ) : (
        row.actor_username
      ),
  },
  { id: 'message', header: 'Detail', cell: (row) => row.message },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────────────────────── */

function DashboardSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-24 rounded-md" count={6} label="Loading dashboard figures" />
      </div>
      <Skeleton className="h-56 rounded-md" count={2} label="Loading dashboard panels" />
    </div>
  );
}

export default function DashboardPage(): ReactElement {
  // In demo mode the request is never made, so a fixture can never be joined to a live payload.
  const query = useApiQuery(getDashboardStatistics, { ready: !IS_DEMO });
  const stats: DemoDashboardStatistics | null = IS_DEMO ? DEMO_DASHBOARD.statistics : query.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="The state of the loop on this machine: how much data is here, where the human-in-the-loop cycle stands, and what has happened recently."
        hideBreadcrumbs
        meta={IS_DEMO ? <DemoBadge /> : undefined}
      />

      {query.loading && stats === null ? (
        <DashboardSkeleton />
      ) : query.error !== null && stats === null ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : stats === null ? (
        <EmptyState
          title="No figures yet"
          description="The API returned nothing to summarise. This is what an empty database looks like — upload a dataset and the counts appear here."
          action={<LinkButton href={ROUTES.data.upload}>Upload data</LinkButton>}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <KpiRow stats={stats} demo={IS_DEMO} />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {stats.hitl === null ? (
              <EmptyState
                title="The HITL cycle has not started"
                description="No validated samples have been counted yet, so there is no cycle to report. The counter starts with the first submitted review."
                action={<LinkButton href={ROUTES.data.review} size="sm">Open the review queue</LinkButton>}
              />
            ) : (
              <HitlPanel hitl={stats.hitl} demo={IS_DEMO} />
            )}

            <Panel
              id="model"
              title="Model performance"
              description="Metrics are only ever shown when this build computed them on the locked test set."
              actions={<LinkButton href={ROUTES.analyze.root} size="sm">Analyze model</LinkButton>}
            >
              {stats.active_model === null ? (
                <Blocked
                  title="Model performance"
                  reason="No model has been trained on this machine. Training, inference and Grad-CAM are not implemented yet, so there is no accuracy, loss curve or confusion matrix to show — and none will be shown until this build computes one."
                />
              ) : (
                <DefinitionList
                  items={[
                    { term: 'Version', value: stats.active_model.version, mono: true },
                    { term: 'Status', value: <StatusPill status={stats.active_model.status} /> },
                    { term: 'Architecture', value: stats.active_model.architecture, mono: true },
                    {
                      term: 'Trained',
                      value:
                        stats.active_model.trained_at === null
                          ? null
                          : formatDateTime(stats.active_model.trained_at),
                      unavailableReason: 'Training date not recorded',
                    },
                    {
                      term: 'Test metrics',
                      value:
                        stats.latest_evaluation === null
                          ? null
                          : 'See Analyze Model for the full evaluation',
                      unavailableReason: 'This version has not been evaluated on the locked test set',
                    },
                  ]}
                />
              )}
            </Panel>
          </div>

          <ReviewActivityPanel stats={stats} demo={IS_DEMO} />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel
              id="recent-activity"
              title="Recent activity"
              description="Ingestion, review and settings events. Model events appear here once training exists."
              meta={IS_DEMO ? <DemoBadge /> : undefined}
              bodyPadding="none"
            >
              <Table
                caption="Recent system activity"
                captionHidden
                columns={ACTIVITY_COLUMNS}
                rows={stats.recent_activity}
                rowKey={(row) => `${row.at}-${row.event}`}
                density="compact"
                emptyState={
                  <EmptyState
                    title="Nothing has happened yet"
                    description="The activity log is written by the API. It fills in as data is uploaded, reviewed and configured."
                    action={<LinkButton href={ROUTES.data.logs} size="sm">System logs</LinkButton>}
                  />
                }
              />
            </Panel>

            <Panel
              id="services"
              title="Services"
              description="Each row reports what was actually checked. A check that could not run reads UNKNOWN, never ONLINE."
              meta={IS_DEMO ? <DemoBadge label="Not probed" /> : undefined}
            >
              {stats.services.length === 0 ? (
                <EmptyState
                  title="No health report"
                  description="GET /health returned no probes. Start the backend to see the six service checks."
                />
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {stats.services.map((service) => (
                    <li key={service.key} className="flex flex-col gap-0.5">
                      <ServiceStateDot state={service.state} label={service.label} />
                      {service.detail === null ? null : (
                        <p className="pl-4 text-xs text-content-muted">{service.detail}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
