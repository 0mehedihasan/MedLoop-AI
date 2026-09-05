'use client';

/**
 * MedLoop AI — `ReviewWorkspace`: the screen that owns the review decision.
 *
 * The canvas contributes gestures, the panels contribute controls, and this file is the only place
 * that decides anything. It holds the history, the layer flags, the selection, the active tool, the
 * timer, and every confirmation — because each of those is either shared by two children or has a
 * consequence one child must not be allowed to cause on its own.
 *
 * ## What is deliberately *not* on this screen
 *
 * The image's publisher-supplied `label_code` is not rendered anywhere. It is real data and it is in
 * the payload, but showing it beside an empty label picker turns the review into a copying exercise:
 * the annotator's label is the measurement, and a visible answer key destroys it. The same argument
 * is why nothing is pre-selected (`LabelPicker`) and why agreement is computed by the server from
 * what was actually submitted (§6.3).
 *
 * ## Removing a saved shape is settled at submit, not immediately
 *
 * A shape carrying a `savedId` is an `annotations` row. Removing it here does **not** fire a
 * `DELETE`: the submit payload is the image's complete intended annotation set, so a shape that is
 * gone from the canvas is gone from the payload, and the server archives what the payload no longer
 * contains (§7 — nothing is hard-deleted). That keeps the removal undoable right up to submit, and
 * it keeps one review from needing two network calls that can half-succeed. The confirmation exists
 * to say *which* kind of removal it is, not to make it irreversible.
 *
 * ## Every number in the outcome banner came from the response
 *
 * Agreement, the validated count, the threshold and the stage are read off `ReviewOutcome`. None is
 * derived here — the threshold especially, which is configuration and never a literal (§2.6).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Card';
import { DefinitionList } from '@/components/ui/KpiTile';
import type { DefinitionItem } from '@/components/ui/KpiTile';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DemoBadge } from '@/components/ui/project';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { formatCount, formatDateTime, humaniseEnum } from '@/lib/format';
import type { SkipBody, SubmitAnnotation } from '@/types/api';
import { AnnotationSource } from '@/types/domain';
import type { Annotation } from '@/types/domain';

import { AnnotationCanvas } from './canvas/AnnotationCanvas';
import type { CanvasActions, LayerVisibility } from './canvas/AnnotationCanvas';
import { GRADCAM_DEFAULT_OPACITY } from './canvas/overlays/GradCamOverlay';
import { newShapeKey, useAnnotationHistory } from './canvas/useAnnotationHistory';
import type { CanvasShape, Snapshot } from './canvas/useAnnotationHistory';
import type { ToolId } from './canvas/tools/tool';
import { LabelPicker } from './LabelPicker';
import { LayerControls } from './LayerControls';
import { PredictionPanel } from './PredictionPanel';
import { ReviewToolbar } from './ReviewToolbar';
import { ShapeList } from './ShapeList';
import { ShortcutHelp } from './ShortcutHelp';
import { SkipDialog } from './SkipDialog';
import { useReviewQueue } from './useReviewQueue';
import type { ReviewOutcome } from './useReviewQueue';

/**
 * `existing_annotations` → canvas shapes.
 *
 * Two filters, both load-bearing. `archived_at !== null` rows are dropped because an earlier review
 * already removed them and re-drawing one would resurrect a decision somebody made deliberately.
 * `AI_LOCALIZATION` rows are dropped because the model's region reaches this screen as
 * `ai_localization` and is *copied* on acceptance (§2.4) — if it arrived as an editable saved shape,
 * the next submit would claim the model's geometry as human work.
 *
 * The `a{id}` key namespace cannot collide with `newShapeKey()`'s `d{n}`, and `savedId` is what makes
 * a later removal an archive rather than a discard.
 */
function toShapes(annotations: readonly Annotation[]): Snapshot {
  return annotations
    .filter(
      (annotation) =>
        annotation.archived_at === null && annotation.source === AnnotationSource.HUMAN,
    )
    .map((annotation) => ({
      key: `a${String(annotation.id)}`,
      type: annotation.type,
      geometry: annotation.geometry,
      labelCode: annotation.label_code,
      savedId: annotation.id,
      origin: 'SAVED' as const,
    }));
}

/**
 * Canvas shapes → the `annotations` field of the submit payload.
 *
 * This is the image's **complete intended annotation set**, not a diff: a saved shape the annotator
 * removed is absent, which is how the archive is expressed (§7). `label_code` is omitted rather than
 * sent as `null` when a shape carries none, so the payload's top-level label applies to it.
 */
function toSubmitAnnotations(shapes: Snapshot): readonly SubmitAnnotation[] {
  return shapes.map((shape) => ({
    type: shape.type,
    geometry: shape.geometry,
    ...(shape.labelCode === null ? {} : { label_code: shape.labelCode }),
  }));
}

/** What the open confirmation is about. `null` ⇒ none is open. */
type Pending =
  | { readonly kind: 'clear' }
  | { readonly kind: 'archive'; readonly shape: CanvasShape }
  | null;

/** The server's `agreement`, in words. `null` is its own sentence, not a hedge on `false` (§6.3). */
function agreementText(agreement: boolean | null): string {
  if (agreement === null) {
    return 'There was no model prediction on this image, so there is no agreement to report.';
  }
  return agreement
    ? 'Your label matches the model’s predicted class.'
    : 'Your label differs from the model’s predicted class — that correction is the signal (§2.4).';
}

export interface OutcomeBannerProps {
  readonly outcome: ReviewOutcome;
  readonly onDismiss: () => void;
}

/**
 * What the server said, in the server's own numbers.
 *
 * Three outcomes that must not look alike: the call failed and nothing happened; the call succeeded
 * but nothing was persisted (demo mode, §10); the call succeeded and rows exist. One green "Saved"
 * covering all three is precisely the false confidence §2.3 forbids.
 */
export function OutcomeBanner({ outcome, onDismiss }: OutcomeBannerProps): ReactElement {
  if (!outcome.ok) {
    return (
      <Alert tone="danger" live title="Nothing was recorded" onDismiss={onDismiss}>
        {outcome.problem === null
          ? 'The request failed and the server gave no reason.'
          : `${outcome.problem.code}: ${outcome.problem.message}`}{' '}
        Your label and every shape are still on this image — nothing was lost, so you can retry.
      </Alert>
    );
  }

  if (!outcome.recorded) {
    return (
      <Alert tone="warn" live title="Advanced, but nothing was recorded" onDismiss={onDismiss}>
        This queue is demo data: no review session, no annotation row, and the HITL counter did not
        move (§10).
      </Alert>
    );
  }

  const hitl = outcome.hitl;
  return (
    <Alert tone="ok" live title="Recorded" onDismiss={onDismiss}>
      <p>{agreementText(outcome.agreement)}</p>
      {hitl === null ? null : (
        <p className="mt-1.5 [font-variant-numeric:tabular-nums]">
          {formatCount(hitl.validated_since_last_training)} of {formatCount(hitl.threshold)}{' '}
          validated samples since the last batch — {formatCount(hitl.remaining)} to go. Cycle stage:{' '}
          {humaniseEnum(hitl.stage)}.
          {hitl.batch_created ? ` This submit created training batch ${formatCount(hitl.batch_id)}.` : ''}
        </p>
      )}
    </Alert>
  );
}

export function ReviewWorkspace(): ReactElement {
  const queue = useReviewQueue();
  const item = queue.item;
  // Not a real id: it only has to be stable so the history hook does not reset while the queue is
  // loading or exhausted. Every hook below runs before the early returns, unconditionally.
  const imageId = item === null ? 0 : item.image.id;

  const saved = useMemo<Snapshot>(
    () => toShapes(item === null ? [] : item.existing_annotations),
    [item],
  );
  const history = useAnnotationHistory(imageId, saved);

  const [tool, setTool] = useState<ToolId>('box');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerVisibility>({
    gradcam: true,
    aiBox: true,
    human: true,
  });
  const [opacity, setOpacity] = useState(GRADCAM_DEFAULT_OPACITY);
  const [labelCode, setLabelCode] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);

  // Per-image state must not survive the queue advancing. This is the render-time reset the history
  // hook uses (React's "adjust state when a prop changes"), not an effect: an effect would paint the
  // previous image's label beside the new photograph for one frame, and the annotator might submit
  // it. `outcome` is deliberately excluded — it is the report *about* the submit that advanced us.
  const [owner, setOwner] = useState(imageId);
  if (owner !== imageId) {
    setOwner(imageId);
    setLabelCode('');
    setAttempted(false);
    setSelectedKey(null);
    setProblem(null);
    setPending(null);
    setSkipOpen(false);
  }

  const startedAt = useRef(Date.now());
  useEffect(() => {
    startedAt.current = Date.now();
  }, [imageId]);
  /** `time_spent_ms` for §14's annotation-time metric — measured, never estimated. */
  const elapsed = useCallback((): number => Date.now() - startedAt.current, []);

  const commit = useCallback(
    (next: Snapshot): void => {
      history.commit(next);
      // A committed gesture is one the geometry validator accepted, so a leftover rejection notice
      // would now be describing a shape that exists. One entry per completed gesture, never per
      // `pointermove` — the canvas calls this once when a drag ends.
      setProblem(null);
    },
    [history],
  );

  const removeShape = useCallback(
    (shape: CanvasShape): void => {
      // A drawn shape is local, so it just goes. A saved one is an `annotations` row, and the
      // annotator is told what the submit will do to it before it leaves the canvas.
      if (shape.savedId !== null) {
        setPending({ kind: 'archive', shape });
        return;
      }
      setSelectedKey((current) => (current === shape.key ? null : current));
      commit(history.shapes.filter((candidate) => candidate.key !== shape.key));
    },
    [commit, history.shapes],
  );

  const confirmPending = useCallback((): void => {
    if (pending === null) return;
    if (pending.kind === 'clear') {
      setSelectedKey(null);
      // `commit([])`, not `replace([])`: clearing stays one undo away, which is what makes a
      // mis-aimed keystroke recoverable.
      commit([]);
    } else {
      const key = pending.shape.key;
      setSelectedKey((current) => (current === key ? null : current));
      commit(history.shapes.filter((candidate) => candidate.key !== key));
    }
    setPending(null);
  }, [commit, history.shapes, pending]);

  const acceptAi = useCallback((): void => {
    const geometry = item === null ? null : item.ai_localization;
    if (geometry === null) return;
    // Copied, never moved. The `ai_predictions` row is not read for this, not updated by it and not
    // deleted after it (§2.4); what gets submitted is an ordinary human annotation.
    const key = newShapeKey();
    commit([
      ...history.shapes,
      { key, type: geometry.type, geometry, labelCode: null, savedId: null, origin: 'ACCEPTED_AI' },
    ]);
    setSelectedKey(key);
  }, [commit, history.shapes, item]);

  const submit = useCallback(async (): Promise<void> => {
    setAttempted(true);
    setOutcome(null);
    // The disease label is the measurement, so there is no defensible default to fall back on
    // (§6.1). Shapes are optional: a label with no region is still a usable classification record.
    if (labelCode === '') return;
    const result = await queue.submit({
      label_code: labelCode,
      annotations: toSubmitAnnotations(history.shapes),
      time_spent_ms: elapsed(),
    });
    setOutcome(result);
  }, [elapsed, history.shapes, labelCode, queue]);

  const confirmSkip = useCallback(
    async (body: SkipBody): Promise<void> => {
      setOutcome(null);
      const result = await queue.skip({ ...body, time_spent_ms: elapsed() });
      // Closed on failure too: an error banner behind an open modal is an error nobody reads, and
      // re-picking a radio costs less than that.
      setSkipOpen(false);
      setOutcome(result);
    },
    [elapsed, queue],
  );

  const actions = useMemo<CanvasActions>(
    () => ({
      undo: history.undo,
      redo: history.redo,
      submit: () => {
        void submit();
      },
      // The canvas raises the intent; the confirmations live here, because the canvas renders no
      // dialogs and neither of these may happen from a single keystroke.
      skip: () => {
        setSkipOpen(true);
      },
      clearAll: () => {
        setPending({ kind: 'clear' });
      },
      toggleLayer: (layer) => {
        setLayers((current) => ({ ...current, [layer]: !current[layer] }));
      },
      remove: removeShape,
    }),
    [history.redo, history.undo, removeShape, submit],
  );

  const dismissOutcome = (): void => {
    setOutcome(null);
  };

  if (queue.loading) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4 lg:flex-row">
        <Skeleton className="h-[30rem] flex-1 lg:h-[40rem]" label="Loading the review queue" />
        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-inspector">
          <Skeleton className="h-44" count={3} />
        </div>
      </div>
    );
  }

  if (queue.error !== null) {
    return <ErrorState error={queue.error} onRetry={queue.retry} />;
  }

  if (item === null) {
    return (
      <div className="flex flex-col gap-4">
        {outcome === null ? null : (
          <OutcomeBanner outcome={outcome} onDismiss={dismissOutcome} />
        )}
        <EmptyState
          title={queue.exhausted ? 'Nothing left to review' : 'No image was returned'}
          description={
            queue.exhausted
              ? 'Every image in the review pool has been validated or skipped. More work appears here when an upload assigns further images to it — a TEST image never does, whatever its lock state (§4.2).'
              : 'The queue answered without an image. Nothing is wrong with your session; check again, or check whether any image is assigned to the review pool.'
          }
          action={
            <Button variant="secondary" busy={queue.refetching} onClick={queue.retry}>
              Check again
            </Button>
          }
        />
      </div>
    );
  }

  const image = item.image;
  const position = queue.position ?? item.queue;
  const savedCount = history.shapes.filter((shape) => shape.savedId !== null).length;

  // The publisher's `label_code` is absent on purpose — see the note at the top of this file.
  const meta: readonly DefinitionItem[] = [
    { term: 'File', value: image.filename, mono: true },
    { term: 'Split', value: humaniseEnum(image.split) },
    { term: 'Status', value: humaniseEnum(image.data_status) },
    {
      term: 'Patient',
      value: image.patient_ref,
      unavailableReason: 'The source metadata carried no patient identifier',
      mono: true,
    },
    {
      term: 'Lesion',
      value: image.lesion_ref,
      unavailableReason: 'The source metadata carried no lesion identifier',
      mono: true,
    },
    {
      term: 'Pixels',
      value:
        image.width === null || image.height === null
          ? null
          : `${formatCount(image.width)} × ${formatCount(image.height)}`,
      unavailableReason: 'Dimensions were not recorded at ingestion',
    },
    { term: 'Added', value: formatDateTime(image.created_at) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-content-secondary [font-variant-numeric:tabular-nums]">
          Image {formatCount(position.position)} of {formatCount(position.total)} ·{' '}
          {formatCount(position.remaining)} left in this queue, including this one
        </p>
        {queue.demo ? <DemoBadge /> : null}
      </div>

      {queue.demo ? (
        <Alert tone="warn" title="Demo queue — nothing you do here is recorded">
          The images are procedurally drawn, no model has run on them, and submitting writes no
          review session, no annotation and no counter movement. Set{' '}
          <code className="font-mono text-xs">NEXT_PUBLIC_DATA_SOURCE=api</code> to review real
          samples (§10).
        </Alert>
      ) : null}

      {outcome === null ? null : <OutcomeBanner outcome={outcome} onDismiss={dismissOutcome} />}

      {problem === null ? null : (
        <Alert
          tone="danger"
          live
          title="That shape was not added"
          onDismiss={() => {
            setProblem(null);
          }}
        >
          {problem}
        </Alert>
      )}

      <ReviewToolbar
        tool={tool}
        onToolChange={setTool}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        onClearAll={actions.clearAll}
        clearDisabled={history.shapes.length === 0}
        onShowShortcuts={() => {
          setShortcutsOpen(true);
        }}
        disabled={queue.busy}
      />

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* An explicit height, because the canvas is `h-full` and cannot resolve against `auto`. */}
        <div className="h-[30rem] min-w-0 flex-1 lg:h-[40rem]">
          <AnnotationCanvas
            imageUrl={item.image_url}
            gradcamUrl={item.gradcam_url}
            aiGeometry={item.ai_localization}
            shapes={history.shapes}
            onShapesChange={commit}
            tool={tool}
            onToolChange={setTool}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            layers={layers}
            gradcamOpacity={opacity}
            actions={actions}
            onProblem={setProblem}
            disabled={queue.busy}
          />
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-inspector">
          <Panel
            id="review-decision"
            title="Your decision"
            description="The label is required. A region is optional, and is what makes the correction usable for localisation."
            footer={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  busy={queue.busy}
                  busyLabel="Recording this review"
                  onClick={() => {
                    void submit();
                  }}
                >
                  Submit and continue
                </Button>
                <Button
                  variant="danger"
                  disabled={queue.busy}
                  onClick={() => {
                    setSkipOpen(true);
                  }}
                >
                  Skip this image
                </Button>
              </div>
            }
          >
            <LabelPicker
              labels={queue.labels}
              value={labelCode}
              onChange={setLabelCode}
              verified={queue.labelSpaceVerified}
              disabled={queue.busy}
              error={
                attempted && labelCode === ''
                  ? 'Choose the label you see before submitting. Nothing is preselected on purpose.'
                  : null
              }
            />
          </Panel>

          <PredictionPanel prediction={item.ai_prediction} labels={queue.labels} />

          <ShapeList
            shapes={history.shapes}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onRemove={removeShape}
            aiGeometry={item.ai_localization}
            onAcceptAi={acceptAi}
            labels={queue.labels}
            disabled={queue.busy}
          />

          <LayerControls
            layers={layers}
            onToggle={actions.toggleLayer}
            hasGradcam={item.gradcam_url !== null}
            hasAiBox={item.ai_localization !== null}
            opacity={opacity}
            onOpacityChange={setOpacity}
            disabled={queue.busy}
          />

          <Panel
            id="review-image"
            title="Image"
            description="Where this sample came from, so the review is attributable by query alone (§7.1)."
          >
            <DefinitionList items={meta} />
          </Panel>


        </aside>
      </div>

      <SkipDialog
        open={skipOpen}
        shapeCount={history.shapes.length}
        busy={queue.busy}
        onConfirm={(body) => {
          void confirmSkip(body);
        }}
        onCancel={() => {
          setSkipOpen(false);
        }}
      />

      <ConfirmDialog
        open={pending !== null && pending.kind === 'clear'}
        title="Remove every shape on this image"
        confirmLabel="Remove them"
        cancelLabel="Keep them"
        tone="danger"
        onConfirm={confirmPending}
        onCancel={() => {
          setPending(null);
        }}
      >
        {formatCount(history.shapes.length)}{' '}
        {history.shapes.length === 1 ? 'shape leaves' : 'shapes leave'} the canvas, and undo brings
        them back.{' '}
        {savedCount === 0
          ? 'None of them has reached the server yet.'
          : `${formatCount(savedCount)} of them are already saved annotations: submitting without them archives those rows — nothing is deleted, archived_at is stamped instead (§7).`}
      </ConfirmDialog>

      <ConfirmDialog
        open={pending !== null && pending.kind === 'archive'}
        title="Remove a saved region"
        confirmLabel="Remove it"
        cancelLabel="Keep it"
        tone="danger"
        onConfirm={confirmPending}
        onCancel={() => {
          setPending(null);
        }}
      >
        This region is already an annotation row. Removing it takes it off the canvas and leaves it
        out of the submit, and the server archives what the submit no longer contains — it is not
        deleted, and the AI prediction for this image is untouched either way (§2.4, §7). Until you
        submit, undo brings it back.
      </ConfirmDialog>

      <ShortcutHelp
        open={shortcutsOpen}
        onDismiss={() => {
          setShortcutsOpen(false);
        }}
      />

    </div>
  );
}

