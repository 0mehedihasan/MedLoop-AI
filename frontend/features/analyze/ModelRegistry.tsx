'use client';

/**
 * MedLoop AI — the model registry on `/analyze`.
 *
 * ## The client never decides whether a candidate qualifies
 *
 * `candidate − active >= minimum_improvement` on the same locked test version is the server's
 * arithmetic (§9). This table therefore offers **Promote** on every `CANDIDATE` row and lets the request
 * fail, rather than hiding the control behind a comparison computed in the browser. Two reasons: a
 * disabled button that the client believes is unqualified would hide the server's stated reason, which
 * is the useful part; and the moment the browser starts evaluating the promotion rule there are two
 * implementations of it, which will eventually disagree about a deployment.
 *
 * A refusal is rendered where the control is, in the server's own words.
 *
 * ## Rejection requires a reason, so it uses a form and not a confirmation
 *
 * `RejectModelBody.reason` is mandatory: an unexplained rejection is an audit row nobody can act on
 * six months later. Promotion's reason is optional — the metrics already justify it — but the same
 * dialog collects it, because a promotion is worth a sentence too.
 *
 * ## Status is the whole story of a version, so it is the second column
 *
 * `ACTIVE` is one row by construction (§9, partial unique index). `ARCHIVED` rows stay: a version is
 * never hard-deleted, and the archived ones are what makes the lineage answerable (§7.1). Nothing here
 * offers deletion.
 */

import { useCallback, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { FormField } from '@/components/ui/Field';
import { Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { VisuallyHidden } from '@/components/ui/project';
import { Table, TableScroll } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, Unavailable } from '@/components/ui/states';
import { promoteModel, rejectModel } from '@/lib/api';
import type { ApiError } from '@/lib/api-client';
import { formatCount, formatDateTime, formatMetric } from '@/lib/format';
import { useApiAction } from '@/lib/use-query';
import { ModelStatus } from '@/types/domain';
import type { Model, PromotionMetric } from '@/types/domain';

import { METRIC_SPECS, NOT_COMPUTED_REASON, metricValue } from './lib';

/** Which action a dialog is collecting a reason for. `null` closes it. */
type PendingAction = { readonly kind: 'promote' | 'reject'; readonly model: Model } | null;

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The reason dialog
 * ──────────────────────────────────────────────────────────────────────────────────────── */

interface ModelActionDialogProps {
  readonly pending: PendingAction;
  readonly reason: string;
  readonly onReasonChange: (next: string) => void;
  readonly busy: boolean;
  /** The server's refusal. Rendered here, beside the control that caused it. */
  readonly error: ApiError | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/**
 * One dialog for both transitions: they collect the same thing and differ only in whether it is
 * mandatory, and a second copy would drift on the wording that matters most.
 *
 * It stays mounted while closed. `Modal` is controlled and needs its `<dialog>` node present to
 * `close()` it, and keeping the node there means a failed request cannot be dismissed by an unmount
 * before the user has read why it failed.
 */
function ModelActionDialog({
  pending,
  reason,
  onReasonChange,
  busy,
  error,
  onCancel,
  onConfirm,
}: ModelActionDialogProps): ReactElement {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const rejecting = pending?.kind === 'reject';
  const version = pending?.model.version ?? 'this version';
  // Trim only to decide emptiness. Whitespace is not a reason, and the server's own validation is
  // still the authority on everything else about the string (§8.1).
  const blank = reason.trim() === '';

  return (
    <Modal
      open={pending !== null}
      onDismiss={onCancel}
      // A request in flight is not dismissible: its outcome is the only reason the dialog is open.
      dismissible={!busy}
      initialFocus={cancelRef}
      size="md"
      title={rejecting ? `Reject ${version}` : `Promote ${version}`}
      description={
        rejecting
          ? 'The version is kept, not deleted, and the active model does not change.'
          : 'The server re-checks the promotion criteria against the locked test set and refuses if they are not met.'
      }
      footer={
        <>
          {/* Cancel first, so the safe control is also the first tab stop. */}
          <Button ref={cancelRef} onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={rejecting ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={rejecting && blank}
            busy={busy}
            busyLabel={rejecting ? 'Recording the rejection' : 'Asking the server to promote'}
          >
            {rejecting ? 'Reject' : 'Promote'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="max-w-prose text-sm text-content-secondary">
          {rejecting
            ? `Rejection records that ${version} was evaluated and not adopted. Nothing is deleted — the version, its metrics and its evaluations stay queryable, which is what makes the lineage answerable later.`
            : `Promotion archives the version that is currently active and makes ${version} the model every new prediction runs on. Both transitions are audited.`}
        </p>
        <FormField
          label="Reason"
          required={rejecting}
          error={null}
          hint={
            rejecting
              ? 'Required. This is the only record of why the version was not adopted, and it is what someone reads six months from now.'
              : 'Optional. The metrics are already the record of why; a sentence of context is still worth adding.'
          }
        >
          <Textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={3}
            placeholder={
              rejecting
                ? 'Macro F1 is up but recall on MEL fell, and MEL is the class this loop exists for.'
                : 'Clears the configured minimum improvement on the same locked test version.'
            }
          />
        </FormField>
        {error === null ? null : <ErrorState error={error} />}
      </div>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The registry
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface ModelRegistryProps {
  readonly models: readonly Model[];
  /** The version whose evaluation is shown beside this table. */
  readonly selectedId: number | null;
  readonly onSelect: (id: number) => void;
  /** The metric promotion is decided on. `null` when the setting could not be read. */
  readonly primary: PromotionMetric | null;
  /** Re-read the registry after a transition. */
  readonly onChanged?: () => void;
  /**
   * Controls beside the table's heading — on `/analyze` this is the link to the compare screen. Kept as
   * a slot rather than built here so the registry does not need to know which routes exist.
   */
  readonly actions?: ReactNode;
  /**
   * `false` in the §10 layout preview, where a promotion would be a real audited transition of a
   * version that does not exist. The controls are then absent, not disabled (§2.3).
   */
  readonly actionable?: boolean;
}

export function ModelRegistry({
  models,
  selectedId,
  onSelect,
  primary,
  onChanged,
  actions,
  actionable = true,
}: ModelRegistryProps): ReactElement {
  /*
   * Destructured, not held as objects. `useApiAction` returns a fresh object literal every render
   * while `run` and `reset` keep stable identities, so `[promote.reset]` would be correct and
   * `exhaustive-deps` would still not be able to see it — the rule reads member expressions as
   * derived from a changing object and asks for the whole thing, which is the version that *would*
   * rebuild every handler on every render. Naming the two functions makes the stability visible.
   */
  const {
    run: runPromote,
    reset: resetPromote,
    busy: promoteBusy,
    error: promoteError,
  } = useApiAction(promoteModel);
  const {
    run: runReject,
    reset: resetReject,
    busy: rejectBusy,
    error: rejectError,
  } = useApiAction(rejectModel);

  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState('');

  const busy = promoteBusy || rejectBusy;
  const error = pending?.kind === 'reject' ? rejectError : promoteError;

  const openDialog = useCallback(
    (kind: 'promote' | 'reject', model: Model): void => {
      // A refusal left over from the previous attempt would read as this one's.
      resetPromote();
      resetReject();
      setReason('');
      setPending({ kind, model });
    },
    [resetPromote, resetReject],
  );

  const closeDialog = useCallback((): void => {
    setPending(null);
  }, []);

  const changeReason = useCallback(
    (next: string): void => {
      setReason(next);
      // The refusal was about the text that was there before; keeping it up while the user rewrites
      // attributes the server's words to a sentence it never saw.
      resetPromote();
      resetReject();
    },
    [resetPromote, resetReject],
  );

  /**
   * The one place a transition is requested.
   *
   * There is no client-side check of the promotion rule. `candidate − active >= minimum_improvement`
   * on the same locked test version is the server's arithmetic (§9): the request is sent, and a
   * refusal is rendered in the server's own words rather than pre-empted by a second implementation
   * of the rule in the browser.
   */
  const confirm = useCallback(async (): Promise<void> => {
    if (pending === null) return;
    const trimmed = reason.trim();
    const result =
      pending.kind === 'promote'
        ? await runPromote(pending.model.id, trimmed === '' ? undefined : { reason: trimmed })
        : await runReject(pending.model.id, { reason: trimmed });
    // On failure the dialog stays open, holding the reason the user typed and the server's answer.
    if (result === null) return;
    setPending(null);
    onChanged?.();
  }, [pending, reason, runPromote, runReject, onChanged]);

  const primarySpec =
    primary === null ? null : (METRIC_SPECS.find((spec) => spec.metric === primary) ?? null);

  /**
   * Newest first. `GET /models` does not promise an order, so the choice is made here instead of
   * being inherited from whatever the database happened to return.
   */
  const rows = [...models].sort((a, b) => b.created_at.localeCompare(a.created_at));

  /**
   * Built inside the component: the version cell closes over `selectedId` and the actions cell over
   * `busy`. A module-level constant would freeze the first render's handlers.
   */
  const columns: readonly Column<Model>[] = [
    {
      id: 'version',
      header: 'Version',
      rowHeader: true,
      width: '7rem',
      cell: (model) => {
        const selected = model.id === selectedId;
        return (
          <button
            type="button"
            onClick={() => onSelect(model.id)}
            // "The current item in a set", which is what a selected row is. Not `aria-pressed`:
            // clicking the selected version again does not deselect it.
            aria-current={selected ? true : undefined}
            className={cx(
              'rounded border px-1.5 py-0.5 font-mono text-xs transition duration-fast',
              selected
                ? 'border-status-info-edge bg-status-info-soft text-content-primary'
                : 'border-edge bg-surface-inset text-content-primary hover:border-edge-strong',
            )}
          >
            {model.version}
            <VisuallyHidden> — show this version’s evaluation</VisuallyHidden>
          </button>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      width: '9rem',
      cell: (model) => <StatusPill status={model.status} />,
    },
    {
      id: 'architecture',
      header: 'Architecture',
      width: '8rem',
      cell: (model) => <Badge mono>{model.architecture}</Badge>,
    },
    {
      // Three different absences, three different sentences: never evaluated, the setting could not
      // be read, or evaluated without this metric. One shared "—" would collapse them into the
      // pessimistic reading (§2.3).
      id: 'primary_metric',
      header: primarySpec?.label ?? 'Primary metric',
      numeric: true,
      width: '9rem',
      cell: (model) => {
        if (model.test_metrics === null) {
          return <Unavailable reason="This version has no evaluation on the locked test set." />;
        }
        if (primarySpec === null) {
          return (
            <Unavailable reason="The promotion metric setting could not be read, so no single figure is singled out here. The full metrics are below." />
          );
        }
        const value = metricValue(model.test_metrics, primarySpec.metric);
        return value === null ? <Unavailable reason={NOT_COMPUTED_REASON} /> : formatMetric(value);
      },
    },
    {
      id: 'test_dataset_version_id',
      header: 'Test version',
      width: '8rem',
      // The figure to its left is comparable to another version's only if this cell matches (§9).
      cell: (model) =>
        model.test_dataset_version_id === null ? (
          <Unavailable reason="Not evaluated, so no test dataset version is recorded." />
        ) : (
          <span className="font-mono text-xs">{`#${String(model.test_dataset_version_id)}`}</span>
        ),
    },
    {
      id: 'epochs_completed',
      header: 'Epochs',
      numeric: true,
      width: '7rem',
      cell: (model) =>
        model.epochs_completed === null ? (
          <Unavailable reason="The training run did not report an epoch count." />
        ) : (
          formatCount(model.epochs_completed)
        ),
    },
    {
      id: 'trained_at',
      header: 'Trained',
      width: '11rem',
      cell: (model) =>
        model.trained_at === null ? (
          <Unavailable reason="No training timestamp was recorded for this version." />
        ) : (
          <span className="whitespace-nowrap">{formatDateTime(model.trained_at)}</span>
        ),
    },
    {
      /*
       * Absent, not disabled (§2.3). A non-candidate has nothing to promote or reject, and a greyed
       * out Promote beside an `ARCHIVED` row invites the reading that it could be un-archived. The
       * §10 preview passes `actionable={false}` and the column empties entirely.
       */
      id: 'actions',
      header: 'Actions',
      headerHidden: true,
      width: '12rem',
      cell: (model) => {
        if (!actionable || model.status !== ModelStatus.CANDIDATE) return null;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => openDialog('promote', model)}
            >
              Promote
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => openDialog('reject', model)}
            >
              Reject
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <Panel
        title="Model versions"
        description="Exactly one version is ACTIVE at a time. Archived and rejected versions are kept — they are what makes the lineage answerable, and nothing here deletes one."
        actions={actions}
        bodyPadding="none"
      >
        <TableScroll label="Model versions" maxHeightClassName="max-h-[28rem]">
          <Table
            caption="Model versions, newest first"
            captionHidden
            columns={columns}
            rows={rows}
            rowKey={(model) => model.id}
            selectedKey={selectedId}
            density="compact"
            stickyHeader
            emptyState={
              <EmptyState
                title="No model version is registered"
                description="A version appears here once a training run completes and registers one. No training run has completed on this machine."
              />
            }
          />
        </TableScroll>
      </Panel>
      <ModelActionDialog
        pending={pending}
        reason={reason}
        onReasonChange={changeReason}
        busy={busy}
        error={error}
        onCancel={closeDialog}
        onConfirm={() => void confirm()}
      />
    </>
  );
}


