'use client';

/**
 * MedLoop AI — `ToastProvider` and `useToast`.
 *
 * The transient-confirmation layer: "Validated — 269 remaining", "Settings saved", "V2 promoted".
 * One provider, mounted once in the shell, and a `push` any client component can call.
 *
 * ## It is an `Alert`, positioned
 *
 * The visual is `Alert`, not a second banner implementation — one tone vocabulary, one glyph per
 * tone, one dismiss control, and no chance of a toast and an inline message disagreeing about what
 * "warn" looks like. This file only owns *where* it sits, *how long* it stays and *how* it is
 * announced.
 *
 * ## The region is polite, and the toasts inside it are plain
 *
 * `aria-live="polite"` on the list, and every `Alert` is rendered with `live={false}`. A `role="alert"`
 * nested inside a live region is announced twice by some screen readers, and there is a better place
 * for an assertive message anyway: next to the control that caused it. A failed write already
 * surfaces there — `Field.tsx` wires the `VALIDATION_ERROR` message into the field — so a toast is
 * for the thing the user *cannot* see, which is precisely the polite case.
 *
 * `danger` toasts therefore never expire on their own. A failure nobody happened to be looking at is
 * worse than a banner that outstays its welcome.
 *
 * ## One constraint worth stating rather than fighting
 *
 * A toast raised while a `<dialog>` is open paints **beneath** it: `showModal()` promotes the dialog
 * into the browser's top layer and no `z-index` in the ordinary stacking order can reach past that
 * (see `Modal.tsx`). This is not a bug to route around with a portal — it is a reason to put a
 * modal's own confirmation *inside* the modal, as an `Alert live`, where the user is already looking.
 *
 * ## No entry animation
 *
 * Deliberate. §11.2 caps motion at 120–200 ms of opacity and small transforms, and a toast that
 * fades in is unreadable for exactly as long as the fade lasts. The announcement is the entrance.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { Alert } from './Alert';
import type { Tone } from './Badge';

/** Long enough to read two lines without hurrying, short enough not to sit over the next action. */
const DEFAULT_DURATION_MS = 6000;

/** More than four at once is noise; the fifth arrival evicts, it does not stack. */
const MAX_VISIBLE = 4;

/**
 * `pointer-events-none` on the region and `pointer-events-auto` on each toast, so an idle stack in
 * the corner never swallows a click meant for the page underneath. `z-50` is Tailwind's default top
 * step and needs no token: there is exactly one page-level overlay layer, and the named scale in
 * `tailwind.config.ts` belongs to the annotation canvas.
 */
const REGION = 'pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2';

export interface ToastOptions {
  readonly tone?: Tone;
  /** The outcome in one line. "Validated", not "The image has now been validated successfully".  */
  readonly title: ReactNode;
  /** The consequence or the count, when the title is not the whole story. */
  readonly description?: ReactNode;
  /** Milliseconds. `0` never auto-dismisses; that is the default for `danger`. */
  readonly duration?: number;
}

export interface ToastHandle {
  /** Returns the id, so a long-running caller can dismiss its own toast when the work finishes. */
  readonly push: (options: ToastOptions) => string;
  readonly dismiss: (id: string) => void;
}

interface ToastItem {
  readonly id: string;
  readonly tone: Tone;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly duration: number;
}

const ToastContext = createContext<ToastHandle | null>(null);

function defaultDuration(tone: Tone): number {
  return tone === 'danger' ? 0 : DEFAULT_DURATION_MS;
}

/**
 * Which toast leaves when the stack is full.
 *
 * The oldest one that would have expired anyway, so a run of confirmations cannot push an
 * unacknowledged failure off the screen. If every toast on screen is sticky the oldest goes after
 * all — four unattended failures at once is a state a fifth banner will not clarify, and the
 * authoritative record of a failed write is the message beside the control, not this corner.
 */
function evict(items: readonly ToastItem[]): readonly ToastItem[] {
  if (items.length <= MAX_VISIBLE) return items;
  const expiring = items.findIndex((item) => item.duration > 0);
  const index = expiring === -1 ? 0 : expiring;
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

interface ToastRowProps {
  readonly item: ToastItem;
  readonly onDismiss: (id: string) => void;
}

/**
 * Each toast owns its own timer. Holding them in a map on the provider would mean reconciling that
 * map against the rendered list on every change; an effect that is created and torn down with the
 * element it belongs to cannot fall out of step with it.
 */
function ToastRow({ item, onDismiss }: ToastRowProps): ReactElement {
  useEffect(() => {
    if (item.duration <= 0) return undefined;
    const timer = window.setTimeout(() => onDismiss(item.id), item.duration);
    return () => {
      window.clearTimeout(timer);
    };
  }, [item.duration, item.id, onDismiss]);

  return (
    <li className="pointer-events-auto w-[min(22rem,calc(100vw-2rem))]">
      <Alert
        tone={item.tone}
        title={item.title}
        onDismiss={() => onDismiss(item.id)}
        dismissLabel="Dismiss notification"
      >
        {item.description}
      </Alert>
    </li>
  );
}

export interface ToastProviderProps {
  readonly children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps): ReactElement {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  // A counter, not `useId`: ids are minted per push, and `crypto.randomUUID` would be a source of
  // difference between a server render and its hydration for no gain.
  const sequence = useRef(0);

  const dismiss = useCallback((id: string): void => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((options: ToastOptions): string => {
    sequence.current += 1;
    const id = `toast-${sequence.current}`;
    const tone = options.tone ?? 'info';
    const item: ToastItem = {
      id,
      tone,
      title: options.title,
      description: options.description,
      duration: options.duration ?? defaultDuration(tone),
    };
    setItems((current) => evict([...current, item]));
    return id;
  }, []);

  const value = useMemo<ToastHandle>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        Always rendered, empty or not. A live region that appears at the same moment as its first
        message is not announced by most screen readers — the element has to be there first.
      */}
      <ol aria-live="polite" aria-label="Notifications" className={REGION}>
        {items.map((item) => (
          <ToastRow key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}

/**
 * Throws outside a {@link ToastProvider}. A no-op fallback would mean a confirmation the user never
 * sees and nobody notices — the same reasoning `useSession` uses for refusing to fail open.
 */
export function useToast(): ToastHandle {
  const value = useContext(ToastContext);
  if (value === null) {
    throw new Error('useToast must be used inside <ToastProvider>.');
  }
  return value;
}
