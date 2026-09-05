/**
 * MedLoop AI — `/data/upload`.
 *
 * Server component. The client boundary starts inside `UploadView`, which owns the registration form
 * and the record it produces. The path and its role guard are declared in `lib/navigation` (§11.1).
 */

import type { ReactElement } from 'react';

import { PageHeader } from '@/components/shell/PageHeader';
import { DemoBadge } from '@/components/ui/project';
import { UploadView } from '@/features/uploads/UploadView';
import { IS_DEMO } from '@/lib/env';

export default function UploadPage(): ReactElement {
  return (
    <>
      <PageHeader
        title="Upload Data"
        description="Registers a local directory path. No bytes cross the API and nothing is copied — the server reads the images where they already are, which is what keeps one physical copy of each file."
        meta={IS_DEMO ? <DemoBadge /> : undefined}
      />
      <UploadView />
    </>
  );
}
