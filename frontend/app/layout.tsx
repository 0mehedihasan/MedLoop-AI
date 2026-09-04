/**
 * MedLoop AI — the root layout.
 *
 * Deliberately thin: `<html>`, `<body>`, the token stylesheet, and the session provider. The visible
 * frame lives in `app/(shell)/layout.tsx` instead, because `/login` must render *without* it — a login
 * screen that shows the navigation of an app you are not signed in to is offering links that cannot
 * work.
 *
 * `metadata.title.template` puts the screen name first: a browser tab reading "Review Data · MedLoop
 * AI" is identifiable at tab-strip width, which "MedLoop AI · Review Data" is not.
 *
 * `robots: noindex` is not defensive dressing. This app is served over `localhost` and its screens
 * reference patient-derived images; if it is ever reverse-proxied by accident, the crawler directive is
 * already in place.
 */

import type { Metadata, Viewport } from 'next';
import type { ReactElement, ReactNode } from 'react';

import './globals.css';
import { SessionProvider } from '@/lib/session';

export const metadata: Metadata = {
  title: {
    default: 'MedLoop AI',
    template: '%s · MedLoop AI',
  },
  description:
    'Local human-in-the-loop explainable medical imaging system for interactive annotation and continuous model refinement. Research prototype — not a medical device.',
  applicationName: 'MedLoop AI',
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // `globals.css` declares `color-scheme: light` and there is no dark theme; saying so here keeps
  // native controls and scrollbars from being rendered dark by the OS preference.
  colorScheme: 'light',
};

export interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): ReactElement {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
