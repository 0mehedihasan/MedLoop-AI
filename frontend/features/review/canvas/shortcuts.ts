/**
 * MedLoop AI — `shortcuts.ts`: the only declaration site for the annotation keyboard map.
 *
 * The handlers match against this table and the help panel renders from it, so the panel cannot lie
 * about a shortcut (the skill lists "keyboard map duplicated in a component" as a failure mode). Add
 * a key here and both the behaviour and the documentation change together.
 *
 * ## Most specific first, and the first match wins
 *
 * `Cmd+Shift+Z` is declared before `Cmd+Z`, exactly as `lib/navigation.ts` orders `ROUTE_GUARDS`.
 * Modifiers are matched *exactly* — an unstated `shift` means "shift must be up" — so the two cannot
 * both fire on one press.
 *
 * ## The modifier is written "Cmd/Ctrl", not detected
 *
 * `event.metaKey || event.ctrlKey` is what the handler accepts, and the label is the literal string
 * "Cmd/Ctrl". Deriving a `⌘` from `navigator.platform` would render one glyph on the server and
 * another after hydration, which React reports as a mismatch — and the two-word label is what the
 * skill's own table says.
 *
 * ## Arrows carry their modifiers instead of multiplying the map
 *
 * One row per direction. `shift` (larger step) and `alt` (resize rather than move) come back with
 * the match, because whether an arrow pans, nudges or resizes depends on the *selection*, which is
 * state the map cannot see. Eight more entries would describe the keys without describing the
 * behaviour.
 */

/** Every action a key can start. The canvas exhaustively switches on this union. */
export type ShortcutAction =
  | 'tool-box'
  | 'tool-polygon'
  | 'tool-rounded'
  | 'tool-select'
  | 'cancel'
  | 'close-polygon'
  | 'cycle-shape'
  | 'delete-selected'
  | 'clear-all'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'reset'
  | 'toggle-gradcam'
  | 'toggle-ai-box'
  | 'submit'
  | 'skip'
  | 'move-left'
  | 'move-right'
  | 'move-up'
  | 'move-down';

/** Help-panel sections, in the order they are rendered. */
export const SHORTCUT_GROUPS = ['Tools', 'Shapes', 'Move', 'View', 'Layers', 'Queue'] as const;

export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

/**
 * The literal modifier label. Not `⌘`, not derived — see the header.
 */
export const MODIFIER_LABEL = 'Cmd/Ctrl';

/** `'either'` means the modifier is *ignored* when matching and reported back to the caller. */
type ModifierRule = boolean | 'either';

export interface ShortcutSpec {
  readonly action: ShortcutAction;
  /** Phrased for the help panel, imperative, no trailing period. */
  readonly label: string;
  /** Chips to render, e.g. `['Cmd/Ctrl', 'Shift', 'Z']`. Display only — matching uses `keys`. */
  readonly chips: readonly string[];
  readonly group: ShortcutGroup;
  /** `event.key` values that select this row, compared case-insensitively. */
  readonly keys: readonly string[];
  /** `true` requires `metaKey || ctrlKey`; omitted requires both to be **up**. */
  readonly mod?: boolean;
  readonly shift?: ModifierRule;
  readonly alt?: ModifierRule;
  /** Removes work, so the canvas confirms first — the skill's rule for clear and skip. */
  readonly destructive?: boolean;
}

/**
 * Prose the panel renders under a group heading, for behaviour that belongs to the group rather
 * than to any one key. Declared here so the panel holds no shortcut knowledge of its own.
 */
export const SHORTCUT_GROUP_NOTES: Partial<Record<ShortcutGroup, string>> = {
  Move: 'Arrows nudge the selected shape by 0.5% of the image, Shift by 5%. Hold Alt to resize from the last-used handle instead of moving. With nothing selected, arrows pan the view.',
  Shapes:
    'Deleting a shape that has already been saved archives the annotation on the server; an unsaved shape is simply discarded.',
};

/**
 * The map. **Declaration order is match order, most specific first** — which is also the order the
 * help panel lists a group in, so "Redo" appears above "Undo" and "Skip" above "Submit". That is a
 * consequence worth accepting: a second ordering field would be a second thing to keep in step.
 */
export const SHORTCUTS: readonly ShortcutSpec[] = [
  /* ── Tools ─────────────────────────────────────────────────────────────────────────────── */
  {
    action: 'tool-box',
    label: 'Bounding box tool',
    chips: ['1'],
    group: 'Tools',
    keys: ['1'],
  },
  {
    action: 'tool-polygon',
    label: 'Polygon tool',
    chips: ['2'],
    group: 'Tools',
    keys: ['2'],
  },
  {
    action: 'tool-rounded',
    label: 'Rounded box tool',
    chips: ['3'],
    group: 'Tools',
    keys: ['3'],
  },
  {
    action: 'tool-select',
    label: 'Select and edit',
    chips: ['V'],
    group: 'Tools',
    keys: ['v'],
  },

  /* ── Shapes ────────────────────────────────────────────────────────────────────────────── */
  {
    // The only row that accepts Backspace with both modifiers held, and the only destructive key in
    // this group that removes shapes it did not select — hence the confirmation.
    action: 'clear-all',
    label: 'Clear every shape on this image',
    chips: [MODIFIER_LABEL, 'Shift', 'Backspace'],
    group: 'Shapes',
    keys: ['Backspace', 'Delete'],
    mod: true,
    shift: true,
    destructive: true,
  },
  {
    action: 'delete-selected',
    label: 'Delete the selected shape',
    chips: ['Delete'],
    group: 'Shapes',
    keys: ['Delete', 'Backspace'],
    destructive: true,
  },
  {
    action: 'redo',
    label: 'Redo',
    chips: [MODIFIER_LABEL, 'Shift', 'Z'],
    group: 'Shapes',
    keys: ['z'],
    mod: true,
    shift: true,
  },
  {
    action: 'undo',
    label: 'Undo',
    chips: [MODIFIER_LABEL, 'Z'],
    group: 'Shapes',
    keys: ['z'],
    mod: true,
  },
  {
    action: 'close-polygon',
    label: 'Close the polygon being drawn',
    chips: ['Enter'],
    group: 'Shapes',
    keys: ['Enter'],
  },
  {
    action: 'cancel',
    label: 'Cancel the shape being drawn, or clear the selection',
    chips: ['Esc'],
    group: 'Shapes',
    keys: ['Escape'],
  },
  {
    // `shift` comes back with the match so the canvas can walk the cycle backwards, which is what
    // Shift+Tab means everywhere else.
    action: 'cycle-shape',
    label: 'Cycle through the shapes on this image',
    chips: ['Tab'],
    group: 'Shapes',
    keys: ['Tab'],
    shift: 'either',
  },

  /* ── Move ──────────────────────────────────────────────────────────────────────────────── */
  {
    action: 'move-left',
    label: 'Nudge or pan left',
    chips: ['←'],
    group: 'Move',
    keys: ['ArrowLeft'],
    shift: 'either',
    alt: 'either',
  },
  {
    action: 'move-right',
    label: 'Nudge or pan right',
    chips: ['→'],
    group: 'Move',
    keys: ['ArrowRight'],
    shift: 'either',
    alt: 'either',
  },
  {
    action: 'move-up',
    label: 'Nudge or pan up',
    chips: ['↑'],
    group: 'Move',
    keys: ['ArrowUp'],
    shift: 'either',
    alt: 'either',
  },
  {
    action: 'move-down',
    label: 'Nudge or pan down',
    chips: ['↓'],
    group: 'Move',
    keys: ['ArrowDown'],
    shift: 'either',
    alt: 'either',
  },

  /* ── View ──────────────────────────────────────────────────────────────────────────────── */
  {
    // `+` is Shift+`=` on a US layout, so shift is ignored rather than required, and `=` is accepted
    // for the keyboards that put `+` elsewhere.
    action: 'zoom-in',
    label: 'Zoom in',
    chips: ['+'],
    group: 'View',
    keys: ['+', '='],
    shift: 'either',
  },
  {
    action: 'zoom-out',
    label: 'Zoom out',
    chips: ['−'],
    group: 'View',
    keys: ['-', '_'],
    shift: 'either',
  },
  {
    action: 'fit',
    label: 'Fit the image to the frame',
    chips: ['0'],
    group: 'View',
    keys: ['0'],
  },
  {
    // Reset is fit *and* clear the selection. It does not clear shapes — that is `clear-all`.
    action: 'reset',
    label: 'Reset the view and clear the selection',
    chips: ['R'],
    group: 'View',
    keys: ['r'],
  },

  /* ── Layers ────────────────────────────────────────────────────────────────────────────── */
  {
    action: 'toggle-gradcam',
    label: 'Show or hide the Grad-CAM overlay',
    chips: ['G'],
    group: 'Layers',
    keys: ['g'],
  },
  {
    action: 'toggle-ai-box',
    label: 'Show or hide the AI bounding box',
    chips: ['B'],
    group: 'Layers',
    keys: ['b'],
  },

  /* ── Queue ─────────────────────────────────────────────────────────────────────────────── */
  {
    action: 'skip',
    label: 'Skip this image',
    chips: [MODIFIER_LABEL, 'Shift', 'Enter'],
    group: 'Queue',
    keys: ['Enter'],
    mod: true,
    shift: true,
    destructive: true,
  },
  {
    action: 'submit',
    label: 'Submit the review and advance',
    chips: [MODIFIER_LABEL, 'Enter'],
    group: 'Queue',
    keys: ['Enter'],
    mod: true,
  },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Matching
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The four fields matching needs. Structural rather than `KeyboardEvent` so a React synthetic event,
 * a native event and a plain object literal in a test all satisfy it without a DOM.
 */
export interface KeyEventLike {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

export interface ShortcutMatch {
  readonly action: ShortcutAction;
  /** Reported for the rows declared `'either'`: a 10× nudge, or a backwards cycle. */
  readonly shift: boolean;
  /** Reported for the arrows: resize from the last handle rather than move. */
  readonly alt: boolean;
}

function modifierMatches(rule: ModifierRule | undefined, actual: boolean): boolean {
  if (rule === 'either') return true;
  return actual === (rule === true);
}

/** `null` when nothing matches, which the handler treats as "not ours" and leaves to the browser. */
export function matchShortcut(event: KeyEventLike): ShortcutMatch | null {
  const key = event.key.toLowerCase();
  const mod = event.metaKey || event.ctrlKey;
  for (const spec of SHORTCUTS) {
    if (!spec.keys.some((candidate) => candidate.toLowerCase() === key)) continue;
    if (mod !== (spec.mod === true)) continue;
    if (!modifierMatches(spec.shift, event.shiftKey)) continue;
    if (!modifierMatches(spec.alt, event.altKey)) continue;
    return { action: spec.action, shift: event.shiftKey, alt: event.altKey };
  }
  return null;
}

/**
 * True while focus sits in something that consumes typing, which suppresses the whole map — the
 * skill's rule, and the reason `1` types a digit in the skip-note field instead of switching tools.
 *
 * Duck-typed rather than `instanceof HTMLElement` so the function is callable from a test with no
 * DOM. Radios and checkboxes count: Space and Enter belong to the control, not to the canvas.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== 'object') return false;
  const element = target as { readonly tagName?: unknown; readonly isContentEditable?: unknown };
  if (element.isContentEditable === true) return true;
  const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Reading the map — for the help panel and for the toolbar's own labels
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export function shortcutFor(action: ShortcutAction): ShortcutSpec | null {
  return SHORTCUTS.find((spec) => spec.action === action) ?? null;
}

/** `'Cmd/Ctrl + Shift + Z'`. For a `title` or an `aria-keyshortcuts`-adjacent hint on a button. */
export function shortcutHint(action: ShortcutAction): string | null {
  const spec = shortcutFor(action);
  return spec === null ? null : spec.chips.join(' + ');
}

export function isDestructive(action: ShortcutAction): boolean {
  return shortcutFor(action)?.destructive === true;
}

export interface ShortcutSection {
  readonly group: ShortcutGroup;
  readonly note: string | null;
  readonly items: readonly ShortcutSpec[];
}

/**
 * Computed once, at module load, from the one table. Empty groups are dropped so removing the last
 * row of a group cannot leave a heading with nothing under it.
 */
export const SHORTCUT_SECTIONS: readonly ShortcutSection[] = SHORTCUT_GROUPS.map((group) => ({
  group,
  note: SHORTCUT_GROUP_NOTES[group] ?? null,
  items: SHORTCUTS.filter((spec) => spec.group === group),
})).filter((section) => section.items.length > 0);
