'use client';

/**
 * MedLoop AI — the batch and job history on `/data/training`.
 *
 * ## Two tables, because they are two different claims
 *
 * A `TrainingBatch` says *what would be trained on*: N validated samples, frozen, immutable from the
 * moment the row exists (§8.4). A `TrainingJob` says *an attempt was made to train it*, and a batch may
 * accumulate several attempts — a `FAILED` job does not invalidate the batch, and retrying does not
 * create a second batch. Collapsing the two into one table would make a retry look like a second
 * dataset.
 *
 * ## `threshold_at_creation` is a column, not a footnote
 *
 * The setting can move at any time. A batch created at 1,000 samples stays a 1,000-sample batch
 * forever, so the number that applied *then* is shown per row rather than read from the current
 * settings — which is the whole of §8.4 expressed as a table column.
 *
 * ## Cancelling is offered only where it can act
 *
 * `POST /training/jobs/{id}/cancel` is meaningful for `QUEUED`, `RUNNING` and `EVALUATING`. A finished
 * job has nothing to cancel, so the cell is empty rather than holding a disabled button (§2.3).
 */

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { Table, TableScroll } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, Skeleton, Unavailable } from '@/components/ui/states';
import { cancelTrainingJob, listTrainingBatches, listTrainingJobs } from '@/lib/api';
import { DEMO_TRAINING } from '@/lib/demo/demo-training';
import { IS_DEMO } from '@/lib/env';
import { formatCount, formatDateTime, formatPercent, humaniseEnum } from '@/lib/format';
import { useApiAction, useApiQuery } from '@/lib/use-query';
import type { Paginated } from '@/types/api';
import { TrainingJobStatus } from '@/types/domain';
import type { TrainingBatch, TrainingJob } from '@/types/domain';

/** The three states in which a cancel request can still change the outcome. */
const CANCELLABLE: readonly TrainingJobStatus[] = [
  TrainingJobStatus.QUEUED,
  TrainingJobStatus.RUNNING,
  TrainingJobStatus.EVALUATING,
];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Batches
 * ──────────────────────────────────────────────────────────────────────────────────────── */

const BATCH_COLUMNS: readonly Column<TrainingBatch>[] = [
  {
    id: 'batch_number',
    header: 'Batch',
    rowHeader: true,
    width: '9rem',
    cell: (batch) => <Badge mono>{`batch_${String(batch.batch_number).padStart(3, '0')}`}</Badge>,
  },
  {
    id: 'status',
    header: 'Status',
    width: '9rem',
    cell: (batch) => <StatusPill status={batch.status} />,
  },
  {
    id: 'sample_count',
    header: 'Samples',
    numeric: true,
    width: '7rem',
    cell: (batch) => formatCount(batch.sample_count),
  },
  {
    id: 'threshold_at_creation',
    header: 'Threshold then',
    numeric: true,
    width: '9rem',
    cell: (batch) => formatCount(batch.threshold_at_creation),
  },
  {
    id: 'dataset_version_id',
    header: 'Dataset version',
    width: '9rem',
    cell: (batch) =>
      batch.dataset_version_id === null ? (
        <Unavailable reason="Not tied to a dataset version." />
      ) : (
        <span className="font-mono text-xs">{`#${batch.dataset_version_id}`}</span>
      ),
  },
  {
    id: 'created_at',
    header: 'Created',
    width: '11rem',
    cell: (batch) => <span className="whitespace-nowrap">{formatDateTime(batch.created_at)}</span>,
  },
  {
    id: 'completed_at',
    header: 'Completed',
    width: '11rem',
    cell: (batch) =>
      batch.completed_at === null ? (
        <Unavailable reason="Has not finished." />
      ) : (
        <span className="whitespace-nowrap">{formatDateTime(batch.completed_at)}</span>
      ),
  },
];

function TrainingBatches(): ReactElement {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const query = useApiQuery(
    (signal) => listTrainingBatches({ page, page_size: pageSize }, signal),
    { ready: !IS_DEMO, deps: [page, pageSize] },
  );

  const data: Paginated<TrainingBatch> | null = IS_DEMO ? DEMO_TRAINING.batches : query.data;
  const rows = data?.items ?? [];

  return (
    <Card padding="none">
      <div className="px-4 pt-4">
        <SectionHeader
          title="Training batches"
          description="Each row is a frozen set of validated samples. Membership is append-only at creation and immutable afterwards, and the threshold that applied then is recorded per batch."
        />
      </div>

      {query.loading && data === null ? (
        <div className="p-4">
          <Skeleton className="h-40 rounded-lg" label="Loading training batches" />
        </div>
      ) : query.error !== null && data === null ? (
        <div className="p-4">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No batch has been created"
            description="A batch appears here the first time the validated-sample counter reaches the threshold. Nothing has reached it on this machine, so the table is genuinely empty rather than unloaded."
          />
        </div>
      ) : (
        <div className="mt-3">
          <TableScroll label="Training batches" maxHeightClassName="max-h-[28rem]">
            <Table
              caption="Training batches"
              captionHidden
              columns={BATCH_COLUMNS}
              rows={rows}
              rowKey={(batch) => batch.id}
              density="compact"
              stickyHeader
            />
          </TableScroll>
          {data === null ? null : (
            <Pagination
              meta={data}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              noun="batches"
              busy={query.refetching}
              className="border-t border-edge-subtle px-3 py-2"
            />
          )}
        </div>
      )}
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Jobs
 * ──────────────────────────────────────────────────────────────────────────────────────── */

function TrainingJobs(): ReactElement {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const cancel = useApiAction(cancelTrainingJob);

  const query = useApiQuery((signal) => listTrainingJobs({ page, page_size: pageSize }, signal), {
    ready: !IS_DEMO,
    deps: [page, pageSize],
  });

  const data: Paginated<TrainingJob> | null = IS_DEMO ? DEMO_TRAINING.jobs : query.data;
  const rows = data?.items ?? [];

  const cancelJob = useCallback(
    async (id: number): Promise<void> => {
      const result = await cancel.run(id);
      if (result === null) return;
      await query.refetch();
    },
    [cancel, query],
  );

  /**
   * Built inside the component because the cancel cell closes over `cancel.busy` and `cancelJob`.
   * A module-level constant would capture the first render's handler.
   */
  const columns: readonly Column<TrainingJob>[] = [
    {
      id: 'id',
      header: 'Job',
      rowHeader: true,
      width: '6rem',
      cell: (job) => <Badge mono>{`#${job.id}`}</Badge>,
    },
    {
      id: 'status',
      header: 'Status',
      width: '9rem',
      cell: (job) => <StatusPill status={job.status} />,
    },
    {
      id: 'training_batch_id',
      header: 'Batch',
      width: '6rem',
      cell: (job) => <span className="font-mono text-xs">{`#${job.training_batch_id}`}</span>,
    },
    {
      id: 'device',
      header: 'Device',
      width: '10rem',
      // Requested and actual in one cell, but never merged: §2.3 wants the device the run used.
      cell: (job) => (
        <span className="whitespace-nowrap text-xs">
          <span className="text-content-secondary">{humaniseEnum(job.device_requested)}</span>
          {job.device_actual === null ? (
            <span className="text-content-muted"> → not reported</span>
          ) : (
            <span className="font-mono text-content-primary"> → {job.device_actual}</span>
          )}
        </span>
      ),
    },
    {
      id: 'progress',
      header: 'Progress',
      numeric: true,
      width: '8rem',
      cell: (job) =>
        job.progress === null ? (
          <Unavailable reason="The worker has not reported progress." />
        ) : (
          formatPercent(job.progress * 100)
        ),
    },
    {
      id: 'epoch',
      header: 'Epoch',
      numeric: true,
      width: '8rem',
      cell: (job) =>
        job.current_epoch === null ? (
          <Unavailable reason="No epoch reported." />
        ) : (
          `${formatCount(job.current_epoch)}${job.total_epochs === null ? '' : ` / ${formatCount(job.total_epochs)}`}`
        ),
    },
    {
      id: 'started_at',
      header: 'Started',
      width: '11rem',
      cell: (job) =>
        job.started_at === null ? (
          <Unavailable reason="Queued, not started." />
        ) : (
          <span className="whitespace-nowrap">{formatDateTime(job.started_at)}</span>
        ),
    },
    {
      id: 'finished_at',
      header: 'Finished',
      width: '11rem',
      cell: (job) =>
        job.finished_at === null ? (
          <Unavailable reason="Still open." />
        ) : (
          <span className="whitespace-nowrap">{formatDateTime(job.finished_at)}</span>
        ),
    },
    {
      id: 'error_message',
      header: 'Failure',
      cell: (job) =>
        job.error_message === null ? (
          <span className="text-content-muted">—</span>
        ) : (
          <span className="text-status-danger">{job.error_message}</span>
        ),
    },
    {
      id: 'actions',
      header: 'Actions',
      headerHidden: true,
      width: '7rem',
      // Absent, not disabled, once the job can no longer be cancelled.
      cell: (job) =>
        IS_DEMO || !CANCELLABLE.includes(job.status) ? null : (
          <Button
            size="sm"
            variant="subtle"
            onClick={() => void cancelJob(job.id)}
            busy={cancel.busy}
            busyLabel="Cancelling the job"
          >
            Cancel
          </Button>
        ),
    },
  ];

  return (
    <Card padding="none">
      <div className="px-4 pt-4">
        <SectionHeader
          title="Training jobs"
          description="One batch may be attempted more than once. A failed job does not invalidate its batch, and a retry does not create a second one."
        />
      </div>

      {cancel.error !== null ? (
        <div className="px-4 pt-3">
          <Alert tone="danger" title="The job was not cancelled" live>
            {cancel.error.message}
          </Alert>
        </div>
      ) : null}

      {query.loading && data === null ? (
        <div className="p-4">
          <Skeleton className="h-40 rounded-lg" label="Loading training jobs" />
        </div>
      ) : query.error !== null && data === null ? (
        <div className="p-4">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No training job has been queued"
            description="A job exists only after a batch is started. No batch exists, so nothing could have been queued — this is an empty history, not a missing one."
          />
        </div>
      ) : (
        <div className="mt-3">
          <TableScroll label="Training jobs" maxHeightClassName="max-h-[28rem]">
            <Table
              caption="Training jobs"
              captionHidden
              columns={columns}
              rows={rows}
              rowKey={(job) => job.id}
              density="compact"
              stickyHeader
            />
          </TableScroll>
          {data === null ? null : (
            <Pagination
              meta={data}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              noun="jobs"
              busy={query.refetching}
              className="border-t border-edge-subtle px-3 py-2"
            />
          )}
        </div>
      )}
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Both
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export function TrainingRuns(): ReactElement {
  return (
    <div className="space-y-6">
      <TrainingBatches />
      <TrainingJobs />
    </div>
  );
}
