/**
 * ┌───────────────────────────────────────────────────────────────────────────────────────┐
 * │  DEMO DATA — MedLoop AI training-management fixture.                                  │
 * │                                                                                       │
 * │  No training has run on this machine. No batch was assembled, no worker was started,   │
 * │  no epoch was executed, no model exists (§15). This file exists so Training Management │
 * │  — the HITL counter, the settings form, the audit of settings changes — can be built    │
 * │  before the endpoints exist.                                                           │
 * │                                                                                       │
 * │  Governed by CLAUDE.md §10: `isDemo: true`, a `<DemoBadge />` on the screen that        │
 * │  renders it, the global banner while `NEXT_PUBLIC_DATA_SOURCE=demo`, and complete       │
 * │  removal under `=api`.                                                                  │
 * │                                                                                       │
 * │  ## The batch and job lists are EMPTY, and that is the point                            │
 * │                                                                                       │
 * │  A `TrainingBatch` row is a claim that the HITL counter reached the threshold and that   │
 * │  N validated samples were frozen into a manifest. A `COMPLETED` `TrainingJob` is a       │
 * │  claim that a model was fitted — the one sentence §10 forbids outright. The counter in    │
 * │  every other fixture reads 412 of 1,000, so the truthful fixture has no batch and no      │
 * │  job, and both tables render their empty state.                                          │
 * │                                                                                       │
 * │  The cost is that the populated batch and job tables are not exercised by demo mode.     │
 * │  That is the correct trade: those tables are proved by the code that renders them, and    │
 * │  inventing a training history to look at would fabricate the project's load-bearing       │
 * │  claim (§2.3).                                                                           │
 * │                                                                                       │
 * │  ## One counter, one place                                                              │
 * │                                                                                       │
 * │  The `HitlStatus` here is re-exported from `demo-dashboard.ts` rather than restated, so   │
 * │  the dashboard's HITL card and this screen cannot disagree about how many samples are     │
 * │  waiting — and so the documented `1000` default exists as a literal in exactly one         │
 * │  frontend file (§2.6: the number is data, never a condition).                             │
 * └───────────────────────────────────────────────────────────────────────────────────────┘
 */

import { DEMO_HITL_STATUS } from './demo-dashboard';

import { PromotionMetric, PromotionMode, Role, TrainingDevice } from '@/types/domain';
import type {
  HitlStatus,
  SettingChange,
  TrainingBatch,
  TrainingJob,
  TrainingSettings,
} from '@/types/domain';
import type { Paginated, TrainingSettingsResponse } from '@/types/api';

/** See the header block: the dashboard owns the counter, this screen reads it. */
const STATUS: HitlStatus = DEMO_HITL_STATUS;

/**
 * The §8.1 defaults, carried as data.
 *
 * `hitl_retraining_threshold` is taken from {@link STATUS} rather than written out, which keeps the
 * fixture internally consistent — a form showing 500 above a counter reading "412 of 1,000" would be
 * a fixture contradicting itself — and keeps the literal in one file.
 *
 * The two non-obvious defaults are the ones §8.1 records as engineering choices: `MANUAL_APPROVAL`,
 * because a clinical-adjacent system should not deploy itself, and `MACRO_F1`, because
 * `minimum_improvement` means nothing without naming the metric it improves.
 */
const SETTINGS: TrainingSettings = {
  hitl_retraining_threshold: STATUS.threshold,
  training_device: TrainingDevice.CPU,
  batch_size: 32,
  max_epochs: 30,
  early_stopping: true,
  candidate_promotion_mode: PromotionMode.MANUAL_APPROVAL,
  minimum_improvement: 0.005,
  primary_promotion_metric: PromotionMetric.MACRO_F1,
};

/**
 * Two audited changes, both matching events that already exist in the other fixtures — the
 * `training_device` row is log entry 105 in `demo-logs.ts`, and the `candidate_promotion_mode` row is
 * the dashboard's recent-activity entry. Reusing the same moments means the three surfaces read as one
 * machine's history rather than three unrelated inventions.
 *
 * Neither row touches `hitl_retraining_threshold`. §8.4's worked example is a threshold change, and it
 * is deliberately *not* reproduced here: the audit shape is fully visible on a key that is not the one
 * rule §2.6 exists to protect.
 */
const HISTORY: readonly SettingChange[] = [
  {
    id: 2,
    key: 'candidate_promotion_mode',
    old_value: 'AUTOMATIC',
    new_value: 'MANUAL_APPROVAL',
    actor_id: 1,
    actor_username: 'demo-admin',
    reason: 'A candidate should wait for a person. Fixture change.',
    at: '2026-09-04T17:48:00+06:00',
  },
  {
    id: 1,
    key: 'training_device',
    old_value: 'AUTO',
    new_value: 'CPU',
    actor_id: 1,
    actor_username: 'demo-admin',
    reason: 'Fixture change. Recorded so the audit shape is visible.',
    at: '2026-09-01T09:14:52+06:00',
  },
];

/** `pages: 0` because there is no page to ask for. `1` would imply an empty page exists. */
const NO_BATCHES: Paginated<TrainingBatch> = {
  items: [],
  page: 1,
  page_size: 25,
  total: 0,
  pages: 0,
};

const NO_JOBS: Paginated<TrainingJob> = {
  items: [],
  page: 1,
  page_size: 25,
  total: 0,
  pages: 0,
};

export interface DemoTraining {
  /** Condition 3 of §10. A type-level `true`, so the compiler keeps it on. */
  readonly isDemo: true;
  readonly status: HitlStatus;
  readonly batches: Paginated<TrainingBatch>;
  readonly jobs: Paginated<TrainingJob>;
  readonly settings: TrainingSettingsResponse;
  readonly history: readonly SettingChange[];
}

export const DEMO_TRAINING: DemoTraining = {
  isDemo: true,
  status: STATUS,
  batches: NO_BATCHES,
  jobs: NO_JOBS,
  settings: { settings: SETTINGS, editable_by: [Role.ADMIN] },
  history: HISTORY,
};
