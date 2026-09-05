'use client';

/**
 * MedLoop AI — `/analyze`.
 *
 * ## Three reads, and only one of them may stop the screen
 *
 * `GET /models` *is* the screen. `GET /models/active` names the version serving predictions.
 * `GET /admin/settings/training` supplies `primary_promotion_metric`, which decides *which tile is
 * marked* and nothing else — so a failure there passes `null` down and costs a highlight, not the
 * page. Only the registry read is fatal.
 *
 * ## "No active version" is a warning, not an empty space
 *
 * A registry with rows and no `ACTIVE` row means every version was rejected or archived and nothing is
 * serving predictions. That is a real state and it needs saying out loud; blank space where the active
 * panel would be reads as "still loading". `GET /models/active` answers `null` on *success*, so the two
 * are told apart by the query's `status`, never by `data === null`.
 *
 * ## Selection follows the data instead of an effect
 *
 * `chosen` is `null` until the user picks a row, and the version shown is `chosen ?? active ?? newest`.
 * Nothing seeds it in an effect, so there is no render in which the screen has data and has not yet
 * decided what to show.
 *
 * ## A promotion changes two rows, so the answer comes from the server
 *
 * Promoting a candidate archives the version that was active — one request, two rows, enforced by a
 * partial unique index (§9). A client that patched the row it acted on would briefly show two active
 * versions. `onChanged` therefore re-reads the registry and the active version rather than editing
 * local state.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/Button';
import { Card, Panel } from '@/components/ui/Card';
import { DefinitionList } from '@/components/ui/KpiTile';
import { Blocked, EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { getActiveModel, getTrainingSettings, listModels } from '@/lib/api';
import { DEMO_ANALYZE } from '@/lib/demo/demo-analyze';
import { IS_DEMO } from '@/lib/env';
import { formatCount, formatDateTime } from '@/lib/format';
import { ROUTES } from '@/lib/navigation';
import { useApiQuery } from '@/lib/use-query';
import type { Model, PromotionMetric } from '@/types/domain';

import { EvaluationDetail } from './EvaluationDetail';
import { ModelRegistry } from './ModelRegistry';
import { NO_MODEL_REASON } from './lib';

/** `#3`, or the sentence explaining why there is no number. Kept here so the four rows read alike. */
function versionRef(id: number | null): string | null {
  return id === null ? null : `#${String(id)}`;
}

export function AnalyzeView(): ReactElement {
  const modelsQuery = useApiQuery((signal) => listModels(undefined, signal), { ready: !IS_DEMO });
  const activeQuery = useApiQuery((signal) => getActiveModel(signal), { ready: !IS_DEMO });
  const settingsQuery = useApiQuery((signal) => getTrainingSettings(signal), { ready: !IS_DEMO });

  const models: readonly Model[] | null = IS_DEMO ? DEMO_ANALYZE.models : modelsQuery.data;
  const active: Model | null = IS_DEMO ? DEMO_ANALYZE.active : activeQuery.data;
  /** `null` is this endpoint's success value, so only `status` can distinguish it from "not yet read". */
  const activeResolved = IS_DEMO || activeQuery.status === 'success';
  const primary: PromotionMetric | null =
    settingsQuery.data?.settings.primary_promotion_metric ?? null;

  const [chosen, setChosen] = useState<number | null>(null);

  /*
   * Destructured so the dependency array holds plain identifiers. `refetch` is stable; the object
   * around it is not, and `exhaustive-deps` cannot see the difference through a member expression.
   */
  const { refetch: refetchModels } = modelsQuery;
  const { refetch: refetchActive } = activeQuery;
  const refresh = useCallback((): void => {
    void refetchModels();
    void refetchActive();
  }, [refetchModels, refetchActive]);

  /** Newest first, matching the registry's own order so `ordered[0]` is what the table shows first. */
  const ordered = useMemo(
    () => [...(models ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [models],
  );
  const newest = ordered[0];
  /** A comparison needs two measured versions; below that the compare screen has nothing to line up. */
  const comparableCount = ordered.filter(
    (model) => model.test_metrics !== null && model.test_dataset_version_id !== null,
  ).length;

  const selectedId = chosen ?? active?.id ?? newest?.id ?? null;
  const selected = ordered.find((model) => model.id === selectedId);

  if (models === null) {
    return (
      <Card>
        {modelsQuery.error !== null ? (
          <ErrorState
            error={modelsQuery.error}
            onRetry={() => void refetchModels()}
            retryLabel="Read the registry again"
          />
        ) : (
          <Skeleton className="h-64 rounded-lg" label="Loading the model registry" />
        )}
      </Card>
    );
  }

  if (models.length === 0) {
    // The §10 layout preview is composed by the route, so it stays reachable in this state too.
    return <Blocked title="Model analysis" reason={NO_MODEL_REASON} />;
  }

  const compareLink =
    comparableCount < 2 ? undefined : (
      <LinkButton size="sm" variant="secondary" href={ROUTES.analyze.compare}>
        {`Compare ${formatCount(comparableCount)} versions`}
      </LinkButton>
    );

  return (
    <div className="space-y-6">
      {activeResolved && active === null ? (
        <Alert tone="warn" title="No version is active">
          {`${formatCount(models.length)} versions are registered and none of them is ACTIVE, so nothing is serving predictions. A candidate becomes active only through an explicit promotion after it has been evaluated on the locked test set — training alone never promotes (§2.7).`}
        </Alert>
      ) : null}

      {active === null ? null : (
        <Panel
          title={`${active.version} is active`}
          description="The version every new prediction runs on. Exactly one is active at a time, and promoting another archives this one rather than deleting it."
        >
          <DefinitionList
            layout="columns"
            items={[
              { term: 'Architecture', value: active.architecture, mono: true },
              {
                term: 'Promoted at',
                value: active.promoted_at === null ? null : formatDateTime(active.promoted_at),
                unavailableReason:
                  'No promotion timestamp is recorded for this version, so when it became active cannot be stated.',
              },
              {
                term: 'Trained on dataset version',
                value: versionRef(active.training_dataset_version_id),
                mono: true,
                unavailableReason:
                  'The training dataset version was not recorded, so what this version learned from cannot be traced from here.',
              },
              {
                term: 'Evaluated on test version',
                value: versionRef(active.test_dataset_version_id),
                mono: true,
                unavailableReason:
                  'This version carries no evaluation, so its figures cannot be compared with another version’s.',
              },
            ]}
          />
        </Panel>
      )}

      <ModelRegistry
        models={ordered}
        selectedId={selectedId}
        onSelect={setChosen}
        primary={primary}
        onChanged={refresh}
        actions={compareLink}
      />

      {selected === undefined ? (
        <EmptyState
          title="No version is selected"
          description="Pick a version in the table above to read its evaluation. The active version is selected by default; if none is active, the most recently registered one is."
        />
      ) : (
        <EvaluationDetail
          modelId={selected.id}
          modelVersion={selected.version}
          primary={primary}
        />
      )}
    </div>
  );
}
