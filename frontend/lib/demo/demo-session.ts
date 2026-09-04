/**
 * ┌───────────────────────────────────────────────────────────────────────────────────────┐
 * │  DEMO DATA — MedLoop AI local demo accounts.                                          │
 * │                                                                                       │
 * │  These accounts do not exist. They exist so the interface can be *navigated* before    │
 * │  the backend does, which is what a frontend-first build order requires: every screen   │
 * │  in this app is role-gated, so with no session there is nothing to review at all.      │
 * │                                                                                       │
 * │  Governed by CLAUDE.md §10, and reachable only while `NEXT_PUBLIC_DATA_SOURCE=demo`.   │
 * │                                                                                       │
 * │  ## What a demo session does not do                                                    │
 * │                                                                                       │
 * │  It stores **no token**. Every request `lib/api-client.ts` makes therefore travels      │
 * │  without an `Authorization` header and is refused by the API exactly as an anonymous    │
 * │  one would be. So this grants *navigation*, never access — which is the same statement  │
 * │  the security skill makes about `canAccess`: the client decides what to offer, the API  │
 * │  decides what to allow. Choosing `ADMIN` here does not make anyone an administrator of  │
 * │  anything; it only makes the admin screens reachable so their layout can be reviewed.   │
 * │                                                                                       │
 * │  The three roles are all offered because the nav, the guards and several panels differ  │
 * │  per role, and a build that can only be seen as one role has three untested screens.   │
 * └───────────────────────────────────────────────────────────────────────────────────────┘
 */

import { Role } from '@/types/domain';
import type { User } from '@/types/domain';

/** Fixed, not `Date.now()` — a fabricated account with a plausible "created just now" reads as real. */
const CREATED_AT = '2026-09-05T00:00:00+06:00';

/**
 * Negative ids. A real `users.id` is a positive serial, so a demo user can never collide with one,
 * and anything that leaks a demo id into a request produces an obvious `-1` in the server log rather
 * than quietly addressing a real row.
 */
const USERS: Readonly<Record<Role, User>> = {
  [Role.ADMIN]: {
    id: -1,
    username: 'demo.admin',
    display_name: 'Demo administrator',
    role: Role.ADMIN,
    is_active: true,
    created_at: CREATED_AT,
  },
  [Role.ANNOTATOR]: {
    id: -2,
    username: 'demo.annotator',
    display_name: 'Demo annotator',
    role: Role.ANNOTATOR,
    is_active: true,
    created_at: CREATED_AT,
  },
  [Role.RESEARCHER]: {
    id: -3,
    username: 'demo.researcher',
    display_name: 'Demo researcher',
    role: Role.RESEARCHER,
    is_active: true,
    created_at: CREATED_AT,
  },
};

export interface DemoSessions {
  /** Condition 3 of §10. */
  readonly isDemo: true;
  readonly users: Readonly<Record<Role, User>>;
  /** Offered in the order the roles are listed in §4, so the admin is first. */
  readonly roles: readonly Role[];
}

export const DEMO_SESSIONS: DemoSessions = {
  isDemo: true,
  users: USERS,
  roles: [Role.ADMIN, Role.ANNOTATOR, Role.RESEARCHER],
};

export function demoUser(role: Role): User {
  return USERS[role];
}
