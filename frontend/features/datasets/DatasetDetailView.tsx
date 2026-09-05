'use client';

/**
 * MedLoop AI — `/data/datasets/[id]`, one dataset and its versions.
 *
 * ## Why this view owns its own `PageHeader`
 *
 * The breadcrumb trail for a detail route must end at a name, never a raw id — `leafLabel` on
 * `PageHeader` exists for exactly that. The name arrives with the payload, so the header is rendered
 * here rather than in the server page: a page that rendered it would have to guess.
 *
 * ## Versions are the unit that gets locked, not datasets
 *
 * A dataset accumulates images; a *version* fixes how they were split and can lock its test set (§2.5).
 * Selecting a version therefore changes what the image table below is looking at, and locking one is
 * the single most consequential button on this screen — which is why it demands the version's own label
 * typed back before it will fire.
 */

import { useCallback, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { PageHeader } from '@/components/shell/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { StatusPill } from '@/components/ui/Badge';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, Panel, SectionHeader } from '@/components/ui/Card';
import { RadioGroup } from '@/components/ui/Choice';
import type { RadioOption } from '@/components/ui/Choice';
import { FormField } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { DefinitionList } from '@/components/ui/KpiTile';
import type { DefinitionItem } from '@/components/ui/KpiTile';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { DemoBadge } from '@/components/ui/project';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { createDatasetVersion, getDataset, lockTestSet } from '@/lib/api';
import { DEMO_DATASETS } from '@/lib/demo/demo-datasets';
import { IS_DEMO } from '@/lib/env';
import { formatCount, formatDate, formatDateTime, humaniseEnum } from '@/lib/format';
import { ROUTES } from '@/lib/navigation';
import { useApiAction, useApiQuery } from '@/lib/use-query';
import type { DatasetDetail, DatasetVersion } from '@/types/domain';

import { DatasetImages } from './DatasetImages';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Pieces
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** The dataset's own metadata. `null` values render `Unavailable` through `DefinitionList`. */
function datasetItems(dataset: DatasetDetail): readonly DefinitionItem[] {
  return [
    { term: 'Status', value: <StatusPill status={dataset.status} /> },
    { term: 'Registered', value: formatDateTime(dataset.created_at) },
    {
      term: 'Source',
      value: dataset.source,
      unavailableReason: 'No source was recorded when this dataset was registered.',
    },
    {
      term: 'Description',
      value: dataset.description,
      unavailableReason: 'No description was recorded.',
    },
    {
      term: 'Archived',
      value: dataset.archived_at === null ? 'No' : formatDateTime(dataset.archived_at),
    },
    { term: 'Versions', value: formatCount(dataset.versions.length) },
  ];
}

/**
 * A version's split composition.
 *
 * Six of the ten `DatasetCounts` buckets, chosen because they are the ones a split decision turns on.
 * The counts are a partition — every image is in exactly one bucket — so these six plus the four not
 * shown add up to `total`, and `total` is printed so the omission is visible rather than silent.
 */
function versionItems(version: DatasetVersion): readonly DefinitionItem[] {
  const { counts } = version;
  return [
    { term: 'Total', value: formatCount(counts.total), mono: true },
    { term: 'Train', value: formatCount(counts.train), mono: true },
    { term: 'Validation', value: formatCount(counts.validation), mono: true },
    { term: 'Test', value: formatCount(counts.test), mono: true },
    { term: 'Unused, untouched', value: formatCount(counts.unused), mono: true },
    { term: 'Validated', value: formatCount(counts.validated), mono: true },
    { term: 'Skipped', value: formatCount(counts.skipped), mono: true },
    { term: 'Staging', value: formatCount(counts.staging), mono: true },
  ];
}

/**
 * Create a version.
 *
 * A version is a snapshot of how the images were split, so its label is the thing every later
 * comparison is quoted against — `model_evaluations` joins to it, and two models measured on different
 * versions are not comparable (§9). Hence a required, human-chosen label rather than an auto-increment.
 */
function CreateVersionDialog({
  datasetId,
  open,
  onDismiss,
  onCreated,
}: {
  readonly datasetId: number;
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly onCreated: () => void;
}): ReactElement {
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const create = useApiAction(createDatasetVersion);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const submit = useCallback(async (): Promise<void> => {
    const result = await create.run(datasetId, {
      label: label.trim(),
      ...(note.trim() === '' ? {} : { note: note.trim() }),
    });
    if (result === null) return;
    setLabel('');
    setNote('');
    onCreated();
  }, [create, datasetId, label, note, onCreated]);

  return (
    <Modal
      open={open}
      onDismiss={onDismiss}
      title="New dataset version"
      description="A version records how the images were split. Nothing is copied — splits are references."
      dismissible={!create.busy}
      initialFocus={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} onClick={onDismiss} disabled={create.busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            busy={create.busy}
            busyLabel="Creating the version"
            disabled={label.trim() === ''}
          >
            Create version
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {create.error !== null ? (
          <Alert tone="danger" title="The version was not created" live>
            {create.error.message}
          </Alert>
        ) : null}
        <FormField
          label="Label"
          required
          hint="Quoted in every evaluation that uses this version. Short and stable — v1, v2-patient-split."
        >
          <Input value={label} onChange={(event) => setLabel(event.target.value)} autoComplete="off" />
        </FormField>
        <FormField label="Note" hint="Optional. How the split was produced — the grouping and the seed.">
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
        </FormField>
      </div>
    </Modal>
  );
}

/**
 * Lock a version's test set.
 *
 * The one control on this screen that a hard rule protects. §2.5 makes a locked test set untouchable —
 * never retrained on, never corrected for training, never admitted to the HITL pool — and §9 makes
 * every model comparison quote the version it was measured on. There is no unlock operation, because
 * the correct way to split differently is a new version.
 *
 * So the confirmation demands the version's own label typed back (`confirmPhrase`), and the reason is
 * stored on the row rather than left in someone's memory.
 */
function LockTestSetDialog({
  version,
  open,
  onDismiss,
  onLocked,
}: {
  readonly version: DatasetVersion;
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly onLocked: () => void;
}): ReactElement {
  const [reason, setReason] = useState('');
  const lock = useApiAction(lockTestSet);

  const submit = useCallback(async (): Promise<void> => {
    const result = await lock.run(version.id, {
      confirm: true,
      ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
    });
    if (result === null) return;
    setReason('');
    onLocked();
  }, [lock, version.id, reason, onLocked]);

  return (
    <ConfirmDialog
      open={open}
      title={`Lock the test set of ${version.label}`}
      confirmLabel="Lock the test set"
      tone="danger"
      confirmPhrase={version.label}
      busy={lock.busy}
      onConfirm={() => void submit()}
      onCancel={onDismiss}
    >
      <div className="space-y-4">
        <p>
          Fixes {formatCount(version.counts.test)} images as the test set of {version.label}. Nothing in
          this version can be reassigned afterwards, and every model evaluated against it is measured on
          identical data — the only condition under which two model versions are comparable.
        </p>
        <p>There is no unlock. To split differently, create another version.</p>
        {lock.error !== null ? (
          <Alert tone="danger" title="The test set was not locked" live>
            {lock.error.message}
          </Alert>
        ) : null}
        <FormField
          label="Reason"
          hint="Optional, stored with the lock. Why this test set, and how it was drawn."
        >
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            disabled={lock.busy}
          />
        </FormField>
      </div>
    </ConfirmDialog>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Versions
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The chooser is a real radio group rather than a row of links.
 *
 * The versions are mutually exclusive views of one dataset, and picking one changes what the image
 * table below is reading — that is a single-choice control, and the browser already has one.
 * `RadioOption.label` is a plain string, so the status travels as words here and as a `<StatusPill />`
 * in the panel underneath.
 */
function versionOptions(versions: readonly DatasetVersion[]): readonly RadioOption[] {
  return versions.map((version) => {
    const state = version.is_test_locked ? 'Test set locked' : humaniseEnum(version.status);
    return {
      value: String(version.id),
      label: version.label,
      description: `${state} · ${formatCount(version.counts.total)} images · registered ${formatDate(version.created_at)}`,
    };
  });
}

/**
 * One version: what it contains, and the lock control if it is still unlocked.
 *
 * The lock button lives here, beside the counts it will freeze, rather than in the page header — a
 * destructive action belongs next to the thing it acts on, where its subject is on screen.
 */
function VersionPanel({
  version,
  onLock,
}: {
  readonly version: DatasetVersion;
  readonly onLock: () => void;
}): ReactElement {
  return (
    <Panel
      title={version.label}
      description={version.note ?? undefined}
      meta={<StatusPill status={version.status} />}
      actions={
        version.is_test_locked || IS_DEMO ? undefined : (
          <Button variant="danger" onClick={onLock}>
            Lock test set
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {version.is_test_locked ? (
          <Alert tone="info" title={`Test set locked ${formatDateTime(version.locked_at)}`}>
            {formatCount(version.counts.test)} images are fixed as this version&rsquo;s test set. They
            cannot be reassigned, reviewed, or admitted to the HITL pool, and every model version is
            evaluated on exactly them.
          </Alert>
        ) : null}
        <DefinitionList items={versionItems(version)} />
      </div>
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The screen
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface DatasetDetailViewProps {
  readonly datasetId: number;
}

export function DatasetDetailView({ datasetId }: DatasetDetailViewProps): ReactElement {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [locking, setLocking] = useState(false);

  const query = useApiQuery((signal) => getDataset(datasetId, signal), {
    ready: !IS_DEMO,
    deps: [datasetId],
  });

  const detail: DatasetDetail | null = IS_DEMO ? DEMO_DATASETS.detail : query.data;
  const versions = detail?.versions ?? [];

  /**
   * The default selection is resolved here, during render, rather than in an effect. An effect would
   * render one frame with nothing selected, and the image table would spend that frame asking for
   * every image in the dataset.
   */
  const fallback: DatasetVersion | null = versions.length > 0 ? versions[0] : null;
  const selected: DatasetVersion | null =
    versions.find((version) => version.id === selectedId) ?? fallback;

  const refetch = useCallback((): void => {
    void query.refetch();
  }, [query]);

  const header = (
    <PageHeader
      title={detail === null ? 'Dataset' : detail.name}
      description="A dataset accumulates images; a version fixes how they were split. Locking a version's test set is permanent — every model version is then evaluated on exactly those images."
      leafLabel={detail?.name}
      meta={IS_DEMO ? <DemoBadge /> : undefined}
      actions={
        IS_DEMO || detail === null ? undefined : (
          <Button variant="primary" onClick={() => setCreating(true)}>
            New version
          </Button>
        )
      }
    />
  );

  if (query.loading && detail === null) {
    return (
      <>
        {header}
        <Skeleton className="h-64 rounded-lg" label="Loading this dataset" />
      </>
    );
  }

  if (query.error !== null && detail === null) {
    return (
      <>
        {header}
        <ErrorState error={query.error} onRetry={refetch} />
      </>
    );
  }

  if (detail === null) {
    return (
      <>
        {header}
        <EmptyState
          title="This dataset is not available"
          description="Nothing was returned for this id. It may never have been registered, or the identifier in the address may be wrong — archived datasets are still returned, because nothing is hard-deleted."
          action={<LinkButton href={ROUTES.data.datasets}>Back to datasets</LinkButton>}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="space-y-6">
        {IS_DEMO ? (
          <Alert tone="info" title="Fixture dataset — nothing here was read from disk">
            Two versions, one of them locked, so both the permitted and the refused path are visible. No
            request is made: creating a version and locking a test set are not rendered at all, and the
            image table below shows only the rows the fixture holds for the selected version.
          </Alert>
        ) : null}

        <Panel
          title="Dataset"
          description="Where this data came from, and what was recorded when it was registered."
        >
          <DefinitionList items={datasetItems(detail)} />
        </Panel>

        {versions.length === 0 || selected === null ? (
          <EmptyState
            title="No versions yet"
            description="A dataset version records how the images were split. Until one exists, nothing in this dataset can be trained on or evaluated against."
            action={
              IS_DEMO ? undefined : (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  New version
                </Button>
              )
            }
          />
        ) : (
          <>
            <Card>
              <div className="space-y-3">
                <SectionHeader
                  title="Versions"
                  description="Chooses what the image table below is reading. Splits belong to a version, so two versions can legitimately disagree about where the same image sits."
                />
                <RadioGroup
                  legend="Dataset version"
                  legendHidden
                  name="dataset-version"
                  value={String(selected.id)}
                  onValueChange={(next) => setSelectedId(Number(next))}
                  options={versionOptions(versions)}
                />
              </div>
            </Card>
            <VersionPanel version={selected} onLock={() => setLocking(true)} />
          </>
        )}

        <DatasetImages
          datasetId={datasetId}
          versionId={selected?.id ?? null}
          locked={selected?.is_test_locked ?? false}
          onAssigned={refetch}
        />
      </div>

      <CreateVersionDialog
        datasetId={datasetId}
        open={creating}
        onDismiss={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          refetch();
        }}
      />
      {selected === null ? null : (
        <LockTestSetDialog
          version={selected}
          open={locking}
          onDismiss={() => setLocking(false)}
          onLocked={() => {
            setLocking(false);
            refetch();
          }}
        />
      )}
    </>
  );
}
