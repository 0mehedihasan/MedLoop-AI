'use client';

/**
 * MedLoop AI — `/data/training`, Training Management.
 *
 * ## The screen is the loop in order
 *
 * Counter, then batch, then job, then the history of both, then the settings that govern all of it.
 * That is the order §6 and §8 describe the cycle in, and reading the screen top to bottom is meant to
 * be the same experience as reading the contract: what has accumulated, what was frozen, what ran, what
 * ran before, and what the rules currently are.
 *
 * The settings come *last* deliberately. They are the most consequential control on the screen, and a
 * threshold field above the counter would invite changing the rule before looking at what the rule is
 * currently doing.
 *
 * ## One status read, shared
 *
 * `GET /training/status` returns the counter, the current batch, the current job and both models in one
 * payload. The panel that renders it and the tables below it therefore need one query, not four — and
 * starting a job refetches that one query rather than reconciling four caches.
 *
 * ## Polling is not implemented, and the refresh control says so
 *
 * A running job's progress changes without the user acting, which is the classic argument for an
 * interval. There is no interval here: no job can exist on this machine yet, so a poll would be a timer
 * against a fixture. The manual refresh is honest about needing a click, and the interval belongs in the
 * same commit as the first real worker run.
 */

import { useCallback } from 'react';
import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { getTrainingStatus } from '@/lib/api';
import { DEMO_TRAINING } from '@/lib/demo/demo-training';
import { IS_DEMO } from '@/lib/env';
import { useApiQuery } from '@/lib/use-query';
import type { HitlStatus } from '@/types/domain';

import { HitlCyclePanel } from './HitlCyclePanel';
import { TrainingRuns } from './TrainingRuns';
import { TrainingSettingsForm } from './TrainingSettingsForm';

export function TrainingView(): ReactElement {
  const query = useApiQuery((signal) => getTrainingStatus(signal), { ready: !IS_DEMO });
  const status: HitlStatus | null = IS_DEMO ? DEMO_TRAINING.status : query.data;

  /** A started job changes the status payload, so the one query behind the panel is re-read. */
  const refresh = useCallback((): void => {
    void query.refetch();
  }, [query]);

  if (status === null) {
    return (
      <div className="space-y-6">
        <Card>
          {query.error !== null ? (
            <ErrorState error={query.error} onRetry={refresh} retryLabel="Read the status again" />
          ) : (
            <Skeleton className="h-56 rounded-lg" label="Loading the HITL status" />
          )}
        </Card>
        <TrainingSettingsForm />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {IS_DEMO ? (
        <Alert tone="info" title="Fixture cycle — no batch, no job, no model">
          The counter, the batch list and the job list come from a fixture. It contains no batch and no
          training job on purpose: a batch row would claim the threshold had been reached, and a
          completed job would claim a model was fitted. Neither has happened here, so both tables show
          their empty state.
        </Alert>
      ) : (
        <div className="flex justify-end">
          <Button variant="subtle" size="sm" onClick={refresh} busy={query.refetching} busyLabel="Reading the status">
            Refresh
          </Button>
        </div>
      )}

      <HitlCyclePanel status={status} onStarted={refresh} />
      <TrainingRuns />
      <TrainingSettingsForm />
    </div>
  );
}
