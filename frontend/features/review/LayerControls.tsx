'use client';

/**
 * MedLoop AI — `LayerControls`: which overlays are drawn, and how strongly.
 *
 * ## An absent artefact removes its control
 *
 * When `gradcam_url` is `null` the Grad-CAM row is **not here**. Not greyed out, not present-and-off:
 * gone (§2.3, and the annotation skill states it for both model layers). A disabled checkbox labelled
 * "Grad-CAM" is still an assertion that an attribution map exists for this image, and the reviewer's
 * next move — clicking it and seeing nothing — teaches them the overlay is broken rather than absent.
 * A sentence in its place says which model output does not exist and why.
 *
 * ## State lives above this component
 *
 * `layers` comes down and `onToggle` goes up, because the same booleans are driven by the keyboard map
 * inside the canvas (`G`, `B`) and by these controls. Two sources of truth for "is the heat-map on"
 * would drift the moment someone pressed `G` while the checkbox had focus.
 *
 * ## Opacity is clamped, not free
 *
 * `0.2 … 0.8`, the same bounds `GradCamOverlay` clamps to. Below `0.2` an overlay that *is* on looks
 * off; at `1.0` it hides the photograph the annotator is being asked to judge. The slider cannot
 * express either state, so no one has to notice they are in it.
 */

import type { ChangeEvent, ReactElement } from 'react';

import { Panel } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Choice';
import { cx } from '@/components/ui/cx';
import { formatPercent } from '@/lib/format';

import {
  GRADCAM_MAX_OPACITY,
  GRADCAM_MIN_OPACITY,
} from './canvas/overlays/GradCamOverlay';
import type { LayerVisibility } from './canvas/AnnotationCanvas';
import { shortcutHint } from './canvas/shortcuts';

export interface LayerControlsProps {
  readonly layers: LayerVisibility;
  readonly onToggle: (layer: keyof LayerVisibility) => void;
  /** `gradcam_url !== null`. `false` removes the row and the opacity slider entirely. */
  readonly hasGradcam: boolean;
  /** `ai_localization !== null`. `false` removes the row. */
  readonly hasAiBox: boolean;
  readonly opacity: number;
  readonly onOpacityChange: (opacity: number) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** `'Show or hide the Grad-CAM overlay'` + `' (G)'` when the map declares a key for it. */
function withHint(label: string, hint: string | null): string {
  return hint === null ? label : `${label} (${hint})`;
}

export function LayerControls({
  layers,
  onToggle,
  hasGradcam,
  hasAiBox,
  opacity,
  onOpacityChange,
  disabled = false,
  className,
}: LayerControlsProps): ReactElement {
  const handleOpacity = (event: ChangeEvent<HTMLInputElement>): void => {
    const parsed = Number(event.target.value);
    if (Number.isFinite(parsed)) onOpacityChange(parsed);
  };

  return (
    <Panel
      id="review-layers"
      title="Layers"
      description="What is drawn over the photograph. Model layers appear only when the model produced one."
      className={className}
    >
      <div className="flex flex-col gap-3">
        <Checkbox
          label="Your annotations"
          description="Boxes and polygons you have drawn on this image, plus any already saved for it."
          checked={layers.human}
          onChange={() => {
            onToggle('human');
          }}
          disabled={disabled}
        />

        {hasGradcam ? (
          <>
            <Checkbox
              label={withHint('Grad-CAM attribution', shortcutHint('toggle-gradcam'))}
              description="Where the model's evidence was concentrated. Not a lesion boundary."
              checked={layers.gradcam}
              onChange={() => {
                onToggle('gradcam');
              }}
              disabled={disabled}
            />
            <OpacityRange
              opacity={opacity}
              onChange={handleOpacity}
              disabled={disabled}
              className="pl-7"
            />
          </>
        ) : null}

        {hasAiBox ? (
          <Checkbox
            label={withHint('Model localisation', shortcutHint('toggle-ai-box'))}
            description="The region the model derived from its own attribution. A separate record from yours."
            checked={layers.aiBox}
            onChange={() => {
              onToggle('aiBox');
            }}
            disabled={disabled}
          />
        ) : null}

        {hasGradcam && hasAiBox ? null : (
          <p className="max-w-prose text-xs text-content-muted">
            {absenceNote(hasGradcam, hasAiBox)}
          </p>
        )}
      </div>
    </Panel>
  );
}

/**
 * The sentence that replaces the missing rows.
 *
 * It names *which* output is absent rather than saying "some layers are unavailable", because the two
 * cases have different causes: no attribution artefact was written, versus no localisation was derived
 * from one. On this machine both are absent for the same reason — there is no model at all (§15) — and
 * the note says that too, so nobody reads it as a per-image failure.
 */
function absenceNote(hasGradcam: boolean, hasAiBox: boolean): string {
  const subject =
    !hasGradcam && !hasAiBox
      ? 'No attribution map and no model localisation exist'
      : hasGradcam
        ? 'No model localisation exists'
        : 'No attribution map exists';
  const layerWord = !hasGradcam && !hasAiBox ? 'those layers are' : 'that layer is';
  return `${subject} for this image, so ${layerWord} not offered here. Drawing an empty overlay would look like a result; this build computes neither.`;
}

interface OpacityRangeProps {
  readonly opacity: number;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly disabled: boolean;
  readonly className?: string;
}

/**
 * A native `<input type="range">`, deliberately.
 *
 * There is no `Slider` primitive in this project and this is the only consumer, so adding one would be
 * a component maintained for a single caller. The native control already brings arrow-key stepping,
 * `Home`/`End`, and the platform's own touch target — all of which a hand-rolled div would have to
 * re-implement to meet §11.2's keyboard rule.
 */
function OpacityRange({ opacity, onChange, disabled, className }: OpacityRangeProps): ReactElement {
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="gradcam-opacity" className="text-xs font-medium text-content-secondary">
          Overlay opacity
        </label>
        <span className="text-xs text-content-muted [font-variant-numeric:tabular-nums]">
          {formatPercent(opacity, 0)}
        </span>
      </div>
      <input
        id="gradcam-opacity"
        type="range"
        min={GRADCAM_MIN_OPACITY}
        max={GRADCAM_MAX_OPACITY}
        step={0.05}
        value={opacity}
        onChange={onChange}
        disabled={disabled}
        className="h-4 w-full cursor-pointer accent-status-info disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
