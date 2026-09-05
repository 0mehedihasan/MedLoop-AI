/**
 * MedLoop AI — `/data/statistics`.
 *
 * A server component: it reads nothing and handles nothing, so the client boundary starts where the
 * date filter does, inside `DataStatisticsView`. `PageHeader` derives its breadcrumbs from
 * `lib/navigation`, which is also where this path and its role guard are declared (§11.1).
 */

import type { ReactElement } from 'react';

import { PageHeader } from '@/components/shell/PageHeader';
import { DemoBadge } from '@/components/ui/project';
import { DataStatisticsView } from '@/features/statistics/DataStatisticsView';
import { IS_DEMO } from '@/lib/env';

export default function DataStatisticsPage(): ReactElement {
  return (
    <>
      <PageHeader
        title="Data Statistics"
        description="How many images exist, where they sit in the experiment, and what humans have done with them. Counts of rows only — nothing on this page is a measurement of a model."
        meta={IS_DEMO ? <DemoBadge /> : undefined}
      />
      <DataStatisticsView />
    </>
  );
}
