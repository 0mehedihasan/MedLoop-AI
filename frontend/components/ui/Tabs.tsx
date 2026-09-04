'use client';

/**
 * MedLoop AI — `Tabs` and `TabLinks`.
 *
 * Two components because there are two situations that *look* alike and must not be built alike.
 *
 * {@link Tabs} is the ARIA tab pattern: one region of a page, several views, no URL change. It owes
 * the user arrow-key navigation, a single tab stop for the whole strip, and `aria-selected` — all of
 * which the browser gives to nothing for free, so all of which is implemented here.
 *
 * {@link TabLinks} is a set of **links** that happen to be drawn as a strip. Each one is a different
 * URL, so it is a `<nav>` of `<a>` elements with `aria-current="page"`, and it must *not* claim
 * `role="tab"` — announcing "tab, 2 of 5" for something that performs a navigation is a lie, and it
 * would also tell the user that arrow keys work when they do not.
 *
 * The Data & Admin sub-sections are routes (§11.1), so they are `TabLinks`. The panels inside one
 * page — a model's evaluation views, an image's prediction vs annotation history — are `Tabs`.
 *
 * ## Activation
 *
 * Selection follows focus (automatic activation). That is the recommended behaviour when switching is
 * cheap, and every panel here is already-fetched data. If a panel ever needs its own request, it
 * should keep this behaviour and render its own loading state rather than switching to manual
 * activation, which requires the user to guess that Enter is needed.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';

import { cx } from './cx';
import { isActiveRoute } from '@/lib/navigation';

/**
 * Shared strip geometry, so a tab and a tab-link are the same object visually.
 *
 * `items-end` and not `items-center`: each item pulls itself down by a pixel (`-mb-px`) so its
 * 2 px underline lands *on* the strip's 1 px border instead of above it. That only lines up if the
 * items are bottom-aligned with the strip, which matters as soon as `actions` puts a shorter
 * control on the same line.
 */
const STRIP = 'flex items-end justify-between gap-4 border-b border-edge';
const ITEM =
  'relative -mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition duration-fast';
const ITEM_ACTIVE = 'border-status-info text-content-primary';
const ITEM_IDLE =
  'border-transparent text-content-secondary hover:border-edge-strong hover:text-content-primary';
const ITEM_DISABLED = 'border-transparent text-content-muted cursor-not-allowed';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Tabs — the ARIA tab pattern
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface TabItem<Id extends string> {
  readonly id: Id;
  readonly label: ReactNode;
  /** A count or a `<StatusPill />` after the label. */
  readonly meta?: ReactNode;
  /**
   * A view that exists but has nothing to show — "Localisation" with no annotation on record.
   * Rendered with `aria-disabled`, not the `disabled` attribute, so it stays in the accessibility
   * tree and announces *why* the strip has a gap; the click and the arrow keys both skip it.
   */
  readonly disabled?: boolean;
}

export interface TabsProps<Id extends string> {
  /** Names the strip — "Evaluation views". Required: a tablist with no name is a mystery. */
  readonly label: string;
  readonly items: readonly TabItem<Id>[];
  readonly value: Id;
  readonly onValueChange: (next: Id) => void;
  /** The panel body. The caller switches on `value`; this component renders one panel, not N. */
  readonly children: ReactNode;
  /** Right-hand slot on the strip line — a density toggle, a "Refresh" button. */
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly panelClassName?: string;
}

/**
 * One strip, one panel.
 *
 * A panel per tab would mean N hidden subtrees all mounted and all fetching; a single panel whose
 * `aria-labelledby` follows the active tab gives the same announcement with one subtree. The panel
 * carries `tabIndex={0}` so that after arrowing through the strip there is somewhere for the
 * keyboard to land — panels here are frequently a table or a figure with no focusable child of
 * their own, and an unreachable panel is the classic failure of this pattern.
 */
export function Tabs<Id extends string>({
  label,
  items,
  value,
  onValueChange,
  children,
  actions,
  className,
  panelClassName,
}: TabsProps<Id>): ReactElement {
  const base = useId();
  const buttons = useRef(new Map<Id, HTMLButtonElement | null>());

  const panelId = `${base}-panel`;
  const tabId = (id: Id): string => `${base}-tab-${id}`;

  /**
   * Selection follows focus, so a disabled tab must never *receive* focus — otherwise arrowing onto
   * it would activate it. Scanning with a wrapping index keeps Home/End and the arrows on one
   * implementation.
   */
  const activateFrom = (start: number, step: number): void => {
    const total = items.length;
    if (total === 0) return;
    for (let hop = 0; hop < total; hop += 1) {
      const index = (((start + step * hop) % total) + total) % total;
      const candidate = items[index];
      if (candidate === undefined || candidate.disabled === true) continue;
      onValueChange(candidate.id);
      buttons.current.get(candidate.id)?.focus();
      return;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = items.findIndex((item) => item.id === value);
    switch (event.key) {
      case 'ArrowRight':
        activateFrom(current + 1, 1);
        break;
      case 'ArrowLeft':
        activateFrom(current - 1, -1);
        break;
      case 'Home':
        activateFrom(0, 1);
        break;
      case 'End':
        activateFrom(items.length - 1, -1);
        break;
      default:
        return;
    }
    // Only reached for a handled key, so Home/End cannot also scroll the page.
    event.preventDefault();
  };

  return (
    <div className={cx('flex flex-col', className)}>
      <div className={STRIP}>
        <div
          role="tablist"
          aria-label={label}
          onKeyDown={handleKeyDown}
          className="flex items-end gap-1 overflow-x-auto"
        >
          {items.map((item) => {
            const selected = item.id === value;
            const disabled = item.disabled === true;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={tabId(item.id)}
                aria-selected={selected}
                aria-controls={selected ? panelId : undefined}
                aria-disabled={disabled ? true : undefined}
                // Roving tab index: the strip is one tab stop, the arrows move within it.
                tabIndex={selected ? 0 : -1}
                ref={(node) => {
                  buttons.current.set(item.id, node);
                }}
                onClick={() => {
                  if (!disabled) onValueChange(item.id);
                }}
                className={cx(
                  ITEM,
                  'whitespace-nowrap',
                  disabled ? ITEM_DISABLED : selected ? ITEM_ACTIVE : ITEM_IDLE,
                )}
              >
                {item.label}
                {item.meta}
              </button>
            );
          })}
        </div>
        {actions}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(value)}
        tabIndex={0}
        className={cx('pt-4', panelClassName)}
      >
        {children}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * TabLinks — a strip of routes
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface TabLinkItem {
  /** Always from `ROUTES` in `lib/navigation.ts`. No page writes a path string (§11.1). */
  readonly href: string;
  readonly label: ReactNode;
  readonly meta?: ReactNode;
}

export interface TabLinksProps {
  /** Names the `<nav>` — "Data and admin sections". Two navs on a page must be distinguishable. */
  readonly label: string;
  readonly items: readonly TabLinkItem[];
  readonly actions?: ReactNode;
  readonly className?: string;
}

/**
 * Route tabs. `isActiveRoute` — not `pathname === href` — decides the current item, so
 * `/data/datasets/7` still marks "Dataset Management", and Dashboard stays an exact match rather
 * than claiming every route beneath `/`.
 *
 * `aria-current="page"` is the whole accessibility contract here. There is deliberately no
 * `role="tab"`, no `aria-selected` and no roving tab index: these are links, every one of them is a
 * legitimate tab stop, and arrow keys are the browser's to define.
 */
export function TabLinks({ label, items, actions, className }: TabLinksProps): ReactElement {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className={cx(STRIP, className)}>
      <div className="flex items-end gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = isActiveRoute(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cx(ITEM, 'whitespace-nowrap', active ? ITEM_ACTIVE : ITEM_IDLE)}
            >
              {item.label}
              {item.meta}
            </Link>
          );
        })}
      </div>
      {actions}
    </nav>
  );
}
