/**
 * MedLoop AI — the layout for `/login`.
 *
 * It exists for one reason: the page itself is a client component, so it cannot export `metadata`.
 * The `title` matters here — a tab reading "Sign in · MedLoop AI" is how someone finds this window
 * again after going to look for their password.
 *
 * Note what this layout does *not* do: it does not render {@link AppShell}. `/login` sits outside the
 * `(shell)` route group precisely so that it has no navigation, because a signed-out visitor offered
 * links to Review Data and Training Management is being offered links that cannot work.
 */

import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Sign in',
};

export interface LoginLayoutProps {
  readonly children: ReactNode;
}

export default function LoginLayout({ children }: LoginLayoutProps): ReactElement {
  return <>{children}</>;
}
