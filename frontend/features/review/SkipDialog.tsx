'use client';

/**
 * MedLoop AI — `SkipDialog`: the reason a sample left the queue without a label.
 *
 * ## A skip is a recorded outcome, not a cancellation
 *
 * §6.2: the review session row is written, `review_status` becomes `SKIPPED`, and the HITL counter is
 * **not** touched. So the reason is worth collecting — "poor image quality" across forty images is a
 * dataset finding, and it is only available if the annotator was asked at the moment they knew.
 *
 * ## The reason is required; the note is not
 *
 * `SkipReason` has an `OTHER` member, which is what makes requiring the radio reasonable: there is
 * always a truthful option, so a forced choice cannot push anyone into a wrong one. The free-text note
 * is optional except after `OTHER`, where the reason alone says nothing.
 *
 * ## Confirmed, because it advances the queue
 *
 * Skipping discards the shapes drawn on this image and moves on, and the annotator does not get the
 * image back by pressing undo — history is per image (`useAnnotationHistory`). That is exactly the
 * class of action `ConfirmDialog` exists for.
 */

import { useState } from 'react';
import type { ReactElement } from 'react';

import { RadioGroup } from '@/components/ui/Choice';
import type { RadioOption } from '@/components/ui/Choice';
import { FormField } from '@/components/ui/Field';
import { Textarea } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/Modal';
import { humaniseEnum } from '@/lib/format';
import { SkipReason } from '@/types/domain';
import type { SkipBody } from '@/types/api';

/** Straight from the enum (§4), so a new member appears here without an edit. */
const REASON_OPTIONS: readonly RadioOption<SkipReason>[] = Object.values(SkipReason).map(
  (reason) => ({ value: reason, label: humaniseEnum(reason) }),
);

export interface SkipDialogProps {
  readonly open: boolean;
  /** How many shapes will be discarded, so the confirmation can say so rather than imply it. */
  readonly shapeCount: number;
  readonly busy?: boolean;
  readonly onConfirm: (body: SkipBody) => void;
  readonly onCancel: () => void;
}

export function SkipDialog({
  open,
  shapeCount,
  busy = false,
  onConfirm,
  onCancel,
}: SkipDialogProps): ReactElement | null {
  const [reason, setReason] = useState<SkipReason | ''>('');
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState(false);

  if (!open) return null;

  const needsNote = reason === SkipReason.OTHER;
  const trimmed = note.trim();
  const reasonError = attempted && reason === '' ? 'Choose a reason before skipping.' : null;
  const noteError =
    attempted && needsNote && trimmed === ''
      ? 'Describe the reason — “Other” on its own is not a record.'
      : null;

  const submit = (): void => {
    setAttempted(true);
    if (reason === '' || (needsNote && trimmed === '')) return;
    onConfirm({ reason, ...(trimmed === '' ? {} : { note: trimmed }) });
  };

  return (
    <ConfirmDialog
      open={open}
      title="Skip this image"
      confirmLabel="Skip and advance"
      cancelLabel="Keep reviewing"
      // `danger` only when there is work to lose. A skip with an untouched canvas is a recorded
      // decision, not a destruction, and colouring every skip red would spend the warning early.
      tone={shapeCount === 0 ? 'primary' : 'danger'}
      busy={busy}
      onConfirm={submit}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-4">
        <p className="max-w-prose text-sm text-content-secondary">
          The image is recorded as skipped and the queue advances.{' '}
          {shapeCount === 0
            ? 'Nothing has been drawn on it.'
            : `${String(shapeCount)} shape${shapeCount === 1 ? '' : 's'} on this image will be discarded and cannot be recovered with undo.`}{' '}
          A skipped sample never joins the retraining pool, so nothing is counted toward the next
          model version.
        </p>

        <RadioGroup<SkipReason>
          legend="Reason"
          name="skip-reason"
          value={reason}
          onValueChange={setReason}
          options={REASON_OPTIONS}
          error={reasonError}
          disabled={busy}
        />

        <div className="flex flex-col gap-1.5">
          <FormField
            label="Note"
            required={needsNote}
            error={noteError}
            hint={
              needsNote
                ? 'Required for “Other”: the reason alone records nothing.'
                : 'Optional. It is stored with the review session.'
            }
          >
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
              disabled={busy}
              invalid={noteError !== null}
              placeholder="What made this image unusable?"
            />
          </FormField>
        </div>
      </div>
    </ConfirmDialog>
  );
}
