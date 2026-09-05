'use client';

/**
 * MedLoop AI — `ShapeList`: the shapes as text, and the one place the AI box can be adopted.
 *
 * ## Why a list exists at all
 *
 * The canvas is an SVG that only means something to someone who can see it. §11.2 requires a keyboard
 * path for every annotation action, so every shape needs a focusable row: select it, read its extent,
 * remove it. This list is that representation — not a convenience panel, the accessible one.
 *
 * ## "Accept the model's region" copies; it never moves
 *
 * The AI geometry is **copied** into a new `HUMAN` shape (`origin: 'ACCEPTED_AI'`). The
 * `ai_predictions` row is not read for this, not updated by it, and not deleted after it (§2.4). The
 * copy is submitted as an ordinary human annotation, because that is what it is: a person looked at a
 * proposed region and said yes. Recording it as the model's own output would erase the human act, and
 * recording it as a mutation of the prediction would erase the disagreement signal (§6.3).
 *
 * `origin` is carried so the UI can say where a shape came from. It is client-only and is not part of
 * `SubmitAnnotation`, so it cannot reach the server as a claim about provenance the backend did not
 * make itself.
 *
 * ## Removing a saved shape is not the same act as removing a drawn one
 *
 * A shape with a `savedId` exists in `annotations`. Its removal is an archive on the server, which the
 * workspace confirms and sends with the submit — so the row says which kind it is rather than offering
 * one undifferentiated "delete".
 */

import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { EmptyState } from '@/components/ui/states';
import { formatPercent, humaniseEnum } from '@/lib/format';
import { AnnotationType } from '@/types/domain';
import type { DiseaseLabel, Geometry } from '@/types/domain';

import { deriveBoundingBox } from './canvas/geometry';
import type { CanvasShape, Snapshot } from './canvas/useAnnotationHistory';

export interface ShapeListProps {
  readonly shapes: Snapshot;
  readonly selectedKey: string | null;
  readonly onSelect: (key: string | null) => void;
  /** Routed to the workspace unchanged: it decides discard-vs-archive by reading `savedId`. */
  readonly onRemove: (shape: CanvasShape) => void;
  /** The model's region, or `null` — the normal case here, since no model runs on this machine. */
  readonly aiGeometry: Geometry | null;
  /** Copies {@link aiGeometry} into a new `HUMAN` shape. Never touches the prediction row (§2.4). */
  readonly onAcceptAi: () => void;
  /** Used only to print a code's human name beside a shape that carries one. */
  readonly labels: readonly DiseaseLabel[];
  readonly disabled?: boolean;
  readonly className?: string;
}

/** `x 30% · y 26% · 37% × 43%` — the extent in the units the shapes are actually stored in (§4.3). */
function extentText(geometry: Geometry): string {
  const box = deriveBoundingBox(geometry);
  const at = `x ${formatPercent(box.x, 0)} · y ${formatPercent(box.y, 0)}`;
  return `${at} · ${formatPercent(box.w, 0)} × ${formatPercent(box.h, 0)}`;
}

/** A polygon's vertex count is the fact its bounding box hides. Nothing else needs a suffix. */
function detailText(geometry: Geometry): string | null {
  return geometry.type === AnnotationType.POLYGON
    ? `${String(geometry.points.length)} points`
    : null;
}

const ORIGIN_TEXT: Readonly<Record<CanvasShape['origin'], string>> = {
  DRAWN: 'Drawn here',
  ACCEPTED_AI: 'Copied from the model’s region',
  SAVED: 'Saved earlier',
};

function labelName(code: string, labels: readonly DiseaseLabel[]): string {
  return labels.find((label) => label.code === code)?.name ?? code;
}

export function ShapeList({
  shapes,
  selectedKey,
  onSelect,
  onRemove,
  aiGeometry,
  onAcceptAi,
  labels,
  disabled = false,
  className,
}: ShapeListProps): ReactElement {
  // One copy is the whole point of the action; a second would be two identical human annotations of
  // the same region, which is noise in the localisation metric rather than a stronger signal.
  const alreadyAccepted = shapes.some((shape) => shape.origin === 'ACCEPTED_AI');

  return (
    <Panel
      id="review-shapes"
      title="Shapes"
      description="Every region on this image, as text. Selecting a row selects it on the canvas."
      className={className}
      actions={
        aiGeometry === null ? undefined : (
          <Button
            variant="secondary"
            size="sm"
            onClick={onAcceptAi}
            disabled={disabled || alreadyAccepted}
          >
            {alreadyAccepted ? 'Model region copied' : 'Copy the model’s region'}
          </Button>
        )
      }
    >
      {shapes.length === 0 ? (
        <EmptyState
          title="No shapes yet"
          description="Draw a box, a rounded box or a polygon on the image. A disease label can be submitted without a shape, but a shape is what makes the correction usable for localisation."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {shapes.map((shape, index) => (
            <li key={shape.key}>
              <div
                className={cx(
                  'flex items-start gap-2 rounded-md border p-2.5 transition-colors duration-fast',
                  shape.key === selectedKey
                    ? 'border-edge-focus bg-status-info-soft'
                    : 'border-edge bg-surface-raised',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(shape.key === selectedKey ? null : shape.key);
                  }}
                  aria-pressed={shape.key === selectedKey}
                  disabled={disabled}
                  className="flex min-w-0 flex-1 flex-col gap-1 rounded text-left focus-visible:outline-none focus-visible:ring focus-visible:ring-edge-focus disabled:cursor-not-allowed"
                >
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-content-primary">
                      {index + 1}. {humaniseEnum(shape.type)}
                    </span>
                    {shape.savedId === null ? null : <Badge tone="neutral">Saved</Badge>}
                    {shape.labelCode === null ? null : (
                      <Badge tone="info">{labelName(shape.labelCode, labels)}</Badge>
                    )}
                  </span>
                  <span className="text-xs text-content-muted [font-variant-numeric:tabular-nums]">
                    {extentText(shape.geometry)}
                    {detailText(shape.geometry) === null
                      ? null
                      : ` · ${String(detailText(shape.geometry))}`}
                  </span>
                  <span className="text-xs text-content-secondary">
                    {ORIGIN_TEXT[shape.origin]}
                  </span>
                </button>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    onRemove(shape);
                  }}
                  disabled={disabled}
                >
                  {shape.savedId === null ? 'Discard' : 'Archive'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
