'use client';

/**
 * MedLoop AI — the session and role context.
 *
 * One provider, mounted once in the app shell, is the only holder of "who is signed in". Feature
 * code reads it through {@link useSession} and never touches `sessionStorage`, never calls
 * `/auth/session` a second time, and never keeps its own copy of the user.
 *
 * ## What this is not
 *
 * It is **not** access control. `canAccess` in `navigation.ts` decides what to *offer*; the API
 * decides what to *allow*. Both exist because a dead button is a bug, not because hiding one
 * protects anything (`medloop-security.md`: "The API is the boundary").
 *
 * ## Three deliberate behaviours, recorded so they are not "simplified" away
 *
 *  - **No token ⇒ no request.** A first visit with an empty `sessionStorage` resolves to
 *    `anonymous` synchronously. Firing a `/auth/session` call that is guaranteed to 401 would put
 *    an error in the console on every cold load and teach everyone to ignore it.
 *  - **Unreachable API ≠ signed out.** A transport failure leaves the token in place and records
 *    the error. We do not know the session is invalid, so we do not destroy it; the login screen
 *    can then say "the backend is not running" instead of implying a bad password.
 *  - **Expiry is enforced client-side too.** When `expires_at` passes, the provider flips to
 *    `anonymous` on its own. Rendering an authenticated shell over a dead token produces
 *    mysterious 401s in unrelated places, which is a worse failure than an honest sign-out.
 *
 * ## The demo session
 *
 * {@link SessionContextValue.signInAsDemo} exists because this build is frontend-first: the API does
 * not answer yet, every screen is role-gated, and so without it there is nothing to review at all.
 * It takes a {@link Role} rather than a `User` on purpose — the three fabricated identities live in
 * `lib/demo/demo-session.ts` and nowhere else, which is CLAUDE.md §10 condition 1. A signature that
 * accepted a `User` would invite a caller to invent one inline, in a file that has no demo banner.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
// `ReactElement`, not `JSX.Element`: React 19's types removed the global `JSX` namespace, so the
// unqualified name only resolves through a namespace import this file does not need.
import type { ReactElement, ReactNode } from 'react';

import { getSession, login as loginRequest, logout as logoutRequest } from './api';
import { ApiError, clearToken, getToken, setToken } from './api-client';
import { demoUser } from './demo/demo-session';
import { IS_DEMO } from './env';
import { ApiErrorCode } from '@/types/api';
import type { Role, User } from '@/types/domain';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Shape
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `loading` is the *bootstrap* state and occurs at most once per mount. It is not reused for
 * in-flight sign-in, which the login form tracks itself — conflating the two makes the whole shell
 * flash back to a skeleton every time someone mistypes a password.
 */
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface SessionState {
  readonly status: SessionStatus;
  readonly user: User | null;
  /** ISO-8601 with offset, straight from the API. `null` while anonymous. */
  readonly expiresAt: string | null;
  /**
   * Set by the bootstrap and {@link SessionContextValue.refresh} paths only — typically "the API is
   * unreachable". {@link SessionContextValue.signIn} **rejects** instead of writing here, because a
   * form owns the wording of its own failure.
   */
  readonly error: ApiError | null;
}

export interface SessionContextValue extends SessionState {
  /** Convenience for the many call sites that need only the role. `null` while not authenticated. */
  readonly role: Role | null;
  /** Resolves with the signed-in user; rejects with an {@link ApiError} the caller must render. */
  readonly signIn: (username: string, password: string) => Promise<User>;
  /**
   * Establishes a **local** session for one of the fabricated demo accounts. Synchronous: there is
   * no request to make, and nothing is written to `sessionStorage`.
   *
   * Storing no token is the entire safety argument. Every call `api-client.ts` makes still travels
   * without an `Authorization` header, so the API refuses it exactly as it refuses an anonymous one.
   * Picking `ADMIN` here therefore unlocks *navigation*, not access.
   *
   * Throws when `NEXT_PUBLIC_DATA_SOURCE !== 'demo'`, so an `api` build cannot reach it even if a
   * button for it survives (§10 condition 5).
   */
  readonly signInAsDemo: (role: Role) => void;
  /** User-initiated. Tells the API, then clears locally — clearing happens even if the call fails. */
  readonly signOut: () => Promise<void>;
  /** For a caller that has just seen `UNAUTHENTICATED`: drop the session without a round trip. */
  readonly invalidate: () => void;
  /** Re-reads `/auth/session`. Used after a role change and by the "retry" affordance. */
  readonly refresh: () => Promise<void>;
}

const ANONYMOUS: SessionState = {
  status: 'anonymous',
  user: null,
  expiresAt: null,
  error: null,
};

const SessionContext = createContext<SessionContextValue | null>(null);

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Expiry
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** `setTimeout` silently fires immediately above 2³¹−1 ms, so a long session must be clamped. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** Milliseconds until `iso`, or `null` when it is absent or unparseable. */
function msUntil(iso: string | null): number | null {
  if (iso === null) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  return at - Date.now();
}

export interface SessionProviderProps {
  readonly children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps): ReactElement {
  // `loading` only when there is something to load. See the header note.
  const [state, setState] = useState<SessionState>(() =>
    typeof window === 'undefined' || getToken() === null
      ? ANONYMOUS
      : { status: 'loading', user: null, expiresAt: null, error: null },
  );

  /** Guards every `setState` that follows an `await`, so an unmount cannot warn. */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const invalidate = useCallback((): void => {
    clearToken();
    if (mounted.current) setState(ANONYMOUS);
  }, []);

  /**
   * Shared by bootstrap and {@link refresh}. `UNAUTHENTICATED` is the one code that destroys the
   * token: every other failure — including a 500 and a dead socket — keeps it, because none of them
   * is evidence that the credential is bad.
   */
  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const session = await getSession(signal);
      if (!mounted.current) return;
      setState({
        status: 'authenticated',
        user: session.user,
        expiresAt: session.expires_at,
        error: null,
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      if (!mounted.current) return;
      if (cause instanceof ApiError && cause.code === ApiErrorCode.UNAUTHENTICATED) {
        clearToken();
        setState(ANONYMOUS);
        return;
      }
      setState({
        ...ANONYMOUS,
        error:
          cause instanceof ApiError
            ? cause
            : new ApiError(ApiErrorCode.INTERNAL_ERROR, 'The session could not be read.'),
      });
    }
  }, []);

  useEffect(() => {
    if (state.status !== 'loading') return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
    // Bootstrap runs for the initial `loading` state only; `refresh` covers every later read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Expiry watchdog ──────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    const remaining = msUntil(state.expiresAt);
    // An absent or unparseable `expires_at` is left alone: guessing a lifetime would sign someone
    // out mid-review for a reason the logs would not explain.
    if (remaining === null) return;
    if (remaining <= 0) {
      invalidate();
      return;
    }
    const timer = window.setTimeout(invalidate, Math.min(remaining, MAX_TIMEOUT_MS));
    return () => window.clearTimeout(timer);
  }, [state.status, state.expiresAt, invalidate]);

  /* ── Actions ──────────────────────────────────────────────────────────────────────── */

  const signIn = useCallback(async (username: string, password: string): Promise<User> => {
    // A stale token must not survive a fresh attempt; `login` is sent anonymously regardless, but
    // leaving the old one in storage would let an interleaved request use it.
    clearToken();
    const result = await loginRequest({ username, password });
    setToken(result.token);
    if (mounted.current) {
      setState({
        status: 'authenticated',
        user: result.user,
        expiresAt: result.expires_at,
        error: null,
      });
    }
    return result.user;
  }, []);

  /**
   * No `await`, no token, no request — see {@link SessionContextValue.signInAsDemo}.
   *
   * `expiresAt: null` is correct rather than lazy: the expiry watchdog above treats a missing value
   * as "do not guess a lifetime", so a demo session simply lasts until the tab is closed or someone
   * signs out. Inventing an expiry would sign a reviewer out mid-screen for no reason anyone could
   * trace back to a server that was never asked.
   */
  const signInAsDemo = useCallback((role: Role): void => {
    if (!IS_DEMO) {
      throw new Error('Demo sign-in is only available while NEXT_PUBLIC_DATA_SOURCE=demo.');
    }
    // Defensive: if a real token is somehow present, a demo session must not borrow its authority.
    clearToken();
    if (mounted.current) {
      setState({
        status: 'authenticated',
        user: demoUser(role),
        expiresAt: null,
        error: null,
      });
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      // "No token ⇒ no request", same rule as the bootstrap: revoking a credential we do not hold
      // cannot succeed, and in demo mode it would put a doomed call in the console on every sign-out.
      if (getToken() !== null) await logoutRequest();
    } catch {
      // Deliberately swallowed. The local session ends either way; a failed server-side revoke is
      // not a reason to leave someone apparently signed in.
    } finally {
      invalidate();
    }
  }, [invalidate]);

  const refresh = useCallback(async (): Promise<void> => {
    if (getToken() === null) {
      invalidate();
      return;
    }
    await load();
  }, [invalidate, load]);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      role: state.user?.role ?? null,
      signIn,
      signInAsDemo,
      signOut,
      invalidate,
      refresh,
    }),
    [state, signIn, signInAsDemo, signOut, invalidate, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Hooks
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/** Throws outside a {@link SessionProvider} — a silent `null` session would fail open. */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error('useSession must be used inside <SessionProvider>.');
  }
  return value;
}

/** The current role, or `null`. Pair with `canAccess` from `navigation.ts`; do not re-derive rules. */
export function useRole(): Role | null {
  return useSession().role;
}
