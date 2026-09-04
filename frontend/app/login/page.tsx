'use client';

/**
 * MedLoop AI — `/login`.
 *
 * Outside the `(shell)` route group, so it renders with no navigation at all.
 *
 * ## Three failures that must not be confused
 *
 * The session provider records "the API is unreachable" separately from "these credentials are wrong"
 * (`lib/session.tsx`), and this screen keeps them apart:
 *
 *  - **`UNAUTHENTICATED` from `/auth/login`** — the credentials were rejected. Say so, next to the
 *    fields, and keep the username so only the password has to be retyped.
 *  - **A transport failure** — nothing answered on the port. Say *that*, with the address, because
 *    the fix is `uvicorn`, not a different password. Telling someone their password is wrong when the
 *    backend is simply not running is the single most expensive wrong message this screen could show.
 *  - **A bootstrap error already on the context** — the provider tried to read an existing token and
 *    could not reach the API. Shown as a banner above the form, because it is about the *session*,
 *    not about this attempt.
 *
 * ## `?next=` is validated, not trusted
 *
 * `AppShell` sends `?next=` when it bounces an anonymous visitor, so the intended screen is not lost.
 * A query parameter is attacker-controllable, so {@link safeNext} accepts only a same-origin absolute
 * path. Without that check, `/login?next=https://elsewhere.example` turns this form into an open
 * redirect that arrives with the user's trust already attached.
 *
 * ## Why `useSearchParams` sits behind Suspense
 *
 * Reading the query string opts a route into request-time rendering. Next requires the boundary
 * explicitly rather than silently making the whole page dynamic, so the form is a child component and
 * the default export is the boundary.
 *
 * ## The demo access section
 *
 * It is rendered only while `NEXT_PUBLIC_DATA_SOURCE=demo`, and it is the reason this build is
 * reviewable at all: the shell bounces anonymous visitors here, the API does not answer yet, so
 * without it the *only* reachable screen in the entire app is this form. Each button establishes a
 * local session for one fabricated account and stores **no token** — every API call still fails, so
 * this buys navigation, not access. The three roles are all offered because the nav, the route
 * guards and several panels differ per role, and a build only ever seen as one role has two
 * unreviewed variants of every screen.
 */

import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { DemoBadge } from '@/components/ui/project';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api-client';
import { DEMO_SESSIONS } from '@/lib/demo/demo-session';
import { API_BASE_URL, APP_VERSION, IS_DEMO } from '@/lib/env';
import { ROUTES, isPublicRoute } from '@/lib/navigation';
import { useSession } from '@/lib/session';
import { ApiErrorCode } from '@/types/api';
import { Role } from '@/types/domain';

/** Wording for the three demo buttons. Kept here, not in the fixture: it is UI copy, not data. */
const DEMO_ROLE_COPY: Readonly<Record<Role, { readonly label: string; readonly detail: string }>> = {
  [Role.ADMIN]: { label: 'Administrator', detail: 'Every area, plus settings and logs.' },
  [Role.ANNOTATOR]: { label: 'Annotator', detail: 'Review Data and the annotation canvas.' },
  [Role.RESEARCHER]: { label: 'Researcher', detail: 'Statistics and Analyze Model, read-only.' },
};

/**
 * A destination this app is willing to navigate to after sign-in.
 *
 * Rules, in order: it must exist; it must start with a single `/` (so `//host` and `https://host`
 * are both rejected — `//host` is a protocol-relative URL, which browsers happily treat as
 * cross-origin); it must not be a public route, because bouncing straight back to `/login` would
 * loop. Anything else falls back to the dashboard.
 */
export function safeNext(raw: string | null): string {
  if (raw === null || raw === '') return ROUTES.dashboard;
  if (!raw.startsWith('/') || raw.startsWith('//')) return ROUTES.dashboard;
  // Strip the query and hash before the guard check so `/login?x=1` cannot slip past it.
  const path = raw.split(/[?#]/)[0] ?? raw;
  if (isPublicRoute(path)) return ROUTES.dashboard;
  return raw;
}

function LoginForm(): ReactElement {
  const router = useRouter();
  const params = useSearchParams();
  const { status, error: sessionError, signIn, signInAsDemo } = useSession();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);

  const next = safeNext(params.get('next'));

  // Already signed in — either the token was still good on arrival, or the sign-in below succeeded.
  // `replace`, not `push`: the back button must not return to a login form for a live session.
  const authenticated = status === 'authenticated';
  useEffect(() => {
    if (!authenticated) return;
    router.replace(next);
  }, [authenticated, next, router]);

  const rejected = failure?.code === ApiErrorCode.UNAUTHENTICATED;
  const unreachable = failure?.isNetworkError === true;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-1">
        <p className="flex items-baseline gap-2 text-sm font-semibold text-content-primary">
          MedLoop AI
          <span className="font-mono text-xs font-normal text-content-muted">v{APP_VERSION}</span>
        </p>
        <p className="text-xs text-content-secondary">
          Local research prototype. Not a medical device and not a diagnostic tool.
        </p>
      </div>

      {/* About the session, not about this attempt — so it sits outside the form. */}
      {sessionError !== null ? (
        <Alert tone="warn" title="The stored session could not be read" className="w-full max-w-sm">
          {sessionError.message}
        </Alert>
      ) : null}

      {/*
        Below the credential form on purpose. The demo path is the only one that *works* in this
        build, but it is not the product's front door, and putting it first would teach a reader that
        MedLoop signs people in without a password.
      */}
      <Card as="section" aria-label="Sign in" padding="lg" className="w-full max-w-sm">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitting(true);
            setFailure(null);
            void signIn(username, password)
              .then(() => {
                // Navigation is left to the effect above, which reacts to the status change. Pushing
                // here as well would race it and can land on the destination twice.
              })
              .catch((cause: unknown) => {
                setFailure(
                  cause instanceof ApiError
                    ? cause
                    : new ApiError(ApiErrorCode.INTERNAL_ERROR, 'Sign-in failed in the browser.'),
                );
              })
              .finally(() => setSubmitting(false));
          }}
        >
          <FormField
            label="Username"
            required
            error={rejected ? 'Check the username and password.' : null}
          >
            <Input
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </FormField>

          <FormField label="Password" required>
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>

          {/* `role="alert"` via `live`: this appears in response to an action, so it should interrupt. */}
          {unreachable ? (
            <Alert tone="danger" live title="The MedLoop API is not reachable">
              Nothing answered at <span className="font-mono text-xs">{API_BASE_URL}</span>. Start the
              backend and try again — this is not a password problem.
            </Alert>
          ) : null}
          {failure !== null && !unreachable && !rejected ? (
            <Alert tone="danger" live title="Sign-in failed">
              <span className="font-mono text-xs uppercase tracking-wide">{failure.code}</span> —{' '}
              {failure.message}
            </Alert>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            fullWidth
            busy={submitting}
            busyLabel="Signing in"
            disabled={username === '' || password === ''}
          >
            Sign in
          </Button>
        </form>
      </Card>

      {IS_DEMO ? <DemoAccess onPick={signInAsDemo} /> : null}

      <p className="max-w-sm text-xs text-content-muted">
        Accounts are local to this machine. There is no sign-up, no password reset and no external
        identity provider — an administrator creates accounts directly.
      </p>
    </div>
  );
}

/**
 * The demo-only sign-in panel. See the header note for why it exists and what it does not grant.
 *
 * `onPick` is passed in rather than the component reaching for `useSession()` itself, so the whole
 * panel is a pure function of its props and can be rendered in isolation.
 */
interface DemoAccessProps {
  readonly onPick: (role: Role) => void;
}

function DemoAccess({ onPick }: DemoAccessProps): ReactElement {
  return (
    <Card as="section" aria-labelledby="demo-access-heading" padding="lg" className="w-full max-w-sm">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="demo-access-heading" className="text-sm font-semibold text-content-primary">
            Demo access
          </h2>
          <DemoBadge label="No backend" />
        </div>
        <p className="text-xs text-content-secondary">
          Open the interface without an account. The screens render fixtures, not measurements, and no
          token is stored — so anything that actually calls the API still fails. This is a way to look
          at the build, not a way into it.
        </p>

        <ul className="flex flex-col gap-2">
          {DEMO_SESSIONS.roles.map((role) => (
            <li key={role} className="grid grid-cols-[7rem_1fr] items-center gap-3">
              {/*
                `aria-describedby` rather than putting the sentence inside the label: the button's
                accessible name stays "Administrator", which is what a screen-reader user navigating
                by control name is listening for, and the explanation follows as a description.
              */}
              <Button size="sm" fullWidth aria-describedby={`demo-role-${role}`} onClick={() => onPick(role)}>
                {DEMO_ROLE_COPY[role].label}
              </Button>
              <p id={`demo-role-${role}`} className="text-xs text-content-muted">
                {DEMO_ROLE_COPY[role].detail}
              </p>
            </li>
          ))}
        </ul>

        <p className="text-xs text-content-muted">
          Set <span className="font-mono">NEXT_PUBLIC_DATA_SOURCE=api</span> to remove this panel and
          every fixture behind it.
        </p>
      </div>
    </Card>
  );
}

/** The Suspense boundary `useSearchParams` requires. See the header note. */
export default function LoginPage(): ReactElement {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner label="Loading the sign-in form" size="lg" showLabel />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
