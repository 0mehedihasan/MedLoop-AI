'use client';

/**
 * MedLoop AI — `useApiQuery`: the one read-path hook.
 *
 * Every data surface in this app owes four states (§11.2: loading, empty, error, populated). This
 * hook produces the first three from a single `fetcher` and leaves the fourth to the caller, so no
 * page invents its own `useState`/`useEffect` pair and forgets one of them.
 *
 * ## Why not TanStack Query
 *
 * Recorded here so it is not re-litigated: there is no cross-screen cache to maintain, no window
 * refocus story worth having on a localhost tool, and no server to be polite to. What is actually
 * needed is abort-on-unmount, an explicit `refetch`, and a `ready` gate for dependent reads. That is
 * this file, and it adds nothing to the bundle.
 *
 * ## The three behaviours that matter
 *
 *  - **Aborts are not errors.** An unmount or a changed key aborts the in-flight request; the
 *    `AbortError` is swallowed, because reporting "request failed" for a request *we* cancelled is
 *    how a page ends up showing an error state it then navigates away from.
 *  - **A stale response never wins.** Each run carries a sequence number; only the newest may
 *    write. Without this, a slow first request can land after a fast second one and overwrite fresh
 *    data with old — the classic filter-flicker bug.
 *  - **`refetch` keeps the old data on screen.** It sets `refetching`, not `loading`, so a table
 *    does not collapse to a spinner while a background reload runs. A first load has nothing to
 *    keep, so it is `loading`.
 *
 * ## Identity of `fetcher`
 *
 * The effect keys on `deps`, never on `fetcher`, because an inline arrow is a new function on every
 * render and keying on it would loop forever. The `fetcher` is read through a ref so the *latest*
 * closure is always the one called. This means: **anything the fetcher reads must appear in `deps`**
 * — the same contract as `useEffect`, stated because the lint rule cannot see inside a ref.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from './api-client';
import { ApiErrorCode } from '@/types/api';

/** Widened to `unknown[]` deliberately: dependency arrays are heterogeneous by nature. */
export type QueryDeps = readonly unknown[];

export interface UseApiQueryOptions {
  /**
   * Re-runs whenever any member changes, exactly like `useEffect`. Must list everything the
   * `fetcher` closes over.
   */
  readonly deps?: QueryDeps;
  /**
   * `false` holds the query in `idle` — nothing is requested. For a read that depends on a value
   * that does not exist yet (a dataset id from a previous query, a filter the user has not set).
   */
  readonly ready?: boolean;
}

export type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseApiQueryResult<T> {
  readonly data: T | null;
  readonly error: ApiError | null;
  readonly status: QueryStatus;
  /** First load with nothing to show. Render a skeleton or a spinner. */
  readonly loading: boolean;
  /** A reload with data already on screen. Render a subtle indicator, never a skeleton. */
  readonly refetching: boolean;
  /** Runs the fetcher again. Resolves when the attempt settles, successfully or not. */
  readonly refetch: () => Promise<void>;
}

function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  // A thrown non-`ApiError` is a bug in a fetcher, not an API response. It is surfaced as
  // `INTERNAL_ERROR` with the original message rather than being reshaped into a domain code the
  // server never sent (§2.3: do not present something as what it is not).
  const message = cause instanceof Error ? cause.message : 'The request failed for an unknown reason.';
  return new ApiError(ApiErrorCode.INTERNAL_ERROR, message);
}

function isAbort(cause: unknown): boolean {
  if (cause instanceof DOMException && cause.name === 'AbortError') return true;
  // Some runtimes reject with a plain `Error` named `AbortError`.
  return cause instanceof Error && cause.name === 'AbortError';
}

export function useApiQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseApiQueryOptions = {},
): UseApiQueryResult<T> {
  const { deps = [], ready = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState<QueryStatus>(ready ? 'loading' : 'idle');
  const [refetching, setRefetching] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  /** `true` until the first *successful* read, so `refetch` before then still counts as loading. */
  const cold = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const run = useCallback(async (background: boolean): Promise<void> => {
    controller.current?.abort();
    const local = new AbortController();
    controller.current = local;
    sequence.current += 1;
    const ticket = sequence.current;

    if (background && !cold.current) {
      setRefetching(true);
    } else {
      setStatus('loading');
    }

    try {
      const result = await fetcherRef.current(local.signal);
      if (!mounted.current || ticket !== sequence.current) return;
      cold.current = false;
      setData(result);
      setError(null);
      setStatus('success');
    } catch (cause) {
      if (isAbort(cause)) return;
      if (!mounted.current || ticket !== sequence.current) return;
      setError(toApiError(cause));
      setStatus('error');
    } finally {
      if (mounted.current && ticket === sequence.current) setRefetching(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) {
      setStatus('idle');
      return;
    }
    void run(false);
    // `fetcher` is intentionally absent: it is read through a ref, and an inline arrow would make
    // this effect run on every render. `deps` is the caller's declared key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, run, ...deps]);

  const refetch = useCallback(async (): Promise<void> => {
    await run(true);
  }, [run]);

  return {
    data,
    error,
    status,
    loading: status === 'loading',
    refetching,
    refetch,
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * Writes
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface UseApiActionResult<Args extends readonly unknown[], T> {
  /** Resolves with the response, or `null` if the call failed — the reason is then in `error`. */
  readonly run: (...args: Args) => Promise<T | null>;
  /** One call at a time. A second `run` while this is `true` is dropped, not queued. */
  readonly busy: boolean;
  readonly error: ApiError | null;
  /** Clears `error` — call it when the user edits the form the error was about. */
  readonly reset: () => void;
}

/**
 * The write-side counterpart to {@link useApiQuery}: busy, error, and nothing else.
 *
 * It deliberately does **not** hold the response. A mutation's result belongs to whatever the screen
 * does next — refetch a list, advance a queue, close a dialog — and caching it here would invite two
 * copies of the same row on screen, one stale.
 *
 * `run` resolves with `null` instead of throwing, so a click handler is a plain `await` with an `if`
 * rather than a `try`. Aborts are impossible by design: a `POST` that may have already committed must
 * not be cancelled on unmount, because the client would then not know whether it happened.
 */
export function useApiAction<Args extends readonly unknown[], T>(
  action: (...args: Args) => Promise<T>,
): UseApiActionResult<Args, T> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const actionRef = useRef(action);
  actionRef.current = action;

  const mounted = useRef(true);
  /** State updates lag a render; this does not. Without it a double-click fires two writes. */
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: Args): Promise<T | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await actionRef.current(...args);
      return result;
    } catch (cause) {
      if (mounted.current) setError(toApiError(cause));
      return null;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  const reset = useCallback((): void => {
    setError(null);
  }, []);

  return { run, busy, error, reset };
}
