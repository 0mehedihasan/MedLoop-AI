/**
 * MedLoop AI — `/analyze/compare`.
 *
 * Server component. `CompareView` owns the version picker and the comparison read; `CompareLayoutPreview`
 * is composed here so it stays reachable while no version exists, and so neither module imports the
 * other. The path inherits the `ANALYSTS` guard from `/analyze` in `lib/navigation` (§11.1).
 *
 * The description says what the screen refuses to do, because that is the part a reader needs to trust:
 * two versions measured on different locked test sets are not a comparison, and no figures are shown for
 * them (§9).
 */

import type { ReactElement } from 'react';

import { PageHeader } from '@/components/shell/PageHeader';
import { DemoBadge } from '@/components/ui/project';
import { CompareView } from '@/features/analyze/CompareView';
import { CompareLayoutPreview } from '@/features/analyze/LayoutPreview';
import { IS_DEMO } from '@/lib/env';

export default function CompareModelsPage(): ReactElement {
  return (
    <>
      <PageHeader
        title="Compare Versions"
        description="Successive model versions on one locked test set, oldest first — the loop read forwards. Versions measured on different test data are not comparable, and the server's refusal is shown instead of the numbers."
        meta={IS_DEMO ? <DemoBadge /> : undefined}
      />
      <div className="space-y-6">
        <CompareView />
        <CompareLayoutPreview />
      </div>
    </>
  );
}
