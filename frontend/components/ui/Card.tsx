/**
 * MedLoop AI — Structure: `Card`, `Panel`, `SectionHeader`, `Divider`.
 *
 * ## Why the heading level is a prop
 *
 * `Panel` renders a real heading, and its level belongs to the *page*, not to the component. The same
 * panel needs `h2` at the top of a route and `h3` nested inside a section; hard-coding one produces an
 * outline that skips levels, which is precisely what makes heading navigation unusable with a screen
 * reader. The default is `2` because the app shell owns the single `h1`.
 *
 * ## Surfaces
 *
 * `surface-raised` and `surface-panel` are the same white. In this app the difference between raised
 * and flat is the border plus **one** shadow step — there is no elevation ramp and no second shadow
 * (see the token table in `globals.css`). So a card is border + `shadow-panel`, and anything nested
 * *inside* a card uses `surface-inset` with no shadow at all.
 *
 * ## No `loading` prop
 *
 * `Panel` takes none of the four states as props. They live in `states.tsx` and are passed as
 * children, because every screen here wants the header to stay put while the body is a skeleton, and
 * a `loading` prop invariably blanks the header too.
 *
 * Nothing in this file uses a hook, so all four render on the server.
 */

import type { ReactElement, ReactNode } from 'react';

import { cx } from './cx';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Shared
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const PADDING: Readonly<Record<CardPadding, string>> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

/** `h1` is deliberately absent: it is rendered once, by the page shell. */
export type HeadingLevel = 2 | 3 | 4;

const HEADING_CLASS: Readonly<Record<HeadingLevel, string>> = {
  2: 'text-base',
  3: 'text-sm',
  4: 'text-sm',
};

interface HeadingProps {
  readonly level: HeadingLevel;
  readonly children: ReactNode;
  readonly id?: string;
  readonly className?: string;
}

/**
 * A `switch` rather than `const Tag = \`h${level}\`` — the string form types as any intrinsic element
 * and would happily accept `h7`, and it defeats the JSX type checker for the props as well.
 */
function Heading({ level, children, id, className }: HeadingProps): ReactElement {
  const cn = cx('font-semibold text-content-primary', HEADING_CLASS[level], className);
  switch (level) {
    case 2:
      return (
        <h2 id={id} className={cn}>
          {children}
        </h2>
      );
    case 3:
      return (
        <h3 id={id} className={cn}>
          {children}
        </h3>
      );
    case 4:
      return (
        <h4 id={id} className={cn}>
          {children}
        </h4>
      );
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Card
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface CardProps {
  readonly children: ReactNode;
  readonly padding?: CardPadding;
  /** Drop the shadow for a card nested in another surface — a row inside a list, for instance. */
  readonly flat?: boolean;
  /** `li` for cards in a list, `section`/`article` when the card carries its own heading. */
  readonly as?: 'div' | 'section' | 'article' | 'li';
  readonly id?: string;
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
}

/** The plain surface. {@link Panel} is this plus a header, and is what most screens actually use. */
export function Card({
  children,
  padding = 'md',
  flat = false,
  as = 'div',
  id,
  className,
  ...aria
}: CardProps): ReactElement {
  const cn = cx(
    'rounded-md border border-edge bg-surface-raised',
    flat ? 'shadow-none' : 'shadow-panel',
    PADDING[padding],
    className,
  );
  switch (as) {
    case 'section':
      return (
        <section id={id} className={cn} {...aria}>
          {children}
        </section>
      );
    case 'article':
      return (
        <article id={id} className={cn} {...aria}>
          {children}
        </article>
      );
    case 'li':
      return (
        <li id={id} className={cn} {...aria}>
          {children}
        </li>
      );
    case 'div':
      return (
        <div id={id} className={cn} {...aria}>
          {children}
        </div>
      );
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * SectionHeader
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface SectionHeaderProps {
  readonly title: ReactNode;
  readonly level?: HeadingLevel;
  /** One line of context. Long enough to need `max-w-prose`, never long enough to need a paragraph. */
  readonly description?: ReactNode;
  /** Trailing controls — a filter, a refresh, a "New dataset" button. */
  readonly actions?: ReactNode;
  /** Sits beside the title. This is where a `<DemoBadge />` goes (§10, condition 4). */
  readonly meta?: ReactNode;
  /** Set on the heading, so a wrapping region can point `aria-labelledby` at it. */
  readonly titleId?: string;
  readonly className?: string;
}

/**
 * Title, optional description, optional trailing actions. Used standalone above a grid of tiles and
 * internally by {@link Panel}, so the two can never drift apart visually.
 *
 * `flex-wrap` with the actions in their own group: on a narrow viewport the buttons drop below the
 * title instead of squeezing it, which keeps the requirement in §11.2 that nothing breaks below `md`.
 */
export function SectionHeader({
  title,
  level = 2,
  description,
  actions,
  meta,
  titleId,
  className,
}: SectionHeaderProps): ReactElement {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Heading level={level} id={titleId}>
            {title}
          </Heading>
          {meta}
        </div>
        {description === undefined ? null : (
          <p className="max-w-prose text-xs text-content-secondary">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Panel
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface PanelProps extends Omit<SectionHeaderProps, 'className' | 'titleId'> {
  readonly children: ReactNode;
  /** Padding of the body only. The header keeps its own so a `none` body can go edge to edge. */
  readonly bodyPadding?: CardPadding;
  /** Actions or a summary line pinned under the body, on the inset surface. */
  readonly footer?: ReactNode;
  /** Supplying it names the region: the heading gets `${id}-title` and the section points at it. */
  readonly id?: string;
  readonly flat?: boolean;
  readonly className?: string;
  readonly bodyClassName?: string;
}

/**
 * The workhorse: a `<section>` with a heading, a body and an optional footer.
 *
 * `bodyPadding="none"` is the case a `<Table>` wants — the table's own cell padding provides the
 * inset, and a padded wrapper around it leaves a stripe of card colour beside the header row that
 * looks like a rendering bug.
 */
export function Panel({
  children,
  title,
  level = 2,
  description,
  actions,
  meta,
  bodyPadding = 'md',
  footer,
  id,
  flat = false,
  className,
  bodyClassName,
}: PanelProps): ReactElement {
  const titleId = id === undefined ? undefined : `${id}-title`;
  return (
    <Card
      as="section"
      padding="none"
      flat={flat}
      id={id}
      aria-labelledby={titleId}
      className={cx('overflow-hidden', className)}
    >
      <div className="border-b border-edge-subtle px-4 py-3">
        <SectionHeader
          title={title}
          level={level}
          description={description}
          actions={actions}
          meta={meta}
          titleId={titleId}
        />
      </div>
      <div className={cx(PADDING[bodyPadding], bodyClassName)}>{children}</div>
      {footer === undefined ? null : (
        <div className="border-t border-edge-subtle bg-surface-inset px-4 py-2.5">{footer}</div>
      )}
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Divider
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface DividerProps {
  readonly orientation?: 'horizontal' | 'vertical';
  /** Text sitting in the rule. Turns the separator into a labelled group boundary. */
  readonly label?: string;
  readonly className?: string;
}

/**
 * `<hr>` for the plain horizontal case, because it already carries `role="separator"`.
 *
 * The vertical variant is a `<span>` and not an `<hr>`: a rotated `<hr>` is announced with the wrong
 * orientation, and `aria-orientation` on an explicit `role="separator"` is the documented way to say
 * it. It needs a height from its container — usually a `flex items-stretch` toolbar.
 */
export function Divider({
  orientation = 'horizontal',
  label,
  className,
}: DividerProps): ReactElement {
  if (orientation === 'vertical') {
    return (
      <span
        role="separator"
        aria-orientation="vertical"
        className={cx('w-px shrink-0 self-stretch bg-edge-subtle', className)}
      />
    );
  }
  if (label === undefined) {
    return <hr className={cx('border-0 border-t border-edge-subtle', className)} />;
  }
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cx('flex items-center gap-3', className)}
    >
      <span aria-hidden="true" className="h-px flex-1 bg-edge-subtle" />
      <span className="text-xs font-medium uppercase tracking-wide text-content-muted">{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-edge-subtle" />
    </div>
  );
}
