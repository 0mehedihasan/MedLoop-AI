'use client';

/**
 * MedLoop AI — `LabelPicker`: the annotator's disease label, chosen from the configurable label space.
 *
 * ## The list is data, and there is no fallback list
 *
 * The options come from `disease_labels` (§5). There is no hard-coded array here — not even the six
 * PAD-UFES-20 codes named in the brief — because a fallback list is indistinguishable from a verified
 * one on screen, and it would quietly keep working after someone edited the label space.
 * An empty label space is therefore an *empty state*, not six defaults.
 *
 * ## Nothing is pre-selected, ever
 *
 * `value: ''` is the initial state and the picker never fills it in. Pre-selecting the publisher's
 * `label_code` — or worse, the model's predicted class — would make "the human agreed" the default
 * outcome of doing nothing, and agreement is the measurement this whole system exists to collect
 * (§2.4, §6.3). A submit with no label is rejected by the workspace instead.
 *
 * ## An unverified label space says so on every image
 *
 * While `verified` is `false` the codes are seeded from the project brief and have **not** been
 * confirmed against the real files (§5). The notice is not dismissible: a provenance warning that can
 * be clicked away is one that is gone before the labelling starts.
 */

import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Panel } from '@/components/ui/Card';
import { RadioGroup } from '@/components/ui/Choice';
import type { RadioOption } from '@/components/ui/Choice';
import { EmptyState } from '@/components/ui/states';
import type { DiseaseLabel } from '@/types/domain';

export interface LabelPickerProps {
  /** The label space as served. Filtered and ordered here; never reordered by the caller. */
  readonly labels: readonly DiseaseLabel[];
  /** `''` ⇒ the annotator has not chosen yet. Never seeded from the image or the prediction. */
  readonly value: string;
  readonly onChange: (code: string) => void;
  /** `labels[*].verified_against_data` for the space as a whole (§5). `false` shows the notice. */
  readonly verified: boolean;
  readonly disabled?: boolean;
  /** Set by the workspace when a submit was attempted with nothing chosen. */
  readonly error?: string | null;
}

/**
 * Active rows only, in `display_order`, ties broken by code so the order is stable across reloads.
 *
 * A deactivated label stays in the database — historical annotations still point at it — but it is not
 * offered for new work. `display_order` is the admin's stated order; sorting by name instead would
 * silently override it.
 */
function options(labels: readonly DiseaseLabel[]): readonly RadioOption[] {
  return labels
    .filter((label) => label.is_active)
    .slice()
    .sort((left, right) =>
      left.display_order === right.display_order
        ? left.code.localeCompare(right.code)
        : left.display_order - right.display_order,
    )
    .map((label) => ({
      value: label.code,
      label: `${label.name} (${label.code})`,
      ...(label.description === null ? {} : { description: label.description }),
    }));
}

export function LabelPicker({
  labels,
  value,
  onChange,
  verified,
  disabled = false,
  error = null,
}: LabelPickerProps): ReactElement {
  const items = options(labels);

  return (
    <Panel
      id="review-label"
      title="Disease label"
      description="The human answer. Stored as a new record beside the model's, never over it."
    >
      <div className="flex flex-col gap-3">
        {verified ? null : (
          <Alert
            tone="warn"
            title="Unverified label space"
            // Stated as provenance, not as a defect: the codes may well be right. What is missing is
            // the check, and until it happens the distinction between a seeded guess and a finding is
            // the only thing keeping the two apart.
          >
            These codes were seeded from the project description and have not yet been confirmed
            against the dataset files. Labels submitted now remain valid records, but the code list
            itself may change once the inspection runs.
          </Alert>
        )}

        {items.length === 0 ? (
          <EmptyState
            title="No labels are configured"
            description="The label space is empty, so there is nothing to submit. An administrator has to add disease labels before this image can be reviewed."
          />
        ) : (
          <RadioGroup
            legend="Disease label"
            legendHidden
            name="review-disease-label"
            value={value}
            onValueChange={onChange}
            options={items}
            disabled={disabled}
            error={error}
          />
        )}
      </div>
    </Panel>
  );
}
