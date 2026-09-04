/**
 * MedLoop AI — class-name join.
 *
 * Deliberately not `clsx` or `tailwind-merge`. This is nine lines; a dependency for it would need a
 * recorded justification under CLAUDE.md §11.4 and there isn't one.
 *
 * It joins and drops falsy entries. It does **not** resolve Tailwind conflicts: `cx('p-2', 'p-4')`
 * leaves both in the string and the cascade decides, which is a real hazard. The convention that
 * avoids it is that a variant map owns a property outright — `SIZE` sets padding, `TONE` sets
 * colour, and no component passes a competing utility for a property a map already governs. A
 * caller-supplied `className` is appended last so an override at a call site still wins.
 */

export type ClassValue = string | false | null | undefined;

export function cx(...values: readonly ClassValue[]): string {
  let out = '';
  for (const value of values) {
    if (value === '' || value === false || value === null || value === undefined) continue;
    out = out === '' ? value : `${out} ${value}`;
  }
  return out;
}
