/**
 * MedLoop AI — `/analyze`.
 *
 * Server component. The client boundary starts inside `AnalyzeView`, which owns the registry read, the
 * active-version read and the evaluation of whichever version is selected. The path and its
 * `ANALYSTS` guard are declared in `lib/navigation` (§11.1).
 *
 * `AnalyzeLayoutPreview` is composed here rather than inside `AnalyzeView` for two reasons: the §10
 * preview must be reachable whether or not a version exists — including in the `Blocked` state, which
 * is what this machine is actually in — and keeping the import here means the view and the preview do
 * not depend on each other.
 */

import type { ReactElement } from 'react';

import { PageHeader } from '@/components/shell/PageHeader';
import { DemoBadge } from '@/components/ui/project';
import { AnalyzeView } from '@/features/analyze/AnalyzeView';
import { AnalyzeLayoutPreview } from '@/features/analyze/LayoutPreview';
import { IS_DEMO } from '@/lib/env';

export default function AnalyzeModelPage(): ReactElement {
  return (
    <>
      <PageHeader
        title="Analyze Model"
        description="The model registry and one version's evaluation against the locked test set. Promotion compares a candidate with the active version on identical test data; the server decides, and its answer is shown here in its own words."
        meta={IS_DEMO ? <DemoBadge /> : undefined}
      />
      <div className="space-y-6">
        <AnalyzeView />
        <AnalyzeLayoutPreview />
      </div>
    </>
  );
}
