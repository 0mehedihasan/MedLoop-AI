'use client';

/**
 * MedLoop AI — `/data/datasets`, Dataset Management.
 *
 * ## What this screen is for
 *
 * A dataset is the unit of provenance: every image belongs to exactly one, through a dataset version
 * (§7.1). This list is therefore the entry point to the lineage question "where did this come from",
 * and its rows link to the detail screen where splits and the test lock live.
 *
 * ## Archived, not deleted
 *
 * Nothing is hard-deleted (§7) — archiving sets a status and stamps `archived_at`. The status filter
 * defaults to *everything*, including archived rows, because a list that silently hid them would make
 * the audit trail look like a delete.
 *
 * ## Why creation is absent in demo mode
 *
 * A `POST` cannot be faked into a fixture, so the button that would issue one is not rendered at all
 * rather than rendered inert. Same rule as the statistics range picker and the review canvas's missing
 * Grad-CAM layer: a control that does nothing is worse than no control.
 */

import { useCallback, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { StatusPill } from '@/components/ui/Badge';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Select, optionsFromEnum } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { createDataset, listDatasets } from '@/lib/api';
import { DEMO_DATASETS } from '@/lib/demo/demo-datasets';
import { IS_DEMO } from '@/lib/env';
import { formatCount, formatDate } from '@/lib/format';
import { ROUTES } from '@/lib/navigation';
import { useApiAction, useApiQuery } from '@/lib/use-query';
import type { Paginated } from '@/types/api';
import { DatasetStatus } from '@/types/domain';
import type { Dataset } from '@/types/domain';

const STATUS_OPTIONS = optionsFromEnum(DatasetStatus);

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Create
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The create dialog.
 *
 * `name` is the only required field, and the button stays disabled until it is non-blank — client-side
 * validation for the user's benefit only. The server validates authoritatively (§8.1), which is why a
 * server error is rendered verbatim in the dialog rather than being pre-empted by cleverer client
 * rules that could disagree with it.
 */
function CreateDatasetDialog({
  open,
  onDismiss,
  onCreated,
}: {
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly onCreated: () => void;
}): ReactElement {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const create = useApiAction(createDataset);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const submit = useCallback(async (): Promise<void> => {
    const result = await create.run({
      name: name.trim(),
      // Omitted rather than sent empty: `''` would store a blank description, which is a different
      // fact from "no description was given".
      ...(description.trim() === '' ? {} : { description: description.trim() }),
      ...(source.trim() === '' ? {} : { source: source.trim() }),
    });
    if (result === null) return;
    setName('');
    setDescription('');
    setSource('');
    onCreated();
  }, [create, name, description, source, onCreated]);

  return (
    <Modal
      open={open}
      onDismiss={onDismiss}
      title="New dataset"
      description="Registers a name only. Images arrive separately, through Upload Data."
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
            busyLabel="Creating the dataset"
            disabled={name.trim() === ''}
          >
            Create dataset
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {create.error !== null ? (
          <Alert tone="danger" title="The dataset was not created" live>
            {create.error.message}
          </Alert>
        ) : null}
        <FormField label="Name" required hint="Shown everywhere this dataset is referenced.">
          <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
        </FormField>
        <FormField label="Description" hint="Optional. What this dataset is and why it exists.">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </FormField>
        <FormField
          label="Source"
          hint="Optional. Where the data came from — a citation, a directory, a collaborator."
        >
          <Input value={source} onChange={(event) => setSource(event.target.value)} autoComplete="off" />
        </FormField>
      </div>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The screen
 * ──────────────────────────────────────────────────────────────────────────────────────── */

const COLUMNS: readonly Column<Dataset>[] = [
  {
    id: 'name',
    header: 'Dataset',
    rowHeader: true,
    cell: (dataset) => (
      <a
        href={ROUTES.data.dataset(dataset.id)}
        className="font-medium text-content-primary underline decoration-edge-strong underline-offset-2 hover:decoration-content-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-edge-focus"
      >
        {dataset.name}
      </a>
    ),
  },
  { id: 'status', header: 'Status', cell: (dataset) => <StatusPill status={dataset.status} /> },
  {
    id: 'source',
    header: 'Source',
    cell: (dataset) => dataset.source ?? <span className="text-content-muted">Not recorded</span>,
  },
  { id: 'created_at', header: 'Registered', cell: (dataset) => formatDate(dataset.created_at) },
  {
    id: 'archived_at',
    header: 'Archived',
    cell: (dataset) =>
      dataset.archived_at === null ? (
        <span className="text-content-muted">—</span>
      ) : (
        formatDate(dataset.archived_at)
      ),
  },
];

export function DatasetListView(): ReactElement {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState<DatasetStatus | ''>('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const query = useApiQuery(
    (signal) =>
      listDatasets(
        {
          page,
          page_size: pageSize,
          ...(status === '' ? {} : { status }),
          ...(search.trim() === '' ? {} : { q: search.trim() }),
        },
        signal,
      ),
    { ready: !IS_DEMO, deps: [page, pageSize, status, search] },
  );

  const data: Paginated<Dataset> | null = IS_DEMO ? DEMO_DATASETS.list : query.data;

  // Any filter change invalidates the current page number: page 4 of an unfiltered list is rarely
  // page 4 of a filtered one, and asking for it would show an empty page rather than results.
  const changeStatus = useCallback((next: DatasetStatus | ''): void => {
    setStatus(next);
    setPage(1);
  }, []);
  const changeSearch = useCallback((next: string): void => {
    setSearch(next);
    setPage(1);
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Search" hint="Matches the name.">
              <Input
                type="search"
                value={search}
                onChange={(event) => changeSearch(event.target.value)}
                placeholder="Dataset name"
                autoComplete="off"
              />
            </FormField>
            <FormField label="Status">
              <Select
                options={STATUS_OPTIONS}
                value={status}
                onValueChange={changeStatus}
                placeholder="Any status"
              />
            </FormField>
          </div>
          {IS_DEMO ? null : (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New dataset
            </Button>
          )}
        </div>
      </Card>

      {IS_DEMO ? (
        <Alert tone="info" title="Fixture list — filters and creation are not wired">
          These two rows come from a fixed demo fixture. No request is made, so the filters above narrow
          nothing and the button that would create a dataset is not rendered at all.
        </Alert>
      ) : null}

      {query.loading && data === null ? (
        <Skeleton className="h-64 rounded-lg" label="Loading datasets" />
      ) : query.error !== null && data === null ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : data === null || data.items.length === 0 ? (
        <EmptyState
          title="No datasets registered"
          description="A dataset appears here once a directory has been registered through Upload Data. Nothing is copied — the images stay where they are."
          action={<LinkButton href={ROUTES.data.upload}>Upload data</LinkButton>}
        />
      ) : (
        <Card padding="none">
          <Table
            caption={`${formatCount(data.total)} datasets`}
            captionHidden
            columns={COLUMNS}
            rows={data.items}
            rowKey={(dataset) => dataset.id}
          />
          <Pagination
            meta={data}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            noun="datasets"
            busy={query.refetching}
            className="border-t border-edge-subtle px-3 py-2"
          />
        </Card>
      )}

      <CreateDatasetDialog
        open={creating}
        onDismiss={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          void query.refetch();
        }}
      />
    </div>
  );
}
