'use client';

/**
 * MedLoop AI — the image table on the dataset detail screen, and the split assignment it carries.
 *
 * ## Selection is the assignment mechanism
 *
 * `assignSplits` takes batched `{split, image_ids}` pairs so that moving four hundred images is one
 * transaction rather than four hundred (§7). The UI therefore needs multi-select, and the checkbox
 * column is the only reason this table is not a plain read-only list.
 *
 * ## A locked version has no assign control at all
 *
 * §2.5 makes a locked test set untouchable, and the endpoint answers `409 DATASET_LOCKED`. Rendering a
 * disabled dropdown would invite the user to hunt for the reason it is disabled; instead the control is
 * absent and a sentence says why.
 *
 * ## What the table does not do
 *
 * It never derives `data_status` — the server sends it, computed with the precedence in §4.1, and a
 * second implementation here could drift from the first. It also never sorts client-side: the rows on
 * screen are one page of thousands, so sorting them locally would order the page, not the dataset, and
 * quietly lie about what "first" means.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Choice';
import { FormField } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { VisuallyHidden } from '@/components/ui/project';
import { Select, optionsFromEnum } from '@/components/ui/Select';
import { Table, TableScroll } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { assignSplits, listImages } from '@/lib/api';
import { DEMO_DATASETS } from '@/lib/demo/demo-datasets';
import { IS_DEMO } from '@/lib/env';
import { formatCount, formatDate, formatPixelSize } from '@/lib/format';
import { useApiAction, useApiQuery } from '@/lib/use-query';
import type { Paginated } from '@/types/api';
import { DataStatus, ImageSplit, ReviewStatus } from '@/types/domain';
import type { ImageSummary } from '@/types/domain';

const STATUS_OPTIONS = optionsFromEnum(DataStatus);
const SPLIT_OPTIONS = optionsFromEnum(ImageSplit);
const REVIEW_OPTIONS = optionsFromEnum(ReviewStatus);

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Assignment
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The assign bar, shown only when rows are selected and the version is unlocked.
 *
 * `TEST` is offered like any other split, because assigning it is how a test set comes to exist. What
 * §4.2 forbids is *reviewing* a `TEST` image or letting one into the HITL pool, and neither of those
 * happens here — so the honest thing is to allow the assignment and say what it implies.
 */
function AssignBar({
  count,
  busy,
  onAssign,
  onClear,
}: {
  readonly count: number;
  readonly busy: boolean;
  readonly onAssign: (split: ImageSplit) => void;
  readonly onClear: () => void;
}): ReactElement {
  const [split, setSplit] = useState<ImageSplit | ''>('');

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-edge bg-surface-inset px-3 py-2.5">
      <p className="text-sm text-content-secondary">
        {formatCount(count)} selected on this page.
      </p>
      <FormField label="Move to split" labelHidden>
        <Select
          options={SPLIT_OPTIONS}
          value={split}
          onValueChange={setSplit}
          placeholder="Move to split…"
          disabled={busy}
        />
      </FormField>
      <Button
        variant="primary"
        size="sm"
        onClick={() => {
          if (split !== '') onAssign(split);
        }}
        disabled={split === ''}
        busy={busy}
        busyLabel="Reassigning the selected images"
      >
        Assign
      </Button>
      <Button size="sm" onClick={onClear} disabled={busy}>
        Clear selection
      </Button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The table
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Narrows the fixture to the selected version.
 *
 * Every row in `demo-datasets.ts` belongs to version 1, so returning the whole fixture while
 * `v2-staging` is selected would show one version's images under another version's name. Filtering
 * yields the empty state instead, which is the truthful answer for a version the fixture has no rows
 * for — and it exercises that state, which the populated fixture otherwise never would.
 */
function demoPage(versionId: number | null): Paginated<ImageSummary> {
  const all = DEMO_DATASETS.images;
  if (versionId === null) return all;
  const items = all.items.filter((row) => row.dataset_version_id === versionId);
  if (items.length === all.items.length) return all;
  return { ...all, items, total: items.length, pages: 1 };
}

export interface DatasetImagesProps {
  readonly datasetId: number;
  /** `null` until a version is chosen; the query stays idle rather than requesting everything. */
  readonly versionId: number | null;
  /** From the version row. Drives whether the assign control exists at all (§2.5). */
  readonly locked: boolean;
  /** Called after a successful reassignment so the version counts above can refetch. */
  readonly onAssigned: () => void;
}

export function DatasetImages({
  datasetId,
  versionId,
  locked,
  onAssigned,
}: DatasetImagesProps): ReactElement {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dataStatus, setDataStatus] = useState<DataStatus | ''>('');
  const [split, setSplit] = useState<ImageSplit | ''>('');
  const [review, setReview] = useState<ReviewStatus | ''>('');
  const [selected, setSelected] = useState<readonly number[]>([]);

  const query = useApiQuery(
    (signal) =>
      listImages(
        {
          page,
          page_size: pageSize,
          dataset_id: datasetId,
          ...(versionId === null ? {} : { dataset_version_id: versionId }),
          ...(dataStatus === '' ? {} : { data_status: dataStatus }),
          ...(split === '' ? {} : { split }),
          ...(review === '' ? {} : { review_status: review }),
        },
        signal,
      ),
    { ready: !IS_DEMO, deps: [page, pageSize, datasetId, versionId, dataStatus, split, review] },
  );

  const assign = useApiAction(assignSplits);
  const data: Paginated<ImageSummary> | null = IS_DEMO ? demoPage(versionId) : query.data;
  // Memoised because `?? []` is a fresh array every render, and `toggleAll` closes over it — without
  // this the select-all callback would be a new function on every render for no reason.
  const rows = useMemo(() => data?.items ?? [], [data]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allOnPage = rows.length > 0 && rows.every((row) => selectedSet.has(row.id));

  const toggleRow = useCallback((id: number): void => {
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }, []);

  const toggleAll = useCallback((): void => {
    setSelected((current) => {
      const ids = rows.map((row) => row.id);
      const every = ids.length > 0 && ids.every((id) => current.includes(id));
      return every ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])];
    });
  }, [rows]);

  /** A filter change reorders the underlying set, so the page number and the selection both go. */
  const resetView = useCallback((): void => {
    setPage(1);
    setSelected([]);
  }, []);

  const runAssign = useCallback(
    async (target: ImageSplit): Promise<void> => {
      if (versionId === null || selected.length === 0) return;
      const result = await assign.run(versionId, {
        assignments: [{ split: target, image_ids: selected }],
      });
      if (result === null) return;
      setSelected([]);
      onAssigned();
      void query.refetch();
    },
    [assign, versionId, selected, onAssigned, query],
  );

  const columns: readonly Column<ImageSummary>[] = [
    {
      id: 'select',
      header: (
        <Checkbox
          label={<VisuallyHidden>Select every image on this page</VisuallyHidden>}
          checked={allOnPage}
          indeterminate={!allOnPage && rows.some((row) => selectedSet.has(row.id))}
          onChange={toggleAll}
          disabled={locked || IS_DEMO}
        />
      ),
      cell: (row) => (
        <Checkbox
          label={<VisuallyHidden>{`Select ${row.filename}`}</VisuallyHidden>}
          checked={selectedSet.has(row.id)}
          onChange={() => toggleRow(row.id)}
          disabled={locked || IS_DEMO}
        />
      ),
    },
    {
      id: 'filename',
      header: 'File',
      rowHeader: true,
      cell: (row) => <span className="font-mono text-xs">{row.filename}</span>,
    },
    { id: 'data_status', header: 'Derived status', cell: (row) => <StatusPill status={row.data_status} /> },
    { id: 'split', header: 'Split', cell: (row) => <StatusPill status={row.split} /> },
    { id: 'review_status', header: 'Review', cell: (row) => <StatusPill status={row.review_status} /> },
    {
      id: 'label_code',
      header: 'Publisher label',
      cell: (row) =>
        row.label_code === null ? (
          <span className="text-content-muted">None</span>
        ) : (
          <Badge mono>{row.label_code}</Badge>
        ),
    },
    {
      id: 'size',
      header: 'Size',
      numeric: true,
      cell: (row) => formatPixelSize(row.width, row.height),
    },
    {
      id: 'patient_ref',
      header: 'Patient',
      cell: (row) =>
        row.patient_ref === null ? (
          <span className="text-content-muted">None</span>
        ) : (
          <span className="font-mono text-xs">{row.patient_ref}</span>
        ),
    },
    {
      id: 'reviewed_at',
      header: 'Reviewed',
      cell: (row) =>
        row.reviewed_at === null ? (
          <span className="text-content-muted">—</span>
        ) : (
          formatDate(row.reviewed_at)
        ),
    },
  ];

  return (
    <Card padding="none">
      <div className="space-y-3 px-4 pt-4">
        <SectionHeader
          title="Images"
          description="One page of the version's images, with the derived status the server computed. Sorting is deliberately absent: these rows are one page of thousands, and ordering them here would order the page, not the dataset."
        />
        <div className="flex flex-wrap items-end gap-3">
          <FormField label="Derived status">
            <Select
              options={STATUS_OPTIONS}
              value={dataStatus}
              onValueChange={(next) => {
                setDataStatus(next);
                resetView();
              }}
              placeholder="Any status"
            />
          </FormField>
          <FormField label="Split">
            <Select
              options={SPLIT_OPTIONS}
              value={split}
              onValueChange={(next) => {
                setSplit(next);
                resetView();
              }}
              placeholder="Any split"
            />
          </FormField>
          <FormField label="Review">
            <Select
              options={REVIEW_OPTIONS}
              value={review}
              onValueChange={(next) => {
                setReview(next);
                resetView();
              }}
              placeholder="Any review status"
            />
          </FormField>
        </div>

        {locked ? (
          <Alert tone="warn" title="This version is locked — splits cannot be reassigned">
            The test set is locked, so every image in this version is fixed in place. Comparing model
            versions is only valid on identical test data, which is what the lock protects. To split
            differently, create a new dataset version.
          </Alert>
        ) : null}

        {assign.error !== null ? (
          <Alert tone="danger" title="The images were not reassigned" live>
            {assign.error.message}
          </Alert>
        ) : null}

        {!locked && !IS_DEMO && selected.length > 0 ? (
          <AssignBar
            count={selected.length}
            busy={assign.busy}
            onAssign={(target) => void runAssign(target)}
            onClear={() => setSelected([])}
          />
        ) : null}
      </div>

      {query.loading && data === null ? (
        <div className="p-4">
          <Skeleton className="h-64 rounded-lg" label="Loading images" />
        </div>
      ) : query.error !== null && data === null ? (
        <div className="p-4">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No images match these filters"
            description="Widen the filters, or register images for this dataset through Upload Data."
          />
        </div>
      ) : (
        <div className="mt-3">
          <TableScroll label="Images in this dataset version" maxHeightClassName="max-h-[32rem]">
            <Table
              caption="Images in this dataset version"
              captionHidden
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              density="compact"
              stickyHeader
            />
          </TableScroll>
          {data !== null ? (
            <Pagination
              meta={data}
              onPageChange={(next) => {
                setPage(next);
                setSelected([]);
              }}
              onPageSizeChange={(size) => {
                setPageSize(size);
                resetView();
              }}
              noun="images"
              busy={query.refetching}
              className="border-t border-edge-subtle px-3 py-2"
            />
          ) : null}
        </div>
      )}
    </Card>
  );
}
