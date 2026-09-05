'use client';

/**
 * MedLoop AI — the HITL cycle panel on `/data/training`.
 *
 * ## Every number here comes from the server
 *
 * `remaining`, `progress` and `threshold_met` are fields of `HitlStatus`, not expressions over
 * `validated_since_last_training` and `threshold`. Computing them here would put a second
 * implementation of the trigger rule in the client, and §8.4 makes that rule subtler than it looks:
 * lowering the threshold below the current count means the threshold is *already met*, and a client
 * that recomputed `remaining` as `threshold - count` would render a negative number where the server
 * renders "ready".
 *
 * ## The stage is the loop, named
 *
 * `HitlCycleStage` is derived server-side from the batch, the job and the candidate together. The panel
 * shows it as a pill and then shows the three records it was derived from, so a stage that looks wrong
 * can be checked against its inputs rather than argued with.
 *
 * ## No start control appears without a batch
 *
 * `POST /training/batches/{id}/start` needs a batch, and a batch only exists once the counter reaches
 * the threshold (§8.3). Below the threshold the button is *absent* rather than disabled — §2.3's rule
 * that a control which cannot do its job is worse than no control — and the sentence beside the
 * counter says what has to happen first.
 */

import { useCallback } from 'react';
import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Card';
import { DefinitionList, KpiTile, ProgressBar } from '@/components/ui/KpiTile';
import type { DefinitionItem } from '@/components/ui/KpiTile';
import { Blocked } from '@/components/ui/states';
import { startTrainingBatch } from '@/lib/api';
import { IS_DEMO } from '@/lib/env';
import { formatCount, formatDateTime, formatPercent, humaniseEnum } from '@/lib/format';
import { useApiAction } from '@/lib/use-query';
import type { HitlStatus, TrainingBatch, TrainingJob } from '@/types/domain';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The counter
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The threshold in words, phrased around what it is waiting for.
 *
 * `threshold_met` is read rather than inferred, so a threshold lowered under the current count reads as
 * met here without this file knowing that rule exists.
 */
function counterText(status: HitlStatus): string {
  if (status.threshold_met) {
    return `${formatCount(status.validated_since_last_training)} of ${formatCount(status.threshold)} — the threshold is met`;
  }
  return `${formatCount(status.validated_since_last_training)} of ${formatCount(status.threshold)}`;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The current batch and job
 * ──────────────────────────────────────────────────────────────────────────────────────── */

function batchItems(batch: TrainingBatch): readonly DefinitionItem[] {
  return [
    { term: 'Batch', value: <Badge mono>{`batch_${String(batch.batch_number).padStart(3, '0')}`}</Badge> },
    { term: 'Status', value: <StatusPill status={batch.status} /> },
    {
      term: 'Samples',
      value: formatCount(batch.sample_count),
    },
    {
      term: 'Threshold at creation',
      value: formatCount(batch.threshold_at_creation),
    },
    {
      term: 'Dataset version',
      value: batch.dataset_version_id === null ? null : `#${batch.dataset_version_id}`,
      unavailableReason: 'The batch is not tied to a dataset version.',
      mono: true,
    },
    { term: 'Created', value: formatDateTime(batch.created_at) },
    {
      term: 'Completed',
      value: batch.completed_at === null ? null : formatDateTime(batch.completed_at),
      unavailableReason: 'This batch has not finished.',
    },
  ];
}

/**
 * The job, including the device it *actually* used.
 *
 * `device_requested` and `device_actual` are shown as two rows rather than one, because §2.3 requires
 * reporting the device the forward pass ran on, not the configured one — an `MPS` request that fell
 * back to CPU is a fact about the run, and collapsing the two would hide it.
 */
function jobItems(job: TrainingJob): readonly DefinitionItem[] {
  return [
    { term: 'Job', value: `#${job.id}`, mono: true },
    { term: 'Status', value: <StatusPill status={job.status} /> },
    { term: 'Device requested', value: humaniseEnum(job.device_requested) },
    {
      term: 'Device used',
      value: job.device_actual,
      unavailableReason: 'The worker has not reported a device yet.',
      mono: true,
    },
    {
      term: 'Epoch',
      value:
        job.current_epoch === null
          ? null
          : `${formatCount(job.current_epoch)}${job.total_epochs === null ? '' : ` of ${formatCount(job.total_epochs)}`}`,
      unavailableReason: 'No epoch has been reported.',
    },
    {
      term: 'Started',
      value: job.started_at === null ? null : formatDateTime(job.started_at),
      unavailableReason: 'Queued, not started.',
    },
    {
      term: 'Finished',
      value: job.finished_at === null ? null : formatDateTime(job.finished_at),
      unavailableReason: 'Still open.',
    },
  ];
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The panel
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface HitlCyclePanelProps {
  readonly status: HitlStatus;
  /** Called after a job is queued, so the caller refetches the status and the job list. */
  readonly onStarted: () => void;
}

export function HitlCyclePanel({ status, onStarted }: HitlCyclePanelProps): ReactElement {
  const start = useApiAction(startTrainingBatch);
  const batch = status.current_batch;

  const startJob = useCallback(async (): Promise<void> => {
    if (batch === null) return;
    const result = await start.run(batch.id);
    if (result === null) return;
    onStarted();
  }, [start, batch, onStarted]);

  return (
    <div className="space-y-6">
      <Panel
        title="The HITL cycle"
        description="Validated samples accumulate until they reach the threshold, then a batch is frozen. Every figure here is served by the API — none of it is recomputed on this screen."
        meta={<StatusPill status={status.stage} />}
      >
        <div className="space-y-5">
          <ProgressBar
            label="Validated samples toward the retraining threshold"
            value={status.validated_since_last_training}
            max={status.threshold}
            valueText={counterText(status)}
            tone={status.threshold_met ? 'warn' : 'info'}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Validated since last batch"
              value={formatCount(status.validated_since_last_training)}
              suffix="samples"
              hint="Skipped samples are not counted (§6.2)."
            />
            <KpiTile
              label="Threshold"
              value={formatCount(status.threshold)}
              suffix="samples"
              hint="A setting, not a constant. Change it under Training settings below."
            />
            <KpiTile
              label="Remaining"
              value={formatCount(status.remaining)}
              suffix="samples"
              hint="Served by the API, so a lowered threshold reads as met rather than negative."
            />
            <KpiTile
              label="Progress"
              value={formatPercent(status.progress * 100)}
              hint="The API's figure, clamped server-side."
            />
          </div>
          <p className="text-sm text-content-secondary">
            Last batch created{' '}
            {status.last_training_at === null
              ? 'never — no batch has been assembled on this machine.'
              : formatDateTime(status.last_training_at)}
          </p>
        </div>
      </Panel>

      {start.error !== null ? (
        <Alert tone="danger" title="The training job was not queued" live>
          {start.error.message}
        </Alert>
      ) : null}

      {batch === null ? (
        <Panel
          title="Current batch"
          description="A batch is frozen automatically when the counter reaches the threshold. Its membership is immutable from that moment (§8.4)."
        >
          <Blocked
            title="No batch has been assembled"
            reason={
              status.threshold_met
                ? 'The threshold reads as met but no batch has been created yet. The batch is created by the server inside the submit transaction, so this state resolves on its own.'
                : `${formatCount(status.remaining)} more validated samples are needed. Nothing can be started before then — and a start button that cannot start anything would be worse than none.`
            }
          />
        </Panel>
      ) : (
        <Panel
          title="Current batch"
          description="Frozen membership. The threshold recorded here is the one that applied at creation, whatever the setting says now."
          meta={<StatusPill status={batch.status} />}
          actions={
            IS_DEMO || status.current_job !== null ? undefined : (
              <Button
                variant="primary"
                onClick={() => void startJob()}
                busy={start.busy}
                busyLabel="Queuing the training job"
              >
                Start training
              </Button>
            )
          }
        >
          <DefinitionList items={batchItems(batch)} />
        </Panel>
      )}

      {status.current_job === null ? null : (
        <Panel
          title="Current job"
          description="One batch, at most one live job. Progress and the device in use are reported by the worker, not assumed."
          meta={<StatusPill status={status.current_job.status} />}
        >
          <div className="space-y-4">
            <ProgressBar
              label="Training progress"
              value={status.current_job.progress}
              max={1}
              valueText={
                status.current_job.progress === null
                  ? 'The worker has not reported progress'
                  : formatPercent(status.current_job.progress * 100)
              }
            />
            {status.current_job.error_message === null ? null : (
              <Alert tone="danger" title="The worker reported a failure">
                {status.current_job.error_message}
              </Alert>
            )}
            <DefinitionList items={jobItems(status.current_job)} />
          </div>
        </Panel>
      )}

      <Panel
        title="Models in this cycle"
        description="A finished job produces a candidate, never an active model. Promotion is a separate, evaluated decision (§2.7)."
      >
        {status.active_model === null && status.candidate_model === null ? (
          <Blocked
            title="No model exists on this machine"
            reason="Nothing has been trained here, so there is no active model to compare against and no candidate awaiting a decision. Model figures appear only once a training run has produced them."
          />
        ) : (
          <DefinitionList
            items={[
              {
                term: 'Active',
                value: status.active_model === null ? null : status.active_model.version,
                unavailableReason: 'No model is active.',
                mono: true,
              },
              {
                term: 'Candidate',
                value: status.candidate_model === null ? null : status.candidate_model.version,
                unavailableReason: 'No candidate is awaiting a decision.',
                mono: true,
              },
            ]}
          />
        )}
      </Panel>
    </div>
  );
}
