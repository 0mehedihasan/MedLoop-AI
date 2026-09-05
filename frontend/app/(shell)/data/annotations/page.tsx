/**
 * MedLoop AI — `/data/annotations`.
 *
 * Server component, like every other page in the shell: the client boundary starts inside
 * `AnnotationStatisticsView`, where the date filter lives. The path and its role guard are declared in
 * `lib/navigation` (§11.1), which is also where `PageHeader` gets its breadcrumbs.
 */

import type { ReactElement } from 'react';

import { PageHeader } from '@/components/shell/PageHeader';
import { DemoBadge } from '@/components/ui/project';
import { AnnotationStatisticsView } from '@/features/statistics/AnnotationStatisticsView';
import { IS_DEMO } from '@/lib/env';

export default function AnnotationStatisticsPage(): ReactElement {
  return (
    <>
      <PageHeader
        title="Annotation Statistics"
        description="What reviewers did: how many images they labelled, what they drew, why they skipped, and how long it took. Figures that compare a human against a model are shown as blocked until a model exists."
        meta={IS_DEMO ? <DemoBadge /> : undefined}
      />
      <AnnotationStatisticsView />
    </>
  );
}
