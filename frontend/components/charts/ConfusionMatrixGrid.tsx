/**
 * MedLoop AI — `ConfusionMatrixGrid`.
 *
 * A real `<table>`, not an SVG. A confusion matrix *is* a table; drawing it as one gives every cell a
 * row and column header for free, which is exactly the information a screen reader needs and exactly
 * what an SVG grid of `<rect>` elements destroys.
 *
 * ## Orientation is stated, not assumed
 *
 * **Rows are the true class. Columns are the predicted class.** `matrix[i][j]` is the number of images
 * whose true class is `labels[i]` and which the model predicted as `labels[j]`. This is written here,
 * in the caption, and in the column group header, because a transposed confusion matrix silently swaps
 * precision and recall — it still looks like a plausible matrix, and every number read off it is
 * wrong. The header row therefore says "predicted" and the stub says "actual" on screen, every time.
 *
 * ## Colour encodes the row share, not the raw count
 *
 * With an imbalanced dataset — which skin-lesion data always is — colouring by raw count makes the
 * largest class the only visible thing. Shading each cell by its share *of its own row* keeps the
 * diagonal readable for a class with forty images and a class with nine hundred. The sequential ramp
 * is one hue in six steps (`tailwind.config.ts`), deliberately not a rainbow: this must not resemble a
 * model-produced heat-map (§2.3).
 *
 * ## What it does not compute
 *
 * No precision, recall or F1. Those are model metrics, they are computed once in `ml/`, and a second
 * definition of recall living in a React component is how two screens end up disagreeing about a
 * published number. Row totals are arithmetic on the given counts and are shown.
 */

import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { cx } from '@/components/ui/cx';
import { EmptyState } from '@/components/ui/states';
import { formatCount, formatPercent } from '@/lib/format';
import { sequentialBg, sequentialNeedsInverseText } from './lib/scale';

export interface ConfusionMatrixGridProps {
  /** The table's accessible name. Say which model version and which test set produced it. */
  readonly ariaLabel: string;
  readonly labels: readonly string[];
  /** `matrix[trueIndex][predictedIndex]`. Square, and the same length as `labels`. */
  readonly matrix: readonly (readonly number[])[];
  /** Adds the row share under each count. Off keeps the grid compact for many classes. */
  readonly showShare?: boolean;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly className?: string;
}

const CELL = 'border border-edge-subtle px-2 py-1.5 text-right text-xs tabular-nums';

export function ConfusionMatrixGrid({
  ariaLabel,
  labels,
  matrix,
  showShare = true,
  emptyTitle = 'No confusion matrix yet',
  emptyDescription = 'A matrix appears once a model version has been evaluated on the locked test set.',
  className,
}: ConfusionMatrixGridProps): ReactElement {
  if (labels.length === 0 || matrix.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />;
  }

  // Reported rather than trimmed: a matrix that does not match its labels is a matrix whose axes we
  // cannot name, and a mislabelled confusion matrix is read as fact.
  const ragged =
    matrix.length !== labels.length || matrix.some((row) => row.length !== labels.length);
  if (ragged) {
    return (
      <Alert tone="danger" title="This confusion matrix cannot be drawn" className={className}>
        The response carried {labels.length} class labels and a {matrix.length}-row matrix whose rows
        are {matrix.map((row) => row.length).join(', ')} wide. A confusion matrix must be square and
        match its labels, so nothing is rendered rather than guessing which axis is which.
      </Alert>
    );
  }

  const rowTotals = matrix.map((row) => row.reduce((sum, value) => sum + value, 0));

  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="border-collapse">
        <caption className="pb-2 text-left text-xs text-content-secondary">
          {ariaLabel} — rows are the actual class, columns are the class the model predicted.
        </caption>
        <thead>
          <tr>
            {/* The stub cell names both axes so the orientation cannot be misread from a screenshot. */}
            <th
              scope="col"
              className="border border-edge-subtle bg-surface-inset px-2 py-1.5 text-left text-xs font-medium text-content-muted"
            >
              actual ↓ / predicted →
            </th>
            {labels.map((label) => (
              <th
                key={label}
                scope="col"
                className="border border-edge-subtle bg-surface-inset px-2 py-1.5 text-right text-xs font-medium text-content-primary"
              >
                {label}
              </th>
            ))}
            <th
              scope="col"
              className="border border-edge-subtle bg-surface-inset px-2 py-1.5 text-right text-xs font-medium text-content-muted"
            >
              total
            </th>
          </tr>
        </thead>
        <tbody>
          {labels.map((rowLabel, rowIndex) => {
            const row = matrix[rowIndex] ?? [];
            const total = rowTotals[rowIndex] ?? 0;
            return (
              <tr key={rowLabel}>
                <th
                  scope="row"
                  className="border border-edge-subtle bg-surface-inset px-2 py-1.5 text-left text-xs font-medium text-content-primary"
                >
                  {rowLabel}
                </th>
                {labels.map((columnLabel, columnIndex) => {
                  const value = row[columnIndex] ?? 0;
                  // A row of zeros gets no shading rather than a divide-by-zero: the class exists in
                  // the label space but has no test images, which the total column then shows as 0.
                  const share = total === 0 ? 0 : value / total;
                  return (
                    <td
                      key={columnLabel}
                      className={cx(
                        CELL,
                        sequentialBg(share),
                        sequentialNeedsInverseText(share)
                          ? 'text-content-inverse'
                          : 'text-content-primary',
                        rowIndex === columnIndex && 'font-semibold',
                      )}
                    >
                      {formatCount(value)}
                      {showShare && total !== 0 ? (
                        <span className="block font-mono text-[0.625rem] opacity-80">
                          {formatPercent(share, 0)}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
                <td className={cx(CELL, 'bg-surface-inset text-content-secondary')}>
                  {formatCount(total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
