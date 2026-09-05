/**
 * MedLoop AI — `/data/datasets`.
 *
 * Server component. The client boundary starts inside `DatasetListView`, where the filters and the
 * create dialog live. The path and its role guard are declared in `lib/navigation` (§11.1).
 */

import type { ReactElement } from 'react';

import { PageHeader } from '@/components/shell/PageHeader';
import { DemoBadge } from '@/components/ui/project';
import { DatasetListView } from '@/features/datasets/DatasetListView';
import { IS_DEMO } from '@/lib/env';

export default function DatasetsPage(): ReactElement {
  return (
    <>
      <PageHeader
        title="Dataset Management"
        description="Every image belongs to exactly one dataset, through a dataset version. Archived datasets stay listed — nothing here is ever hard-deleted."
        meta={IS_DEMO ? <DemoBadge /> : undefined}
      />
      <DatasetListView />
    </>
  );
}
