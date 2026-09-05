'use client';

/**
 * MedLoop AI — the training settings form and its audit trail, on `/data/training`.
 *
 * ## The threshold is the reason this screen exists
 *
 * §2.6 forbids `1000` as a condition anywhere in the codebase. This form is where the *value* lives:
 * an integer read from `GET /admin/settings/training`, written back through `PUT`, and never compared
 * against a literal here. The consequence a user needs to see is §8.4's, so it is stated beside the
 * field rather than left to be discovered: lowering the threshold below the current count does not
 * discard the samples already counted, and every batch keeps the threshold that applied when it was
 * created.
 *
 * ## Who may write is the server's answer, not this file's
 *
 * The form is gated on `editable_by` from the response. A client-side `role === 'ADMIN'` comparison
 * would be a second authority, and the two can disagree — a role removed server-side would still see
 * an editable form, submit, and be refused. Asking "is my role in the list the server sent" keeps one
 * authority.
 *
 * ## Validation here is for typing, not for trust
 *
 * The bounds in §8.1 are mirrored as `min`/`max`/`step` and as a local check that blocks a submit which
 * is certain to fail. That is a courtesy to the person typing. The server validates independently and
 * its refusal is rendered verbatim — the local check is never the reason a value is accepted.
 *
 * ## A change is an audited event, so it carries a reason
 *
 * Every write appends a `system_logs` row with actor, key, old value, new value and the optional
 * reason typed here (§8.4). The field is offered on every save because "why" is the part a log cannot
 * reconstruct later.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Panel, SectionHeader } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Choice';
import { FormField } from '@/components/ui/Field';
import { NumberInput, Textarea } from '@/components/ui/Input';
import { Select, optionsFromEnum } from '@/components/ui/Select';
import { Table, TableScroll } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, Skeleton, Unavailable } from '@/components/ui/states';
import { getSettingsHistory, getTrainingSettings, updateTrainingSettings } from '@/lib/api';
import { DEMO_TRAINING } from '@/lib/demo/demo-training';
import { IS_DEMO } from '@/lib/env';
import { formatDateTime, humaniseEnum } from '@/lib/format';
import { useRole } from '@/lib/session';
import { useApiAction, useApiQuery } from '@/lib/use-query';
import { PromotionMetric, PromotionMode, TrainingDevice } from '@/types/domain';
import type { SettingChange, TrainingSettings } from '@/types/domain';

const DEVICE_OPTIONS = optionsFromEnum(TrainingDevice);
const MODE_OPTIONS = optionsFromEnum(PromotionMode);
const METRIC_OPTIONS = optionsFromEnum(PromotionMetric);

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Local validation — a courtesy, never an authority
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The §8.1 bounds, as data.
 *
 * A field is described by its range, not by a hand-written sentence per field, so the hint under the
 * control and the check before the submit cannot drift apart.
 */
interface Bound {
  readonly min: number;
  readonly max: number | null;
  readonly integer: boolean;
}

const BOUNDS = {
  hitl_retraining_threshold: { min: 1, max: null, integer: true },
  batch_size: { min: 1, max: 512, integer: true },
  max_epochs: { min: 1, max: 1000, integer: true },
  minimum_improvement: { min: 0, max: 1, integer: false },
} as const satisfies Readonly<Record<string, Bound>>;

type NumericKey = keyof typeof BOUNDS;

/** `null` when the value is acceptable; otherwise the sentence to show under the field. */
function checkNumber(key: NumericKey, value: number | null): string | null {
  const bound: Bound = BOUNDS[key];
  if (value === null) return 'A value is required.';
  if (!Number.isFinite(value)) return 'Must be a number.';
  if (bound.integer && !Number.isInteger(value)) return 'Must be a whole number.';
  if (value < bound.min) return `Must be at least ${bound.min}.`;
  if (bound.max !== null && value > bound.max) return `Must be at most ${bound.max}.`;
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Draft state
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The form's own copy of the settings, with the numeric fields nullable.
 *
 * An empty number field is `null`, not `0` — clearing "max epochs" is not a request to train for zero
 * epochs, and coercing it would submit a value the person never typed.
 */
interface Draft {
  readonly hitl_retraining_threshold: number | null;
  readonly training_device: TrainingDevice;
  readonly batch_size: number | null;
  readonly max_epochs: number | null;
  readonly early_stopping: boolean;
  readonly candidate_promotion_mode: PromotionMode;
  readonly minimum_improvement: number | null;
  readonly primary_promotion_metric: PromotionMetric;
}

function toDraft(settings: TrainingSettings): Draft {
  return { ...settings };
}

/**
 * Only what changed.
 *
 * `PUT` takes a partial patch, and sending the untouched keys would write an audit row per key on every
 * save — an audit trail full of `training_device CPU → CPU` is an audit trail nobody reads.
 */
function diff(draft: Draft, saved: TrainingSettings): Partial<TrainingSettings> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (value === null) continue;
    if (value !== saved[key as keyof TrainingSettings]) patch[key] = value;
  }
  return patch as Partial<TrainingSettings>;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The history table
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `old_value` is nullable because the first write of a key has nothing before it. That reads as
 * "unset", not as a dash — a key that had no value is different from a key whose value we failed to
 * record.
 */
const HISTORY_COLUMNS: readonly Column<SettingChange>[] = [
  {
    id: 'at',
    header: 'When',
    width: '11rem',
    cell: (row) => <span className="whitespace-nowrap">{formatDateTime(row.at)}</span>,
  },
  {
    id: 'key',
    header: 'Setting',
    rowHeader: true,
    width: '15rem',
    cell: (row) => <Badge mono>{row.key}</Badge>,
  },
  {
    id: 'change',
    header: 'Change',
    width: '18rem',
    cell: (row) => (
      <span className="whitespace-nowrap font-mono text-xs">
        {row.old_value === null ? (
          <span className="text-content-muted">unset</span>
        ) : (
          <span className="text-content-secondary">{row.old_value}</span>
        )}
        <span className="text-content-muted"> → </span>
        <span className="text-content-primary">{row.new_value}</span>
      </span>
    ),
  },
  {
    id: 'actor',
    header: 'Actor',
    width: '10rem',
    cell: (row) =>
      row.actor_username === null ? (
        <span className="text-content-muted">System</span>
      ) : (
        <span className="font-mono text-xs">{row.actor_username}</span>
      ),
  },
  {
    id: 'reason',
    header: 'Reason',
    cell: (row) =>
      row.reason === null ? <Unavailable reason="No reason was given." /> : row.reason,
  },
];

function SettingsHistory(): ReactElement {
  const query = useApiQuery((signal) => getSettingsHistory(undefined, signal), {
    ready: !IS_DEMO,
  });
  const rows: readonly SettingChange[] = IS_DEMO ? DEMO_TRAINING.history : (query.data ?? []);

  return (
    <Card padding="none">
      <div className="px-4 pt-4">
        <SectionHeader
          title="Settings history"
          description="Every change to a training setting, with the actor who made it. Append-only — the same trail as System Logs, narrowed to this screen's keys."
        />
      </div>
      {query.loading && query.data === null && !IS_DEMO ? (
        <div className="p-4">
          <Skeleton className="h-32 rounded-lg" label="Loading the settings history" />
        </div>
      ) : query.error !== null && query.data === null ? (
        <div className="p-4">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No setting has been changed"
            description="The values above are the documented defaults, still untouched. The first save writes the first row here."
          />
        </div>
      ) : (
        <div className="mt-3 pb-2">
          <TableScroll label="Settings history" maxHeightClassName="max-h-[24rem]">
            <Table
              caption="Settings history"
              captionHidden
              columns={HISTORY_COLUMNS}
              rows={rows}
              rowKey={(row) => row.id}
              density="compact"
              stickyHeader
            />
          </TableScroll>
        </div>
      )}
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The form
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export function TrainingSettingsForm(): ReactElement {
  const role = useRole();
  const query = useApiQuery((signal) => getTrainingSettings(signal), { ready: !IS_DEMO });
  const save = useApiAction(updateTrainingSettings);

  const response = IS_DEMO ? DEMO_TRAINING.settings : query.data;
  const saved = response?.settings ?? null;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  /** Adopt the server's values once they arrive, and again after a successful write. */
  useEffect(() => {
    if (saved === null) return;
    setDraft(toDraft(saved));
  }, [saved]);

  /**
   * Writable when the server says this role may write.
   *
   * `role === null` means the session has not resolved; that is not permission, so the form stays
   * read-only until it does.
   */
  const editable =
    !IS_DEMO && role !== null && (response?.editable_by ?? []).includes(role);

  const errors = useMemo(() => {
    if (draft === null) return {} as Readonly<Partial<Record<NumericKey, string>>>;
    const found: Partial<Record<NumericKey, string>> = {};
    for (const key of Object.keys(BOUNDS) as NumericKey[]) {
      const message = checkNumber(key, draft[key]);
      if (message !== null) found[key] = message;
    }
    return found;
  }, [draft]);

  const patch = useMemo(
    () => (draft === null || saved === null ? {} : diff(draft, saved)),
    [draft, saved],
  );
  const changedKeys = Object.keys(patch);
  const blocked = Object.keys(errors).length > 0;

  const submit = useCallback(async (): Promise<void> => {
    if (draft === null || saved === null || blocked || changedKeys.length === 0) return;
    setJustSaved(false);
    const result = await save.run({
      settings: patch,
      ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
    });
    if (result === null) return;
    setReason('');
    setJustSaved(true);
    await query.refetch();
  }, [draft, saved, blocked, changedKeys.length, patch, reason, save, query]);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setJustSaved(false);
    setDraft((current) => (current === null ? current : { ...current, [key]: value }));
  }, []);

  if (query.loading && saved === null) {
    return (
      <Card>
        <Skeleton className="h-72 rounded-lg" label="Loading the training settings" />
      </Card>
    );
  }

  if (saved === null || draft === null) {
    return (
      <Card>
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          retryLabel="Load the settings again"
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Training settings"
        description="Server-held configuration. Every value here is read from the settings service and written back to it — none of it is a constant in the code."
        meta={editable ? undefined : <Badge>Read-only</Badge>}
        footer={
          editable ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-content-muted">
                {changedKeys.length === 0
                  ? 'No change to save.'
                  : `${String(changedKeys.length)} change${changedKeys.length === 1 ? '' : 's'} to save: ${changedKeys.join(', ')}.`}
              </p>
              <Button
                variant="primary"
                onClick={() => void submit()}
                busy={save.busy}
                busyLabel="Saving the settings"
                disabled={blocked || changedKeys.length === 0}
              >
                Save changes
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-5">
          {IS_DEMO ? (
            <Alert tone="info" title="Fixture settings — the form does not write">
              These are the documented §8.1 defaults rendered from a fixture. No request is made, so
              the save control is absent rather than disabled.
            </Alert>
          ) : !editable ? (
            <Alert tone="info" title="You cannot change these settings">
              The API reports that only{' '}
              {(response?.editable_by ?? []).map((each) => humaniseEnum(each)).join(', ') ||
                'no role'}{' '}
              may write them. The values are shown because reading them is not restricted.
            </Alert>
          ) : null}

          {save.error !== null ? (
            <Alert tone="danger" title="The settings were not saved" live>
              {save.error.message}
            </Alert>
          ) : null}

          {justSaved ? (
            <Alert tone="ok" title="Saved" live onDismiss={() => setJustSaved(false)}>
              The change is recorded in the settings history below, with the reason if you gave one.
            </Alert>
          ) : null}

          <fieldset disabled={!editable} className="space-y-5 border-0 p-0">
            <legend className="sr-only">Training settings</legend>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="HITL retraining threshold"
                hint="Validated samples that must accumulate before a batch is frozen. Lowering it below the current count means the threshold is already met — the samples counted so far are never discarded, and every existing batch keeps the threshold it was created with (§8.4)."
                error={errors.hitl_retraining_threshold ?? null}
                required
              >
                <NumberInput
                  value={draft.hitl_retraining_threshold}
                  onValueChange={(next) => set('hitl_retraining_threshold', next)}
                  min={BOUNDS.hitl_retraining_threshold.min}
                  step={1}
                  suffix="samples"
                  invalid={errors.hitl_retraining_threshold !== undefined}
                />
              </FormField>

              <FormField
                label="Training device"
                hint="What to request. The device a run actually used is reported per job, because an MPS request can fall back to CPU (§2.3)."
              >
                <Select
                  options={DEVICE_OPTIONS}
                  value={draft.training_device}
                  onValueChange={(next) =>
                    set('training_device', next === '' ? draft.training_device : next)
                  }
                />
              </FormField>

              <FormField
                label="Batch size"
                hint="1 to 512. Sized for 16 GB of unified memory, not for a GPU server."
                error={errors.batch_size ?? null}
                required
              >
                <NumberInput
                  value={draft.batch_size}
                  onValueChange={(next) => set('batch_size', next)}
                  min={BOUNDS.batch_size.min}
                  max={BOUNDS.batch_size.max ?? undefined}
                  step={1}
                  suffix="images"
                  invalid={errors.batch_size !== undefined}
                />
              </FormField>

              <FormField
                label="Maximum epochs"
                hint="1 to 1000. An upper bound, not a target — early stopping may end a run sooner."
                error={errors.max_epochs ?? null}
                required
              >
                <NumberInput
                  value={draft.max_epochs}
                  onValueChange={(next) => set('max_epochs', next)}
                  min={BOUNDS.max_epochs.min}
                  max={BOUNDS.max_epochs.max ?? undefined}
                  step={1}
                  suffix="epochs"
                  invalid={errors.max_epochs !== undefined}
                />
              </FormField>

              <FormField
                label="Candidate promotion mode"
                hint="Manual approval keeps a passing candidate waiting for a person. Either way a candidate is evaluated on the locked test set first — no mode skips that (§2.7)."
              >
                <Select
                  options={MODE_OPTIONS}
                  value={draft.candidate_promotion_mode}
                  onValueChange={(next) =>
                    set(
                      'candidate_promotion_mode',
                      next === '' ? draft.candidate_promotion_mode : next,
                    )
                  }
                />
              </FormField>

              <FormField
                label="Primary promotion metric"
                hint="The metric the minimum improvement is measured in. Macro-F1 resists the class imbalance skin-lesion datasets carry."
              >
                <Select
                  options={METRIC_OPTIONS}
                  value={draft.primary_promotion_metric}
                  onValueChange={(next) =>
                    set(
                      'primary_promotion_metric',
                      next === '' ? draft.primary_promotion_metric : next,
                    )
                  }
                />
              </FormField>

              <FormField
                label="Minimum improvement"
                hint="0 to 1, in units of the metric above. A candidate must beat the active model by at least this much on the same locked test set."
                error={errors.minimum_improvement ?? null}
                required
              >
                <NumberInput
                  value={draft.minimum_improvement}
                  onValueChange={(next) => set('minimum_improvement', next)}
                  min={BOUNDS.minimum_improvement.min}
                  max={BOUNDS.minimum_improvement.max ?? undefined}
                  step={0.001}
                  invalid={errors.minimum_improvement !== undefined}
                />
              </FormField>

              <div className="flex items-end">
                <Checkbox
                  label="Early stopping"
                  description="Stop when the validation metric stops improving, rather than running every epoch."
                  checked={draft.early_stopping}
                  onChange={(changed) => set('early_stopping', changed.currentTarget.checked)}
                />
              </div>
            </div>

            {editable ? (
              <FormField
                label="Reason for this change"
                hint="Optional, and stored on the audit row. The log can reconstruct what changed and by whom; only you can supply why."
              >
                <Textarea
                  value={reason}
                  onChange={(changed) => setReason(changed.currentTarget.value)}
                  rows={2}
                  spellCheck
                />
              </FormField>
            ) : null}
          </fieldset>
        </div>
      </Panel>

      <SettingsHistory />
    </div>
  );
}
