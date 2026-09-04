/**
 * MedLoop AI — the layout for every signed-in screen.
 *
 * A route group, so the URL is unchanged: `app/(shell)/page.tsx` is still `/`. Its only job is to put
 * {@link AppShell} between the root layout and the pages that need navigation — which is all of them
 * except `/login`, and `/login` sits outside this group precisely so it does not inherit the frame.
 */

import type { ReactElement, ReactNode } from 'react';

import { AppShell } from '@/components/shell/AppShell';

export interface ShellLayoutProps {
  readonly children: ReactNode;
}

export default function ShellLayout({ children }: ShellLayoutProps): ReactElement {
  return <AppShell>{children}</AppShell>;
}
