/**
 * ┌───────────────────────────────────────────────────────────────────────────────────────┐
 * │  DEMO DATA — MedLoop AI upload-registration fixture.                                  │
 * │                                                                                       │
 * │  No directory was scanned to produce this. No path below exists, nothing was opened,   │
 * │  no image was counted, no metadata column was read. The file exists so the Upload Data │
 * │  screen can show what a *registered* directory looks like before the ingestion         │
 * │  endpoint exists.                                                                     │
 * │                                                                                       │
 * │  Governed by CLAUDE.md §10: `isDemo: true`, a `<DemoBadge />` on the screen that        │
 * │  renders it, the global banner while `NEXT_PUBLIC_DATA_SOURCE=demo`, and complete       │
 * │  removal under `=api`.                                                                  │
 * │                                                                                       │
 * │  Two rules shape what is in here:                                                      │
 * │    · §2.2 — the real PAD-UFES-20 files are in this repository, and this fixture has     │
 * │      not looked at them. The path is deliberately impossible (`/demo/…`), so it can     │
 * │      never be mistaken for a directory on this machine, and the counts a real           │
 * │      inspection would report are **absent** rather than guessed.                        │
 * │    · §2.3 — `inspection.state` is `not_inspected`, which is the truth for a fixture.     │
 * │      A fabricated `complete` with an image count would be an invented measurement.      │
 * └───────────────────────────────────────────────────────────────────────────────────────┘
 */

import { DatasetStatus } from '@/types/domain';
import type { Upload } from '@/types/domain';

/** Fixed, so the screen screenshots identically twice. */
const CREATED = '2026-09-01T08:35:00+06:00';

/**
 * A registered directory that has not been inspected.
 *
 * `dataset_id` is `null` on purpose: registration records a path, and the dataset row is created by
 * the ingestion step. A fixture that filled it in would imply work that never happened.
 */
const UPLOAD: Upload = {
  id: 1,
  dataset_id: null,
  dataset_name: 'demo-dataset-01',
  description: 'Fixture registration. No directory was scanned and no file was opened.',
  image_directory: '/demo/not-a-real-directory/images',
  annotation_file: null,
  metadata_file: '/demo/not-a-real-directory/metadata.csv',
  status: DatasetStatus.STAGING,
  inspection: {
    state: 'not_inspected',
    reason: 'This is a fixture. No directory was read, so nothing has been counted or validated.',
  },
  created_at: CREATED,
};

export interface DemoUploads {
  /** Condition 3 of §10. A type-level `true`, so the compiler keeps it on. */
  readonly isDemo: true;
  readonly upload: Upload;
}

export const DEMO_UPLOADS: DemoUploads = {
  isDemo: true,
  upload: UPLOAD,
};
