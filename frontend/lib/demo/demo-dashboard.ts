/**
 * ┌───────────────────────────────────────────────────────────────────────────────────────┐
 * │  DEMO DATA — MedLoop AI dashboard fixtures.                                           │
 * │                                                                                       │
 * │  Nothing in this file was measured. It exists so the dashboard's layout, empty states │
 * │  and four render states can be built and reviewed before the backend is wired.        │
 * │                                                                                       │
 * │  Governed by CLAUDE.md §10. In particular:                                            │
 * │    · every export carries `isDemo: true`;                                              │
 * │    · every screen that renders it shows a `<DemoBadge />`, and the shell shows the      │
 * │      global banner while `NEXT_PUBLIC_DATA_SOURCE=demo`;                               │
 * │    · setting `NEXT_PUBLIC_DATA_SOURCE=api` removes all of it — the dashboard falls     │
 * │      back to real empty states, never a silent mix.                                    │
 * │                                                                                       │
 * │  Three things are deliberately absent, because §10 forbids them even behind a badge:  │
 * │    · `active_model` / `candidate_model` / `latest_evaluation` are `null`, so the model │
 * │      panel renders "no trained model" rather than a plausible accuracy;                │
 * │    · `agreement_rate` is omitted from the KPIs — agreement is a property of a model's  │
 * │      predictions, and no model has produced any;                                       │
 * │    · every service reports `UNKNOWN`, because demo mode probes nothing. Claiming       │
 * │      `ONLINE` for a database this build never opened is the §2.3 failure exactly.      │
 * └───────────────────────────────────────────────────────────────────────────────────────┘
 */

import { HitlCycleStage, ServiceKey, ServiceState } from '@/types/domain';
import type {
  ActivityEntry,
  DashboardKpis,
  DashboardStatistics,
  HitlStatus,
  Series,
  ServiceHealth,
} from '@/types/domain';

/**
 * The fixture window. Fixed dates, not `Date.now()` — a fixture that quietly follows the clock looks
 * live, and a screenshot taken from it cannot be reproduced.
 */
const FROM = '2026-08-07';
const TO = '2026-09-05';

/**
 * `source` is the one field of {@link DashboardStatistics} this fixture does not supply. The union is
 * `'database' | 'unavailable'`; a fixture is neither, and picking one would be a claim about
 * provenance. The dashboard reads provenance from `IS_DEMO` instead.
 */
export type DemoDashboardStatistics = Omit<DashboardStatistics, 'source'>;

/**
 * Counts only — images, datasets, review outcomes. These describe fixture *state*, not model
 * performance, which is why they are permitted behind the badge while a metric would not be.
 */
const KPIS: DashboardKpis = {
  total_images: 2298,
  datasets: 1,
  reviewed: 471,
  validated: 412,
  skipped: 59,
  pending_review: 1827,
  annotations: 412,
  // `agreement_rate` intentionally omitted. See the header block.
};

/**
 * The threshold here is the documented default (1000) carried as *data*, which is what §2.6
 * requires: the number is never a condition in code. `progress`, `remaining` and `threshold_met` are
 * supplied rather than derived, mirroring the real payload — the client must not compute them.
 */
const HITL: HitlStatus = {
  validated_since_last_training: 412,
  threshold: 1000,
  remaining: 588,
  progress: 0.412,
  stage: HitlCycleStage.NOT_READY,
  threshold_met: false,
  current_batch: null,
  current_job: null,
  active_model: null,
  candidate_model: null,
  last_training_at: null,
};

/** A short, unremarkable review curve. Two series so the chart's legend path is exercised. */
const REVIEW_ACTIVITY: readonly Series[] = [
  {
    key: 'validated',
    label: 'Validated',
    points: [
      { t: '2026-08-24', v: 18 },
      { t: '2026-08-25', v: 34 },
      { t: '2026-08-26', v: 29 },
      { t: '2026-08-27', v: 41 },
      { t: '2026-08-28', v: 22 },
      { t: '2026-08-29', v: 0 },
      { t: '2026-08-30', v: 0 },
      { t: '2026-08-31', v: 37 },
      { t: '2026-09-01', v: 44 },
      { t: '2026-09-02', v: 39 },
      { t: '2026-09-03', v: 26 },
      { t: '2026-09-04', v: 48 },
      { t: '2026-09-05', v: 12 },
    ],
  },
  {
    key: 'skipped',
    label: 'Skipped',
    points: [
      { t: '2026-08-24', v: 3 },
      { t: '2026-08-25', v: 6 },
      { t: '2026-08-26', v: 2 },
      { t: '2026-08-27', v: 7 },
      { t: '2026-08-28', v: 4 },
      { t: '2026-08-29', v: 0 },
      { t: '2026-08-30', v: 0 },
      { t: '2026-08-31', v: 5 },
      { t: '2026-09-01', v: 8 },
      { t: '2026-09-02', v: 6 },
      { t: '2026-09-03', v: 3 },
      { t: '2026-09-04', v: 9 },
      { t: '2026-09-05', v: 1 },
    ],
  },
];

/**
 * Every entry is an ingestion, review or settings event. None of them says a model was trained,
 * evaluated or promoted — writing that sentence anywhere, even in a fixture, is forbidden by §10.
 */
const RECENT_ACTIVITY: readonly ActivityEntry[] = [
  {
    at: '2026-09-05T09:12:00+06:00',
    event: 'REVIEW_VALIDATED',
    actor_username: 'demo.annotator',
    message: 'Validated 12 samples in this session.',
  },
  {
    at: '2026-09-04T17:48:00+06:00',
    event: 'SETTINGS_CHANGED',
    actor_username: 'demo.admin',
    message: 'Changed candidate_promotion_mode AUTOMATIC → MANUAL_APPROVAL.',
  },
  {
    at: '2026-09-04T14:03:00+06:00',
    event: 'REVIEW_SKIPPED',
    actor_username: 'demo.annotator',
    message: 'Skipped 9 samples: POOR_IMAGE_QUALITY.',
  },
  {
    at: '2026-09-02T11:20:00+06:00',
    event: 'SPLITS_ASSIGNED',
    actor_username: 'demo.admin',
    message: 'Assigned splits at patient level, seed 20260905.',
  },
  {
    at: '2026-09-01T08:35:00+06:00',
    event: 'DATASET_VERSION_CREATED',
    actor_username: 'demo.admin',
    message: 'Created dataset version v1 (staging).',
  },
];

/**
 * `UNKNOWN` across the board, with a `detail` that says why. This is the honest fixture: the six
 * probes in `GET /health` did not run, so no state can be reported for them (§2.3).
 */
const NOT_CHECKED = 'Not checked — demo mode renders fixtures and runs no probes.';

const SERVICES: readonly ServiceHealth[] = [
  { key: ServiceKey.FRONTEND, label: 'Frontend', state: ServiceState.UNKNOWN, detail: NOT_CHECKED, checked_at: `${TO}T09:12:00+06:00` },
  { key: ServiceKey.API, label: 'API', state: ServiceState.UNKNOWN, detail: NOT_CHECKED, checked_at: `${TO}T09:12:00+06:00` },
  { key: ServiceKey.DATABASE, label: 'Database', state: ServiceState.UNKNOWN, detail: NOT_CHECKED, checked_at: `${TO}T09:12:00+06:00` },
  { key: ServiceKey.ML_ENGINE, label: 'ML engine', state: ServiceState.UNKNOWN, detail: NOT_CHECKED, checked_at: `${TO}T09:12:00+06:00` },
  { key: ServiceKey.STORAGE, label: 'Storage', state: ServiceState.UNKNOWN, detail: NOT_CHECKED, checked_at: `${TO}T09:12:00+06:00` },
  { key: ServiceKey.TRAINING_WORKER, label: 'Training worker', state: ServiceState.UNKNOWN, detail: NOT_CHECKED, checked_at: `${TO}T09:12:00+06:00` },
];

export interface DemoDashboard {
  /** Condition 3 of §10. Checked by consumers, not assumed. */
  readonly isDemo: true;
  readonly statistics: DemoDashboardStatistics;
}

export const DEMO_DASHBOARD: DemoDashboard = {
  isDemo: true,
  statistics: {
    from: FROM,
    to: TO,
    kpis: KPIS,
    hitl: HITL,
    active_model: null,
    candidate_model: null,
    latest_evaluation: null,
    review_activity: REVIEW_ACTIVITY,
    recent_activity: RECENT_ACTIVITY,
    services: SERVICES,
  },
};
