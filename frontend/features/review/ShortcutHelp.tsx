'use client';

/**
 * MedLoop AI — `ShortcutHelp`: the keyboard map, read out of the map itself.
 *
 * There is no list of keys in this file. `SHORTCUT_SECTIONS` is derived from the one table the canvas
 * matches against, so the panel cannot document a key that no longer works — the failure mode of every
 * hand-maintained shortcut sheet. Each group's `note` comes from the same module, which is why the
 * "deleting a saved shape archives it on the server" sentence appears here without this component
 * knowing anything about annotations.
 *
 * Destructive rows are marked. `Cmd/Ctrl+Shift+Enter` skips an image and cannot be undone from the
 * next one, so a reader scanning for what is safe to try should not have to infer it from the verb.
 */

import type { ReactElement } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SHORTCUT_SECTIONS } from './canvas/shortcuts';

export interface ShortcutHelpProps {
  readonly open: boolean;
  readonly onDismiss: () => void;
}

export function ShortcutHelp({ open, onDismiss }: ShortcutHelpProps): ReactElement {
  return (
    <Modal
      open={open}
      onDismiss={onDismiss}
      title="Keyboard shortcuts"
      description="Every key the review canvas listens for. Keys are ignored while you are typing in a field."
      size="lg"
      footer={
        <Button variant="primary" onClick={onDismiss}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {SHORTCUT_SECTIONS.map((section) => (
          <section key={section.group} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-content-primary">{section.group}</h3>
            {section.note === null ? null : (
              <p className="max-w-prose text-xs text-content-secondary">{section.note}</p>
            )}
            <dl className="flex flex-col gap-1.5">
              {section.items.map((spec) => (
                <div
                  key={spec.action}
                  className="flex items-baseline justify-between gap-4 border-b border-edge-subtle pb-1.5 last:border-b-0 last:pb-0"
                >
                  <dt className="text-sm text-content-primary">
                    {spec.label}
                    {spec.destructive === true ? (
                      <span className="ml-2 text-xs font-medium text-status-danger">
                        removes work
                      </span>
                    ) : null}
                  </dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {spec.chips.map((chip) => (
                      <kbd
                        key={chip}
                        className="rounded border border-edge bg-surface-inset px-1.5 py-0.5 font-mono text-xs text-content-secondary"
                      >
                        {chip}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
