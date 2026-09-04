/**
 * MedLoop AI — shared glyphs.
 *
 * Every icon in this project is an inline `<svg>` painted with `fill-current`. There is no icon
 * package and no icon font: a sprite fetched at runtime is an outbound request (§2.1), and a font
 * would put the interface's meaning behind a file that can fail to load.
 *
 * A glyph moves into this file the moment a **second** component needs it. Path data copied between
 * components is how a close button ends up as two subtly different shapes on two surfaces, and the
 * copy is never found again.
 *
 * Glyphs are `aria-hidden` and carry no accessible name. The name belongs to the control around them
 * — `IconButton`'s `label`, a `<button>`'s text — never to the picture inside it.
 */

import type { ReactElement } from 'react';

import { cx } from './cx';

export interface GlyphProps {
  /** Sizing utilities. Defaults suit the control the glyph is usually placed in. */
  readonly className?: string;
}

/** The dismiss affordance: alerts, modals, drawers, toasts. */
export function CloseIcon({ className = 'h-3 w-3' }: GlyphProps): ReactElement {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={cx('fill-current', className)}>
      <path d="M1.2 0 6 4.8 10.8 0 12 1.2 7.2 6 12 10.8 10.8 12 6 7.2 1.2 12 0 10.8 4.8 6 0 1.2z" />
    </svg>
  );
}
