'use client';

/**
 * MedLoop AI — `ReviewToolbar`: tool selection and the history actions.
 *
 * ## The buttons render the keyboard map, they do not restate it
 *
 * Every label's key chip comes from `shortcutHint(action)`, so the toolbar cannot disagree with what
 * the canvas actually listens for. A hard-coded `(1)` next to a button whose key had moved would be
 * worse than no chip at all, because it would be believed.
 *
 * ## No zoom or fit controls
 *
 * Zoom, fit and reset are owned by the canvas viewport and reachable by `+`, `−`, `0` and `R`. A
 * second set of buttons here would need the viewport handle lifted out of the component that owns the
 * wheel and pinch gestures, and two authorities over scale is how a zoom control ends up disagreeing
 * with the image on screen.
 *
 * ## Clear-all is destructive and does not act on its own
 *
 * It is routed up unchanged. The workspace confirms it, because a saved shape in the set means the
 * action reaches the server — and the canvas, per its own contract, renders no dialogs.
 */

import type { ReactElement } from 'react';

import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { shortcutHint } from './canvas/shortcuts';
import { TOOL_DESCRIPTORS } from './canvas/tools/tool';
import type { ToolId } from './canvas/tools/tool';

export interface ReviewToolbarProps {
  readonly tool: ToolId;
  readonly onToolChange: (tool: ToolId) => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  /** Confirmed by the workspace, not here. `null` shapes ⇒ the caller disables it. */
  readonly onClearAll: () => void;
  readonly clearDisabled: boolean;
  readonly onShowShortcuts: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** `Bounding box (1)`, or just the label when the map declares no key for that action. */
function withKey(label: string, hint: string | null): string {
  return hint === null ? label : `${label} (${hint})`;
}

export function ReviewToolbar({
  tool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClearAll,
  clearDisabled,
  onShowShortcuts,
  disabled = false,
  className,
}: ReviewToolbarProps): ReactElement {
  return (
    <div
      className={cx(
        'flex flex-wrap items-center justify-between gap-3 rounded-md border border-edge bg-surface-raised p-2',
        className,
      )}
    >
      {/*
        A real toolbar: `role="toolbar"` with `aria-pressed` on each tool, rather than a radio group.
        The tools are buttons that stay pressed, and screen readers announce that state without the
        group semantics implying the annotator must pick one before anything else can happen.
      */}
      <div role="toolbar" aria-label="Annotation tools" aria-orientation="horizontal" className="flex flex-wrap items-center gap-1.5">
        {TOOL_DESCRIPTORS.map((descriptor) => (
          <Button
            key={descriptor.id}
            variant={descriptor.id === tool ? 'primary' : 'subtle'}
            size="sm"
            aria-pressed={descriptor.id === tool}
            title={withKey(descriptor.label, shortcutHint(descriptor.action))}
            onClick={() => {
              onToolChange(descriptor.id);
            }}
            disabled={disabled}
          >
            {withKey(descriptor.label, shortcutHint(descriptor.action))}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="subtle"
          size="sm"
          onClick={onUndo}
          disabled={disabled || !canUndo}
          title={withKey('Undo', shortcutHint('undo'))}
        >
          {withKey('Undo', shortcutHint('undo'))}
        </Button>
        <Button
          variant="subtle"
          size="sm"
          onClick={onRedo}
          disabled={disabled || !canRedo}
          title={withKey('Redo', shortcutHint('redo'))}
        >
          {withKey('Redo', shortcutHint('redo'))}
        </Button>
        <Button
          variant="subtle"
          size="sm"
          onClick={onClearAll}
          disabled={disabled || clearDisabled}
          title={withKey('Clear all shapes', shortcutHint('clear-all'))}
        >
          {withKey('Clear all', shortcutHint('clear-all'))}
        </Button>
        <Button variant="subtle" size="sm" onClick={onShowShortcuts} disabled={disabled}>
          Keyboard shortcuts
        </Button>
      </div>
    </div>
  );
}
