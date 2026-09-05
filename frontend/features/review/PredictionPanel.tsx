'use client';

/**
 * MedLoop AI — `PredictionPanel`: what the model said, or a plain statement that nothing did.
 *
 * ## The empty path is the normal path
 *
 * `ai_prediction` is `null` on every image on this machine, because no model has been trained here
 * (§15). So the refusal is not an edge case to be tucked away — it is what this panel renders today,
 * and it says *why* rather than showing a dash. §2.3 forbids the alternative: a greyed-out "0.87" or
 * an empty bar chart is the same claim in a quieter font.
 *
 * ## Nothing here computes agreement
 *
 * `agreement = (human_label == ai_predicted_class)` is stored on the review session by the server at
 * submit time, together with the model version that produced the prediction (§6.3). A live "you
 * disagree with the model" indicator would be a second, unrecorded answer to that question, computed
 * by the layer that §3.1 forbids to hold business rules. The submitted outcome is reported after the
 * fact, from the server's own field.
 *
 * ## The device is the one the pass ran on
 *
 * Printed verbatim from the prediction row. §2.3 is explicit that the *configured* device is not the
 * answer; `AUTO` resolving to CPU after an MPS failure is exactly the case that matters.
 */

import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Card';
import { DefinitionList, ProgressBar } from '@/components/ui/KpiTile';
import { Unavailable } from '@/components/ui/states';
import { formatConfidence, formatDateTime } from '@/lib/format';
import type { AiPrediction, DiseaseLabel } from '@/types/domain';

export interface PredictionPanelProps {
  /** `null` ⇒ no model produced anything for this image. The panel refuses rather than fills in. */
  readonly prediction: AiPrediction | null;
  /** Used to print a code's human name. A code with no row is shown as the code itself. */
  readonly labels: readonly DiseaseLabel[];
}

/** `ACK` → `Actinic keratosis (ACK)`, or just `ACK` when the label space has no such row. */
function labelText(code: string, labels: readonly DiseaseLabel[]): string {
  const match = labels.find((label) => label.code === code);
  return match === undefined ? code : `${match.name} (${match.code})`;
}

/** Highest probability first. A vector read in insertion order buries the answer. */
function ranked(
  probabilities: Readonly<Record<string, number>>,
): readonly (readonly [string, number])[] {
  return Object.entries(probabilities).sort(([, left], [, right]) => right - left);
}

export function PredictionPanel({ prediction, labels }: PredictionPanelProps): ReactElement {
  return (
    <Panel
      id="ai-prediction"
      title="Model prediction"
      description="The model's own record. A human correction is stored beside it and never overwrites it."
      meta={prediction === null ? undefined : <Badge mono>{prediction.model_version}</Badge>}
    >
      {prediction === null ? (
        <Unavailable
          variant="block"
          reason="No model has predicted anything for this image. Training and inference are not implemented on this machine, so there is no predicted class, no confidence and no probability vector to show — and none will be shown until this build computes one."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <DefinitionList
            items={[
              {
                term: 'Predicted',
                value: labelText(prediction.predicted_label_code, labels),
              },
              { term: 'Confidence', value: formatConfidence(prediction.confidence) },
              { term: 'Model', value: prediction.model_version, mono: true },
              // Not the configured device — the one the forward pass reported (§2.3).
              { term: 'Ran on', value: prediction.device, mono: true },
              { term: 'Predicted at', value: formatDateTime(prediction.created_at) },
            ]}
          />

          {/*
            The full vector, not just the winning class. §2.3's "publish the threshold behind any
            binary verdict" has the same shape here: a lone `0.62` hides whether the runner-up was
            `0.61` or `0.02`, and those are different findings for a reviewer to act on.
          */}
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-content-secondary">Class probabilities</h4>
            <div className="flex flex-col gap-2">
              {ranked(prediction.probabilities).map(([code, value]) => (
                <ProgressBar
                  key={code}
                  // The winning row is named, not merely first. Sorting puts the vector's argmax on
                  // top; if the server's `predicted_label_code` were ever a different code, an
                  // implicit "top row wins" would hide that disagreement instead of showing it.
                  label={
                    code === prediction.predicted_label_code
                      ? `${labelText(code, labels)} — predicted`
                      : labelText(code, labels)
                  }
                  value={value}
                  max={1}
                  valueText={formatConfidence(value)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
