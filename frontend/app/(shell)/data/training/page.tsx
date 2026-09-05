/**
 * MedLoop AI — `/data/training`.
 *
 * Server component. The client boundary starts inside `TrainingView`, which owns the status read, the
 * two history tables and the settings form. The path and its `ADMIN`-only guard are declared in
 * `lib/navigation` (§11.1).
 */

import type { ReactElement } from 'react';

import { PageHeader } from '@/components/shell/PageHeader';
import { DemoBadge } from '@/components/ui/project';
import { TrainingView } from '@/features/training/TrainingView';
import { IS_DEMO } from '@/lib/env';

export default function TrainingManagementPage(): ReactElement {
  return (
    <>
      <PageHeader
        title="Training Management"
        description="The retraining cycle and the settings that govern it. Validated samples accumulate to a threshold, a batch is frozen, a worker trains it, and the result is a candidate — never an active model."
        meta={IS_DEMO ? <DemoBadge /> : undefined}
      />
      <TrainingView />
    </>
  );
}
