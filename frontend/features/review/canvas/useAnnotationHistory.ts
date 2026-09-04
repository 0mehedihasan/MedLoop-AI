'use client';

/**
 * MedLoop AI — `useAnnotationHistory`: undo and redo over immutable snapshots.
 *
 * ## One snapshot per completed gesture
 *
 * A 300-event drag is one history entry. `commit` is called on `pointerup`, never on `pointermove`;
 * the in-progress shape lives in the tool's own draft state and only becomes a snapshot when the
 * gesture finishes. The skill lists the alternative as a named failure mode — "undo needs 300
 * presses, memory climbs".
 *
 * ## Reset is keyed on the image, and it happens during render
 *
 * Undoing into the *previous* image is the worst bug this component can have: it would edit an
 * annotation that has already been submitted. So the history belongs to one `imageId`, and when that
 * changes the stacks are replaced — during render, using React's documented "adjust state when a
 * prop changes" pattern rather than in an effect. An effect would paint one frame of the previous
 * image's shapes over the new image first, which is exactly the confusion this rule exists to
 * prevent.
 *
 * ## Nothing here reaches the server
 *
 * Submit posts `present` only. `past` and `future` are client memory; the server has no notion of an
 * annotator's undo stack and does not need one.
 */

import { useCallback, useMemo, useState } from 'react';

import type { AnnotationType, Geometry } from '@/types/domain';

/** Oldest entries drop off the front, silently. 50 gestures is far more than one review takes. */
export const HISTORY_LIMIT = 50;

/**
 * A shape while it is being edited.
 *
 * `key`, `savedId` and `origin` are **client-only**: {@link SubmitAnnotation} carries `type`,
 * `geometry` and `label_code` and nothing else, so none of these three can leak into a request body.
 * They exist because the canvas has to distinguish a shape it has already saved from one it has not,
 * and because "copied from the AI box" is worth saying in the UI — while still being submitted as a
 * plain `HUMAN` annotation (§2.4).
 */
export interface CanvasShape {
  readonly key: string;
  readonly type: AnnotationType;
  readonly geometry: Geometry;
  readonly labelCode: string | null;
  /** The `annotations` row this shape came from, or `null` while it exists only in the browser. */
  readonly savedId: number | null;
  readonly origin: 'DRAWN' | 'ACCEPTED_AI' | 'SAVED';
}

export type Snapshot = readonly CanvasShape[];

interface HistoryState {
  readonly past: readonly Snapshot[];
  readonly present: Snapshot;
  readonly future: readonly Snapshot[];
}

export interface AnnotationHistory {
  readonly shapes: Snapshot;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Pushes the current shapes onto `past` and clears `future`. One call per completed gesture. */
  readonly commit: (next: Snapshot) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  /** Replaces everything and empties both stacks. For a discard that must not be undoable. */
  readonly replace: (shapes: Snapshot) => void;
}

function initial(shapes: Snapshot): HistoryState {
  return { past: [], present: shapes, future: [] };
}

export function useAnnotationHistory(imageId: number, saved: Snapshot): AnnotationHistory {
  const [state, setState] = useState<HistoryState>(() => initial(saved));
  const [owner, setOwner] = useState<number>(imageId);

  if (owner !== imageId) {
    // Render-time reset. Both setters are on this component, so React re-renders immediately with
    // the new state and never commits a frame carrying the previous image's shapes.
    setOwner(imageId);
    setState(initial(saved));
  }

  const commit = useCallback((next: Snapshot): void => {
    setState((current) => {
      const past = [...current.past, current.present];
      return {
        past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
        present: next,
        // Cleared, per the skill: redo survives only until the next commit. A branch kept here
        // would let a redo resurrect shapes the annotator has since drawn over.
        future: [],
      };
    });
  }, []);

  const undo = useCallback((): void => {
    setState((current) => {
      const previous = current.past[current.past.length - 1];
      if (previous === undefined) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  }, []);

  const redo = useCallback((): void => {
    setState((current) => {
      const next = current.future[0];
      if (next === undefined) return current;
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      };
    });
  }, []);

  const replace = useCallback((shapes: Snapshot): void => {
    setState(initial(shapes));
  }, []);

  return useMemo<AnnotationHistory>(
    () => ({
      shapes: state.present,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      commit,
      undo,
      redo,
      replace,
    }),
    [state, commit, undo, redo, replace],
  );
}
