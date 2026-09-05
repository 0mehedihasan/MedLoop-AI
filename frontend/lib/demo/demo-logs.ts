/**
 * ┌───────────────────────────────────────────────────────────────────────────────────────┐
 * │  DEMO DATA — MedLoop AI system-log fixture.                                           │
 * │                                                                                       │
 * │  Nothing here was emitted by a running system. No request was served, no setting was    │
 * │  changed, no test set was locked. The file exists so System Logs — filters, levels,     │
 * │  metadata disclosure, all four render states — can be built before the API exists.      │
 * │                                                                                       │
 * │  Governed by CLAUDE.md §10: `isDemo: true`, a `<DemoBadge />` on the screen that        │
 * │  renders it, the global banner while `NEXT_PUBLIC_DATA_SOURCE=demo`, and complete       │
 * │  removal under `=api`.                                                                  │
 * │                                                                                       │
 * │  What is deliberately **absent** matters as much as what is here:                       │
 * │    · no `TRAINING_STARTED`, `TRAINING_COMPLETED`, `CANDIDATE_CREATED`, `MODEL_PROMOTED` │
 * │      or `MODEL_REJECTED` row. No training has run on this machine and no model exists   │
 * │      (§15), so inventing the audit trail of one would be fabricating the single most     │
 * │      load-bearing claim in the project (§2.3).                                          │
 * │    · no `hitl_retraining_threshold` value anywhere. The threshold is configuration       │
 * │      (§2.6) and belongs in `system_settings`, not in a fixture.                          │
 * │    · usernames are `demo-`prefixed. They are not real accounts, and the actor ids are    │
 * │      obviously synthetic.                                                               │
 * │                                                                                       │
 * │  `total` equals `items.length` on purpose: a larger total would render a second page      │
 * │  that, with no request behind it, could only show these same rows again.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────┘
 */

import { LogEvent, LogLevel } from '@/types/domain';
import type { SystemLog } from '@/types/domain';
import type { Paginated } from '@/types/api';

/**
 * Newest first, which is the order an audit reader wants and the order the endpoint returns.
 *
 * The rows are chosen to cover the shapes the table has to survive rather than to tell a story: an
 * actor-less system row, a row with no entity, a row with no metadata, a `CRITICAL` row, and a
 * `SETTINGS_CHANGED` row whose metadata carries the old and new value — which is the §8.4 requirement
 * that a settings change is auditable, applied to a key that has nothing to do with the threshold.
 */
const ROWS: readonly SystemLog[] = [
  {
    id: 108,
    at: '2026-09-04T18:02:11+06:00',
    level: LogLevel.INFO,
    event: LogEvent.ANNOTATION_SUBMITTED,
    actor_id: 3,
    actor_username: 'demo-annotator',
    entity_type: 'image',
    entity_id: 5,
    message: 'Human label recorded and the sample added to the HITL pool.',
    metadata: { review_session_id: 412, agreement: null },
  },
  {
    id: 107,
    at: '2026-09-04T17:48:03+06:00',
    level: LogLevel.INFO,
    event: LogEvent.IMAGE_SKIPPED,
    actor_id: 3,
    actor_username: 'demo-annotator',
    entity_type: 'image',
    entity_id: 6,
    message: 'Image skipped. The HITL counter was not incremented.',
    metadata: { skip_reason: 'POOR_IMAGE_QUALITY' },
  },
  {
    id: 106,
    at: '2026-09-02T11:20:00+06:00',
    level: LogLevel.WARNING,
    event: LogEvent.TEST_SET_LOCKED,
    actor_id: 1,
    actor_username: 'demo-admin',
    entity_type: 'dataset_version',
    entity_id: 1,
    message: 'Test set locked. Splits in this version can no longer be reassigned.',
    metadata: { label: 'v1', reason: 'Baseline test set, fixed before any training was configured.' },
  },
  {
    id: 105,
    at: '2026-09-01T09:14:52+06:00',
    level: LogLevel.INFO,
    event: LogEvent.SETTINGS_CHANGED,
    actor_id: 1,
    actor_username: 'demo-admin',
    entity_type: 'system_settings',
    entity_id: null,
    message: 'demo-admin changed training_device AUTO → CPU.',
    metadata: {
      key: 'training_device',
      old_value: 'AUTO',
      new_value: 'CPU',
      reason: 'Fixture change. Recorded so the audit shape is visible.',
    },
  },
  {
    id: 104,
    at: '2026-09-01T08:35:40+06:00',
    level: LogLevel.INFO,
    event: LogEvent.DATASET_ASSIGNED,
    actor_id: 1,
    actor_username: 'demo-admin',
    entity_type: 'dataset_version',
    entity_id: 2,
    message: 'Split assignment applied to 240 images.',
    metadata: { split: 'STAGING', count: 240 },
  },
  {
    id: 103,
    at: '2026-08-07T09:00:12+06:00',
    level: LogLevel.INFO,
    event: LogEvent.DATASET_UPLOADED,
    actor_id: 1,
    actor_username: 'demo-admin',
    entity_type: 'dataset',
    entity_id: 1,
    message: 'Directory registered. No files were copied.',
    metadata: null,
  },
  {
    id: 102,
    at: '2026-08-07T08:58:01+06:00',
    level: LogLevel.CRITICAL,
    event: LogEvent.ERROR,
    // A row with no actor: the system itself is the author, and `demo-system` would invent an account.
    actor_id: null,
    actor_username: null,
    entity_type: null,
    entity_id: null,
    message: 'Storage root was unreadable at startup. Reported, not recovered from.',
    metadata: { probe: 'storage' },
  },
  {
    id: 101,
    at: '2026-08-07T08:57:44+06:00',
    level: LogLevel.WARNING,
    event: LogEvent.AUTH_LOGIN_FAILED,
    actor_id: null,
    actor_username: null,
    entity_type: null,
    entity_id: null,
    message: 'Sign-in rejected. The username is not recorded on a failed attempt.',
    metadata: null,
  },
];

export interface DemoLogs {
  /** Condition 3 of §10. A type-level `true`, so the compiler keeps it on. */
  readonly isDemo: true;
  readonly list: Paginated<SystemLog>;
  /**
   * What the event filter offers.
   *
   * Derived from the rows rather than from `LogEvent`, because under `=api` the dropdown is populated
   * by `listLogEvents()` — the events the server has actually recorded. Offering a filter value that
   * matches nothing is a dead end, and here the fixture is the only thing that could have recorded
   * anything.
   */
  readonly events: readonly string[];
}

export const DEMO_LOGS: DemoLogs = {
  isDemo: true,
  list: { items: ROWS, page: 1, page_size: 25, total: ROWS.length, pages: 1 },
  events: [...new Set(ROWS.map((row) => row.event))],
};
