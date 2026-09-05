'use client';

/**
 * MedLoop AI — `useReviewQueue`: the queue as the workspace sees it, demo or live.
 *
 * ## One hook, two sources, and no third shape
 *
 * `IS_DEMO` is read once — here. In demo mode neither query is allowed to run (`ready: false`), so a
 * fixture and a live payload can never be on screen together (§10 condition 5); in API mode the
 * fixture is unreachable. Everything downstream receives one shape and holds no demo branch of its
 * own, which is what makes `NEXT_PUBLIC_DATA_SOURCE=api` a one-line change instead of a sweep.
 *
 * ## A demo submit records nothing, and the outcome says so
 *
 * `recorded: false` and `hitl: null` come back from every demo submit. No row is written and no
 * counter moves, so reporting a `validated_since_last_training` figure would be a fabricated
 * experiment state (§10) — and it is precisely the number a reader would quote. The workspace renders
 * that difference rather than hiding it.
 *
 * ## The next item arrives with the response
 *
 * §6.1 step 9: `submit` returns `next`, so the queue advances without a second round trip. That reply
 * is authoritative and is applied *over* the initial query's item rather than triggering a refetch —
 * asking the server to choose again would let it hand back a different image, and the annotator would
 * watch the queue skip one.
 *
 * ## A skip is recorded but never counted
 *
 * `SkipResult` deliberately carries no `hitl` block (§6.2), so a skip returns `recorded: true` with
 * `hitl: null`. The two flags are separate facts: "the server wrote a review session" and "the HITL
 * counter moved" are not the same claim, and collapsing them would make a skip look like progress
 * toward retraining.
 */

import { useCallback, useMemo, useState } from 'react';

import { getReviewQueue, listLabels, skipImage, submitReview } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { DEMO_REVIEW } from '@/lib/demo/demo-review';
import { IS_DEMO } from '@/lib/env';
import { useApiQuery } from '@/lib/use-query';
import { ApiErrorCode } from '@/types/api';
import type { SkipBody, SubmitBody, SubmitHitlOutcome } from '@/types/api';
import type { DiseaseLabel, QueuePosition, ReviewItem } from '@/types/domain';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The outcome of one submit or skip
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * What happened, in the four terms the UI is allowed to state.
 *
 * Returned rather than thrown: a failed submit is an expected outcome on a screen whose whole job is
 * submitting, and the workspace has to keep the shapes on canvas and let the annotator try again. A
 * thrown error would unwind past the state it needs to preserve.
 */
export interface ReviewOutcome {
  readonly ok: boolean;
  /**
   * `null` when there was no prediction to agree or disagree with — which is every case on this
   * machine, since no model exists (§2.3, §6.3). Never `false` as a stand-in.
   */
  readonly agreement: boolean | null;
  /** The server's HITL block. `null` for a skip (§6.2) and for anything done in demo mode. */
  readonly hitl: SubmitHitlOutcome | null;
  /** `true` only when the server wrote a row. `false` in demo mode: nothing was persisted. */
  readonly recorded: boolean;
  readonly problem: ApiError | null;
}

/** Demo mode: the cursor moved, the fixture is unchanged, and nothing anywhere was counted. */
const DEMO_OUTCOME: ReviewOutcome = {
  ok: true,
  agreement: null,
  hitl: null,
  recorded: false,
  problem: null,
};

function failure(cause: unknown): ReviewOutcome {
  const problem =
    cause instanceof ApiError
      ? cause
      : new ApiError(
          ApiErrorCode.INTERNAL_ERROR,
          cause instanceof Error ? cause.message : 'The request failed for an unknown reason.',
        );
  return { ok: false, agreement: null, hitl: null, recorded: false, problem };
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The hook
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export interface ReviewQueue {
  /** Read by the workspace to render the §10 badge and the "nothing is being counted" note. */
  readonly demo: boolean;
  readonly item: ReviewItem | null;
  /** The current image's place in the queue, for the "2 of 3" indicator only. */
  readonly position: QueuePosition | null;
  /** The configurable label space (§5). Empty until it loads; never a hard-coded list. */
  readonly labels: readonly DiseaseLabel[];
  /** `false` ⇒ the codes have not been confirmed against the real files. The UI says so. */
  readonly labelSpaceVerified: boolean;
  readonly loading: boolean;
  readonly refetching: boolean;
  readonly error: ApiError | null;
  /** Loaded, and there is no image to review. Distinct from "still loading with nothing yet". */
  readonly exhausted: boolean;
  /** A submit or skip is in flight. Every control that could double-post reads this. */
  readonly busy: boolean;
  readonly submit: (body: SubmitBody) => Promise<ReviewOutcome>;
  readonly skip: (body: SkipBody) => Promise<ReviewOutcome>;
  readonly retry: () => void;
}

/** A stable empty list, so a render before the labels arrive does not change the returned identity. */
const NO_LABELS: readonly DiseaseLabel[] = [];

export function useReviewQueue(): ReviewQueue {
  // `getReviewQueue` takes `(query?, signal?)`, so it cannot be passed as the fetcher directly — the
  // hook would hand it an `AbortSignal` as the filter bag. There are no filters on this screen yet;
  // when there are, they belong in `deps` as well as in the call.
  const queue = useApiQuery((signal) => getReviewQueue(undefined, signal), { ready: !IS_DEMO });
  const labels = useApiQuery(listLabels, { ready: !IS_DEMO });
  // Pulled out as identifiers: both are stable `useCallback`s, but `exhaustive-deps` cannot know that
  // through a member expression and would demand the whole (per-render) query object instead.
  const refetchQueue = queue.refetch;
  const refetchLabels = labels.refetch;

  /** Demo cursor. Advancing it issues no request and writes nothing. */
  const [cursor, setCursor] = useState(0);
  /**
   * The item the last submit or skip handed back, wrapped so that "the server said the queue is
   * empty" (`{ item: null }`) is distinguishable from "no submit has happened yet" (`null`). Without
   * the wrapper a `??` chain would fall through to the initial query and re-serve a reviewed image.
   */
  const [advanced, setAdvanced] = useState<{ readonly item: ReviewItem | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const demoItems = DEMO_REVIEW.items;
  const item: ReviewItem | null = IS_DEMO
    ? (demoItems[cursor] ?? null)
    : advanced !== null
      ? advanced.item
      : (queue.data?.item ?? null);

  const submit = useCallback(
    async (body: SubmitBody): Promise<ReviewOutcome> => {
      if (item === null) {
        return failure(
          new ApiError(ApiErrorCode.CONFLICT, 'There is no image in the queue to submit.'),
        );
      }
      if (IS_DEMO) {
        setCursor((current) => current + 1);
        return DEMO_OUTCOME;
      }
      setBusy(true);
      try {
        const result = await submitReview(item.image.id, body);
        setAdvanced({ item: result.next });
        return {
          ok: true,
          agreement: result.agreement,
          hitl: result.hitl,
          recorded: true,
          problem: null,
        };
      } catch (cause) {
        return failure(cause);
      } finally {
        setBusy(false);
      }
    },
    [item],
  );

  const skip = useCallback(
    async (body: SkipBody): Promise<ReviewOutcome> => {
      if (item === null) {
        return failure(
          new ApiError(ApiErrorCode.CONFLICT, 'There is no image in the queue to skip.'),
        );
      }
      if (IS_DEMO) {
        setCursor((current) => current + 1);
        return DEMO_OUTCOME;
      }
      setBusy(true);
      try {
        const result = await skipImage(item.image.id, body);
        setAdvanced({ item: result.next });
        // `recorded` is true — a review session row exists — while `hitl` stays null, because a skip
        // never touches the counter (§6.2). Two separate facts, reported separately.
        return { ok: true, agreement: null, hitl: null, recorded: true, problem: null };
      } catch (cause) {
        return failure(cause);
      } finally {
        setBusy(false);
      }
    },
    [item],
  );

  /**
   * Reload. In API mode the locally-advanced item is dropped first, so the server's choice wins
   * rather than being masked by the last response. In demo mode there is nothing to fetch, so
   * "reload the queue" can only mean "start the fixture again" — which is what it does.
   */
  const retry = useCallback((): void => {
    if (IS_DEMO) {
      setCursor(0);
      return;
    }
    setAdvanced(null);
    void refetchQueue();
    void refetchLabels();
  }, [refetchQueue, refetchLabels]);

  /**
   * "Loaded, and there is nothing to review" — never "not loaded yet". In API mode that needs the
   * query to have *succeeded*, or a local advance to have reported an empty `next`; a first render
   * with `item === null` is loading, and rendering "queue complete" then would tell the annotator
   * their work is done before a single row had been read.
   */
  const exhausted = IS_DEMO
    ? cursor >= demoItems.length
    : item === null && (advanced !== null || queue.status === 'success');

  return useMemo<ReviewQueue>(
    () => ({
      demo: IS_DEMO,
      item,
      position: item?.queue ?? null,
      labels: IS_DEMO ? DEMO_REVIEW.labels.items : (labels.data?.items ?? NO_LABELS),
      labelSpaceVerified: IS_DEMO
        ? DEMO_REVIEW.labels.verified_against_data
        : (labels.data?.verified_against_data ?? false),
      loading: IS_DEMO ? false : queue.loading || labels.loading,
      refetching: IS_DEMO ? false : queue.refetching || labels.refetching,
      // The label space failing is as fatal as the queue failing: with no codes there is nothing to
      // submit, so both surface as one page-level error rather than a half-usable screen.
      error: IS_DEMO ? null : (queue.error ?? labels.error),
      exhausted,
      busy,
      submit,
      skip,
      retry,
    }),
    [
      item,
      exhausted,
      busy,
      submit,
      skip,
      retry,
      labels.data,
      labels.loading,
      labels.refetching,
      labels.error,
      queue.loading,
      queue.refetching,
      queue.error,
    ],
  );
}
